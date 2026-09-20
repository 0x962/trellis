import type { TicketContract } from "../schemas/ticket.ts";

export type ContractClause = {
	label: string;
	values: string[];
};

export type ContractClauses = [ContractClause, ContractClause, ContractClause, ContractClause, ContractClause];

export const contractClauses = (contract: TicketContract): ContractClauses => [
	{ label: "Result", values: contract.result === "" ? [] : [contract.result] },
	{ label: "Files", values: contract.files },
	{ label: "Leave alone", values: contract.leaveAlone },
	{ label: "Verify", values: contract.verify },
	{ label: "Review focus", values: contract.reviewFocus },
];
