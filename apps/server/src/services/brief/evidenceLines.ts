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

const changedFile = (path: string): PrPath => ({ path, change: "change" });

export const evidenceLines = (contract: TicketContract, repositoryName: string): string[] => {
	if (contract.files.length === 0) return ["## Evidence owed", "", "- unknown. The contract names no file."];
	const facts = prPaths(repositoryName, contract.files.map(changedFile));
	const floor = evidenceFloor({ kind: facts.kind, risk: facts.risk, rows: [], hasSummary: false });
	return ["## Evidence owed", "", `- Kind: ${floor.kind}`, ...floor.required.map((item) => `- ${evidenceWords[item]}`)];
};
