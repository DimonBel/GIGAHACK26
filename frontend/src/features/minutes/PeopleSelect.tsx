import type { SelectHTMLAttributes } from "react";

import { PEOPLE } from "@/mocks/people";
import { Select } from "@/shared/ui";

/** Select of the meeting's people (author of a view, owner of a task). */
export function PeopleSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Select {...props}>
      {PEOPLE.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </Select>
  );
}
