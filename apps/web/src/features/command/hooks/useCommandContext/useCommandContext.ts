import type { TicketSummary } from "@trellis/api";
import { useEffect, useRef } from "react";
import { commandActions, type SelectionOwner } from "../../commandStore";

// One row of the key the hook compares: the id of the row and its version.
// The version rises on every server write, so a label added to a selected
// row reaches the palette without a change of the selected ids.
const keyOf = (rows: readonly TicketSummary[]) => rows.map((row) => `${row.id}.${row.version}`).join("\n");

// Gives the command palette the ticket context of a list surface, the
// table or the board: the identifier of the row or card a person focused,
// the selected rows, and the two selection commands of the surface. The
// hook writes only when its own value changes, so its first empty value
// never erases a context another surface wrote. An unmounted surface that
// wrote a context clears it.
//
// `owner` may be a new object on every render. The hook keeps the newest
// one in a ref and registers one wrapper, so the store never sees a change
// it does not need.
export const useCommandContext = (
	focused: string | null,
	selected: readonly TicketSummary[],
	owner: SelectionOwner,
) => {
	const selectedKey = keyOf(selected);
	const rows = useRef(selected);
	rows.current = selected;
	const latestOwner = useRef(owner);
	latestOwner.current = owner;
	const published = useRef({ focused: null as string | null, selectedKey: "" });
	useEffect(() => {
		if (focused === published.current.focused) return;
		published.current.focused = focused;
		commandActions.setFocusedTicket(focused);
	}, [focused]);
	useEffect(() => {
		if (selectedKey === published.current.selectedKey) return;
		published.current.selectedKey = selectedKey;
		commandActions.setSelection([...rows.current]);
	}, [selectedKey]);
	useEffect(() => {
		commandActions.setSelectionOwner({
			selectAll: () => latestOwner.current.selectAll(),
			clear: () => latestOwner.current.clear(),
		});
		return () => commandActions.setSelectionOwner(null);
	}, []);
	useEffect(
		() => () => {
			if (published.current.focused !== null) commandActions.setFocusedTicket(null);
			if (published.current.selectedKey !== "") commandActions.setSelection([]);
		},
		[],
	);
};
