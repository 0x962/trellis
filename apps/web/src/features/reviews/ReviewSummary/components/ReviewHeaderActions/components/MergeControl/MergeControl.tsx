import { useMutation } from "@tanstack/react-query";
import type { ReviewRevision } from "@trellis/api";
import { Button, Checkbox, ConfirmDialog, SplitButton, toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../../../lib/appContext";
import {
	mergeAction,
	mergeMenuActions,
	primaryReviewAction,
	type ReviewAction,
	type ReviewActionMeta,
	type ReviewActionMetadata,
} from "../../reviewActions";

export function MergeControl({
	pr,
	revision,
	meta,
	extra,
	metadataPending,
	onMenuOpen,
	onDone,
}: {
	pr: string;
	revision: ReviewRevision;
	meta: ReviewActionMeta & { baseRefName?: string };
	extra?: ReviewActionMetadata;
	metadataPending: boolean;
	onMenuOpen: () => void;
	onDone: () => void;
}) {
	const { client, orpc, queryClient } = useApp();
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [admin, setAdmin] = useState(false);
	const primary = primaryReviewAction(meta);
	const mutation = useMutation({
		mutationFn: (action: ReviewAction) => client.reviews.action({ pr, headSha: revision.headSha, action }),
		onSuccess: () => {
			setConfirmOpen(false);
			void queryClient.invalidateQueries({ queryKey: orpc.reviews.metadata.key() });
			onDone();
		},
		onError: (error) => toast.error("The pull request action failed", { description: error.message }),
	});

	if (primary === null) return null;
	if (primary === "ready") {
		return (
			<Button variant="primary" processing={mutation.isPending} onClick={() => mutation.mutate("ready")}>
				Mark ready for review
			</Button>
		);
	}

	return (
		<>
			<SplitButton
				variant="primary"
				menuLabel="More merge options"
				items={
					metadataPending
						? [{ label: "Loading merge options…", disabled: true, onSelect: () => undefined }]
						: mergeMenuActions(meta, extra).map((item) => ({
								label: item.label,
								disabled: mutation.isPending,
								onSelect: () => mutation.mutate(item.action),
							}))
				}
				onMenuOpenChange={(open) => open && onMenuOpen()}
				disabled={mutation.isPending}
				onClick={() => setConfirmOpen(true)}
			>
				Squash and merge
			</SplitButton>
			<ConfirmDialog
				open={confirmOpen}
				title="Squash and merge?"
				description={`Merge these changes into ${meta.baseRefName ?? "the base branch"}.`}
				confirmLabel="Squash and merge"
				processing={mutation.isPending}
				onCancel={() => setConfirmOpen(false)}
				onConfirm={() => mutation.mutate(mergeAction(admin))}
			>
				<div className="review-merge-confirmation">
					<Checkbox label="Use administrator privileges" checked={admin} onCheckedChange={setAdmin} />
					{admin && <p className="review-merge-admin-note">Administrator privileges bypass branch protection.</p>}
					<span className="review-merge-sha">Reviewed head: {revision.headSha.slice(0, 12)}</span>
				</div>
			</ConfirmDialog>
		</>
	);
}
