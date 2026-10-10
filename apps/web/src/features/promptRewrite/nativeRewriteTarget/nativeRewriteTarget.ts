import { isRewriteTextarea } from "../isRewriteTextarea";
import type { RewriteSelection } from "../rewriteTarget";

export function nativeRewriteTarget(element: HTMLTextAreaElement): RewriteSelection | null {
	if (!isRewriteTextarea(element)) return null;
	const original = element.value;
	if (!original.trim() || element.selectionStart !== 0 || element.selectionEnd !== original.length) return null;
	const current = (value: string) => element.isConnected && isRewriteTextarea(element) && element.value === value;
	const insert = (text: string) => {
		element.focus({ preventScroll: true });
		element.setSelectionRange(0, element.value.length);
		return element.ownerDocument.execCommand("insertText", false, text);
	};
	return {
		element,
		text: original,
		valid: () =>
			current(original) &&
			element.ownerDocument.activeElement === element &&
			element.selectionStart === 0 &&
			element.selectionEnd === original.length,
		insertKey: () => {
			if (current(original)) insert("l");
		},
		replace: (text) => {
			if (!insert(text)) return null;
			return () => {
				if (!current(text)) return false;
				return insert(original);
			};
		},
	};
}
