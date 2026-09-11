import { ORPCError } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import { cx, EmptyState, TicketId, useMediaQuery } from "@trellis/ui";
import { useEffect, useState } from "react";
import { useArchivedProjects } from "../../../hooks/useArchivedProjects";
import { useApp } from "../../../lib/appContext";
import { AttachmentGrid } from "../../attachments/AttachmentGrid";
import { useUploads } from "../../attachments/hooks/useUploads";
import { PullRequests } from "../../prs";
import { NotFoundState } from "../../shell/NotFoundState";
import { Description } from "../Description";
import { Header } from "../Header";
import { ReviewActions } from "../Header/components/ReviewActions";
import { PropertiesRail } from "../PropertiesRail";
import { SubTickets } from "../SubTickets";
import { Timeline } from "../Timeline";
import { Title } from "../Title";
import { DropOverlay, useDropOverlay } from "./components/DropOverlay";
import { TicketSkeleton } from "./components/TicketSkeleton";

export type TicketViewProps = {
	// The canonical identifier, `CDE-42`.
	identifier: string;
	// The page draws the 280 px rail; the peek folds it under the title.
	variant: "page" | "peek";
};

// One ticket, as the page and the peek both draw it: the header, the ID,
// the title, the description, the sub-tickets, the PRs, the attachments,
// and the timeline, in one left-aligned column of 760 px of content. Below
// 768 px the page folds the rail into the peek grid under the title, with
// the review actions under the grid. Every
// section reads the cached detail, so a live patch repaints it with no
// refetch. The whole ticket is the one drop target: a dropped file uploads
// to the ticket, and the attachments section shows its progress.
export function TicketView({ identifier, variant }: TicketViewProps) {
	const { orpc } = useApp();
	const query = useQuery(orpc.tickets.get.queryOptions({ input: { ticket: identifier } }));
	const [addingChild, setAddingChild] = useState(false);
	const uploads = useUploads(identifier);
	const drop = useDropOverlay(uploads.start);
	const narrow = useMediaQuery("(max-width: 767px)");
	const { isArchived, notice } = useArchivedProjects();

	useEffect(() => setAddingChild(false), []);
	useEffect(() => {
		if (variant !== "page" || query.data === undefined) return;
		document.title = `${query.data.identifier} · ${query.data.title}`;
		return () => {
			document.title = "trellis";
		};
	}, [query.data, variant]);

	if (query.error !== null) {
		if (query.error instanceof ORPCError && query.error.code === "NOT_FOUND") {
			return <NotFoundState ref={identifier} searchFor={identifier} />;
		}
		return <EmptyState variant="page" title={`${identifier} did not load.`} description={query.error.message} />;
	}
	if (query.data === undefined) {
		if (variant === "peek") {
			return (
				<article className="relative flex min-w-0 flex-1 flex-col">
					<Header ticket={undefined} identifier={identifier} surface="peek" />
					<TicketSkeleton variant="peek" />
				</article>
			);
		}
		return <TicketSkeleton variant="page" />;
	}
	const ticket = query.data;
	const peek = variant === "peek";
	const inlineRail = peek || narrow;
	const readOnly = isArchived(ticket.project.path);

	// The server refuses every write to a ticket under an archived project.
	// A disabled fieldset disables every control inside it, so the page and
	// the peek show the ticket read-only. The edit keys read `readOnly` too.
	const main = (
		<article
			{...drop.handlers}
			className={cx("relative flex min-w-0 flex-1 flex-col", !peek && "min-h-0 overflow-y-auto")}
		>
			<Header ticket={ticket} surface={variant} />
			{readOnly && (
				<p className="flex h-9 shrink-0 items-center bg-warning-soft px-12 text-sm font-medium text-warning max-md:px-4">
					{notice(ticket.project.path)}
				</p>
			)}
			<div className="flex max-w-[856px] flex-col px-12 pt-8 pb-12 max-md:px-4">
				<div className="flex flex-col gap-1">
					<TicketId id={ticket.identifier} />
					<Title key={ticket.identifier} ticket={ticket} autoFocus={peek} />
				</div>
				{inlineRail && (
					<div className="mt-3">
						<PropertiesRail ticket={ticket} variant="peek" onAddSubTicket={() => setAddingChild(true)} />
					</div>
				)}
				{narrow && !peek && (
					<div data-phone-actions="" className="mt-4 flex flex-col gap-2 empty:hidden">
						<ReviewActions ticket={ticket} />
					</div>
				)}
				<div className={inlineRail ? "mt-4" : "mt-3"}>
					<Description key={ticket.identifier} ticket={ticket} />
				</div>
				<div className="mt-8 flex flex-col gap-8">
					{(ticket.children.length > 0 || addingChild) && <SubTickets ticket={ticket} autoFocusAdd={addingChild} />}
					<PullRequests ticket={ticket} initialPrs={ticket.prs} />
					<AttachmentGrid ticket={ticket.identifier} initialAttachments={ticket.attachments} uploads={uploads} />
					<Timeline ticket={ticket} pinned={peek} onAttachFiles={uploads.start} />
				</div>
			</div>
			{drop.over && <DropOverlay identifier={ticket.identifier} />}
		</article>
	);

	if (inlineRail) {
		return (
			<fieldset disabled={readOnly} className="contents">
				{main}
			</fieldset>
		);
	}
	return (
		<fieldset disabled={readOnly} className="contents">
			<div className="flex min-h-0 flex-1">
				{main}
				<PropertiesRail ticket={ticket} variant="page" onAddSubTicket={() => setAddingChild(true)} />
			</div>
		</fieldset>
	);
}
