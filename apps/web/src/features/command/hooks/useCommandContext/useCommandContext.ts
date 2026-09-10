import { useEffect, useRef } from "react";
import { commandActions } from "../../commandStore";

// Gives the command palette the ticket context of a list surface, the
// table or the board: the identifier of the row or card a person focused,
// and the identifiers of the selected rows. The hook writes only when its
// own value changes, so its first empty value never erases a context
// another surface wrote. An unmounted surface that wrote a context clears it.
export const useCommandContext = (focused: string | null, selected: readonly string[]) => {
	const selectedKey = selected.join("\n");
	const published = useRef({ focused: null as string | null, selectedKey: "" });
	useEffect(() => {
		if (focused === published.current.focused) return;
		published.current.focused = focused;
		commandActions.setFocusedTicket(focused);
	}, [focused]);
	useEffect(() => {
		if (selectedKey === published.current.selectedKey) return;
		published.current.selectedKey = selectedKey;
		commandActions.setSelection(selectedKey === "" ? [] : selectedKey.split("\n"));
	}, [selectedKey]);
	useEffect(
		() => () => {
			if (published.current.focused !== null) commandActions.setFocusedTicket(null);
			if (published.current.selectedKey !== "") commandActions.setSelection([]);
		},
		[],
	);
};
