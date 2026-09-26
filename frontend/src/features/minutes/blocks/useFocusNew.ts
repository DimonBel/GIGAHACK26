import { useRef } from "react";

/** Focus the input of an item right after it was added (Enter in the previous one, or "Add item"). */
export function useFocusNew() {
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const pending = useRef<string | null>(null); // added, but its input is not rendered yet
  const register = (id: string) => (el: HTMLInputElement | null) => {
    if (!el) return void inputs.current.delete(id);
    inputs.current.set(id, el);
    if (pending.current === id) {
      pending.current = null;
      el.focus();
    }
  };
  const focus = (id: string) => {
    const el = inputs.current.get(id);
    if (el) el.focus();
    else pending.current = id;
  };
  return { register, focus, get: (id: string) => inputs.current.get(id) };
}
