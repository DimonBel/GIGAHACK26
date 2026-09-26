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

export function AuthLayout({ wide, children }: { wide: boolean; children: ReactNode }) {
  const lang = useSessionStore((s) => s.lang);
  const setLang = useSessionStore((s) => s.setLang);
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 text-on-ink lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(27,107,94,0.15),transparent_60%)]"
        />
        <div className="relative flex items-baseline gap-3">
          <Wordmark className="text-white" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Medpark · on-premise</span>
        </div>
        <div className="relative flex max-w-md flex-col gap-8">
          <p className="font-sans text-4xl font-bold leading-[1.15] text-white">
            Audio in. Minutes out. Nothing leaves the hospital network.
          </p>
          <ul className="flex flex-col gap-3">
            {FACTS.map((fact) => (
              <li key={fact} className="flex gap-3 text-md text-on-ink-muted">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-ok" strokeWidth={2} />
                {fact}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative flex items-center gap-2 text-sm text-on-ink-muted">
          <Dot className="bg-ok" />
          Internal network only · no external calls
        </div>
      </aside>

      <main className="flex flex-col bg-canvas px-6 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Wordmark className="lg:invisible" />
          <Segmented label="Language" options={LANGS} value={lang} onChange={setLang} size="sm" />
        </div>
        <div className="flex flex-1 items-center justify-center py-12">
          <div
            className={cn(
              "w-full rounded-xl border border-line bg-white p-8 shadow-sm sm:p-10",
              wide ? "max-w-[480px]" : "max-w-[400px]",
            )}
          >
            {children}
          </div>
        </div>
        <p className="flex items-center justify-center gap-2 text-sm text-muted lg:hidden">
          <Dot className="bg-ok" />
          Internal network only · no external calls
        </p>
      </main>
    </div>
  );
}
