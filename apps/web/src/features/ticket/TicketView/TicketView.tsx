import { ORPCError } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import { asksQuestion, questionParts } from "@trellis/api";
import { cx, EmptyState, SectionHeader, useMediaQuery } from "@trellis/ui";
import { useEffect } from "react";
import { useArchivedProjects } from "../../../hooks/useArchivedProjects";
import { useApp } from "../../../lib/appContext";
import { AttachmentGrid } from "../../attachments/AttachmentGrid";
import { useUploads } from "../../attachments/hooks/useUploads";
import { NotFoundState } from "../../shell/NotFoundState";
import { usePageSheet } from "../../shell/PageSheet";
import { Description } from "../Description";
import { Header } from "../Header";
import { useParentSummary } from "../hooks/useParentSummary";
import { PropertiesRail } from "../PropertiesRail";
import { QuestionBlock } from "../QuestionBlock";
import { SubTickets } from "../SubTickets";
import { Title } from "../Title";
import { DropOverlay, useDropOverlay } from "./components/DropOverlay";
import { ParentChip } from "./components/ParentChip";
import { TicketSkeleton } from "./components/TicketSkeleton";

export type TicketViewProps = {
	// The canonical identifier, `CDE-42`.
	identifier: string;
};

// The ticket page holds the words of the ticket and nothing else: the title,
// the ask, the sub-tickets and the attached files. Every property and every
// control sits in the properties rail beside it, including the pull requests,
// the agent and its run.
//
// A decision ticket asks a question. Its options and the box that answers
// them stand under the ask, because a person opens the ticket to answer it
// and the answer belongs to the ask.
//
// The merge conditions, the evidence, the GitHub checks and the flow runs of
// a pull request live in the review sheet, which a pull request of the rail
// opens over this page.
//
// The page renders the same on its route and in a `PageSheet`, with these
// differences in a sheet: the browser tab keeps the title of the page under
// the sheet, and the sheet handles Escape.
export function TicketView({ identifier }: TicketViewProps) {
	const { orpc } = useApp();
	const inSheet = usePageSheet() !== null;
	const query = useQuery(orpc.tickets.get.queryOptions({ input: { ticket: identifier } }));
	const uploads = useUploads(identifier);
	const parentSummary = useParentSummary(query.data?.parent?.identifier ?? null);
	const drop = useDropOverlay(uploads.addFiles);
	const narrow = useMediaQuery("(max-width: 767px)");
	const { isArchived, notice } = useArchivedProjects();

	useEffect(() => {
		if (inSheet || query.data === undefined) return;
		document.title = `${query.data.identifier} · ${query.data.title}`;
		return () => {
			document.title = "trellis";
		};
	}, [inSheet, query.data]);

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
	// A question keeps its question block once it is answered, and the block
	// then shows the stored answer.
	const question = asksQuestion(ticket.status.reviewer, ticket.description) || ticket.answer !== null;
	// On a question, `QuestionBlock` prints the options and the reason, so the
	// ask prints only the prose around them, and a person cannot edit it here.
	const ask = question ? questionParts(ticket.description).ask : "";

	// The server refuses every write to a ticket under an archived project.
	// The disabled fieldset and the edit keys enforce `readOnly`.
	const column = (
		<article className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto page-card">
			<div
				data-ticket-content=""
				className="mx-auto flex w-full min-w-0 max-w-[856px] flex-col px-5 pt-6 pb-8 max-md:px-4"
			>
				<div className="flex flex-col gap-1">
					{ticket.parent !== null && <ParentChip ancestors={ticket.ancestors} title={parentSummary?.title ?? ""} />}
					<Title key={ticket.identifier} ticket={ticket} onAttachFiles={uploads.addFiles} />
				</div>
				{/* A person on a phone opens a question ticket to answer it, so the ask
				    and the options come first and the property list follows the
				    question block. On every other ticket the property list stays above
				    the ask. */}
				{narrow && !question && (
					<div className="mt-3">
						<PropertiesRail ticket={ticket} variant="inline" />
					</div>
				)}
				<section aria-label="The ask" className={cx("flex min-w-0 flex-col", narrow ? "mt-4" : "mt-3")}>
					<SectionHeader title="The ask" />
					{question ? (
						<div className="flex min-w-0 flex-col gap-6">
							{ask !== "" && <p className="whitespace-pre-line text-base text-fg">{ask}</p>}
							<QuestionBlock ticket={ticket} />
						</div>
					) : (
						<div data-ticket-description="" className="min-h-24">
							<Description key={ticket.identifier} ticket={ticket} onAttachFiles={uploads.addFiles} />
						</div>
					)}
				</section>
				<div className="mt-8 flex flex-col gap-8">
					{narrow && question && <PropertiesRail ticket={ticket} variant="inline" />}
					<SubTickets ticket={ticket} />
					<AttachmentGrid ticket={ticket.identifier} initialAttachments={ticket.attachments} uploads={uploads} />
				</div>
			</div>
		</article>
	);
	const page = narrow ? (
		column
	) : (
		<div data-ticket-columns="" className="flex min-h-0 flex-1">
			{column}
			<PropertiesRail ticket={ticket} variant="page" />
		</div>
	);

	return (
		<>
			<Header ticket={ticket} readOnly={readOnly} />
			<fieldset disabled={readOnly} className="contents">
				<div {...drop.handlers} className="relative flex h-full min-h-0 flex-1 flex-col">
					{readOnly && (
						<p className="flex h-9 shrink-0 items-center bg-warning-soft px-5 text-sm font-medium text-warning max-md:px-4">
							{notice(ticket.project.path)}
						</p>
					)}
					{page}
					{drop.over && <DropOverlay identifier={ticket.identifier} />}
				</div>
			</fieldset>
		</>
	);
}
