import { useMutation, useQuery } from "@tanstack/react-query";
import type { ReviewRevision, TrellisClient } from "@trellis/api";
import { Button, Select, Sheet } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";

type Action = Parameters<TrellisClient["reviews"]["action"]>[0]["action"];
const labels: Record<Action, string> = {
	merge: "Squash and merge",
	"admin-merge": "Merge with administrator override",
	automerge: "Enable auto-merge",
	"disable-automerge": "Disable auto-merge",
	queue: "Join the merge queue",
	dequeue: "Leave the merge queue",
	close: "Close PR",
	ready: "Mark ready for review",
	"update-branch": "Update branch",
	"deploy-on": "Enable deploy on merge",
	"deploy-off": "Disable deploy on merge",
	"live-create": "Create Live Branch",
	"live-deploy": "Redeploy Live Branch",
	"live-delete": "Delete Live Branch",
	"live-enable": "Enable Live Branch on push",
	"live-disable": "Disable Live Branch on push",
	"live-persist": "Keep Live Branch after merge",
	"live-unpersist": "Remove Live Branch persistence",
};
export function ReviewActions({
	pr,
	revision,
	open,
	onOpenChange,
	onDone,
}: {
	pr: string;
	revision: ReviewRevision;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onDone: () => void;
}) {
	const { client, orpc } = useApp();
	const [action, setAction] = useState<Action>("merge");
	const extra = useQuery(orpc.reviews.metadata.queryOptions({ input: { pr } }));
	const mutation = useMutation({
		mutationFn: () => client.reviews.action({ pr, headSha: revision.headSha, action }),
		onSuccess: () => {
			onOpenChange(false);
			onDone();
		},
	});
	const items = Object.entries(labels)
		.filter(([key]) => !key.startsWith("live-") && (!key.startsWith("deploy-") || extra.data?.autoDeployAvailable))
		.map(([value, label]) => ({ value: value as Action, label }));
	return open ? (
		<Sheet
			width="var(--review-sheet-width)"
			titleClassName="font-medium text-base"
			open
			title="Pull request action"
			onOpenChange={(value) => !value && !mutation.isPending && onOpenChange(false)}
		>
			<form
				className="review-form"
				onSubmit={(event) => {
					event.preventDefault();
					mutation.mutate();
				}}
			>
				<Select label="Action" value={action} onValueChange={setAction} items={items} />
				<a className="review-meta" href={pr} target="_blank" rel="noreferrer">
					Open pull request
				</a>
				{action === "admin-merge" && <p role="alert">This action bypasses branch protection.</p>}
				{action === "live-delete" && <p role="alert">This action deletes the PR environment.</p>}
				<p className="review-meta">Reviewed head: {revision.headSha.slice(0, 12)}</p>
				{mutation.isError && (
					<p role="alert" className="review-error">
						{mutation.error.message}
					</p>
				)}
				<div className="review-form-actions">
					<Button type="button" disabled={mutation.isPending} onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button type="submit" variant={action === "close" ? "danger" : "primary"} processing={mutation.isPending}>
						{labels[action]}
					</Button>
				</div>
			</form>
		</Sheet>
	) : null;
}
