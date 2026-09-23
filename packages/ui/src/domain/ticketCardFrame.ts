// The box that every ticket card draws: the card on the board, the card that
// follows the pointer during a drag, the placeholder the board shows while it
// loads, and the samples in the gallery. It sets the corner radius, the border
// width and the padding. Each caller adds its own ground, its own height and
// its own gap.
//
// `--glimmer-radius` is the corner that `.ticket-glimmer` draws. The glimmer
// covers the area inside the border. That area turns a corner one border width
// tighter than this box, so the value takes the radius of this box and
// subtracts the border width. A card that changes `rounded-md` or the border
// width changes it here, and the glimmer follows.
export const ticketCardFrame =
	"relative flex flex-col rounded-md border p-3 [--glimmer-radius:calc(var(--radius-md)_-_var(--border-width-hairline))]";
