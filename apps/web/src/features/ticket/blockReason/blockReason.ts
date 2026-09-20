import type { TicketSummary } from "@trellis/api";

// Why a ticket is not done yet. A question is done when a person picks an
// option, so the reason says `is open`. Every other ticket is done when its
// pull request merges. The `Ready` sentence of the chain block and the line
// under `Start` both call this function, so both say the same words.
export function blockReason(dependency: TicketSummary["waitsOn"][number]): string {
	return dependency.isQuestion ? "is open" : "is not merged";
}
