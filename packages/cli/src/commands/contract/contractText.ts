import { contractClauses, contractFloor, evidenceWords, type TicketContract } from "@trellis/api";

export const evidenceOwedText = (contract: TicketContract, repositoryName: string | undefined): string => {
	const floor = contractFloor(repositoryName, contract);
	if (floor === null) return "-";
	return `${floor.kind}: ${floor.required.map((item) => evidenceWords[item]).join(" · ")}`;
};

const row = (label: string, values: string[]): string => {
	const prefix = ` ${label.padEnd(15)}`;
	const continuation = " ".repeat(prefix.length);
	const lines = values.length === 0 ? ["nothing"] : values;
	return lines.map((value, index) => `${index === 0 ? prefix : continuation}${value}`).join("\n");
};

export const contractText = (contract: TicketContract, repositoryName: string | undefined): string =>
	`${[
		"THE CONTRACT",
		...contractClauses(contract).map(({ label, values }) => row(label, values)),
		row("Evidence owed", [evidenceOwedText(contract, repositoryName)]),
	].join("\n")}\n`;
