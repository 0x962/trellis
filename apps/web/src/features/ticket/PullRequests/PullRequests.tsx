import { useQuery } from "@tanstack/react-query";
import type { Ticket } from "@trellis/api";
import { IconButton } from "@trellis/ui";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { errorMessage } from "../../../lib/conflict";
import { relativeTime } from "../../../lib/format";
import { GhNotice } from "./components/GhNotice";
import { PrRow } from "./components/PrRow";

export type PullRequestsProps = {
	ticket: Ticket;
};

// The pull requests on a ticket. The rows come from `pullRequests.list`,
// seeded from the detail, so a `pr.updated` event refreshes them with one
// refetch. The header shows how old the newest poll is and refreshes on
// demand. A gh problem shows here, never as a toast.
export function PullRequests({ ticket }: PullRequestsProps) {
	const { client, orpc, queryClient } = useApp();
	const listOptions = orpc.pullRequests.list.queryOptions({ input: { ticket: ticket.identifier } });
	const prs = useQuery({ ...listOptions, initialData: ticket.prs }).data;
	const gh = useQuery(orpc.system.gh.queryOptions({})).data;
	const [refreshError, setRefreshError] = useState<string | null>(null);
	const fetchedAt = prs
		.map((pr) => pr.fetchedAt)
		.filter((at): at is string => at !== null)
		.sort()
		.at(-1);

	const refresh = async () => {
		setRefreshError(null);
		try {
			for (const pr of prs) await client.pullRequests.refresh({ id: pr.id });
			await queryClient.invalidateQueries({ queryKey: listOptions.queryKey });
		} catch (error) {
			setRefreshError(errorMessage(error));
		}
	};

	return (
		<section aria-label="Pull requests" className="flex flex-col gap-2">
			<header className="flex h-7 items-center gap-2 text-base font-medium text-fg">
				Pull requests
				<span className="font-normal text-fg-faint tabular">{prs.length}</span>
				<span className="ml-auto flex items-center gap-1 text-sm font-normal text-fg-faint tabular">
					{fetchedAt !== undefined && <span>Fetched {relativeTime(fetchedAt)}</span>}
					<IconButton label="Refresh pull requests" size="sm" icon={<RefreshCw />} onClick={() => void refresh()} />
				</span>
			</header>
			{gh !== undefined && !gh.ok && <GhNotice gh={gh} />}
			{refreshError !== null && <p className="text-sm text-danger">{refreshError}</p>}
			{prs.length === 0 ? (
				<p className="text-sm text-fg-faint">
					No pull request yet. A branch or a PR that names {ticket.identifier} links itself.
				</p>
			) : (
				<ul className="flex flex-col gap-2">
					{prs.map((pr) => (
						<PrRow key={pr.id} pr={pr} ticket={ticket} />
					))}
				</ul>
			)}
		</section>
	);
}
