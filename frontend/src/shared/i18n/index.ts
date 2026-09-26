import { useSessionStore } from "@/stores/session";
import type { Lang } from "@/shared/types/domain";

import { en, type Messages } from "./en";
import { ro } from "./ro";
import { ru } from "./ru";

export const MESSAGES: Record<Lang, Messages> = { en, ro, ru };
export const LANGS: { value: Lang; label: string }[] = [
  { value: "en", label: "EN" },
  { value: "ro", label: "RO" },
  { value: "ru", label: "RU" },
];

/** Messages of the language chosen in the header. */
export function useT(): Messages {
  return MESSAGES[useSessionStore((s) => s.lang)];
}

export type { Messages };
