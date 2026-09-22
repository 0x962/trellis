import { contractClauses, type TicketContract } from "@trellis/api";

const row = (label: string, values: string[]): string => {
	const prefix = ` ${label.padEnd(15)}`;
	const continuation = " ".repeat(prefix.length);
	const lines = values.length === 0 ? ["nothing"] : values;
	return lines.map((value, index) => `${index === 0 ? prefix : continuation}${value}`).join("\n");
};

export const contractText = (contract: TicketContract): string =>
	`${["THE CONTRACT", ...contractClauses(contract).map(({ label, values }) => row(label, values))].join("\n")}\n`;
