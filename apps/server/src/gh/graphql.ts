import {
	type ChangedFile,
	type Check,
	type CiState,
	MAX_CHANGED_FILES,
	type PrState,
	type ReviewState,
} from "@trellis/api";
import { deriveCiState, normalizeChecks, normalizeFiles, type RawContext, type RawFile } from "./parse.ts";
import type { GhFailure, GhRunner, GhSlot } from "./run.ts";

// One `gh api graphql` request fetches a batch of pull requests. Each ref gets
// the alias prN, so the response maps back to refs[N] by index. The response
// carries no owner or repo, so the row takes both from the ref.
//
// The selection asks for the start time of every check node and for the event
// that triggered a workflow run. normalizeChecks needs both to tell a re-run
// from the run it replaces.

export type PullRequestRef = { owner: string; repo: string; number: number };

export type RawPullRequest = {
	number: number;
	additions: number;
	deletions: number;
	changedFiles: number;
	files: { nodes: RawFile[] };
	title: string;
	state: "OPEN" | "CLOSED" | "MERGED";
	isDraft: boolean;
	mergeQueueEntry: { position: number } | null;
	url: string;
	headRefOid: string;
	headRefName: string;
	baseRefName: string;
	mergedAt: string | null;
	closedAt: string | null;
	reviewDecision: "REVIEW_REQUIRED" | "APPROVED" | "CHANGES_REQUESTED" | null;
	commits: { nodes: Array<{ commit: { statusCheckRollup: { contexts: { nodes: RawContext[] } } | null } }> };
};

// GitHub sets a null alias when the repository is unknown, and a null
// pullRequest when the number is unknown. When one field fails, GitHub sets
// a null node inside the alias. Every case adds an `errors` entry whose
// `path` starts with the alias.
// An alias with an error entry holds partial data, so the mapper reports the
// error and never reads that alias.
export type PullRequestResponse = {
	data: Record<string, { pullRequest: RawPullRequest | null } | null>;
	errors?: Array<{ message: string; path?: Array<string | number> }>;
};

// The fields the poller stores. `contentHash` covers every other field, so
// a row is written only when something the web shows changed.
export type PullRequestContent = {
	owner: string;
	repo: string;
	number: number;
	additions: number;
	deletions: number;
	changedFiles: number;
	files: ChangedFile[];
	url: string;
	title: string;
	state: PrState;
	isDraft: boolean;
	isQueued: boolean;
	headSha: string;
	headRef: string;
	baseRef: string;
	reviewState: ReviewState;
	mergedAt: string | null;
	closedAt: string | null;
	checks: Check[];
	ciState: CiState;
};

export type PullRequestRow = PullRequestContent & { contentHash: string };

export type PullRequestResult = { ref: PullRequestRef; row: PullRequestRow } | { ref: PullRequestRef; error: string };

export type FetchPullRequestsResult = { ok: true; results: PullRequestResult[] } | GhFailure;

const selection = `{
	number additions deletions changedFiles title state isDraft mergeQueueEntry { position } url headRefOid headRefName baseRefName mergedAt closedAt reviewDecision
	files(first: ${MAX_CHANGED_FILES}) { nodes { path changeType additions deletions } }
	commits(last: 1) { nodes { commit { statusCheckRollup { contexts(first: 100) { nodes {
		__typename
		... on CheckRun { name status conclusion startedAt detailsUrl checkSuite { workflowRun { event workflow { name } } } }
		... on StatusContext { context state targetUrl createdAt }
	} } } } } }
}`;

const alias = (index: number) => `pr${index}`;

export const buildPullRequestQuery = (refs: PullRequestRef[]): string => {
	const fields = refs.map(
		(ref, index) =>
			`${alias(index)}: repository(owner: "${ref.owner}", name: "${ref.repo}") { pullRequest(number: ${ref.number}) ${selection} }`,
	);
	return `query {\n${fields.join("\n")}\n}`;
};

const reviewStates: Record<NonNullable<RawPullRequest["reviewDecision"]>, ReviewState> = {
	REVIEW_REQUIRED: "review_required",
	APPROVED: "approved",
	CHANGES_REQUESTED: "changes_requested",
};

// JSON with object keys sorted at every depth. Two rows with the same values
// give the same text whatever order their keys were built in.
const canonical = (value: unknown): string => {
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	if (value !== null && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1));
		return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
	}
	return JSON.stringify(value);
};

// sha256 over the canonical JSON of the row, as 64 lowercase hex characters.
export const contentHash = (content: Record<string, unknown>): string =>
	new Bun.CryptoHasher("sha256").update(canonical(content)).digest("hex");

export const withQueueState = (row: PullRequestRow, isQueued: boolean): PullRequestRow => {
	const { contentHash: _contentHash, ...content } = row;
	const next = { ...content, isQueued };
	return { ...next, contentHash: contentHash(next) };
};

const toRow = (ref: PullRequestRef, raw: RawPullRequest): PullRequestRow => {
	const rollup = raw.commits.nodes[0]?.commit.statusCheckRollup ?? null;
	const checks = normalizeChecks(rollup?.contexts.nodes ?? []);
	const content: PullRequestContent = {
		owner: ref.owner,
		repo: ref.repo,
		number: raw.number,
		additions: raw.additions,
		deletions: raw.deletions,
		changedFiles: raw.changedFiles,
		files: normalizeFiles(raw.files.nodes),
		url: raw.url,
		title: raw.title,
		state: raw.state.toLowerCase() as PrState,
		isDraft: raw.isDraft,
		isQueued: raw.mergeQueueEntry !== null,
		headSha: raw.headRefOid,
		headRef: raw.headRefName,
		baseRef: raw.baseRefName,
		reviewState: raw.reviewDecision === null ? "none" : reviewStates[raw.reviewDecision],
		mergedAt: raw.mergedAt,
		closedAt: raw.closedAt,
		checks,
		ciState: deriveCiState(checks),
	};
	return { ...content, contentHash: contentHash(content) };
};

export const mapPullRequestResponse = (refs: PullRequestRef[], response: PullRequestResponse): PullRequestResult[] =>
	refs.map((ref, index) => {
		const name = alias(index);
		const error = response.errors?.find((entry) => entry.path?.[0] === name);
		if (error !== undefined) return { ref, error: error.message };
		return { ref, row: toRow(ref, response.data[name]!.pullRequest!) };
	});

// gh exits 1 when the response carries `errors`, and still prints the body
// to stdout. A body whose `data` is an object maps per alias, so one unknown
// PR number does not fail the other 49. A body without a data object is a
// batch failure. A rate limit gives `data` null, a query error gives no
// `data` key, and a 401 or 403 gives a REST style `message` body. gh writes
// its message to stderr in each case, so the run failure carries it. A run
// that timed out or lost its connection holds a cut body, which is not JSON,
// so the run failure stands.
//
// The poller passes 10 refs on the poller slot. link and refresh pass one ref
// on the interactive slot, so a user action never waits behind a tick.
export const fetchPullRequests = async (
	runGh: GhRunner,
	refs: PullRequestRef[],
	slot: GhSlot = "poller",
): Promise<FetchPullRequestsResult> => {
	const result = await runGh(slot, ["api", "graphql", "-f", `query=${buildPullRequestQuery(refs)}`]);
	if (result.ok) return { ok: true, results: mapPullRequestResponse(refs, JSON.parse(result.stdout)) };
	if (result.reason !== "error") return result;
	const response = parseFailureBody(result.stdout);
	if (response === undefined) return result;
	return { ok: true, results: mapPullRequestResponse(refs, response) };
};

// The body a failed gh run printed, when it is a JSON object with a data
// object. Any other stdout, a cut body included, gives undefined.
const parseFailureBody = (stdout: string): PullRequestResponse | undefined => {
	let body: unknown;
	try {
		body = JSON.parse(stdout);
	} catch {
		return undefined;
	}
	const data = (body as Partial<PullRequestResponse> | null)?.data;
	if (typeof data !== "object" || data === null) return undefined;
	return body as PullRequestResponse;
};
