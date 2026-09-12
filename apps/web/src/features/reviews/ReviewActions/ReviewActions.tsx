import { DotsThree, GitMerge } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ReviewRevision, TrellisClient } from "@trellis/api";
import { Button, IconButton, Select, Sheet, Tooltip } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";

type Action = Parameters<TrellisClient["reviews"]["action"]>[0]["action"];
const labels: Record<Action, string> = {
	approve: "Approve on GitHub",
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
	live = false,
	onDone,
}: {
	pr: string;
	revision: ReviewRevision;
	live?: boolean;
	onDone: () => void;
}) {
	const { client, orpc } = useApp();
	const [open, setOpen] = useState(false);
	const [action, setAction] = useState<Action>(live ? "live-create" : "approve");
	const extra = useQuery({ ...orpc.reviews.metadata.queryOptions({ input: { pr } }), enabled: !live });
	const mutation = useMutation({
		mutationFn: () => client.reviews.action({ pr, headSha: revision.headSha, action }),
		onSuccess: () => {
			setOpen(false);
			onDone();
		},
	});
	const items = Object.entries(labels)
		.filter(
			([key]) => key.startsWith("live-") === live && (!key.startsWith("deploy-") || extra.data?.autoDeployAvailable),
		)
		.map(([value, label]) => ({ value: value as Action, label }));
	return (
		<>
			<Tooltip content={live ? "Live Branch actions" : "GitHub actions"}>
				<IconButton
					label={live ? "Live Branch actions" : "GitHub actions"}
					icon={live ? <GitMerge /> : <DotsThree />}
					onClick={() => setOpen(true)}
				/>
			</Tooltip>
			{open && (
				<Sheet
					width="var(--review-sheet-width)"
					titleClassName="font-medium text-base"
					open
					title={live ? "Live Branch action" : "GitHub action"}
					onOpenChange={(value) => !value && !mutation.isPending && setOpen(false)}
				>
					<form
						className="review-form"
						onSubmit={(event) => {
							event.preventDefault();
							mutation.mutate();
						}}
					>
						<Select label="Action" value={action} onValueChange={setAction} items={items} />
						<p className="review-form-hint">This action changes the pull request on GitHub.</p>
						<a className="review-meta" href={pr} target="_blank" rel="noreferrer">
							Open pull request on GitHub
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
							<Button type="button" disabled={mutation.isPending} onClick={() => setOpen(false)}>
								Cancel
							</Button>
							<Button type="submit" disabled={mutation.isPending}>
								{labels[action]}
							</Button>
						</div>
					</form>
				</Sheet>
			)}
		</>
	);
}
