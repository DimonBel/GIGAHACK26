import { Mail, Search, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Checkbox, EmptyState, IconButton } from "@/shared/ui";
import { useMinutesStore } from "@/stores/minutes";

/** Who attended: they receive the minutes by email when the moderator approves them. */
export function AttendeesPicker({ editing }: { editing: boolean }) {
  const { directory, attendeeList, loadDirectory, setAttendees } = useMinutesStore();
  const selected = useMinutesStore((s) => s.doc?.attendees);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (editing) void loadDirectory();
  }, [editing, loadDirectory]);

  const ids = selected ?? [];
  const toggle = (id: number) => setAttendees(ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]);
  const q = query.trim().toLowerCase();
  const shown = directory.filter((u) => !q || [u.name, u.email, u.dept].join(" ").toLowerCase().includes(q));

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="flex items-center gap-2 text-md font-semibold">
          <Mail aria-hidden className="size-4 text-muted" strokeWidth={1.75} />
          Attendees
          <span className="text-sm font-normal text-muted tabular-nums">{ids.length}</span>
        </h3>
        <p className="text-base text-muted">
          They can read these minutes and receive them by email when they are approved.
        </p>
      </div>

      {attendeeList.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {attendeeList.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-1 rounded-full border border-line bg-white py-1 pr-1 pl-3 text-base"
            >
              {a.name}
              <span className="text-sm text-muted">· {a.dept}</span>
              {editing ? (
                <IconButton
                  icon={X}
                  label={`Remove ${a.name}`}
                  onClick={() => toggle(a.id)}
                  className="size-6"
                />
              ) : (
                <span className="w-2" />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>
          {editing ? "Nobody chosen yet: tick who attended below." : "No attendees recorded."}
        </EmptyState>
      )}

      {editing && (
        <div className="overflow-hidden rounded-lg border border-line bg-white">
          <label className="flex h-10 items-center gap-2 border-b border-line-soft px-3">
            <Search aria-hidden className="size-4 text-subtle" strokeWidth={1.75} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the directory by name, email or department"
              aria-label="Search the directory"
              className="h-full flex-1 bg-transparent text-md outline-none placeholder:text-subtle"
            />
          </label>
          <ul className="max-h-64 divide-y divide-line-soft overflow-y-auto">
            {shown.map((u) => (
              <li key={u.id}>
                <label className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-canvas">
                  <Checkbox checked={ids.includes(u.id)} onChange={() => toggle(u.id)} />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-md font-medium">{u.name}</span>
                    <span className="truncate text-sm text-muted">
                      {u.dept} · {u.email}
                    </span>
                  </span>
                </label>
              </li>
            ))}
            {!shown.length && <li className="px-3 py-3 text-base text-subtle">No one matches.</li>}
          </ul>
        </div>
      )}
    </section>
  );
}
