import { GitMerge } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import type { ReviewRevision } from "@trellis/api";
import { Checkbox, ConfirmDialog, IconButton, Tooltip, toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { mergeAction } from "../../../ReviewSummary/components/ReviewHeaderActions/reviewActions";
import { mergeQuestion } from "../../unmetLine/unmetLine";

// The merge button of the verdict bar. It is never disabled: an unmet
// condition only changes the question that the one confirm asks, and the
// confirm lists each unmet condition. The person decides.
export function MergeControl({
	pr,
	revision,
	baseRefName,
	unmet,
	onDone,
}: {
	pr: string;
	revision: ReviewRevision;
	baseRefName: string | undefined;
	// The phrases of `unmetConditions`, such as "1 check failed".
	unmet: readonly string[];
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
		onError: (error) => toast.error("The merge failed", { description: error.message }),
	});

	return (
		<>
			<Tooltip content="Merge">
				<IconButton label="Merge" icon={<GitMerge />} variant="primary" onClick={() => setConfirmOpen(true)} />
			</Tooltip>
			<ConfirmDialog
				open={confirmOpen}
				title={mergeQuestion(unmet)}
				description={`Squash and merge these changes into ${baseRefName ?? "the base branch"}.`}
				confirmLabel="Merge"
				processing={mutation.isPending}
				onCancel={() => setConfirmOpen(false)}
				onConfirm={() => mutation.mutate()}
			>
				<div className="review-merge-confirmation">
					{unmet.length > 0 && (
						<ul className="review-merge-unmet">
							{unmet.map((phrase) => (
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
