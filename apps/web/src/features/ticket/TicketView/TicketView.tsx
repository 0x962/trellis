import { ORPCError } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import { cx, EmptyState, TicketId } from "@trellis/ui";
import { useEffect, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { AttachmentGrid } from "../../attachments/AttachmentGrid";
import { PullRequests } from "../../prs";
import { NotFoundState } from "../../shell/NotFoundState";
import { Description } from "../Description";
import { Header } from "../Header";
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

// One ticket, as the page and the peek both draw it: the header, the
// title, the description, the sub-tickets, the pull requests, the
// attachments, and the timeline. Every section reads the cached detail,
// so a live patch repaints it with no refetch.
export function TicketView({ identifier, variant }: TicketViewProps) {
	const { orpc } = useApp();
	const query = useQuery(orpc.tickets.get.queryOptions({ input: { ticket: identifier } }));
	const [addingChild, setAddingChild] = useState(false);
	const drop = useDropOverlay();

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
		return (
			<EmptyState title="Something went wrong" description={query.error.message} className="flex-1 justify-center" />
		);
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

	const main = (
		<article
			{...drop.handlers}
			className={cx("relative flex min-w-0 flex-1 flex-col", !peek && "min-h-0 overflow-y-auto")}
		>
			<Header ticket={ticket} surface={variant} />
			<div className="flex max-w-202 flex-col gap-7 px-12 py-5">
				<div className="flex flex-col gap-1">
					<TicketId id={ticket.identifier} />
					<Title key={ticket.identifier} ticket={ticket} autoFocus={peek} />
				</div>
				{peek && <PropertiesRail ticket={ticket} variant="peek" onAddSubTicket={() => setAddingChild(true)} />}
				<Description key={ticket.identifier} ticket={ticket} />
				{(ticket.children.length > 0 || addingChild) && <SubTickets ticket={ticket} autoFocusAdd={addingChild} />}
				<PullRequests ticket={ticket} initialPrs={ticket.prs} />
				<AttachmentGrid ticket={ticket.identifier} initialAttachments={ticket.attachments} />
				<Timeline ticket={ticket} />
			</div>
			{drop.over && <DropOverlay identifier={ticket.identifier} />}
		</article>
	);

	if (peek) return main;
	return (
		<div className="flex min-h-0 flex-1">
			{main}
			<PropertiesRail ticket={ticket} variant="page" onAddSubTicket={() => setAddingChild(true)} />
		</div>
	);
}
