// The button inside a cell that opens an inline picker. It fills the cell's
// height, so the whole cell is the hit area, and shows its bounds on hover,
// on focus, and while its popover is open. The hover is a wash of the text
// color, like a quiet Button, so it reads on a plain row and on a selected
// one.
export const cellButtonClass =
	"inline-flex h-7 max-w-full min-w-7 items-center gap-1.5 rounded-md px-1 text-left transition-colors duration-hover hover:bg-fg/6 data-popup-open:bg-fg/10 focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2";
