"""Request bodies and the Minutes document, validated with Pydantic."""
import re
import unicodedata
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, Field, StringConstraints, model_validator

from stt.minutes.builder import MEETING_TYPES
from stt.minutes.markdown import SECTIONS

MIN_PASSWORD = 12
MAX_PASSWORD = 256
MAX_EMAIL = 254
MAX_DOMAIN = 253
MAX_DOMAINS = 100  # allowed recipient domains
MAX_DURATION_MIN = 24 * 60
MAX_RECIPIENTS = 200
MAX_LIST_MEMBERS = 500
MAX_ITEMS = 500  # entries in one list of the minutes
MAX_TEXT = 4000  # one line / field of the minutes
MAX_SUMMARY = 20000
MAX_INSTRUCTIONS = 1000  # a minutes template's instructions for the LLM
MAX_NOTE = 200  # what changed in a template version
PRIORITIES = ("high", "medium", "low")

# Deliberately stricter than RFC 5322: no quotes, spaces, commas or angle brackets, which could inject headers.
# Unlike email-validator, it accepts internal domains such as medpark.local.
DOMAIN = r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+"
EMAIL = re.compile(r"[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@" + DOMAIN)
DOMAIN_NAME = re.compile(DOMAIN)


def email_address(value: str) -> str:
    """The address in lower case; ValueError if it isn't a plain email address."""
    value = value.strip().lower()
    if len(value) > MAX_EMAIL or not EMAIL.fullmatch(value):
        raise ValueError(f"{value!r} is not a valid email address")
    return value


def domain_name(value: str) -> str:
    """The domain in lower case; ValueError if it isn't a plain domain name such as medpark.md."""
    value = value.strip().lower()
    if len(value) > MAX_DOMAIN or not DOMAIN_NAME.fullmatch(value):
        raise ValueError(f"{value!r} is not a valid domain name")
    return value


def unique(values: list) -> list:
    return list(dict.fromkeys(values))


def http_url(value: str) -> str:
    url = urlsplit(value)
    if url.scheme not in ("http", "https") or not url.hostname:
        raise ValueError("must be an http(s) URL")
    return value


Email = Annotated[str, AfterValidator(email_address)]
Domains = Annotated[list[Annotated[str, AfterValidator(domain_name)]], Field(max_length=MAX_DOMAINS),
                    AfterValidator(unique)]
Role = Literal["admin", "moderator", "user"]
MeetingType = Literal[MEETING_TYPES]
Kind = Literal["to", "cc"]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Position = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
Password = Annotated[str, StringConstraints(min_length=MIN_PASSWORD, max_length=MAX_PASSWORD)]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LoginIn(Input):
    email: Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, max_length=MAX_EMAIL)]
    password: Annotated[str, StringConstraints(max_length=MAX_PASSWORD)]


class PasswordChangeIn(Input):
    current: Annotated[str, StringConstraints(max_length=MAX_PASSWORD)]
    new: Password


class UserIn(Input):
    email: Email
    full_name: Name
    position: Position = ""
    specialty: Position = ""
    job_title: Position = ""
    role: Role
    password: Password


class UserPatch(Input):
    full_name: Name | None = None
    position: Position | None = None
    specialty: Position | None = None
    job_title: Position | None = None
    role: Role | None = None
    active: bool | None = None
    password: Password | None = None


class MemberIn(Input):
    user_id: int | None = None
    email: Email | None = None
    kind: Kind = "to"

    @model_validator(mode="after")
    def one_address(self):
        if (self.user_id is None) == (self.email is None):
            raise ValueError("a member needs either user_id or email")
        return self


class ListIn(Input):
    name: Name
    meeting_type: MeetingType | None = None
    members: list[MemberIn] = Field(default_factory=list, max_length=MAX_LIST_MEMBERS)


class ListPatch(Input):
    name: Name | None = None
    meeting_type: MeetingType | None = None  # sent as null: any meeting type
    members: list[MemberIn] | None = Field(None, max_length=MAX_LIST_MEMBERS)


class SettingsIn(Input):
    """Any subset of the settings; the rest keep their values."""
    asr_engine: Literal["mlx", "whisper.cpp"] | None = None
    asr_model: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)] | None = None
    llm_model: Annotated[str, StringConstraints(pattern=r"^[\w.:/-]{1,100}$")] | None = None
    language: Annotated[str, StringConstraints(pattern=r"^(auto|[a-z]{2,3})$")] | None = None
    delivery: Literal["n8n", "smtp"] | None = None
    n8n_webhook_url: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500),
                               AfterValidator(http_url)] | None = None
    smtp_host: Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[A-Za-z0-9.:\[\]-]{1,253}$")] | None \
        = None
    smtp_port: Annotated[int, Field(ge=1, le=65535)] | None = None
    mail_from: Email | None = None
    keep_audio_days: Annotated[int, Field(ge=0, le=3650)] | None = None
    max_upload_mb: Annotated[int, Field(ge=1, le=10240)] | None = None
    max_duration_min: Annotated[int, Field(ge=1, le=MAX_DURATION_MIN)] | None = None
    allowed_recipient_domains: Domains | None = None  # empty: any domain


class SendIn(Input):
    to: list[Email] = Field(min_length=1, max_length=MAX_RECIPIENTS)
    cc: list[Email] = Field(default_factory=list, max_length=MAX_RECIPIENTS)


class SectionIn(Input):
    key: Literal[SECTIONS]
    enabled: bool


class TopicFieldsIn(Input):
    status: bool
    findings: bool
    decisions: bool


def _each_section_once(sections: list[SectionIn]) -> list[SectionIn]:
    if sorted(s.key for s in sections) != sorted(SECTIONS):
        raise ValueError(f"must list each section exactly once: {', '.join(SECTIONS)}")
    return sections


def _without_control_characters(value: str) -> str:
    """The text without control characters, except line breaks and tabs: it goes on the command line of the
    transcription process, which can't take a NUL."""
    return "".join(c for c in value if c in "\n\t" or unicodedata.category(c) != "Cc")


class TemplateIn(Input):
    """A new version of a meeting type's minutes template."""
    sections: Annotated[list[SectionIn], AfterValidator(_each_section_once)]
    topic_fields: TopicFieldsIn
    instructions: Annotated[str, StringConstraints(strip_whitespace=True, max_length=MAX_INSTRUCTIONS),
                            AfterValidator(_without_control_characters)] = ""
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=MAX_NOTE)] = ""


# The minutes come from the LLM and from the moderator's editor: unknown fields are dropped, numbers become text.
Text = Annotated[str, StringConstraints(max_length=MAX_TEXT)]
Texts = Annotated[list[Text], Field(max_length=MAX_ITEMS)]


class Loose(BaseModel):
    # hide_input_in_errors: a failed check is logged, and its message would quote the minutes (patient data).
    model_config = ConfigDict(extra="ignore", coerce_numbers_to_str=True, hide_input_in_errors=True)


class KeyMoment(Loose):
    time: Text = ""
    moment: Text = ""


class Topic(Loose):
    name: Text = ""
    time: Text = ""
    status: Text = ""
    findings: Texts = []


class Decision(Loose):
    decision: Text = ""
    time: Text = ""
    patient: Text = ""


def _priority(value) -> str:
    value = str(value).strip().lower()
    return value if value in PRIORITIES else "medium"


class ActionItem(Loose):
    task: Text = ""
    owner: Text = ""
    owner_user_id: int | None = None  # the owner when chosen from the app's users
    deadline: Text = ""
    priority: Annotated[Literal[PRIORITIES], BeforeValidator(_priority)] = "medium"
    time: Text = ""
    patient: Text = ""


class Attendee(Loose):
    """Someone present at the meeting, also without speaking (added by the moderator, never by the LLM)."""
    user_id: int | None = None  # None: someone outside the directory
    name: Text = ""
    job_title: Text = ""
    position: Text = ""
    specialty: Text = ""


class Participant(Loose):
    role: Text = ""
    name: Text = ""
    seconds: Annotated[int, Field(ge=0), BeforeValidator(lambda v: round(v) if isinstance(v, float) else v)] = 0
    evidence: Text = ""


class MinutesDoc(Loose):
    title: Text = ""
    summary: Annotated[str, StringConstraints(max_length=MAX_SUMMARY)] = ""
    key_moments: Annotated[list[KeyMoment], Field(max_length=MAX_ITEMS)] = []
    topics: Annotated[list[Topic], Field(max_length=MAX_ITEMS)] = []
    decisions: Annotated[list[Decision], Field(max_length=MAX_ITEMS)] = []
    action_items: Annotated[list[ActionItem], Field(max_length=MAX_ITEMS)] = []
    open_issues: Texts = []
    warnings: Texts = []
    attendees: Annotated[list[Attendee], Field(max_length=MAX_ITEMS)] = []
    participants: Annotated[dict[Text, Participant], Field(max_length=MAX_ITEMS)] = {}


def minutes_doc(raw: dict) -> dict:
    """The minutes in the documented shape: every field present, unknown ones dropped."""
    return MinutesDoc.model_validate(raw).model_dump()
