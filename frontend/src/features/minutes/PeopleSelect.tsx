import type { SelectHTMLAttributes } from "react";

import { PEOPLE } from "@/mocks/people";
import { Select } from "@/shared/ui";

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
