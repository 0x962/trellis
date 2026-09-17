import { ArrowClockwise, RocketLaunch, Trash } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import type { ReviewRevision, TrellisClient } from "@trellis/api";
import { ConfirmDialog, IconButton, Tooltip } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";

type LiveAction = Extract<
	Parameters<TrellisClient["reviews"]["action"]>[0]["action"],
	"live-create" | "live-deploy" | "live-delete"
>;

const actionLabels: Record<LiveAction, string> = {
	"live-create": "Deploy live branch",
	"live-deploy": "Redeploy live branch",
	"live-delete": "Delete live branch",
};

export function ReviewLiveActions({
	pr,
	revision,
	onDone,
}: {
	pr: string;
	revision: ReviewRevision;
	onDone: () => void;
}) {
	const { client } = useApp();
	const [deleteOpen, setDeleteOpen] = useState(false);
	const mutation = useMutation({
		mutationFn: (action: LiveAction) => client.reviews.action({ pr, headSha: revision.headSha, action }),
		onSuccess: (_, action) => {
			if (action === "live-delete") setDeleteOpen(false);
			onDone();
		},
	});
	const run = (action: LiveAction) => mutation.mutate(action);
	return (
		<div className="review-live-control">
			<fieldset className="review-live-actions">
				<legend className="sr-only">Live branch actions</legend>
				<Tooltip content={actionLabels["live-create"]}>
					<IconButton
						label={actionLabels["live-create"]}
						icon={<RocketLaunch />}
						disabled={mutation.isPending}
						onClick={() => run("live-create")}
					/>
				</Tooltip>
				<Tooltip content={actionLabels["live-deploy"]}>
					<IconButton
						label={actionLabels["live-deploy"]}
						icon={<ArrowClockwise />}
						disabled={mutation.isPending}
						onClick={() => run("live-deploy")}
					/>
				</Tooltip>
				<Tooltip content={actionLabels["live-delete"]}>
					<IconButton
						label={actionLabels["live-delete"]}
						icon={<Trash />}
						variant="danger"
						disabled={mutation.isPending}
						onClick={() => setDeleteOpen(true)}
					/>
				</Tooltip>
			</fieldset>
			{mutation.isError && (
				<p className="review-error" role="alert">
					{mutation.error.message}
				</p>
			)}
			<ConfirmDialog
				open={deleteOpen}
				title="Delete live branch?"
				description="The PR environment will become unavailable."
				confirmLabel="Delete live branch"
				danger
				processing={mutation.isPending}
				onCancel={() => setDeleteOpen(false)}
				onConfirm={() => run("live-delete")}
			/>
		</div>
	);
}
