import { useQuery } from "@tanstack/react-query";
import { Button, EmptyState } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";
import { ManagerQueue } from "../../project-manager/ManagerQueue";
import { PageTitle } from "../../shell/PageTitle";
import { Topbar } from "../../shell/Topbar";
import { DoneTodaySection } from "../components/DoneTodaySection";
import { FailingCiSection } from "../components/FailingCiSection";
import { NativeAttention } from "../components/NativeAttention";
import { NeedsYouEmpty } from "../components/NeedsYouEmpty";
import { ReviewSection } from "../components/ReviewSection";
import { StalledSection } from "../components/StalledSection";
import { useInbox } from "../hooks/useInbox";
import { useNativeAttention } from "../hooks/useNativeAttention";
import { InboxSkeleton } from "./components/InboxSkeleton";

export function NeedsYou() {
	const inbox = useInbox();
	const native = useNativeAttention();
	const { orpc } = useApp();
	const queue = useQuery({ ...orpc.controller.list.queryOptions({ input: {} }), refetchInterval: 2000, retry: false });
	const attention =
		native.items.length > 0 ||
		native.error !== null ||
		queue.isPending ||
		queue.isError ||
		queue.data?.some((row) => row.state === "unknown" || row.error !== null);
	// The empty state shows only when every section is empty.
	const empty =
		inbox.data !== undefined && Object.values(inbox.data).every((section: { total: number }) => section.total === 0);

	return (
		<>
			<Topbar>
				<PageTitle title="Needs you" />
			</Topbar>
			<div className="page-card flex flex-1 flex-col overflow-y-auto">
				<NativeAttention attention={native} />
				{attention && (
					<div className="p-4">
						<ManagerQueue attentionOnly />
					</div>
				)}
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
					(empty && !attention ? (
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
