import { LoaderCircle, Search, X } from "lucide-react";
import { useEffect, useState } from "react";

import { searchCodes, type IcdCode } from "@/api/codes";
import type { CodesBlock as CodesBlockData } from "@/api/types";
import { cn } from "@/shared/lib/cn";
import { CODE_TEXT } from "@/shared/lib/tones";
import type { CodeSystem, Lang } from "@/shared/types/domain";
import { EmptyState, IconButton } from "@/shared/ui";
import { newId, useMinutesStore } from "@/stores/minutes";
import { useSessionStore } from "@/stores/session";

const DEBOUNCE_MS = 200;
const codeColor = (system: string) => CODE_TEXT[system as CodeSystem] ?? "text-ink";
/** The code's name in the interface language, else the first one there is. */
const nameIn = (c: IcdCode, lang: Lang) => c[lang] || c.en || c.ro || c.ru;

/** Search the ICD-10 dictionary on the server (Romanian, Russian, English names), a little after typing stops. */
function useCodeSearch(query: string, enabled: boolean) {
  const [results, setResults] = useState<IcdCode[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const q = query.trim();
    if (!enabled || !q) return;
    let stale = false;
    const timer = setTimeout(() => {
      setBusy(true);
      searchCodes(q)
        .then((found) => !stale && setResults(found))
        .catch(() => !stale && setResults([]))
        .finally(() => !stale && setBusy(false));
    }, DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query, enabled]);
  return { results: query.trim() ? results : [], busy };
}

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
  const lang = useSessionStore((s) => s.lang);
  const [query, setQuery] = useState("");
  const { results, busy } = useCodeSearch(query, editing);
  const have = new Set(block.items.map((c) => c.code));
  const shown = results.filter((c) => !have.has(c.code));

  return (
    <>
      {block.items.length ? (
        <ul className="flex flex-col divide-y divide-line-soft">
          {block.items.map((c) => (
            <li
              key={c.id}
              className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3 py-2 first:pt-0"
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
            {busy ? (
              <LoaderCircle aria-hidden className="size-4 animate-spin text-subtle" strokeWidth={1.75} />
            ) : (
              <Search aria-hidden className="size-4 text-subtle" strokeWidth={1.75} />
            )}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Add an ICD-10 code: search by code or term (RO · RU · EN)"
              aria-label="Search ICD-10 codes"
              className="h-full flex-1 bg-transparent text-md outline-none placeholder:text-subtle"
            />
          </label>
          {shown.length > 0 && (
            <ul className="border-t border-line-soft py-1">
              {shown.map((c) => (
                <li key={c.code}>
                  <button
                    type="button"
                    onClick={() => {
                      addItem(topicId, block.id, {
                        id: newId("c"),
                        system: "ICD-10",
                        code: c.code,
                        label: nameIn(c, lang),
                      });
                      setQuery("");
                    }}
                    className="grid w-full grid-cols-[72px_minmax(0,1fr)] gap-3 px-3 py-2 text-left transition-colors hover:bg-sunken"
                  >
                    <span className="text-md font-semibold text-primary tabular-nums">{c.code}</span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-md">{nameIn(c, lang)}</span>
                      <span className="truncate text-sm text-muted">
                        {(["ro", "ru", "en"] as const)
                          .filter((l) => l !== lang && c[l])
                          .map((l) => c[l])
                          .join(" · ")}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.trim() && !busy && shown.length === 0 && (
            <p className="border-t border-line-soft px-3 py-2.5 text-base text-subtle">No matching code.</p>
          )}
        </div>
      )}
    </>
  );
}
