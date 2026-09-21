import {
	ArrowSquareOut,
	ArrowsClockwise,
	Eye,
	GithubLogo,
	GitMerge,
	Lightning,
	Queue,
	XCircle,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ReviewRevision } from "@trellis/api";
import { Checkbox, ConfirmDialog, IconButton, Menu, type MenuGroup, toast } from "@trellis/ui";
import { type ReactElement, useState } from "react";
import { useApp } from "../../../lib/appContext";
import {
	type ActionItem,
	type GithubMenuAction,
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
	const [adminMerge, setAdminMerge] = useState(false);
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
			setAdminMerge(false);
			void queryClient.invalidateQueries({ queryKey: orpc.reviews.metadata.key() });
			onDone();
		},
		onError: (error) => {
			if (isPrHeadMoved(error)) {
				setConfirm(null);
				setAdminMerge(false);
				onDone();
				return;
			}
			toast.error("The pull request action failed", { description: error.message });
		},
	});
	const iconByAction: Record<GithubMenuAction, ReactElement> = {
		open: <ArrowSquareOut />,
		merge: <GitMerge />,
		"admin-merge": <GitMerge />,
		automerge: <Lightning />,
		"disable-automerge": <Lightning />,
		queue: <Queue />,
		dequeue: <Queue />,
		ready: <Eye />,
		"update-branch": <ArrowsClockwise />,
		close: <XCircle />,
	};
	const toMenuItem = (item: ActionItem) => ({
		label: item.label,
		danger: item.danger,
		disabled: action.isPending,
		icon: iconByAction[item.action],
		onSelect: () => {
			if (item.action === "open") {
				window.open(pr, "_blank", "noopener");
				return;
			}
			if (item.confirm) {
				setAdminMerge(false);
				setConfirm({
					action: item.action === "merge" ? "merge" : item.action,
					title: item.action === "merge" ? `${item.label} pull request?` : `${item.label}?`,
					description:
						item.action === "close"
							? "This stops new reviews and prevents the pull request from merging."
							: item.action === "merge"
								? "This squashes the commits and merges the pull request."
								: "This runs the GitHub action.",
					confirmLabel: item.label,
					danger: item.danger,
				});
				return;
			}
			action.mutate(item.action);
		},
	});
	const items: MenuGroup[] = [
		...githubActionItems(meta, extra, pr).map((group) => ({
			type: "group" as const,
			label: group.label,
			items: group.items.map(toMenuItem),
		})),
		...(metadataRequested && extra === undefined
			? [
					{
						type: "group" as const,
						items: [{ label: "Loading GitHub actions...", disabled: true, onSelect: () => {} }],
					},
				]
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
				onCancel={() => {
					setConfirm(null);
					setAdminMerge(false);
				}}
				onConfirm={() =>
					confirm && action.mutate(confirm.action === "merge" && adminMerge ? "admin-merge" : confirm.action)
				}
			>
				{confirm?.action === "merge" && (
					<Checkbox label="Admin merge" checked={adminMerge} onCheckedChange={setAdminMerge} className="text-sm" />
				)}
			</ConfirmDialog>
		</div>
	);
}
