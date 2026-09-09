import type { Check, CiState, PrState, ReviewState } from "@trellis/api";
import { deriveCiState, normalizeChecks, type RawContext } from "./parse.ts";
import type { GhFailure, GhRunner } from "./run.ts";

// One `gh api graphql` request fetches up to 50 pull requests. Each ref gets
// the alias prN, so the response maps back to refs[N] by index. The response
// carries no owner or repo, so the row takes both from the ref.

export type PullRequestRef = { owner: string; repo: string; number: number };

export type RawPullRequest = {
	number: number;
	title: string;
	state: "OPEN" | "CLOSED" | "MERGED";
	isDraft: boolean;
	url: string;
	headRefName: string;
	baseRefName: string;
	mergedAt: string | null;
	closedAt: string | null;
	reviewDecision: "REVIEW_REQUIRED" | "APPROVED" | "CHANGES_REQUESTED" | null;
	commits: { nodes: Array<{ commit: { statusCheckRollup: { contexts: { nodes: RawContext[] } } | null } }> };
};

// GitHub sets a null alias when the repository is unknown, and a null
// pullRequest when the number is unknown. `errors` names the alias in `path`.
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
	url: string;
	title: string;
	state: PrState;
	isDraft: boolean;
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
	number title state isDraft url headRefName baseRefName mergedAt closedAt reviewDecision
	commits(last: 1) { nodes { commit { statusCheckRollup { contexts(first: 100) { nodes {
		__typename
		... on CheckRun { name status conclusion detailsUrl checkSuite { workflowRun { workflow { name } } } }
		... on StatusContext { context state targetUrl }
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

const toRow = (ref: PullRequestRef, raw: RawPullRequest): PullRequestRow => {
	const rollup = raw.commits.nodes[0]?.commit.statusCheckRollup ?? null;
	const checks = normalizeChecks(rollup?.contexts.nodes ?? []);
	const content: PullRequestContent = {
		owner: ref.owner,
		repo: ref.repo,
		number: raw.number,
		url: raw.url,
		title: raw.title,
		state: raw.state.toLowerCase() as PrState,
		isDraft: raw.isDraft,
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
		const raw = response.data[name]?.pullRequest ?? null;
		if (raw !== null) return { ref, row: toRow(ref, raw) };
		const error = response.errors!.find((entry) => entry.path?.[0] === name)!;
		return { ref, error: error.message };
	});

// gh exits 1 when the response carries `errors`, and still prints the body
// to stdout. A body with `data` maps like a success, so one unknown PR
// number does not fail the other 49.
export const fetchPullRequests = async (runGh: GhRunner, refs: PullRequestRef[]): Promise<FetchPullRequestsResult> => {
	const result = await runGh("poller", ["api", "graphql", "-f", `query=${buildPullRequestQuery(refs)}`]);
	const body = result.ok ? result.stdout : result.reason === "error" ? result.stdout : "";
	if (!result.ok && !body.startsWith("{")) return result;
	return { ok: true, results: mapPullRequestResponse(refs, JSON.parse(body) as PullRequestResponse) };
};
