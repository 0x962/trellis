import type { EditorFocus } from "../protocol";

export function observeFieldFocus(document: Document, selected: (focus: EditorFocus) => void) {
	const focused = (event: FocusEvent) => {
		const target = event.target;
		if (!(target instanceof document.defaultView!.Element)) return;
		const field = target.closest<HTMLElement>("[data-trellis-node][data-trellis-field]");
		if (field) selected({ nodeId: field.dataset.trellisNode!, field: field.dataset.trellisField! });
	};
	document.addEventListener("focusin", focused);
	return () => document.removeEventListener("focusin", focused);
}
