import { Plus } from "lucide-react";
import { useNavigate } from "react-router";

import { MEETINGS } from "@/mocks/meetings";
import { cabinetPath } from "@/shared/config/cabinets";
import { useCabinet } from "@/shared/hooks/useCabinet";
import { useT } from "@/shared/i18n";
import { MEETING_TYPES } from "@/shared/lib/tones";
import { Button, EmptyState, PageHeader, Panel, Segmented } from "@/shared/ui";
import { useMeetingsStore, type MeetingFilter } from "@/stores/meetings";
import { useMinutesStore } from "@/stores/minutes";

import { MeetingRow, MEETING_COLUMNS } from "./MeetingRow";

export function MeetingsListPage() {
  const t = useT();
  const cabinet = useCabinet();
  const isModerator = cabinet === "moderator";
  const { filter, setFilter } = useMeetingsStore();
  const openFirstTopic = useMinutesStore((s) => s.openFirstTopic);
  const navigate = useNavigate();

  const visible = MEETINGS.filter((m) => isModerator || !m.processing);
  const shown = visible.filter((m) => filter === "All" || m.type === filter);
  const filters: { value: MeetingFilter; label: string; count: number }[] = [
    { value: "All", label: "All", count: visible.length },
    ...MEETING_TYPES.map((type) => ({ value: type, label: type, count: visible.filter((m) => m.type === type).length })),
  ];

  return (
    <>
      <PageHeader
        title={isModerator ? t.meetings : t.moms}
        description={
          isModerator
            ? "Recorded meetings and their minutes. Open one to review, edit and send it."
            : "Minutes of the meetings you attended, as approved by the moderator."
        }
        actions={
          isModerator && (
            <Button variant="primary" icon={Plus} onClick={() => navigate(cabinetPath(cabinet, "new"))}>
              {t.new}
            </Button>
          )
        }
      />
      <div className="flex flex-col gap-3">
        <Segmented label="Filter by meeting type" options={filters} value={filter} onChange={setFilter} />
        <Panel className="overflow-hidden">
          <div
            className={`hidden border-b border-line-soft bg-canvas px-5 py-2.5 text-sm font-medium text-muted md:grid ${MEETING_COLUMNS}`}
          >
            <span>Meeting</span>
            <span>Date</span>
            <span>Length</span>
            <span>Status</span>
          </div>
          {shown.length ? (
            <ul className="divide-y divide-line-soft">
              {shown.map((m) => (
                <li key={m.id}>
                  <MeetingRow
                    meeting={m}
                    onOpen={() => {
                      openFirstTopic();
                      navigate(cabinetPath(cabinet, isModerator ? "editor" : "read"));
                    }}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState className="px-5 py-10">No {filter.toLowerCase()} meetings yet.</EmptyState>
          )}
        </Panel>
      </div>
    </>
  );
}
