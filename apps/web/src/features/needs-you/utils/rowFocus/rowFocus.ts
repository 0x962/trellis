// Every Needs you row carries its identifier in `data-inbox-row` and takes
// the focus itself, so one walk covers the whole page across the sections.
const rowSelector = "[data-inbox-row]";

const rows = () => [...document.querySelectorAll<HTMLElement>(rowSelector)];

// The row the focus sits in, or null when the focus is somewhere else.
export const focusedRow = (): HTMLElement | null => {
	const active = document.activeElement;
	return active instanceof HTMLElement ? active.closest<HTMLElement>(rowSelector) : null;
};

export const focusedIdentifier = (): string | null => focusedRow()?.getAttribute("data-inbox-row") ?? null;

// Moves the focus `step` rows down the page. The first and the last row hold
// the focus, so a key press at the end of the list changes nothing.
export const focusRowBy = (step: number) => {
	const all = rows();
	const index = all.indexOf(focusedRow()!);
	if (index < 0) return;
	const next = all[Math.min(Math.max(index + step, 0), all.length - 1)];
	next?.focus();
};

// Moves the focus off `identifier` and onto the row under it, which is what
// an approval leaves behind.
export const focusRowAfter = (identifier: string) => {
	const all = rows();
	const index = all.findIndex((row) => row.getAttribute("data-inbox-row") === identifier);
	if (index < 0) return;
	const next = all[index + 1] ?? all[index - 1];
	next?.focus();
};

// The identifier of the row that holds the focus itself. A button inside a
// row has its own keys, so the row keys act on the row alone.
export const activeRowIdentifier = (): string | null =>
	document.activeElement === focusedRow() ? focusedIdentifier() : null;
