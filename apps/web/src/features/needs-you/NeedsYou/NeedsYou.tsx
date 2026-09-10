import { useNavigate } from "@tanstack/react-router";
import { Button, EmptyState, Tooltip, useHotkey } from "@trellis/ui";
import { WifiOff } from "lucide-react";
import { useEffect, useRef } from "react";
import { formatCount, relativeTime } from "../../../lib/format";
import { Topbar } from "../../shell/Topbar";
import { TicketPeek } from "../../ticket/TicketPeek";
import { usePeek } from "../../ticket/TicketPeek/hooks/usePeek";
import { PeekListProvider } from "../../ticket/TicketPeek/providers/PeekListProvider";
import { DoneTodaySection } from "../components/DoneTodaySection";
import { FailingCiSection } from "../components/FailingCiSection";
import { NeedsYouEmpty } from "../components/NeedsYouEmpty";
import { ReviewSection } from "../components/ReviewSection";
import { StalledSection } from "../components/StalledSection";
import { useInbox } from "../hooks/useInbox";
import { useInboxPeekRows } from "../hooks/useInboxPeekRows";
import { ActiveRowProvider } from "../providers/ActiveRowProvider";
import { needsYouCount } from "../utils/needsYouCount";
import { activeRowIdentifier, focusRowBy } from "../utils/rowFocus";
import { InboxSkeleton } from "./components/InboxSkeleton";

// The home screen: everything that waits on a person, in four sections. The
// order is fixed, from what a person acts on first to what is only news. The
// page reads `inbox.get` once with no project filter, and every section reads
// its rows from that one entry. `j` and `k` walk the rows across the section
// borders, Enter opens the peek, and `o` opens the ticket page.
export function NeedsYou() {
	const inbox = useInbox();
	const navigate = useNavigate();
	const count = inbox.data === undefined ? 0 : needsYouCount(inbox.data);
	// The count leaves out Stalled and Done by agents today, but their rows
	// still show. The empty state shows only when every section is empty.
	const empty =
		inbox.data !== undefined && Object.values(inbox.data).every((section: { total: number }) => section.total === 0);
	const identifiers =
		inbox.data === undefined
			? []
			: [inbox.data.review, inbox.data.failingCi, inbox.data.stalled, inbox.data.doneByAgentsToday].flatMap((section) =>
					section.items.map((item) => item.identifier),
				);
	const peekRows = useInboxPeekRows();
	const shown = usePeek().current;

	// When the peek closes, the focus goes to the row of the ticket that the
	// peek showed last. Base UI returns the focus only to the element that had
	// it before the peek opened, and a j or k step inside the peek shows a
	// ticket other than that row. An approved row can be gone from the page.
	const lastShown = useRef(shown);
	useEffect(() => {
		const closed = lastShown.current;
		lastShown.current = shown;
		if (closed === undefined || shown !== undefined) return;
		document.querySelector<HTMLElement>(`[data-inbox-row="${closed}"]`)?.focus();
	}, [shown]);

	useHotkey("j", () => focusRowBy(1));
	useHotkey("k", () => focusRowBy(-1));
	useHotkey("enter", () => {
		const identifier = activeRowIdentifier();
		if (identifier !== null) void navigate({ to: "/needs-you", search: { peek: identifier } });
	});
	useHotkey("o", () => {
		const identifier = activeRowIdentifier();
		if (identifier !== null) void navigate({ to: "/t/$identifier", params: { identifier } });
	});

	return (
		<PeekListProvider rows={peekRows}>
			<Topbar>
				<h1 className="flex items-center gap-2 text-lg font-semibold text-fg">
					Needs you
					{inbox.data !== undefined && (
						<Tooltip content={`Fetched ${relativeTime(new Date(inbox.dataUpdatedAt).toISOString())}`}>
							<span data-needs-you-count="" className="font-normal text-fg-faint tabular">
								{formatCount(count)}
							</span>
						</Tooltip>
					)}
				</h1>
			</Topbar>
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
				{inbox.isPending && <InboxSkeleton />}
				{inbox.isError && (
					<EmptyState
						variant="page"
						icon={<WifiOff />}
						title="Needs you did not load"
						description={`${inbox.error.message}. Make sure that the server runs, then select Retry.`}
						action={
							<Button size="md" onClick={() => void inbox.refetch()}>
								Retry
							</Button>
						}
					/>
				)}
				{inbox.data !== undefined &&
					(empty ? (
						<NeedsYouEmpty />
					) : (
						<ActiveRowProvider identifiers={identifiers}>
							<ReviewSection />
							<FailingCiSection />
							<StalledSection />
							<DoneTodaySection />
						</ActiveRowProvider>
					))}
			</div>
			<TicketPeek />
		</PeekListProvider>
	);
}
