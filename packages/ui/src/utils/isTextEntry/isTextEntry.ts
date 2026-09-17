export const isTextEntry = (target: EventTarget | null) =>
	target instanceof HTMLElement &&
	(target.isContentEditable || target.closest('input, textarea, select, [role~="textbox"]') !== null);
