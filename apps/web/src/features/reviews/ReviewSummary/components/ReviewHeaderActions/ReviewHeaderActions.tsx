import { GithubLogo } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ReviewRevision } from "@trellis/api";
import { ConfirmDialog, IconButton, Menu, Tooltip, toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { MergeControl } from "./components/MergeControl";
import { ReviewerPicker } from "./components/ReviewerPicker";
import { ReviewSubmit } from "./components/ReviewSubmit";
import {
	overflowActions,
	primaryReviewAction,
	type ReviewAction,
	type ReviewActionMeta,
	type ReviewActionMetadata,
	type ReviewRequest,
} from "./reviewActions";

type Meta = ReviewActionMeta & {
	baseRefName?: string;
	author?: { login: string };
	reviewRequests?: ReviewRequest[];
};

export function ReviewHeaderActions({
	pr,
	revision,
	showReview,
	onDone,
}: {
	pr: string;
	revision: ReviewRevision;
	showReview: boolean;
	onDone: () => void;
}) {
	const { client, orpc } = useApp();
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
			onDone();
		},
		onError: (error) => toast.error("The pull request action failed", { description: error.message }),
	});

	return (
		<div className="review-header-actions">
			{primary !== null && (
				<>
					<ReviewerPicker pr={pr} author={meta.author?.login} requests={meta.reviewRequests ?? []} onDone={onDone} />
					{showReview && <ReviewSubmit pr={pr} revision={revision} onDone={onDone} />}
					<MergeControl
						pr={pr}
						revision={revision}
						meta={meta}
						extra={extra}
						metadataPending={metadataRequested && metadata.isPending}
						onMenuOpen={() => setMetadataRequested(true)}
						onDone={onDone}
					/>
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
						items={overflowActions(meta, extra).map((item) => ({
							label: item.label,
							danger: item.action === "close",
							disabled: action.isPending,
							onSelect: () => (item.action === "close" ? setCloseOpen(true) : action.mutate(item.action)),
						}))}
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
