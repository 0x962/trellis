import { type PrKind, prPaths, type TicketContract } from "@trellis/api";

const evidenceByKind: Record<PrKind, string> = {
	backend: "backend: summary · verify record · test proof · contract table",
	frontend: "frontend: summary · after image · before image · capture record · console list",
	mixed:
		"mixed: summary · after image · before image · capture record · console list · verify record · test proof · contract table",
};

export const evidenceOwedText = (contract: TicketContract): string => {
	const kind = prPaths(
		"",
		contract.files.map((path) => ({ path, change: "change" })),
	).kind;
	return evidenceByKind[kind];
};

const row = (label: string, values: string[]): string => {
	const prefix = ` ${label.padEnd(15)}`;
	const continuation = " ".repeat(prefix.length);
	const lines = values.length === 0 ? ["-"] : values;
	return lines.map((value, index) => `${index === 0 ? prefix : continuation}${value}`).join("\n");
};

export const contractText = (contract: TicketContract): string =>
	`${[
		"THE CONTRACT",
		row("Result", [contract.result]),
		row("Files", contract.files),
		row("Leave alone", contract.leaveAlone),
		row("Verify", contract.verify),
		row("Review focus", contract.reviewFocus),
		row("Evidence owed", [evidenceOwedText(contract)]),
	].join("\n")}\n`;
