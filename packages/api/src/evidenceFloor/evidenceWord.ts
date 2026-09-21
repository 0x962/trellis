import type { TicketPr } from "../schemas/ticketPr.ts";

export const evidenceWord = (pr: TicketPr): string | null => {
	if (pr.state !== "open") return null;
	if (pr.evidence === null || pr.evidenceRequired === null || pr.evidence === 0) return "no evidence";
	return pr.evidence === pr.evidenceRequired
		? "evidence complete"
		: `evidence ${pr.evidence} of ${pr.evidenceRequired}`;
};
