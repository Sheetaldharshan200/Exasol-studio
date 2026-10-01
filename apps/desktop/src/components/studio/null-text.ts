// How the result grid and the cell viewer show SQL NULL (Settings → Result
// Grid → Display NULL as). A context, so the grid layers need no extra prop.

import { createContext } from "react";
import { nullLabel } from "@/lib/null-label";

export const NullTextContext = createContext(nullLabel(undefined));
