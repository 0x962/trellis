import { type EvidenceFloorItem, evidenceFloor, type PrPath, prPaths, type TicketContract } from "@trellis/api";

const evidenceWords: Record<EvidenceFloorItem, string> = {
	summary: "summary",
	after: "after image",
	before: "before image",
	capture: "capture record",
	console: "console list",
	verify: "verify record",
	test: "test proof",
	contract: "contract table",
	migration: "migration plan",
	picture: "picture",
	equivalence: "equivalence proof",
};

const asChangedFile = (path: string): PrPath => ({ path, change: "change" });

export const evidenceOwedText = (contract: TicketContract, repositoryName: string): string => {
	if (contract.files.length === 0) return "-";
	const facts = prPaths(repositoryName, contract.files.map(asChangedFile));
	const floor = evidenceFloor({ kind: facts.kind, risk: facts.risk, rows: [], hasSummary: false });
	return `${floor.kind}: ${floor.required.map((item) => evidenceWords[item]).join(" · ")}`;
};

const row = (label: string, values: string[]): string => {
	const prefix = ` ${label.padEnd(15)}`;
	const continuation = " ".repeat(prefix.length);
	const lines = values.length === 0 ? ["-"] : values;
	return lines.map((value, index) => `${index === 0 ? prefix : continuation}${value}`).join("\n");
};

export const contractText = (contract: TicketContract, repositoryName: string): string =>
	`${[
		"THE CONTRACT",
		row("Result", [contract.result]),
		row("Files", contract.files),
		row("Leave alone", contract.leaveAlone),
		row("Verify", contract.verify),
		row("Review focus", contract.reviewFocus),
		row("Evidence owed", [evidenceOwedText(contract, repositoryName)]),
	].join("\n")}\n`;
