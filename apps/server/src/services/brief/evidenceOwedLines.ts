import { contractFloor, evidenceWords, type TicketContract } from "@trellis/api";

export const evidenceOwedLines = (contract: TicketContract, repositoryName: string | undefined): string[] => {
	const floor = contractFloor(repositoryName, contract);
	if (floor === null) return ["## Evidence owed", "", "- unknown. The contract names no file."];
	return [
		"## Evidence owed",
		"",
		`- Kind: ${floor.kind}`,
		...floor.required.map((item) => `- ${evidenceWords[item]}`),
		...floor.notes.map((note) => `- ${note}`),
	];
};
