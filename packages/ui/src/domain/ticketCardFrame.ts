// The box that every ticket card draws. Each caller adds its own ground, its
// own height and its own gap.
//
// `--glimmer-radius` is the corner radius for `.ticket-glimmer`.
// ticket-glimmer.css says why it is smaller than this box.
export const ticketCardFrame =
	"relative flex flex-col rounded-md border p-3 [--glimmer-radius:calc(var(--radius-md)_-_var(--border-width-hairline))]";
