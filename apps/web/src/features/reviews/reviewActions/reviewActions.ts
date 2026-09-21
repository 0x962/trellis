import { ORPCError } from "@orpc/client";

export type ReviewAction =
	| "merge"
	| "admin-merge"
	| "automerge"
	| "disable-automerge"
	| "queue"
	| "dequeue"
	| "close"
	| "ready"
	| "update-branch";

export type GithubMenuAction = ReviewAction | "open";

export type ActionItem = { action: GithubMenuAction; label: string; danger?: boolean; confirm?: boolean };

export type GithubActionGroup = {
	label?: string;
	items: ActionItem[];
};

export type ReviewActionMeta = {
	state?: string;
	isDraft?: boolean;
	autoMergeRequest?: unknown;
};

export type ReviewActionMetadata = {
	mergeQueueEntry?: unknown;
};

export const isPrHeadMoved = (error: unknown) => error instanceof ORPCError && error.code === "PR_HEAD_MOVED";

export const mergeMenuActions = (meta: ReviewActionMeta, extra?: ReviewActionMetadata): ActionItem[] => [
	{ action: "merge", label: "Merge", confirm: true },
	meta.autoMergeRequest
		? { action: "disable-automerge", label: "Cancel merge when ready" }
		: { action: "automerge", label: "Merge when ready" },
	extra?.mergeQueueEntry
		? { action: "dequeue", label: "Remove from merge queue" }
		: { action: "queue", label: "Add to merge queue" },
];

export const githubActionItems = (
	meta: ReviewActionMeta,
	extra: ReviewActionMetadata | undefined,
	_pr: string,
): GithubActionGroup[] => {
	const openGroup: GithubActionGroup = {
		items: [{ action: "open", label: "Open in GitHub" }],
	};
	if (meta.state?.toUpperCase() !== "OPEN") return [openGroup];
	const branchItems: ActionItem[] = [
		...(meta.isDraft ? [{ action: "ready", label: "Mark ready for review" } satisfies ActionItem] : []),
		{ action: "update-branch", label: "Update branch" },
	];
	return [
		openGroup,
		{ label: "Merge", items: mergeMenuActions(meta, extra) },
		{ label: "Branch", items: branchItems },
		{ items: [{ action: "close", label: "Close pull request", danger: true, confirm: true }] },
	];
};
