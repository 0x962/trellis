import type { LinkedPullRequest, TicketSummary } from "@trellis/api";
import { Menu } from "@trellis/ui";
import { useApp } from "../../../../../../../lib/appContext";
import { copyText } from "../../../../../../../lib/clipboard";

export type PrActionsProps = {
	ticket: TicketSummary;
	pr: LinkedPullRequest;
};

// The actions menu of one pull request. It repeats the hover-only GitHub
// button of the row, so the keyboard reaches every row action.
export function PrActions({ ticket, pr }: PrActionsProps) {
	const { client, orpc, queryClient } = useApp();
	const listKey = orpc.pullRequests.list.queryKey({ input: { ticket: ticket.id } });

	const refresh = async () => {
		await client.pullRequests.refresh({ id: pr.id });
		await queryClient.invalidateQueries({ queryKey: listKey });
	};

	const unlink = async () => {
		await client.pullRequests.unlink({ ticket: ticket.id, id: pr.id });
		await queryClient.invalidateQueries({ queryKey: listKey });
	};

	return (
		<Menu
			label="Pull request actions"
			items={[
				{ label: "Open on GitHub", onSelect: () => window.open(pr.url, "_blank", "noopener") },
				{ label: "Copy link", onSelect: () => void copyText(pr.url, "Copied the pull request link") },
				{ label: "Refresh", onSelect: () => void refresh() },
				{ label: "Unlink", onSelect: () => void unlink(), danger: true },
			]}
		/>
	);
}
