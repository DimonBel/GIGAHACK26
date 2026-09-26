import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { LANGS } from "@/shared/i18n";
import { cn } from "@/shared/lib/cn";
import { Dot, Segmented, Wordmark } from "@/shared/ui";
import { useSessionStore } from "@/stores/session";

const FACTS = [
  "Whisper, pyannote and a local LLM run on the internal server",
  "Minutes in Romanian, Russian and English, topic by topic",
  "Nothing is sent before a moderator approves it",
];

/** Signed-out frame: brand panel on the left (large screens), the current step on the right. */
export function AuthLayout({ wide, children }: { wide: boolean; children: ReactNode }) {
  const lang = useSessionStore((s) => s.lang);
  const setLang = useSessionStore((s) => s.setLang);
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="hidden flex-col justify-between bg-ink p-12 text-on-ink lg:flex">
        <div className="flex items-baseline gap-3">
          <Wordmark className="text-white" />
          <span className="text-overline text-on-ink-muted uppercase">Medpark · on-premise</span>
        </div>
        <div className="flex max-w-md flex-col gap-8">
          <p className="font-serif text-display text-white">
            Audio in. Minutes out. Nothing leaves the hospital network.
          </p>
          <ul className="flex flex-col gap-3">
            {FACTS.map((fact) => (
              <li key={fact} className="flex gap-3 text-body text-on-ink-muted">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-ok" strokeWidth={2} />
                {fact}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center gap-2 text-caption text-on-ink-muted">
          <Dot className="bg-ok" />
          Internal network only · no external calls
        </div>
      </aside>

      <main className="flex flex-col px-6 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Wordmark className="lg:invisible" />
          <Segmented label="Language" options={LANGS} value={lang} onChange={setLang} size="sm" />
        </div>
        <div
          className={cn(
            "mx-auto flex w-full flex-1 flex-col justify-center gap-8 py-12",
            wide ? "max-w-[480px]" : "max-w-[400px]",
          )}
        >
          {children}
        </div>
        <p className="flex items-center justify-center gap-2 text-caption text-muted lg:hidden">
          <Dot className="bg-ok" />
          Internal network only · no external calls
        </p>
      </main>
    </div>
  );
}
