import { CircleAlert, LoaderCircle, Plus } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router";

import { cabinetPath, minutesPath } from "@/shared/config/cabinets";
import { useCabinet } from "@/shared/hooks/useCabinet";
import { useT } from "@/shared/i18n";
import { MEETING_TYPES } from "@/shared/lib/tones";
import { Button, EmptyState, PageHeader, Panel, Segmented } from "@/shared/ui";
import { isBusy, useMeetingsStore, type MeetingFilter } from "@/stores/meetings";

import { MeetingRow, MEETING_COLUMNS } from "./MeetingRow";

const REFRESH_MS = 3000;

export function MeetingsListPage() {
  const t = useT();
  const cabinet = useCabinet();
  const isModerator = cabinet === "moderator";
  const { meetings, loaded, error, filter, setFilter, load } = useMeetingsStore();
  const navigate = useNavigate();
  const busy = meetings.some(isBusy);

  useEffect(() => {
    void load();
  }, [load]);
  // Keep queued / processing meetings up to date while they are on screen.
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [busy, load]);

  const shown = meetings.filter((m) => filter === "All" || m.type === filter);
  const filters: { value: MeetingFilter; label: string; count: number }[] = [
    { value: "All", label: "All", count: meetings.length },
    ...MEETING_TYPES.map((type) => ({
      value: type,
      label: type,
      count: meetings.filter((m) => m.type === type).length,
    })),
  ];
  const newMeeting = () => navigate(cabinetPath(cabinet, "new"));

  return (
    <>
      <PageHeader
        title={isModerator ? t.meetings : t.moms}
        description={
          isModerator
            ? "Recorded meetings and their minutes. Open one to follow its processing, or to review and approve it."
            : "Minutes of your meetings, as drafted by the moderator. You can suggest additions until they are approved."
        }
        actions={
          isModerator && (
            <Button variant="primary" icon={Plus} onClick={newMeeting}>
              {t.new}
            </Button>
          )
        }
      />
      <div className="flex flex-col gap-3">
        {meetings.length > 0 && (
          <Segmented label="Filter by meeting type" options={filters} value={filter} onChange={setFilter} />
        )}
        {error && (
          <p
            role="alert"
            className="flex items-center gap-2 rounded-lg bg-danger-soft px-4 py-3 text-base text-danger-ink"
          >
            <CircleAlert aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
            {error}
          </p>
        )}
        <Panel className="overflow-hidden">
          <div
            className={`hidden border-b border-line-soft bg-canvas px-5 py-2.5 text-sm font-medium text-muted md:grid ${MEETING_COLUMNS}`}
          >
            <span>Meeting</span>
            <span>Date</span>
            <span>Length</span>
            <span>Status</span>
          </div>
          {!loaded ? (
            <EmptyState icon={LoaderCircle} className="px-5 py-10 [&_svg]:animate-spin">
              Loading meetings…
            </EmptyState>
          ) : shown.length ? (
            <ul className="divide-y divide-line-soft">
              {shown.map((m) => (
                <li key={m.id}>
                  <MeetingRow meeting={m} onOpen={() => navigate(minutesPath(cabinet, m.id))} />
                </li>
              ))}
            </ul>
          ) : meetings.length ? (
            <EmptyState className="px-5 py-10">No {filter.toLowerCase()} meetings.</EmptyState>
          ) : (
            <div className="flex flex-col items-start gap-3 px-5 py-10">
              <p className="text-md text-muted">
                {isModerator
                  ? "No meetings yet. Upload or record the first one."
                  : "No minutes shared with you yet."}
              </p>
              {isModerator && (
                <Button icon={Plus} onClick={newMeeting}>
                  {t.new}
                </Button>
              )}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
