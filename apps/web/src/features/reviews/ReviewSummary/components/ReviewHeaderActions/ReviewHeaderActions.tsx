import { GithubLogo } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ReviewRevision, ReviewThread } from "@trellis/api";
import { Button, ConfirmDialog, IconButton, Menu, Tooltip, toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import {
	mergeMenuActions,
	overflowActions,
	primaryReviewAction,
	type ReviewAction,
	type ReviewActionMeta,
	type ReviewActionMetadata,
} from "../../../reviewActions/reviewActions";
import { ReviewSubmit } from "./components/ReviewSubmit";

type Meta = ReviewActionMeta & {
	baseRefName?: string;
};

export function ReviewHeaderActions({
	pr,
	revision,
	openThreads,
	showReview,
	onDone,
}: {
	pr: string;
	revision: ReviewRevision;
	openThreads: ReviewThread[];
	showReview: boolean;
	onDone: () => void;
}) {
	const { client, orpc, queryClient } = useApp();
	const [closeOpen, setCloseOpen] = useState(false);
	const [metadataRequested, setMetadataRequested] = useState(false);
	const meta = revision.meta as Meta;
	const primary = primaryReviewAction(meta);
	const metadata = useQuery({
		...orpc.reviews.metadata.queryOptions({ input: { pr } }),
		enabled: primary !== null && metadataRequested,
	});
	const extra = metadata.data as ReviewActionMetadata | undefined;
	const action = useMutation({
		mutationFn: (next: ReviewAction) => client.reviews.action({ pr, headSha: revision.headSha, action: next }),
		onSuccess: () => {
			setCloseOpen(false);
			void queryClient.invalidateQueries({ queryKey: orpc.reviews.metadata.key() });
			onDone();
		},
		onError: (error) => toast.error("The pull request action failed", { description: error.message }),
	});

	// `mergeMenuActions` reads `extra.mergeQueueEntry` to choose between "Join
	// the merge queue" and "Leave the merge queue". The metadata query starts
	// when this menu opens for the first time, so `extra` is undefined until
	// that answer arrives. A placeholder holds the place until then, because
	// the wrong word would send the pull request into the queue twice.
	const mergeItems: Array<{ action: ReviewAction; label: string; waiting: boolean }> =
		primary !== "merge"
			? []
			: extra === undefined
				? [{ action: "queue", label: "Loading merge options…", waiting: true }]
				: mergeMenuActions(meta, extra).map((item) => ({ ...item, waiting: false }));

	return (
		<div className="review-header-actions">
			{primary !== null && (
				<>
					{showReview && <ReviewSubmit pr={pr} revision={revision} openThreads={openThreads} onDone={onDone} />}
					{primary === "ready" && (
						<Button variant="primary" processing={action.isPending} onClick={() => action.mutate("ready")}>
							Mark ready for review
						</Button>
					)}
				</>
			)}
			<Tooltip content="Open pull request on GitHub">
				<IconButton
					label="Open pull request on GitHub"
					icon={<GithubLogo />}
					variant="default"
					onClick={() => window.open(pr, "_blank", "noopener")}
				/>
			</Tooltip>
			{primary !== null && (
				<>
					<Menu
						label="More pull request actions"
						triggerTooltip="More actions"
						onOpenChange={(open) => open && setMetadataRequested(true)}
						items={[...mergeItems, ...overflowActions(meta, extra).map((item) => ({ ...item, waiting: false }))].map(
							(item) => ({
								label: item.label,
								danger: item.action === "close",
								disabled: action.isPending || item.waiting,
								onSelect: () => (item.action === "close" ? setCloseOpen(true) : action.mutate(item.action)),
							}),
						)}
					/>
					<ConfirmDialog
						open={closeOpen}
						title="Close pull request?"
						description="This stops new reviews and prevents the pull request from merging."
						confirmLabel="Close pull request"
						danger
						processing={action.isPending}
						onCancel={() => setCloseOpen(false)}
						onConfirm={() => action.mutate("close")}
					/>
				</>
			)}
		</div>
	);
}
