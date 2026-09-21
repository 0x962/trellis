import { GitMerge } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import type { ReviewRevision } from "@trellis/api";
import { Checkbox, ConfirmDialog, IconButton, Tooltip, toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { isPrHeadMoved, mergeAction } from "../../../reviewActions/reviewActions";
import { mergeQuestion } from "../../unmetLine/unmetLine";

// The button stays enabled when a condition is unmet. The confirm dialog
// names each unmet condition, and the person decides.
export function MergeButton({
	pr,
	revision,
	baseRefName,
	unmetConditions,
	onDone,
}: {
	pr: string;
	revision: ReviewRevision;
	baseRefName: string | undefined;
	unmetConditions: readonly string[];
	onDone: () => void;
}) {
	const { client, orpc, queryClient } = useApp();
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [admin, setAdmin] = useState(false);
	const mutation = useMutation({
		mutationFn: () => client.reviews.action({ pr, headSha: revision.headSha, action: mergeAction(admin) }),
		onSuccess: () => {
			setConfirmOpen(false);
			void queryClient.invalidateQueries({ queryKey: orpc.reviews.metadata.key() });
			onDone();
		},
		onError: (error) => {
			if (isPrHeadMoved(error)) {
				setConfirmOpen(false);
				onDone();
				return;
			}
			toast.error("The merge failed", { description: error.message });
		},
	});

	return (
		<>
			<Tooltip content="Merge">
				<IconButton label="Merge" icon={<GitMerge />} variant="primary" onClick={() => setConfirmOpen(true)} />
			</Tooltip>
			<ConfirmDialog
				open={confirmOpen}
				title={mergeQuestion(unmetConditions)}
				description={`Squash and merge these changes into ${baseRefName ?? "the base branch"}.`}
				confirmLabel="Merge"
				processing={mutation.isPending}
				onCancel={() => setConfirmOpen(false)}
				onConfirm={() => mutation.mutate()}
			>
				<div className="review-merge-confirmation">
					{unmetConditions.length > 0 && (
						<ul className="review-merge-unmet">
							{unmetConditions.map((phrase) => (
								<li key={phrase}>{phrase}</li>
							))}
						</ul>
					)}
					<Checkbox label="Use administrator privileges" checked={admin} onCheckedChange={setAdmin} />
					{admin && <p className="review-merge-admin-note">Administrator privileges bypass branch protection.</p>}
					<span className="review-merge-sha">Reviewed head: {revision.headSha.slice(0, 12)}</span>
				</div>
			</ConfirmDialog>
		</>
	);
}
