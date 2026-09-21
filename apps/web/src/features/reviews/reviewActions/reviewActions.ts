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
	| "update-branch"
	| "deploy-on"
	| "deploy-off"
	| "live-create"
	| "live-deploy"
	| "live-delete"
	| "live-enable"
	| "live-disable"
	| "live-persist"
	| "live-unpersist";

type ActionItem = { action: ReviewAction; label: string; danger?: boolean; confirm?: boolean };

export type ReviewActionMeta = {
	state?: string;
	isDraft?: boolean;
	headRefName?: string;
	autoMergeRequest?: unknown;
	labels?: { name: string }[];
};

export type ReviewActionMetadata = {
	mergeQueueEntry?: unknown;
	autoDeployAvailable?: boolean;
};

export const isPrHeadMoved = (error: unknown) => error instanceof ORPCError && error.code === "PR_HEAD_MOVED";

const hasLabel = (meta: ReviewActionMeta, name: string) => meta.labels?.some((label) => label.name === name) ?? false;

export const mergeMenuActions = (meta: ReviewActionMeta, extra?: ReviewActionMetadata): ActionItem[] => [
	{ action: "merge", label: "Merge", confirm: true },
	{ action: "admin-merge", label: "Admin merge", confirm: true },
	meta.autoMergeRequest
		? { action: "disable-automerge", label: "Disable auto-merge" }
		: { action: "automerge", label: "Enable auto-merge" },
	extra?.mergeQueueEntry
		? { action: "dequeue", label: "Remove from queue" }
		: { action: "queue", label: "Add to queue" },
];

export const deployAction = (meta: ReviewActionMeta): ActionItem =>
	hasLabel(meta, "00_AUTO_DEPLOY")
		? { action: "deploy-off", label: "Disable deploy on merge" }
		: { action: "deploy-on", label: "Enable deploy on merge" };

export const liveBranchActions = (meta: ReviewActionMeta, pr: string): ActionItem[] => {
	if (!pr.includes("github.com/canary-technologies-corp/canary/pull/")) return [];
	if (meta.state?.toUpperCase() !== "OPEN" || meta.headRefName?.startsWith("golem/")) return [];
	return [
		{ action: "live-create", label: "Create Live Branch" },
		{ action: "live-deploy", label: "Deploy Live Branch" },
		{ action: "live-delete", label: "Delete Live Branch", danger: true, confirm: true },
		hasLabel(meta, "Live Branch: Enabled") || hasLabel(meta, "Lite Env: Enabled")
			? { action: "live-disable", label: "Disable Live Branch on push" }
			: { action: "live-enable", label: "Enable Live Branch on push" },
		hasLabel(meta, "Live Branch: Persist") || hasLabel(meta, "Lite Env: Persist")
			? { action: "live-unpersist", label: "Remove Live Branch persistence" }
			: { action: "live-persist", label: "Keep Live Branch after merge" },
	];
};

export const githubActionItems = (
	meta: ReviewActionMeta,
	extra: ReviewActionMetadata | undefined,
	pr: string,
): ActionItem[] => {
	if (meta.state?.toUpperCase() !== "OPEN") return [];
	const ready: ActionItem[] = meta.isDraft ? [{ action: "ready", label: "Mark ready for review" }] : [];
	return [
		...ready,
		...mergeMenuActions(meta, extra),
		{ action: "update-branch", label: "Update branch" },
		...(extra?.autoDeployAvailable ? [deployAction(meta)] : []),
		...liveBranchActions(meta, pr),
		{ action: "close", label: "Close", danger: true, confirm: true },
	];
};
