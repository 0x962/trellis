// The elements inside a row that own their click: the controls of a cell,
// a link that is not the row link, and the options of a picker. The row
// link (`data-row-link` in `Row`) covers the whole row and forwards its
// plain click to the row, so it is not one of them.
const ownClick = [
	"button",
	"a:not([data-row-link])",
	"input",
	"select",
	"textarea",
	"[role=button]",
	"[role=checkbox]",
	"[role=listbox]",
	"[role=option]",
	"[role=menuitem]",
	"[role=menuitemcheckbox]",
	"[role=menuitemradio]",
].join(", ");

// Whether a click on a ticket row opens the ticket. A picker of a cell
// renders its menu in a portal outside the row, but React still delivers a
// click in that menu to the row's `onClick`. So a click opens the ticket
// only when its target is inside the row element in the DOM and is not
// inside an element that owns its click.
export function rowClickOpens(target: Element, row: Node) {
	return row.contains(target) && target.closest(ownClick) === null;
}
