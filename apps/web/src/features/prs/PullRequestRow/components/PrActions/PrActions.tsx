import { DotsThree } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import type { LinkedPullRequest, TicketSummary } from "@trellis/api";
import { ConfirmDialog, IconButton, Menu } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { copyText } from "../../../../../lib/clipboard";
import { failToast } from "../../../../../lib/failToast";

export type PrActionsProps = {
	ticket: TicketSummary;
	pr: LinkedPullRequest;
};

// The question names the pull request number and the ticket, so the person
// reads which link the confirm takes away.
export const removeQuestion = (pr: Pick<LinkedPullRequest, "number">, ticket: Pick<TicketSummary, "identifier">) =>
	`Remove #${pr.number} from ${ticket.identifier}?`;

// The menu of one pull request row. Remove takes the pull request off the
// ticket, and it asks in a ConfirmDialog before the write.
export function PrActions({ ticket, pr }: PrActionsProps) {
	const { client, orpc, queryClient } = useApp();
	const [confirming, setConfirming] = useState(false);
	const listKey = orpc.pullRequests.list.queryKey({ input: { ticket: ticket.id } });
	const unlink = useMutation({
		mutationFn: async () => await client.pullRequests.unlink({ ticket: ticket.id, id: pr.id }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: listKey });
			setConfirming(false);
		},
		onError: (error) =>
			failToast(`#${pr.number} is still linked to ${ticket.identifier}.`, error, () => unlink.mutate()),
	});

	return (
		<>
			<Menu
				label={`Actions for PR #${pr.number}`}
				trigger={
					<IconButton
						label={`Actions for PR #${pr.number}`}
						icon={<DotsThree />}
						size="xs"
						className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100 [@media(hover:none)]:opacity-100"
					/>
				}
				items={[
					{ label: "Copy link", onSelect: () => void copyText(pr.url, "Copied the link") },
					{ label: "Remove", danger: true, onSelect: () => setConfirming(true) },
				]}
			/>
			<ConfirmDialog
				open={confirming}
				title={removeQuestion(pr, ticket)}
				description="The ticket loses the evidence, the checks and the review threads of this pull request until somebody links it again."
				confirmLabel="Remove"
				danger
				processing={unlink.isPending}
				onConfirm={() => unlink.mutate()}
				onCancel={() => setConfirming(false)}
			/>
		</>
	);
}
