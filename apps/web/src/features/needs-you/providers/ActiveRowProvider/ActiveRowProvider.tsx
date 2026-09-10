import { createContext, type ReactNode, useContext, useState } from "react";

type ActiveRow = {
	// The identifier of the one row on the page that shows its actions.
	activeId: string | null;
	setActiveId: (identifier: string) => void;
};

// Without a provider no row is active, so a section on its own shows its
// actions on hover and focus only.
const ActiveRowContext = createContext<ActiveRow>({ activeId: null, setActiveId: () => {} });

export type ActiveRowProviderProps = {
	// Every row identifier on the page, in page order.
	identifiers: readonly string[];
	children: ReactNode;
};

// The active row of Needs you: the one row, across every section, that
// shows its actions without a hover. The page opens with the first row
// active, and the pointer or the focus on a row makes that row active. A
// row that leaves the page hands the active mark back to the first row.
// The mark never moves the DOM focus.
export function ActiveRowProvider({ identifiers, children }: ActiveRowProviderProps) {
	const [chosen, setChosen] = useState<string | null>(null);
	const activeId = chosen !== null && identifiers.includes(chosen) ? chosen : (identifiers[0] ?? null);
	return <ActiveRowContext.Provider value={{ activeId, setActiveId: setChosen }}>{children}</ActiveRowContext.Provider>;
}

export const useActiveRow = () => useContext(ActiveRowContext);
