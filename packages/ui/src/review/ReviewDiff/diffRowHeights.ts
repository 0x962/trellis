// The exact height in pixels of every diff row whose box the stylesheet pins.
// The list of rows is virtual: it draws only the rows inside the visible
// height and adds these numbers to place a row, so a row that draws a height
// other than the one counted here moves every row under it. A file of a
// thousand lines with a 4 px error per line puts a link to its last line 4000
// px away from where the link lands.
//
// `ReviewDiff.css` draws each of these rows at the number it reads here,
// through the custom properties of `diffRowStyle`. That is the only place the
// height is written, so the drawn height and the counted height are one value.
//
// A touch screen draws every button 44 px tall, because `hitArea` gives an
// `IconButton` the class `pointer-coarse:h-11`. A button is the tallest thing
// in a code line, in a file header and in a hunk header, so all three grow
// with it.
export type DiffRowHeights = {
	file: number;
	group: number;
	hunk: number;
	line: number;
	end: number;
};

// The clear space above a file header and under the bar that closes a file.
// The space belongs to the row, so the row's height carries it.
const FILE_GAP = 16;

// A file header holds the Viewed box and the Show full file button inside 8 px
// of padding and a 1 px border, above and below.
const fileBox = (coarse: boolean) => (coarse ? 44 + 16 + 2 : 48);

// Every box here is a border box, so a 1 px border above and below eats into
// the number. A hunk header holds the expand controls, which are 24 px on a
// mouse and 44 px on a touch screen, so a touch screen needs 44 + 2.
const hunkBox = (coarse: boolean) => (coarse ? 44 + 2 : 24);

// A code line holds the Add line comment button, which is an `IconButton` at
// size `sm`.
const lineBox = (coarse: boolean) => (coarse ? 44 : 28);

// The bar that closes the box of a file.
const END_BOX = 16;

export const diffRowHeights = (coarse: boolean): DiffRowHeights => ({
	file: fileBox(coarse) + FILE_GAP,
	group: 32,
	hunk: hunkBox(coarse),
	line: lineBox(coarse),
	end: END_BOX + FILE_GAP,
});

// The custom properties that carry the heights to `ReviewDiff.css`. A name
// this object leaves out would drop the `height` declaration that reads it,
// and the row would take the height of its contents again.
export const diffRowStyle = (coarse: boolean) => ({
	"--review-diff-file-box": `${fileBox(coarse)}px`,
	"--review-diff-group-box": `${diffRowHeights(coarse).group}px`,
	"--review-diff-hunk-box": `${hunkBox(coarse)}px`,
	"--review-diff-line-box": `${lineBox(coarse)}px`,
	"--review-diff-end-box": `${END_BOX}px`,
});
