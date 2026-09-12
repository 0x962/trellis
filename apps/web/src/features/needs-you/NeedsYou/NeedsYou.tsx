import { Button, EmptyState } from "@trellis/ui";
import { Topbar } from "../../shell/Topbar";
import { DoneTodaySection } from "../components/DoneTodaySection";
import { FailingCiSection } from "../components/FailingCiSection";
import { NeedsYouEmpty } from "../components/NeedsYouEmpty";
import { ReviewSection } from "../components/ReviewSection";
import { StalledSection } from "../components/StalledSection";
import { useInbox } from "../hooks/useInbox";
import { InboxSkeleton } from "./components/InboxSkeleton";

// The home screen: everything that waits on a person, in four sections. The
// order is fixed, from what a person acts on first to what is only news. The
// page reads `inbox.get` once with no project filter, and every section reads
// its rows from that one entry. A row opens the ticket page, and the person
// acts on the ticket there.
export function NeedsYou() {
	const inbox = useInbox();
	// The empty state shows only when every section is empty.
	const empty =
		inbox.data !== undefined && Object.values(inbox.data).every((section: { total: number }) => section.total === 0);

	return (
		<>
			<Topbar>
				<h1 className="sr-only">Needs you</h1>
			</Topbar>
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
				{inbox.isPending && <InboxSkeleton />}
				{inbox.isError && (
					<EmptyState
						variant="page"
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
