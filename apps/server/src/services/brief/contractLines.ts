import type { TicketContract } from "@trellis/api";

const valueLines = (label: string, values: string[]) => [
	`- ${label}:`,
	...(values.length === 0 ? ["  - not set"] : values.map((value) => `  - ${value}`)),
];

export const contractLines = (contract: TicketContract): string[] => [
	"## Contract",
	"",
	`- Result: ${contract.result === "" ? "not set" : contract.result}`,
	...valueLines("Files", contract.files),
	...valueLines("Leave alone", contract.leaveAlone),
	...valueLines("Verify", contract.verify),
	...valueLines("Review focus", contract.reviewFocus),
];
