import type { EditorContent } from "../../../../protocol";

export function suspendNativeEditor(document: Document, content: () => EditorContent) {
	const controls = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';
	if (Array.from(document.querySelectorAll<HTMLElement>(controls)).some(
		(control) => !control.hidden && control.dataset.state !== "closed" && control.getAttribute("aria-hidden") !== "true",
	)) {
		return { state: "refused", reason: "open-control" } as const;
	}
	if (document.querySelector("input:invalid, textarea:invalid, select:invalid")) {
		return { state: "refused", reason: "invalid-field" } as const;
	}
	document.getElementById("root")!.inert = true;
	return { state: "suspended", content: content() } as const;
}
