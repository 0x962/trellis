import { evidenceFloor, evidenceWords, type PrPath, prPaths, type TicketContract } from "@trellis/api";

// A contract stores paths without Git change types. `prPaths` receives "change", so it cannot report a deleted test from this data.
const changedFile = (path: string): PrPath => ({ path, change: "change" });

export const evidenceLines = (contract: TicketContract, repositoryName: string): string[] => {
	if (contract.files.length === 0) return ["## Evidence owed", "", "- unknown. The contract names no file."];
	const facts = prPaths(repositoryName, contract.files.map(changedFile));
	const floor = evidenceFloor({ kind: facts.kind, risk: facts.risk, rows: [], hasSummary: false });
	return ["## Evidence owed", "", `- Kind: ${floor.kind}`, ...floor.required.map((item) => `- ${evidenceWords[item]}`)];
};
