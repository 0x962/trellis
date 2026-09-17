import { createContext } from "react";
import type { LineChangesValue } from "../components/CardContent/components/LineChanges";

export type BoardLineStats = {
	values: ReadonlyMap<string, LineChangesValue>;
	pendingIds: ReadonlySet<string>;
};

export const BoardLineStatsContext = createContext<BoardLineStats | null>(null);
