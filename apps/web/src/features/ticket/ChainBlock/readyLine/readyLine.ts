import type { TicketSummary } from "@trellis/api";

type Dependency = TicketSummary["waitsOn"][number];

// A question closes when a person picks an option, so the sentence says
// `open`. Every other ticket closes when its pull request merges.
const reasonOf = (dependency: Dependency) =>
	`${dependency.identifier} is ${dependency.isQuestion ? "open" : "not merged"}`;

// The list always puts a comma and the word `and` before the last item.
function sentenceList(parts: readonly string[]): string {
	if (parts.length === 1) return parts[0] as string;
	return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

// The `Ready` sentence of the chain block. The server leaves a ticket that
// is done out of `waitsOn`, so every entry still holds the work back. The
// sentence reports a state and starts nothing.
export function readyLine(waitsOn: TicketSummary["waitsOn"]): string {
	if (waitsOn.length === 0) return "yes. No ticket holds this one back.";
	return `no. ${sentenceList(waitsOn.map(reasonOf))}.`;
}
