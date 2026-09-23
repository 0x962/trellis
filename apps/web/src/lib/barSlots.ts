// Every bar of Trellis that a person clicks names each of its control boxes
// with a `data-bar-slot` attribute. The box is the element that holds the
// place of the control in the row, and it is drawn whether the control
// inside it has arrived or not. This reads those names, in the order the
// markup holds them.
//
// A bar draws its controls in one row, each one at a fixed size, so the
// place of a control in the row decides its left offset. Two renders of the
// same bar that answer this with the same list therefore put every control
// at the same offset. A test renders a bar before its data arrives and
// again after, and compares the two lists: an equal list proves that no
// control moved, and the render with no data proves that the empty bar
// already holds every box.
export const barSlots = (html: string): string[] =>
	[...html.matchAll(/data-bar-slot="([^"]*)"/g)].map((match) => match[1] as string);
