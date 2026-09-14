import { ORPCError } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import { cx, EmptyState, useMediaQuery } from "@trellis/ui";
import { useEffect } from "react";
import { useArchivedProjects } from "../../../hooks/useArchivedProjects";
import { useApp } from "../../../lib/appContext";
import { AttachmentGrid } from "../../attachments/AttachmentGrid";
import { useUploads } from "../../attachments/hooks/useUploads";
import { PullRequests } from "../../prs";
import { NotFoundState } from "../../shell/NotFoundState";
import { Description } from "../Description";
import { Header } from "../Header";
import { useParentSummary } from "../hooks/useParentSummary";
import { PropertiesRail } from "../PropertiesRail";
import { SubTickets } from "../SubTickets";
import { TicketWorkArea } from "../TicketWorkArea";
import { Timeline } from "../Timeline";
import { Title } from "../Title";
import { DropOverlay, useDropOverlay } from "./components/DropOverlay";
import { ParentChip } from "./components/ParentChip";
import { TicketSkeleton } from "./components/TicketSkeleton";

export type TicketViewProps = {
	// The canonical identifier, `CDE-42`.
	identifier: string;
};

export function TicketView({ identifier }: TicketViewProps) {
	const { orpc } = useApp();
	const query = useQuery(orpc.tickets.get.queryOptions({ input: { ticket: identifier } }));
	const uploads = useUploads(identifier);
	const parentSummary = useParentSummary(query.data?.parent?.identifier ?? null);
	const drop = useDropOverlay(uploads.start);
	const narrow = useMediaQuery("(max-width: 767px)");
	const { isArchived, notice } = useArchivedProjects();

	useEffect(() => {
		if (query.data === undefined) return;
		document.title = `${query.data.identifier} · ${query.data.title}`;
		return () => {
			document.title = "trellis";
		};
	}, [query.data]);

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
	const inlineRail = narrow;
	const readOnly = isArchived(ticket.project.path);

	// The server refuses every write to a ticket under an archived project.
	// The disabled fieldset and the edit keys enforce `readOnly`.
	const main = (
		<article className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto page-card">
			<div data-ticket-content="" className="flex min-w-0 max-w-[856px] flex-col px-5 pt-6 pb-8 max-md:px-4">
				<div className="flex flex-col gap-1">
					{ticket.parent !== null && <ParentChip ancestors={ticket.ancestors} title={parentSummary?.title ?? ""} />}
					<Title key={ticket.identifier} ticket={ticket} />
				</div>
				{inlineRail && (
					<div className="mt-3">
						<PropertiesRail ticket={ticket} variant="inline" />
					</div>
				)}
				<div data-ticket-description="" className={cx("min-h-24", inlineRail ? "mt-4" : "mt-3")}>
					<Description key={ticket.identifier} ticket={ticket} />
				</div>
				<div className="mt-8">
					<TicketWorkArea
						key={ticket.id}
						ticket={ticket}
						activity={<Timeline ticket={ticket} onAttachFiles={uploads.start} />}
						overview={
							<>
								<SubTickets ticket={ticket} />
								<PullRequests ticket={ticket} initialPrs={ticket.prs} />
								<AttachmentGrid ticket={ticket.identifier} initialAttachments={ticket.attachments} uploads={uploads} />
								<Timeline ticket={ticket} onAttachFiles={uploads.start} />
							</>
						}
					/>
				</div>
			</div>
		</article>
	);

	return (
		<fieldset disabled={readOnly} className="contents">
			<div {...drop.handlers} className="relative flex h-full min-h-0 flex-1 flex-col">
				<Header ticket={ticket} />
				{readOnly && (
					<p className="flex h-9 shrink-0 items-center bg-warning-soft px-5 text-sm font-medium text-warning max-md:px-4">
						{notice(ticket.project.path)}
					</p>
				)}
				{inlineRail ? (
					main
				) : (
					<div data-ticket-columns="" className="flex min-h-0 flex-1 gap-3">
						{main}
						<PropertiesRail ticket={ticket} variant="page" />
					</div>
				)}
				{drop.over && <DropOverlay identifier={ticket.identifier} />}
			</div>
		</fieldset>
	);
}
