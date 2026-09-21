import type { TicketPr } from "../schemas/ticketPr.ts";
import { proofSentence } from "./evidenceFloor.ts";

export const evidenceWord = (pr: TicketPr): string | null => {
	if (pr.state !== "open") return null;
	if (pr.evidence === null || pr.evidenceRequired === null || pr.evidenceMissing === null) return "unknown proof";
	return proofSentence(pr.evidenceMissing, pr.evidence, pr.evidenceRequired);
};
