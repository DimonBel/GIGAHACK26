import { useParams } from "react-router";

import { isCabinet } from "@/shared/config/cabinets";
import type { Cabinet } from "@/shared/types/domain";

/** Cabinet of the current URL (/moderator/editor -> "moderator"). Only used under the cabinet route. */
export function useCabinet(): Cabinet {
  const { cabinet } = useParams();
  if (!isCabinet(cabinet)) throw new Error(`Not a cabinet route: ${cabinet}`);
  return cabinet;
}
