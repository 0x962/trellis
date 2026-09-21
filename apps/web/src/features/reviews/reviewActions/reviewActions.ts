export type ReviewAction =
	| "merge"
	| "admin-merge"
	| "automerge"
	| "disable-automerge"
	| "queue"
	| "dequeue"
	| "close"
	| "ready"
	| "update-branch"
	| "deploy-on"
	| "deploy-off";

type ActionItem = { action: ReviewAction; label: string };

export type ReviewActionMeta = {
	state?: string;
	isDraft?: boolean;
	autoMergeRequest?: unknown;
	labels?: { name: string }[];
};

export type ReviewActionMetadata = {
	mergeQueueEntry?: unknown;
	autoDeployAvailable?: boolean;
};

export const primaryReviewAction = ({ state, isDraft }: ReviewActionMeta) => {
	if (state?.toUpperCase() !== "OPEN") return null;
	return isDraft ? "ready" : "merge";
};

export const mergeAction = (admin: boolean) => (admin ? "admin-merge" : "merge");

export const mergeMenuActions = (meta: ReviewActionMeta, extra?: ReviewActionMetadata): ActionItem[] => [
	meta.autoMergeRequest
		? { action: "disable-automerge", label: "Disable auto-merge" }
		: { action: "automerge", label: "Enable auto-merge" },
	extra?.mergeQueueEntry
		? { action: "dequeue", label: "Leave the merge queue" }
		: { action: "queue", label: "Join the merge queue" },
];

export const overflowActions = (meta: ReviewActionMeta, extra?: ReviewActionMetadata): ActionItem[] => {
	const deploy = meta.labels?.some((label) => label.name === "00_AUTO_DEPLOY");
	return [
		{ action: "update-branch", label: "Update branch" },
		...(extra?.autoDeployAvailable
			? [
					deploy
						? ({ action: "deploy-off", label: "Disable deploy on merge" } as const)
						: ({ action: "deploy-on", label: "Enable deploy on merge" } as const),
				]
			: []),
		{ action: "close", label: "Close pull request" },
	];
};
