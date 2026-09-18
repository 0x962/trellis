import type { TicketLabel } from "@trellis/api";

// The labels of a ticket as one line of text, such as "Bug, Type / Chore".
// A control that draws the pills gives this text to a screen reader in place
// of them.
export const labelNames = (labels: readonly TicketLabel[]): string =>
	labels.map((label) => (label.group === null ? label.name : `${label.group} / ${label.name}`)).join(", ");
