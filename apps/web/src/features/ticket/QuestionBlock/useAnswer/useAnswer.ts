import { useMutation } from "@tanstack/react-query";
import type { Ticket, TicketAnswerDelivery } from "@trellis/api";
import { useState } from "react";
import { useApp } from "../../../../lib/appContext";

// The list always puts a comma and the word `and` before the last item.
const sentenceList = (parts: readonly string[]): string => {
	if (parts.length === 1) return parts[0] as string;
	return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
};

// What the answer did, in one sentence: the question is done, and each
// running agent that waits for it has the answer. An agent gets the answer
// through `review_deliveries`, the channel a review already uses, so its run
// keeps working and does not restart.
export const answerResult = (identifier: string, deliveries: readonly TicketAnswerDelivery[]): string => {
	if (deliveries.length === 0) return `${identifier} is done. No agent was running on a ticket this answer releases.`;
	const runs = sentenceList(deliveries.map((delivery) => `${delivery.agentName} on ${delivery.ticket}`));
	return `${identifier} is done. ${runs} ${deliveries.length === 1 ? "has" : "have"} the answer.`;
};

// Holds the picked option, the reason and the one write that answers the
// question. The write records the option and the reason, moves the ticket to
// the done category, and reaches every live run in the same call.
export const useAnswer = (ticket: Ticket) => {
	const { client, queryClient } = useApp();
	const [option, setOption] = useState<number | null>(null);
	const [reason, setReason] = useState("");
	const answer = useMutation({
		mutationFn: () =>
			client.tickets.answer({
				ticket: ticket.identifier,
				option: option as number,
				reason,
				expectedVersion: ticket.version,
			}),
		// The answer moves the ticket and writes a comment, so every list and
		// every counter that names this ticket is now behind.
		onSuccess: () => queryClient.invalidateQueries(),
	});
	return {
		option,
		onOptionChange: setOption,
		reason,
		onReasonChange: setReason,
		answering: answer.isPending,
		result: answer.data === undefined ? null : answerResult(ticket.identifier, answer.data.deliveries),
		error: answer.error?.message ?? null,
		onAnswer: () => answer.mutate(),
	};
};
