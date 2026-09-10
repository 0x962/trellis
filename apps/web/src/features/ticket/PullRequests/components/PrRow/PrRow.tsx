import type { LinkedPullRequest, Ticket } from "@trellis/api";
import { Badge, Button, CheckRibbon, cx, IconButton, Menu } from "@trellis/ui";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { copyText } from "../../../../../lib/clipboard";
import { compactRelativeTime } from "../../../../../lib/format";
import { lowestPositionStatus } from "../../../../../lib/statusPicks";
import { useEnsureStatuses } from "../../../hooks/useStatuses";
import { useTicketWrite } from "../../../hooks/useTicketWrite";
import { failToast } from "../../../utils/failToast";
import { isExpanded, setExpanded } from "../../utils/expandedPrs";
import { CheckPill } from "../CheckPill";
import { CheckRows } from "../CheckRows";
import { DiffPanel } from "../DiffPanel";
import { PrStateIcon } from "../PrStateIcon";

export type PrRowProps = {
	pr: LinkedPullRequest;
	ticket: Ticket;
};

const reviewLabels = { approved: "Approved", changes_requested: "Changes requested" } as const;

// One pull request: a 56 px row that opens to its checks and, below them,
// the diff panel. Every hover action has a twin in the row's menu, so the
// keyboard reaches it. A merged PR on a human-review ticket offers Mark
// Done under the row; the person decides, never the poller.
export function PrRow({ pr, ticket }: PrRowProps) {
	const { client, orpc, queryClient } = useApp();
	const { write } = useTicketWrite(ticket.identifier);
	const ensureStatuses = useEnsureStatuses(ticket.project.path);
	const [expanded, setOpen] = useState(() => isExpanded(pr));
	const [diff, setDiff] = useState(false);
	const review = pr.reviewState === "approved" || pr.reviewState === "changes_requested" ? pr.reviewState : null;
	const nudge = pr.state === "merged" && ticket.status.category === "review" && ticket.status.reviewer === "human";

	const toggle = () => {
		setExpanded(pr, !expanded);
		setOpen(!expanded);
	};

	const markDone = async () => {
		const done = lowestPositionStatus(await ensureStatuses(), "done")!;
		try {
			await write((api) => api.tickets.move({ ticket: ticket.identifier, status: done.slug }), {
				optimistic: (row) => ({ ...row, status: { ...done } }),
			});
		} catch (error) {
			failToast(`Couldn't move ${ticket.identifier} to ${done.name}`, error, () => void markDone());
		}
	};

	const refresh = async () => {
		await client.pullRequests.refresh({ id: pr.id });
		await queryClient.invalidateQueries({
			queryKey: orpc.pullRequests.list.queryKey({ input: { ticket: ticket.identifier } }),
		});
	};

	const unlink = async () => {
		await client.pullRequests.unlink({ ticket: ticket.identifier, id: pr.id });
		await queryClient.invalidateQueries({
			queryKey: orpc.tickets.get.queryKey({ input: { ticket: ticket.identifier } }),
		});
	};

	return (
		<li className="group overflow-hidden rounded-md border border-border">
			<div className="flex items-center gap-1 pr-2">
				<button
					type="button"
					aria-expanded={expanded}
					onClick={toggle}
					className="flex h-14 min-w-0 flex-1 items-center gap-3 px-3 text-left focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
				>
					<PrStateIcon pr={pr} />
					<span className="flex min-w-0 flex-1 flex-col">
						<span className="flex min-w-0 items-baseline gap-1.5">
							<span className="shrink-0 font-mono text-sm text-fg-muted">
								{pr.owner}/{pr.repo} #{pr.number}
							</span>
							<span className="truncate font-medium text-fg">{pr.title}</span>
						</span>
						<span className="flex min-w-0 items-center gap-2 text-sm text-fg-muted">
							<span className="truncate font-mono text-xs">
								{pr.headRef} → {pr.baseRef}
							</span>
							<span aria-hidden="true">·</span>
							<span className="shrink-0 tabular">updated {compactRelativeTime(pr.updatedAt)}</span>
						</span>
					</span>
					<CheckRibbon checks={pr.checks} />
					<CheckPill checks={pr.checks} />
					{review !== null && <Badge tone={review === "approved" ? "accent" : "bad"}>{reviewLabels[review]}</Badge>}
				</button>
				<IconButton
					label="Open on GitHub"
					icon={<ExternalLink />}
					className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
					onClick={() => window.open(pr.url, "_blank", "noopener")}
				/>
				<Menu
					label="Pull request actions"
					items={[
						{ label: "Open on GitHub", onSelect: () => window.open(pr.url, "_blank", "noopener") },
						{ label: "Copy link", onSelect: () => void copyText(pr.url, "Copied the pull request link") },
						{ label: "Refresh", onSelect: () => void refresh() },
						{ label: "Unlink", onSelect: () => void unlink(), danger: true },
					]}
				/>
			</div>
			{expanded && (
				<>
					<CheckRows checks={pr.checks} />
					<div className="flex h-9 items-center justify-end border-t border-border bg-bg px-2">
						<Button variant="quiet" size="sm" onClick={() => setDiff((shown) => !shown)}>
							{diff ? "Hide diff" : "Show diff"}
						</Button>
					</div>
					{diff && <DiffPanel pr={pr} />}
				</>
			)}
			{nudge && (
				<div className={cx("flex h-9 items-center gap-3 border-t border-border px-3 text-sm text-fg")}>
					<span>PR merged. Mark Done?</span>
					<Button size="sm" onClick={() => void markDone()}>
						Mark Done
					</Button>
				</div>
			)}
		</li>
	);
}
