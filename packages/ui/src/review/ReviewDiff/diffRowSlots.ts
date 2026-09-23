import { groupHeaderHeight, phoneGroupHeaderHeight } from "../../domain/GroupHeader";

// The slot of every diff row whose box the stylesheet pins. A slot is the box
// the row draws plus the clear space around that box, so a slot is what the
// list of rows reserves and a box is what the stylesheet draws.
//
// The list is virtual: it draws only the rows inside the visible height and
// adds these numbers to place a row. A row that draws a height other than its
// slot moves every row under it. A file of a thousand lines with an error of
// 4 px per line puts a link to its last line 4000 px from where it lands.
//
// `ReviewDiff.css` draws each box at the number it reads here, through the
// custom properties of `diffRowStyle`. That is the only place the height is
// written, so the drawn height and the reserved height are one value.
//
// A touch screen draws every button 44 px tall, because `hitArea` gives an
// `IconButton` the class `pointer-coarse:h-11`. A button is the tallest thing
// in a code line, in a file header and in a hunk header, so all three grow
// with it.
export type DiffRowSlots = {
	file: number;
	group: number;
	hunk: number;
	line: number;
	end: number;
};

// The 4 px base of the spacing scale. It is the value of `--spacing` in
// `tokens.css`, which every box of the diff read before these numbers moved
// here.
const STEP = 4;

// The height of the tallest thing a touch screen draws in a row: a button,
// through the `pointer-coarse` classes of `hitArea`.
const COARSE_BUTTON = 44;

// A 1 px border above and 1 px below. Every box is a border box, so a border
// eats into the height instead of adding to it.
const BORDERS = 2;

// The clear space above a file header and under the bar that closes a file.
// The space sits outside the box, so only the slot carries it.
const FILE_GAP = STEP * 4;

// A file header holds the Viewed box and the Show full file button inside
// 8 px of padding, above and below.
const fileBox = (coarse: boolean) => (coarse ? COARSE_BUTTON + STEP * 4 + BORDERS : STEP * 12);

// A hunk header holds the expand controls, which are an `IconButton` at size
// `xs`: 24 px on a mouse.
const hunkBox = (coarse: boolean) => (coarse ? COARSE_BUTTON + BORDERS : STEP * 6 + BORDERS);

// A code line holds the Add line comment button, which is an `IconButton` at
// size `sm`.
const lineBox = (coarse: boolean) => (coarse ? COARSE_BUTTON : STEP * 7);

// The bar that closes the box of a file.
const END_BOX = STEP * 4;

// `coarse` is true on a touch screen and `phone` under 768 px. The band of a
// risk group is a `GroupHeader`, which is taller on a phone.
export const diffRowSlots = (coarse: boolean, phone: boolean): DiffRowSlots => ({
	file: fileBox(coarse) + FILE_GAP,
	group: phone ? phoneGroupHeaderHeight : groupHeaderHeight,
	hunk: hunkBox(coarse),
	line: lineBox(coarse),
	end: END_BOX + FILE_GAP,
});

// The custom properties that carry the box heights to `ReviewDiff.css`. A name
// this object leaves out would drop the `height` declaration that reads it,
// and the row would take the height of its contents again.
export const diffRowStyle = (coarse: boolean) => ({
	"--review-diff-file-box": `${fileBox(coarse)}px`,
	"--review-diff-hunk-box": `${hunkBox(coarse)}px`,
	"--review-diff-line-box": `${lineBox(coarse)}px`,
	"--review-diff-end-box": `${END_BOX}px`,
});
