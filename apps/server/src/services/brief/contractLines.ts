import type { TicketContract } from "@trellis/api";

const clauseLines = (label: string, values: string[]) => [
	`- ${label}:`,
	...(values.length === 0 ? ["  - not set"] : values.map((value) => `  - ${value}`)),
];

export const contractLines = (contract: TicketContract): string[] => [
	"## Contract",
	"",
	`- Result: ${contract.result === "" ? "not set" : contract.result}`,
	...clauseLines("Files", contract.files),
	...clauseLines("Leave alone", contract.leaveAlone),
	...clauseLines("Verify", contract.verify),
	...clauseLines("Review focus", contract.reviewFocus),
];
