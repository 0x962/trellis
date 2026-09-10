import type { KeyboardEvent, RefObject } from "react";

// A keydown handler for the frame around a picker list. A key in `picks`
// picks its row while the search field is empty. With text in the field,
// the same key is text for the search, so "2" still finds "P2 bugs".
export const keyPick =
	(picks: ReadonlyMap<string, () => void>, input: RefObject<HTMLInputElement | null>) =>
	(event: KeyboardEvent<HTMLElement>) => {
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		if ((input.current?.value ?? "") !== "") return;
		const pick = picks.get(event.key);
		if (pick === undefined) return;
		event.preventDefault();
		pick();
	};
