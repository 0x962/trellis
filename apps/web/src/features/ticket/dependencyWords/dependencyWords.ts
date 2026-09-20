import type { TicketSummary } from "@trellis/api";

// What a ticket that holds another ticket back still owes. A question
// closes when a person picks an option, so the words say `is open`. Every
// other ticket closes when its pull request merges. The `Ready` sentence of
// the chain block and the line under `Start` say the same words.
export function dependencyWords(dependency: TicketSummary["waitsOn"][number]): string {
	return dependency.isQuestion ? "is open" : "is not merged";
}
