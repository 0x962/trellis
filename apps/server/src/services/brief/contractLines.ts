import { contractClauses, type TicketContract } from "@trellis/api";

const clauseLines = (label: string, values: string[]) => [
	`- ${label}:`,
	...(values.length === 0 ? ["  - nothing"] : values.map((value) => `  - ${value}`)),
];

export const contractLines = (contract: TicketContract): string[] => {
	const [result, ...lists] = contractClauses(contract);
	return [
		"## Contract",
		"",
		`- ${result.label}: ${result.values[0] ?? "nothing"}`,
		...lists.flatMap(({ label, values }) => clauseLines(label, values)),
	];
};
