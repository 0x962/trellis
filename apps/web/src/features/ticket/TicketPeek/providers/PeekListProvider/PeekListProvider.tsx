import { createContext, type ReactNode, useContext } from "react";

// One row of the list a peek walks. A row inside a collapsed group is not
// visible, and j and k skip it.
export type PeekRow = { identifier: string; visible: boolean };

const Context = createContext<readonly PeekRow[]>([]);

export type PeekListProviderProps = {
	rows: readonly PeekRow[];
	children: ReactNode;
};

// Hands the list's rows, in display order, to the peek. The table and the
// board wrap their rows in it, so j and k inside the peek follow the list.
export function PeekListProvider({ rows, children }: PeekListProviderProps) {
	return <Context.Provider value={rows}>{children}</Context.Provider>;
}

export const usePeekList = () => useContext(Context);
