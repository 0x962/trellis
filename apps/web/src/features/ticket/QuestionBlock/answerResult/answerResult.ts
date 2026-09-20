import type { TicketAnswerDelivery } from "@trellis/api";

const sentenceList = (parts: readonly string[]): string => {
	if (parts.length === 1) return parts[0] as string;
	return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
};

// The sentence under the `Answer` button: the question is done, and each
// running agent that waits for it has the answer.
export const answerResult = (identifier: string, deliveries: readonly TicketAnswerDelivery[]): string => {
	if (deliveries.length === 0) return `${identifier} is done. No agent was running on a ticket this answer releases.`;
	const runs = sentenceList(deliveries.map((delivery) => `${delivery.agentName} on ${delivery.ticket}`));
	return `${identifier} is done. ${runs} ${deliveries.length === 1 ? "has" : "have"} the answer.`;
};
