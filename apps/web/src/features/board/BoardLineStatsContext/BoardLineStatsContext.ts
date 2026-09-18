import type { LineChangesValue } from "@trellis/ui";
import { createContext } from "react";

export type BoardLineStats = {
	values: ReadonlyMap<string, LineChangesValue>;
	pendingIds: ReadonlySet<string>;
};

export const BoardLineStatsContext = createContext<BoardLineStats | null>(null);
