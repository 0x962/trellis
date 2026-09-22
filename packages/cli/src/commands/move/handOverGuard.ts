import type { Ticket } from "@trellis/api";
import type { TrellisClient } from "@trellis/api/client";
import type { ActorKind } from "../../actor.ts";
import type { EvidenceCheckResult } from "../evidence/checkText.ts";
import { pullRequestCheck } from "../evidence/pullRequestCheck.ts";

const statusMatches = (status: Ticket["status"], ref: string) => {
	const lower = ref.toLowerCase();
	if (lower.startsWith("category:")) return status.category === lower.slice("category:".length);
	return status.slug === lower || status.id === ref.toUpperCase() || status.name.toLowerCase() === lower;
};

// Both actors receive the same missing list. blocksAgent stops only an agent from the hand-over.
export const handOverGuard = async (
	client: TrellisClient,
	actorKind: ActorKind,
	ticketRef: string,
	statusRef: string,
): Promise<{ result: EvidenceCheckResult; blocksAgent: boolean } | null> => {
	const ticket = await client.tickets.get({ ticket: ticketRef });
	const { statuses } = await client.statuses.list({ project: ticket.project.path });
	const status = statuses.find((candidate) => statusMatches(candidate, statusRef));
	if (status?.slug !== "human-review") return null;
	for (const linked of ticket.prs.filter((pullRequest) => pullRequest.state === "open")) {
		const result = await pullRequestCheck(client, ticket, linked);
		if (!result.complete) return { result, blocksAgent: actorKind === "agent" };
	}
	return null;
};
