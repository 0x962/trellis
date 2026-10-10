import { isRewriteTextarea } from "../isRewriteTextarea";
import { nativeRewriteTarget } from "../nativeRewriteTarget";
import { type RewriteSelection, registeredRewriteTarget } from "../rewriteTarget";

export function installRewriteShortcut(document: Document, rewrite: (selection: RewriteSelection) => void) {
	let pending: { selection: RewriteSelection; timer: ReturnType<typeof setTimeout> } | null = null;
	const clear = () => {
		if (pending) clearTimeout(pending.timer);
		pending = null;
	};
	const flush = () => {
		const selection = pending?.selection;
		clear();
		selection?.insertKey();
	};
	const focusout = (event: FocusEvent) => {
		if (!pending) return;
		flush();
		if (event.relatedTarget instanceof HTMLElement) event.relatedTarget.focus({ preventScroll: true });
		else if (document.activeElement === event.target && event.target instanceof HTMLElement) event.target.blur();
	};
	const keydown = (event: KeyboardEvent) => {
		const element = event.target;
		if (
			event.key === "a" &&
			(event.ctrlKey || event.metaKey) &&
			!event.altKey &&
			!event.shiftKey &&
			!event.repeat &&
			!event.isComposing &&
			!event.defaultPrevented
		) {
			flush();
			if (!(element instanceof HTMLElement)) return;
			let selected = false;
			if (element instanceof HTMLTextAreaElement && isRewriteTextarea(element)) {
				element.select();
				selected = true;
			} else selected = registeredRewriteTarget(element)?.selectAll() ?? false;
			if (selected) {
				event.preventDefault();
				event.stopImmediatePropagation();
			}
			return;
		}
		const plainL = event.key === "l" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
		if (!plainL || event.repeat || event.isComposing || event.defaultPrevented) {
			flush();
			return;
		}
		if (pending) {
			const { selection } = pending;
			if (element === selection.element && selection.valid()) {
				clear();
				event.preventDefault();
				event.stopImmediatePropagation();
				rewrite(selection);
				return;
			}
			flush();
		}
		if (!(element instanceof HTMLElement)) return;
		const selection =
			element instanceof HTMLTextAreaElement
				? nativeRewriteTarget(element)
				: registeredRewriteTarget(element)?.capture();
		if (!selection) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		pending = { selection, timer: setTimeout(flush, 300) };
	};
	document.addEventListener("keydown", keydown, true);
	document.addEventListener("pointerdown", flush, true);
	document.addEventListener("focusout", focusout, true);
	document.addEventListener("compositionstart", flush, true);
	document.addEventListener("paste", flush, true);
	return () => {
		flush();
		document.removeEventListener("keydown", keydown, true);
		document.removeEventListener("pointerdown", flush, true);
		document.removeEventListener("focusout", focusout, true);
		document.removeEventListener("compositionstart", flush, true);
		document.removeEventListener("paste", flush, true);
	};
}
