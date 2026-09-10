import { useEffect } from "react";
import { useCommandStore } from "../../commandStore";
import { paletteTypeahead } from "../../typeahead";

const editable = (target: EventTarget | null) =>
	target instanceof HTMLElement &&
	(target.isContentEditable ||
		target.tagName === "INPUT" ||
		target.tagName === "TEXTAREA" ||
		target.tagName === "SELECT");

// While the palette is open, a printable key or Backspace from outside a
// text field goes to the palette query. The listener is on window in the
// capture phase, so it runs before every hotkey listener on document. It
// reads the store at each keydown, so the key right after Cmd+K is already
// held. A key in the palette field is a text field key and passes.
export const usePaletteTypeahead = () => {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (!useCommandStore.getState().open || editable(event.target)) return;
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			if (event.key.length !== 1 && event.key !== "Backspace") return;
			event.preventDefault();
			event.stopPropagation();
			paletteTypeahead.key(event.key);
		};
		window.addEventListener("keydown", onKeyDown, { capture: true });
		return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
	}, []);
};
