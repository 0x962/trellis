import { useMutation } from "@tanstack/react-query";
import type { LinkedPullRequest, TicketSummary } from "@trellis/api";
import { IconButton } from "@trellis/ui";
import { X } from "lucide-react";
import { useApp } from "../../../../../../../lib/appContext";

export type UnlinkButtonProps = {
	ticket: TicketSummary;
	pr: LinkedPullRequest;
};

// The control that takes one pull request off one ticket. The label names
// the number, so a section with several cards gives each control a name of
// its own. The button shows on hover and on focus, so the card stays quiet
// until somebody reaches for it.
export function UnlinkButton({ ticket, pr }: UnlinkButtonProps) {
	const { client, orpc, queryClient } = useApp();
	const listKey = orpc.pullRequests.list.queryKey({ input: { ticket: ticket.id } });
	const unlink = useMutation({
		mutationFn: async () => await client.pullRequests.unlink({ ticket: ticket.id, id: pr.id }),
		onSuccess: async () => await queryClient.invalidateQueries({ queryKey: listKey }),
	});

	return (
		<IconButton
			label={`Unlink PR #${pr.number}`}
			icon={<X />}
			size="xs"
			disabled={unlink.isPending}
			className="relative opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
			onClick={() => unlink.mutate()}
		/>
	);
}
