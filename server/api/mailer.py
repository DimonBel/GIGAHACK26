"""Emailing the approved minutes — only ever through a local SMTP relay.

The security gate: the relay must be this computer or the hospital's internal network (Mailpit by default,
scripts/mailpit.sh). An external server (Gmail, Outlook, SendGrid, ...) would be an external call, so
check_local() refuses it when the API starts, and every send checks again where the name resolves to.
"""
import ipaddress
import queue
import smtplib
import socket
import sys
import threading
import time
from email.message import EmailMessage
from email.utils import formatdate, make_msgid

from .db import Store
from .email_render import render
from .jobs import read_json
from .settings import Settings

LOCAL_NAMES = ("localhost",)
LOCAL_SUFFIXES = (".local", ".internal", ".lan", ".localhost", ".home.arpa")


class NotLocalError(ValueError):
    pass


def _local_ip(ip) -> bool:
    return ip.is_loopback or ip.is_private or ip.is_link_local


def check_local(host: str) -> str:
    """The host, if it is a local relay; raises NotLocalError for anything that could leave the network."""
    name = host.strip().strip("[]").lower().rstrip(".")
    try:
        ok = _local_ip(ipaddress.ip_address(name))
    except ValueError:
        ok = name in LOCAL_NAMES or name.endswith(LOCAL_SUFFIXES)
    if not ok:
        raise NotLocalError(
            f"SMTP_HOST={host!r} is not a local mail server. Minutes may only be sent through a relay on this "
            "computer or the hospital network (e.g. Mailpit on 127.0.0.1:1025, see scripts/mailpit.sh); "
            "external SMTP such as Gmail, Outlook or SendGrid is blocked.")
    return name


def check_resolves_local(host: str, port: int):
    """A local-looking name must also resolve to local addresses only (no DNS trick to an outside server)."""
    for *_, sockaddr in socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP):
        if not _local_ip(ipaddress.ip_address(sockaddr[0])):
            raise NotLocalError(f"{host} resolves to {sockaddr[0]}, which is outside the local network.")


class Mailer:
    """Sends queued deliveries in the background, one email per attendee, so approving never waits on SMTP."""

    def __init__(self, store: Store, settings: Settings, smtp=smtplib.SMTP, retry_delay: float = 5):
        self.host = check_local(settings.smtp_host)
        self.store, self.settings, self.smtp, self.retry_delay = store, settings, smtp, retry_delay
        self.queue, self.busy = queue.Queue(), 0
        self.cv = threading.Condition()
        threading.Thread(target=self._loop, name="mailer", daemon=True).start()

    def enqueue(self, delivery_ids: list):
        with self.cv:
            self.busy += len(delivery_ids)
        for i in delivery_ids:
            self.queue.put(i)

    def recover(self):
        """After a restart: send what was still waiting."""
        self.enqueue(self.store.queued_deliveries())

    def wait_idle(self, timeout: float = 10) -> bool:
        with self.cv:
            return self.cv.wait_for(lambda: self.busy == 0, timeout)

    def _loop(self):
        while True:
            delivery_id = self.queue.get()
            try:
                self._send(delivery_id)
            except Exception as e:  # noqa: BLE001 - one bad email never stops the others
                print(f"mail {delivery_id} failed: {e}", file=sys.stderr)
                self.store.update_delivery(delivery_id, status="failed", error=str(e).splitlines()[0][:300])
            finally:
                with self.cv:
                    self.busy -= 1
                    self.cv.notify_all()

    def message(self, delivery: dict) -> EmailMessage:
        meeting = self.store.meeting(delivery["meeting_id"])
        doc = read_json(self.settings.meeting_dir(meeting["id"]) / "minutes.json")
        recipient = self.store.user(delivery["user_id"]) if delivery["user_id"] else None
        recipient = recipient or {"name": delivery["email"], "email": delivery["email"]}
        approver = self.store.user(meeting["approved_by"]) if meeting["approved_by"] else None
        names = {u["id"]: u["name"] for u in self.store.users()}
        attendees = [names[i] for i in doc.get("attendees", []) if i in names]
        link = f"{self.settings.app_url}/participant/read/{meeting['id']}"
        mail = render(meeting, doc, recipient, approver["name"] if approver else "", link, attendees)

        msg = EmailMessage()
        msg["Subject"] = mail.subject
        msg["From"] = self.settings.mail_from
        msg["To"] = f"{recipient['name']} <{delivery['email']}>"
        if approver:
            msg["Reply-To"] = f"{approver['name']} <{approver['email']}>"
        msg["Date"] = formatdate(localtime=True)
        msg["Message-ID"] = make_msgid(domain="medpark.local")
        msg.set_content(mail.markdown)
        msg.add_alternative(mail.html, subtype="html")
        msg.add_attachment(mail.markdown.encode(), maintype="text", subtype="markdown",
                           filename=f"minutes-{meeting['id']}.md")
        return msg

    def _send(self, delivery_id: int):
        delivery = self.store.delivery(delivery_id)
        if not delivery or delivery["status"] != "queued":
            return
        msg = self.message(delivery)
        check_resolves_local(self.host, self.settings.smtp_port)
        for attempt in (1, 2):
            try:
                with self.smtp(self.host, self.settings.smtp_port, timeout=15) as smtp:
                    smtp.send_message(msg)
                break
            except (ConnectionError, TimeoutError, smtplib.SMTPServerDisconnected):
                if attempt == 2:
                    raise
                time.sleep(self.retry_delay)  # the relay may be restarting
        self.store.update_delivery(delivery_id, status="sent", sent=time.time(), error=None)
