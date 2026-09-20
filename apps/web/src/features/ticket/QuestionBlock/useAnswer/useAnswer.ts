import { useMutation } from "@tanstack/react-query";
import type { Ticket } from "@trellis/api";
import { useState } from "react";
import { useApp } from "../../../../lib/appContext";
import { answerResult } from "../answerResult";

// Holds the picked option, the reason and the one write that answers the
// question. The write records the option and the reason, moves the ticket to
// the done category, and reaches every live run in the same call.
export const useAnswer = (ticket: Ticket) => {
	const { client, orpc, queryClient } = useApp();
	const [picked, setPicked] = useState<number | null>(null);
	const [reason, setReason] = useState("");
	const answer = useMutation({
		mutationFn: () =>
			client.tickets.answer({
				ticket: ticket.identifier,
				option: picked as number,
				reason,
				expectedVersion: ticket.version,
			}),
		// The answer moves the ticket, writes a comment and releases the
		// tickets that waited for it. These four trees hold every list and
		// every counter that reads those facts. A refetch of the whole cache
		// would also run `agentRuns.workspace`, which reads git.
		onSuccess: () =>
			Promise.all([
				queryClient.invalidateQueries({ queryKey: orpc.tickets.key() }),
				queryClient.invalidateQueries({ queryKey: orpc.timeline.key() }),
				queryClient.invalidateQueries({ queryKey: orpc.comments.key() }),
				queryClient.invalidateQueries({ queryKey: orpc.needsYou.key() }),
			]),
	});
	return {
		picked,
		onPickedChange: setPicked,
		reason,
		onReasonChange: setReason,
		answering: answer.isPending,
		result: answer.data === undefined ? null : answerResult(ticket.identifier, answer.data.deliveries),
		error: answer.error?.message ?? null,
		onAnswer: () => answer.mutate(),
	};
};
