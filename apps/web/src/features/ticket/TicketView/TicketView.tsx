import { ORPCError } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import { cx, EmptyState, useMediaQuery } from "@trellis/ui";
import { useEffect, useState } from "react";
import { useArchivedProjects } from "../../../hooks/useArchivedProjects";
import { useApp } from "../../../lib/appContext";
import { AttachmentGrid } from "../../attachments/AttachmentGrid";
import { useUploads } from "../../attachments/hooks/useUploads";
import { PullRequests } from "../../prs";
import { ReviewPage } from "../../reviews/ReviewPage/ReviewPage";
import { NotFoundState } from "../../shell/NotFoundState";
import { usePageSheet } from "../../shell/PageSheet";
import { Description } from "../Description";
import { Header } from "../Header";
import { useParentSummary } from "../hooks/useParentSummary";
import { useTicketEscape } from "../hooks/useTicketEscape";
import { PropertiesRail } from "../PropertiesRail";
import { SubTickets } from "../SubTickets";
import { TicketWorkArea } from "../TicketWorkArea";
import { Timeline } from "../Timeline";
import { Title } from "../Title";
import { DropOverlay, useDropOverlay } from "./components/DropOverlay";
import { ParentChip } from "./components/ParentChip";
import { PullRequestSheet } from "./components/PullRequestSheet";
import { TicketSkeleton } from "./components/TicketSkeleton";

export type TicketViewProps = {
	// The canonical identifier, `CDE-42`.
	identifier: string;
	thread?: string;
	onReturnToList: () => void;
};

// The ticket page. It renders the same on its route and in a `PageSheet`,
// with these differences in a sheet: a pull request opens in a second sheet
// over the ticket and does not replace it, the browser tab keeps the title
// of the page under the sheet, and the sheet handles Escape.
export function TicketView({ identifier, thread, onReturnToList }: TicketViewProps) {
	const { orpc } = useApp();
	const inSheet = usePageSheet() !== null;
	const query = useQuery(orpc.tickets.get.queryOptions({ input: { ticket: identifier } }));
	const uploads = useUploads(identifier);
	const parentSummary = useParentSummary(query.data?.parent?.identifier ?? null);
	const drop = useDropOverlay(uploads.addFiles);
	const narrow = useMediaQuery("(max-width: 767px)");
	const { isArchived, notice } = useArchivedProjects();
	const [workAreaTab, setWorkAreaTab] = useState("activity");
	const [pullRequest, setPullRequest] = useState<string | null>(null);
	useTicketEscape(
		{
			reviewOpen: pullRequest !== null,
			closeReview: () => setPullRequest(null),
			returnToList: onReturnToList,
		},
		!inSheet,
	);

	useEffect(() => {
		if (inSheet || query.data === undefined || pullRequest !== null) return;
		document.title = `${query.data.identifier} · ${query.data.title}`;
		return () => {
			document.title = "trellis";
		};
	}, [inSheet, pullRequest, query.data]);

	if (query.error !== null) {
		if (query.error instanceof ORPCError && query.error.code === "NOT_FOUND") {
			return <NotFoundState ref={identifier} searchFor={identifier} />;
		}
		return (
			<EmptyState
				className="page-card"
				variant="page"
				title={`${identifier} did not load.`}
				description={query.error.message}
			/>
		);
	}
	if (query.data === undefined) return <TicketSkeleton />;
	const ticket = query.data;
	const readOnly = isArchived(ticket.project.path);
	const backToTicket = (
		<a
			href={`/t/${ticket.identifier}`}
			aria-label={`Back to ${ticket.identifier}`}
			onClick={(event) => {
				event.preventDefault();
				setPullRequest(null);
			}}
		>
			{ticket.identifier}
		</a>
	);
	if (pullRequest !== null && !inSheet) {
		return <ReviewPage key={pullRequest} pr={pullRequest} syncHash={false} parent={backToTicket} />;
	}

	// The server refuses every write to a ticket under an archived project.
	// The disabled fieldset and the edit keys enforce `readOnly`.
	const activity = (
		<article className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto page-card">
			<div
				data-ticket-content=""
				className="mx-auto flex w-full min-w-0 max-w-[856px] flex-col px-5 pt-6 pb-8 max-md:px-4"
			>
				<div className="flex flex-col gap-1">
					{ticket.parent !== null && <ParentChip ancestors={ticket.ancestors} title={parentSummary?.title ?? ""} />}
					<Title key={ticket.identifier} ticket={ticket} onAttachFiles={uploads.addFiles} />
				</div>
				{narrow && (
					<div className="mt-3">
						<PropertiesRail ticket={ticket} variant="inline" />
					</div>
				)}
				<div data-ticket-description="" className={cx("min-h-24", narrow ? "mt-4" : "mt-3")}>
					<Description key={ticket.identifier} ticket={ticket} onAttachFiles={uploads.addFiles} />
				</div>
				<div className="mt-8 flex flex-col gap-8">
					<SubTickets ticket={ticket} />
					<PullRequests ticket={ticket} initialPrs={ticket.prs} onOpen={setPullRequest} title="Pull requests" />
					<AttachmentGrid ticket={ticket.identifier} initialAttachments={ticket.attachments} uploads={uploads} />
					<Timeline thread={thread} ticket={ticket} onAttachFiles={uploads.addFiles} />
				</div>
			</div>
		</article>
	);
	const activityPage = narrow ? (
		activity
	) : (
		<div data-ticket-columns="" className="flex min-h-0 flex-1">
			{activity}
			<PropertiesRail ticket={ticket} variant="page" />
		</div>
	);

	return (
		<>
			<fieldset disabled={readOnly} className="contents">
				<div {...drop.handlers} className="relative flex h-full min-h-0 flex-1 flex-col">
					<Header ticket={ticket} readOnly={readOnly} />
					{readOnly && (
						<p className="flex h-9 shrink-0 items-center bg-warning-soft px-5 text-sm font-medium text-warning max-md:px-4">
							{notice(ticket.project.path)}
						</p>
					)}
					<TicketWorkArea
						key={ticket.id}
						ticket={ticket}
						tab={workAreaTab}
						onTabChange={setWorkAreaTab}
						onOpenPullRequest={setPullRequest}
						activity={activityPage}
					/>
					{drop.over && <DropOverlay identifier={ticket.identifier} />}
				</div>
			</fieldset>
			{inSheet && <PullRequestSheet pr={pullRequest} parent={backToTicket} onClose={() => setPullRequest(null)} />}
		</>
	);
}
