import { Search, X } from "lucide-react";
import { useState } from "react";

import type { CodesBlock as CodesBlockData } from "@/api/types";
import { cn } from "@/shared/lib/cn";
import { CODE_TEXT } from "@/shared/lib/tones";
import type { CodeSystem } from "@/shared/types/domain";
import { EmptyState, IconButton } from "@/shared/ui";
import { newId, searchCatalog, useMinutesStore } from "@/stores/minutes";

const codeColor = (system: string) => CODE_TEXT[system as CodeSystem] ?? "text-ink";

export function CodesBlock({
  topicId,
  block,
  editing,
}: {
  topicId: string;
  block: CodesBlockData;
  editing: boolean;
}) {
  const { addItem, removeItem } = useMinutesStore();
  const [query, setQuery] = useState("");
  const results = editing ? searchCatalog(query, block.items) : [];

  return (
    <>
      {block.items.length ? (
        <ul className="flex flex-col divide-y divide-line-soft">
          {block.items.map((c) => (
            <li
              key={c.id}
              className="grid grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-3 py-2 first:pt-0"
            >
              <span className={cn("text-md font-semibold tabular-nums", codeColor(c.system))}>{c.code}</span>
              <span className="text-md text-ink">{c.label}</span>
              {editing ? (
                <IconButton
                  icon={X}
                  label={`Remove ${c.code}`}
                  onClick={() => removeItem(topicId, block.id, c.id)}
                />
              ) : (
                <span className="text-sm text-muted">{c.system}</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>No codes yet.</EmptyState>
      )}

      {editing && (
        <div className="overflow-hidden rounded-md border border-line-strong bg-white focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/15">
          <label className="flex h-10 items-center gap-2 px-3">
            <Search aria-hidden className="size-4 text-subtle" strokeWidth={1.75} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ICD-10 / ACHI by code or term (RO · RU · EN)"
              aria-label="Search codes"
              className="h-full flex-1 bg-transparent text-md outline-none placeholder:text-subtle"
            />
          </label>
          {results.length > 0 && (
            <ul className="border-t border-line-soft py-1">
              {results.map((c) => (
                <li key={c.code}>
                  <button
                    type="button"
                    onClick={() => {
                      addItem(topicId, block.id, {
                        id: newId("c"),
                        system: c.system,
                        code: c.code,
                        label: c.label,
                      });
                      setQuery("");
                    }}
                    className="grid w-full grid-cols-[88px_minmax(0,1fr)_auto] gap-3 px-3 py-2 text-left transition-colors hover:bg-sunken"
                  >
                    <span className={cn("text-md font-semibold tabular-nums", codeColor(c.system))}>
                      {c.code}
                    </span>
                    <span className="text-md">{c.label}</span>
                    <span className="text-sm text-muted">{c.system}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.trim() && results.length === 0 && (
            <p className="border-t border-line-soft px-3 py-2.5 text-base text-subtle">No matching code.</p>
          )}
        </div>
      )}
    </>
  );
}
