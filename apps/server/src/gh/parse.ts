import type { Check, CheckBucket, CiState } from "@trellis/api";

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
	detailsUrl?: string | null;
	checkSuite: { workflowRun: { workflow: { name: string } } | null };
};

export type RawStatusContext = {
	__typename: "StatusContext";
	context: string;
	state: string;
	targetUrl?: string | null;
};

export type RawContext = RawCheckRun | RawStatusContext;

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

const toCheck = (node: RawContext): Check => {
	if (node.__typename === "CheckRun") {
		return {
			name: node.name,
			workflow: node.checkSuite.workflowRun?.workflow.name ?? null,
			bucket: bucketForCheckRun(node),
			link: node.detailsUrl ?? null,
		};
	}
	return { name: node.context, workflow: null, bucket: bucketForStatusContext(node), link: node.targetUrl ?? null };
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

export const normalizeChecks = (nodes: RawContext[]): Check[] => nodes.map(toCheck).sort(compareChecks);

// Any fail or cancel gives fail; else any pending gives pending; else any
// pass gives pass; else none. A skipping check counts as nothing.
export const deriveCiState = (checks: Check[]): CiState => {
	const buckets = new Set(checks.map((check) => check.bucket));
	if (buckets.has("fail") || buckets.has("cancel")) return "fail";
	if (buckets.has("pending")) return "pending";
	if (buckets.has("pass")) return "pass";
	return "none";
};

export type TicketIdentifier = { key: string; number: number };

// A project key is 2 to 10 characters, starts with a letter, and matches in
// any case. Branch names are lowercase (`cde-42-slug`), titles are not.
export const TICKET_IDENTIFIER_PATTERN = /\b([a-z][a-z0-9]{1,9})-(\d+)\b/gi;

// tickets.number is a Postgres int, so no ticket has a number above this.
// An equality lookup on that column with a larger value errors in Postgres.
export const MAX_TICKET_NUMBER = 2147483647;

// Returns every distinct identifier in text order. The key comes out
// uppercased, so `cde-42` and `CDE-42` are one entry. Ticket numbers run
// from 1 to MAX_TICKET_NUMBER, so a match outside that range is dropped.
// A timestamp stamp such as run-1757400000000 never reaches the lookup.
// matchAll copies lastIndex from a global regex, so the search starts from
// 0 whatever an outside exec left.
export const findTicketIdentifiers = (text: string): TicketIdentifier[] => {
	TICKET_IDENTIFIER_PATTERN.lastIndex = 0;
	const seen = new Set<string>();
	const found: TicketIdentifier[] = [];
	for (const match of text.matchAll(TICKET_IDENTIFIER_PATTERN)) {
		const key = match[1]!.toUpperCase();
		const number = Number(match[2]);
		const id = `${key}-${number}`;
		if (number === 0 || number > MAX_TICKET_NUMBER || seen.has(id)) continue;
		seen.add(id);
		found.push({ key, number });
	}
	return found;
};
