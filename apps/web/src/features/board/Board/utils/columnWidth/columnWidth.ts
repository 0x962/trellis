// The CSS width of each open column. The open columns share the board width
// that the 40 px rails and the 12 px gaps leave, between 248 px and 300 px.
// The percentage is of the board's content box.
export const columnWidth = (columns: number, rails: number) => {
	const open = Math.max(1, columns - rails);
	const fixed = rails * 40 + Math.max(0, columns - 1) * 12;
	return `clamp(248px, calc((100% - ${fixed}px) / ${open}), 300px)`;
};
