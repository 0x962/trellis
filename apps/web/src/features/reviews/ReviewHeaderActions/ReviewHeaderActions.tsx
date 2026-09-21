import { GithubLogo } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ReviewRevision } from "@trellis/api";
import { ConfirmDialog, IconButton, Menu, toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import {
	githubActionItems,
	isPrHeadMoved,
	type ReviewAction,
	type ReviewActionMeta,
	type ReviewActionMetadata,
} from "../reviewActions/reviewActions";

export function ReviewHeaderActions({
	pr,
	revision,
	onDone,
}: {
	pr: string;
	revision: ReviewRevision;
	onDone: () => void;
}) {
	const { client, orpc, queryClient } = useApp();
	const [confirm, setConfirm] = useState<{
		action: ReviewAction;
		title: string;
		description: string;
		confirmLabel: string;
		danger?: boolean;
	} | null>(null);
	const [metadataRequested, setMetadataRequested] = useState(false);
	const meta = revision.meta as ReviewActionMeta;
	const metadata = useQuery({
		...orpc.reviews.metadata.queryOptions({ input: { pr } }),
		enabled: metadataRequested,
	});
	const extra = metadata.data as ReviewActionMetadata | undefined;
	const action = useMutation({
		mutationFn: (next: ReviewAction) => client.reviews.action({ pr, headSha: revision.headSha, action: next }),
		onSuccess: () => {
			setConfirm(null);
			void queryClient.invalidateQueries({ queryKey: orpc.reviews.metadata.key() });
			onDone();
		},
		onError: (error) => {
			if (isPrHeadMoved(error)) {
				setConfirm(null);
				onDone();
				return;
			}
			toast.error("The pull request action failed", { description: error.message });
		},
	});
	const items = [
		{
			label: "Open in GitHub",
			onSelect: () => window.open(pr, "_blank", "noopener"),
		},
		...githubActionItems(meta, extra, pr).map((item) => ({
			label: item.label,
			danger: item.danger,
			disabled: action.isPending,
			onSelect: () =>
				item.confirm
					? setConfirm({
							action: item.action,
							title:
								item.action === "merge" || item.action === "admin-merge"
									? `${item.label} pull request?`
									: `${item.label}?`,
							description:
								item.action === "close"
									? "This stops new reviews and prevents the pull request from merging."
									: item.action === "admin-merge"
										? "This uses administrator privileges and bypasses branch protection."
										: item.action === "merge"
											? "This squashes the commits and merges the pull request."
											: "This runs the GitHub action.",
							confirmLabel: item.label,
							danger: item.danger,
						})
					: action.mutate(item.action),
		})),
		...(metadataRequested && extra === undefined
			? [{ label: "Loading GitHub actions...", disabled: true, onSelect: () => {} }]
			: []),
	];

	return (
		<div className="review-header-actions">
			<Menu
				label="GitHub actions"
				trigger={<IconButton label="GitHub actions" icon={<GithubLogo />} variant="default" />}
				triggerTooltip="GitHub actions"
				onOpenChange={(open) => open && setMetadataRequested(true)}
				items={items}
			/>
			<ConfirmDialog
				open={confirm !== null}
				title={confirm?.title ?? ""}
				description={confirm?.description ?? ""}
				confirmLabel={confirm?.confirmLabel ?? ""}
				danger={confirm?.danger}
				processing={action.isPending}
				onCancel={() => setConfirm(null)}
				onConfirm={() => confirm && action.mutate(confirm.action)}
			/>
		</div>
	);
}
