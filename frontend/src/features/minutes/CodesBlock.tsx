import { Search, X } from "lucide-react";

import { cn } from "@/shared/lib/cn";
import { CODE_TEXT } from "@/shared/lib/tones";
import type { Topic } from "@/shared/types/domain";
import { EmptyState, IconButton } from "@/shared/ui";
import { searchCatalog, useMinutesStore } from "@/stores/minutes";

import { Block } from "./Block";

export function CodesBlock({ topic, editing }: { topic: Topic; editing: boolean }) {
  const { icdQuery, setIcdQuery, addCode, removeCode } = useMinutesStore();
  const results = editing ? searchCatalog(icdQuery, topic) : [];
  return (
    <Block label="Diagnosis & DRG">
      {topic.codes.length ? (
        <ul className="flex flex-col divide-y divide-line-soft">
          {topic.codes.map((c) => (
            <li key={c.code} className="grid grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-3 py-2 first:pt-0">
              <span className={cn("text-md font-semibold tabular-nums", CODE_TEXT[c.system])}>{c.code}</span>
              <span className="text-md text-ink">{c.label}</span>
              {editing ? (
                <IconButton icon={X} label={`Remove ${c.code}`} onClick={() => removeCode(topic.id, c.code)} />
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
              value={icdQuery}
              onChange={(e) => setIcdQuery(e.target.value)}
              placeholder="Add a code: search ICD-10 / ACHI by code or term (RO · RU · EN)"
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
                    onClick={() => addCode(topic.id, c)}
                    className="grid w-full grid-cols-[88px_minmax(0,1fr)_auto] gap-3 px-3 py-2 text-left transition-colors hover:bg-sunken"
                  >
                    <span className={cn("text-md font-semibold tabular-nums", CODE_TEXT[c.system])}>{c.code}</span>
                    <span className="text-md">{c.label}</span>
                    <span className="text-sm text-muted">{c.system}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {icdQuery.trim() && results.length === 0 && (
            <p className="border-t border-line-soft px-3 py-2.5 text-base text-subtle">No matching code.</p>
          )}
        </div>
      )}

      {topic.drg && (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md bg-sunken px-3.5 py-2.5">
          <span className="text-xs font-semibold text-muted uppercase tracking-wider">DRG</span>
          <span className="text-md font-semibold tabular-nums">{topic.drg}</span>
          <span className="text-base text-ink-2">{topic.drgLabel}</span>
        </div>
      )}
    </Block>
  );
}
