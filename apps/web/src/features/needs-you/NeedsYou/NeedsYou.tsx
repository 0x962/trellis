import { useNavigate } from "@tanstack/react-router";
import { Badge, Button, EmptyState, useHotkey } from "@trellis/ui";
import { RefreshCw } from "lucide-react";
import { formatCount, relativeTime } from "../../../lib/format";
import { Topbar } from "../../shell/Topbar";
import { DoneTodaySection } from "../components/DoneTodaySection";
import { FailingCiSection } from "../components/FailingCiSection";
import { NeedsYouEmpty } from "../components/NeedsYouEmpty";
import { ReviewSection } from "../components/ReviewSection";
import { StalledSection } from "../components/StalledSection";
import { useInbox } from "../hooks/useInbox";
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
		<>
			<Topbar
				actions={
					inbox.data !== undefined && (
						<span className="flex items-center gap-1.5 text-sm text-fg-muted tabular">
							<RefreshCw aria-hidden="true" className="size-3.25" />
							Fetched {relativeTime(new Date(inbox.dataUpdatedAt).toISOString())}
						</span>
					)
				}
			>
				<h1 className="flex items-center gap-2 text-md font-semibold text-fg">
					Needs you
					{count > 0 && <Badge tone="accent">{formatCount(count)}</Badge>}
				</h1>
			</Topbar>
			<div className="min-h-0 flex-1 overflow-y-auto">
				{inbox.isPending && <InboxSkeleton />}
				{inbox.isError && (
					<EmptyState
						title="Could not load Needs you"
						description="The server did not answer."
						action={<Button onClick={() => void inbox.refetch()}>Retry</Button>}
						className="justify-center"
					/>
				)}
				{inbox.data !== undefined &&
					(count === 0 ? (
						<NeedsYouEmpty />
					) : (
						<>
							<ReviewSection />
							<FailingCiSection />
							<StalledSection />
							<DoneTodaySection />
						</>
					))}
			</div>
		</>
	);
}
