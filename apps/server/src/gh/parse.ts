import { type ChangedFile, type Check, type CheckBucket, type CiState, MAX_CHANGED_FILES } from "@trellis/api";
import type { PullRequestRef } from "./graphql.ts";

// The raw nodes `gh api graphql` returns for `statusCheckRollup { contexts }`.
// A CheckRun comes from GitHub Actions or a checks app and carries its
// workflow through checkSuite.workflowRun. A StatusContext comes from the
// commit status API and has no workflow. A node can omit its URL field, and
// the Check row then carries link null, so the row passes CheckSchema.

export type RawCheckRun = {
	__typename: "CheckRun";
	name: string;
	status: string;
	conclusion: string | null;
	startedAt?: string | null;
	completedAt?: string | null;
	detailsUrl?: string | null;
	checkSuite: { workflowRun: { event?: string | null; workflow: { name: string } } | null };
};

export type RawStatusContext = {
	__typename: "StatusContext";
	context: string;
	state: string;
	createdAt?: string | null;
	targetUrl?: string | null;
};

export type RawContext = RawCheckRun | RawStatusContext;

export type RawFile = {
	path: string;
	changeType: "ADDED" | "CHANGED" | "COPIED" | "DELETED" | "MODIFIED" | "RENAMED";
	additions: number;
	deletions: number;
};

const changeOf = ({ changeType, additions, deletions }: RawFile): ChangedFile["change"] => {
	if (changeType === "ADDED" || changeType === "COPIED") return "new";
	if (changeType === "DELETED") return "deleted";
	if (changeType === "RENAMED") return additions === 0 && deletions === 0 ? "rename-pure" : "rename-changed";
	return "change";
};

// The bucket table mirrors `gh pr checks`, so the web shows the same word
// gh prints. A conclusion outside the table is a check gh cannot judge yet.
const checkRunBuckets: Record<string, CheckBucket> = {
	SUCCESS: "pass",
	FAILURE: "fail",
	TIMED_OUT: "fail",
	ACTION_REQUIRED: "fail",
	STARTUP_FAILURE: "fail",
	STALE: "fail",
	CANCELLED: "cancel",
	SKIPPED: "skipping",
	NEUTRAL: "skipping",
};

const statusContextBuckets: Record<string, CheckBucket> = {
	SUCCESS: "pass",
	FAILURE: "fail",
	ERROR: "fail",
	PENDING: "pending",
	EXPECTED: "pending",
};

export const bucketForCheckRun = (node: RawCheckRun): CheckBucket => {
	if (node.status !== "COMPLETED") return "pending";
	return checkRunBuckets[node.conclusion ?? ""] ?? "pending";
};

export const bucketForStatusContext = (node: RawStatusContext): CheckBucket =>
	statusContextBuckets[node.state] ?? "pending";

// A commit status carries one time only, so its start is its end and it
// reads as no time at all.
const toCheck = (node: RawContext): Check => {
	if (node.__typename === "CheckRun") {
		return {
			name: node.name,
			workflow: node.checkSuite.workflowRun?.workflow.name ?? null,
			bucket: bucketForCheckRun(node),
			link: node.detailsUrl ?? null,
			startedAt: node.startedAt ?? null,
			endedAt: node.completedAt ?? null,
		};
	}
	return {
		name: node.context,
		workflow: null,
		bucket: bucketForStatusContext(node),
		link: node.targetUrl ?? null,
		startedAt: node.createdAt ?? null,
		endedAt: null,
	};
};

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// Sorted by workflow (a null workflow first), then name, then bucket, then
// link. The order is total, so the same checks in any input order give the
// same array and the same content hash.
const compareChecks = (a: Check, b: Check) =>
	compareText(a.workflow ?? "", b.workflow ?? "") ||
	compareText(a.name, b.name) ||
	compareText(a.bucket, b.bucket) ||
	compareText(a.link ?? "", b.link ?? "");

// The time GitHub started the node. A node that carries no time sorts before
// every node that carries one, so a re-run with a time always wins.
const startedAtMs = (node: RawContext): number => {
	const stamp = node.__typename === "CheckRun" ? node.startedAt : node.createdAt;
	const parsed = Date.parse(stamp ?? "");
	return Number.isNaN(parsed) ? 0 : parsed;
};

// Two nodes with this same key are the same check. A CheckRun is one check
// per name, workflow, and trigger event: the same workflow run on a push and
// on a pull request gives two checks that both count. A StatusContext is one
// check per context name. The key matches the one `gh pr checks` builds, so
// the web shows the rows gh prints.
const identity = (node: RawContext): string => {
	if (node.__typename === "StatusContext") return `status\u0000${node.context}`;
	const workflowRun = node.checkSuite.workflowRun;
	return `run\u0000${node.name}\u0000${workflowRun?.workflow.name ?? ""}\u0000${workflowRun?.event ?? ""}`;
};

// GitHub keeps a re-run beside the run it replaces on the same commit, so
// contexts can hold two nodes for one check. Only the node that started last
// counts. Without this, a first run that failed holds ciState at fail after
// the re-run passes.
const latestPerCheck = (nodes: RawContext[]): RawContext[] => {
	const latest = new Map<string, RawContext>();
	for (const node of nodes) {
		const key = identity(node);
		const held = latest.get(key);
		if (held === undefined || startedAtMs(node) > startedAtMs(held)) latest.set(key, node);
	}
	return [...latest.values()];
};

export const normalizeChecks = (nodes: RawContext[]): Check[] => latestPerCheck(nodes).map(toCheck).sort(compareChecks);

export const normalizeFiles = (nodes: RawFile[]): ChangedFile[] =>
	nodes
		.map((file) => ({
			path: file.path,
			change: changeOf(file),
			additions: file.additions,
			deletions: file.deletions,
		}))
		.sort((a, b) => compareText(a.path, b.path))
		.slice(0, MAX_CHANGED_FILES);

// Any fail or cancel gives fail; else any pending gives pending; else any
// pass gives pass; else none. A skipping check counts as nothing.
export const deriveCiState = (checks: Check[]): CiState => {
	const buckets = new Set(checks.map((check) => check.bucket));
	if (buckets.has("fail") || buckets.has("cancel")) return "fail";
	if (buckets.has("pending")) return "pending";
	if (buckets.has("pass")) return "pass";
	return "none";
};

// The pull request one GitHub url names. The path may carry more segments
// (`/files`), a query, or a fragment, and the owner and the repository may
// be spelled in any case.
const PULL_URL = /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/([1-9][0-9]*)(?:[/?#]|$)/i;

// The owner and the repository are case-insensitive on GitHub and lower case
// in the database, so two spellings of one pull request are one row.
export const parsePullRequestUrl = (url: string): PullRequestRef | null => {
	const match = PULL_URL.exec(url);
	if (match === null) return null;
	return { owner: match[1]!.toLowerCase(), repo: match[2]!.toLowerCase(), number: Number(match[3]) };
};
