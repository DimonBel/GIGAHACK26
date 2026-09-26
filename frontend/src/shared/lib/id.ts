let next = 0;

/** Unique id for items created in the UI (React keys, edit targets). */
export function uid(prefix = "id") {
  next += 1;
  return `${prefix}-${next}`;
}
