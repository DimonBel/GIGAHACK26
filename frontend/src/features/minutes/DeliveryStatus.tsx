import { Check, CircleAlert, LoaderCircle, Mail } from "lucide-react";
import { useEffect } from "react";

import { useMinutesStore } from "@/stores/minutes";

const POLL_MS = 2000;

/** Moderator, after approval: were the minutes emailed to every attendee? */
export function DeliveryStatus() {
  const { deliveries, loadDeliveries, retryDeliveries } = useMinutesStore();
  const queued = deliveries.filter((d) => d.status === "queued").length;
  const failed = deliveries.filter((d) => d.status === "failed");
  const sent = deliveries.length - queued - failed.length;

  useEffect(() => {
    void loadDeliveries();
  }, [loadDeliveries]);
  useEffect(() => {
    if (!queued) return;
    const timer = setInterval(() => void loadDeliveries(), POLL_MS);
    return () => clearInterval(timer);
  }, [queued, loadDeliveries]);

  const base = "flex items-center gap-1.5 text-base";
  if (!deliveries.length) {
    return (
      <span className={`${base} text-muted`}>
        <Mail aria-hidden className="size-4" strokeWidth={1.75} />
        Not emailed (no attendees)
      </span>
    );
  }
  if (queued) {
    return (
      <span role="status" className={`${base} text-muted`}>
        <LoaderCircle aria-hidden className="size-4 animate-spin" strokeWidth={1.75} />
        Emailing… {sent} of {deliveries.length}
      </span>
    );
  }
  if (failed.length) {
    return (
      <span
        role="alert"
        title={failed.map((d) => `${d.name ?? d.email}: ${d.error ?? "failed"}`).join("\n")}
        className={`${base} text-danger`}
      >
        <CircleAlert aria-hidden className="size-4" strokeWidth={1.75} />
        {sent ? `Emailed ${sent}, ` : ""}
        {failed.length} failed
        <button
          type="button"
          onClick={() => void retryDeliveries()}
          className="font-medium underline underline-offset-2"
        >
          Retry
        </button>
      </span>
    );
  }
  return (
    <span className={`${base} text-muted`} title={deliveries.map((d) => d.email).join("\n")}>
      <Check aria-hidden className="size-4 text-ok" strokeWidth={2} />
      Emailed to {sent} attendee{sent === 1 ? "" : "s"}
    </span>
  );
}
