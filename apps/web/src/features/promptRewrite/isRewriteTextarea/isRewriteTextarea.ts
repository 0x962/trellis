export function isRewriteTextarea(element: HTMLTextAreaElement) {
	return (
		!element.matches(":disabled") &&
		!element.readOnly &&
		!element.closest(".xterm, .cm-editor, .monaco-editor, [data-rewrite-disabled]")
	);
}
