import { basename } from "node:path";
import type {
	UsageDay,
	UsageDays,
	UsageGroupBy,
	UsageGroupRow,
	UsageHarness,
	UsageReport,
	UsageSession,
	UsageTotals,
} from "@trellis/api";
import type { CollectedEntry } from "./entries.ts";
import { cacheSavingsUsd, costUsd, matchModelRate, PRICING_TABLE_UPDATED } from "./pricing.ts";

// An agent run that Trellis started, with the names its usage rows print.
// `workDir` is the worktree of a ticket agent, which a transcript names as
// its cwd when the session id of the run is not in the transcript.
export type UsageRun = {
	id: string;
	kind: string;
	name: string;
	ticketIdentifier: string | null;
	ticketTitle: string | null;
	projectPath: string;
	projectName: string;
	accountName: string | null;
	sessionId: string | null;
	workDir: string;
};

// A project with the repository directory its agents work in. A session
// that Trellis did not start joins the project whose directory holds its
// cwd. An empty directory never matches.
export type UsageProject = { path: string; name: string; directory: string };

export type UsageReportInputs = {
	entries: readonly CollectedEntry[];
	sessionLabels: ReadonlyMap<string, string>;
	scannedFiles: number;
	runs: readonly UsageRun[];
	projects: readonly UsageProject[];
	// The account that owns a session, by session id, from the state file of
	// each profile. Several profiles can share one transcript directory, so
	// the directory alone cannot name the account.
	sessionAccounts: ReadonlyMap<string, string>;
	days: UsageDays;
	cutoffMs: number;
	now: Date;
};

const GROUPINGS: readonly UsageGroupBy[] = ["ticket", "agent", "project", "kind", "account", "model", "harness"];
const MAX_GROUP_ROWS = 100;
const MAX_SESSIONS = 200;
const OUTSIDE = "outside";

const HARNESS_LABELS: Record<UsageHarness, string> = {
	claude: "Claude Code",
	codex: "Codex",
	pi: "Pi",
	opencode: "OpenCode",
	muse: "Muse",
};

const KIND_LABELS: Record<string, string> = {
	agent: "Ticket agents",
	flow: "Flow agents",
	session: "Sessions",
};

// The local calendar day, as the clock of the machine prints it.
export function dayKey(timestampMs: number): string {
	const date = new Date(timestampMs);
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${date.getFullYear()}-${month}-${day}`;
}

// Local midnight `days - 1` days ago, so the totals equal the sum of the
// daily buckets the chart shows.
export function rangeStart(days: number, now: Date): number {
	const start = new Date(now);
	start.setHours(0, 0, 0, 0);
	start.setDate(start.getDate() - (days - 1));
	return start.getTime();
}

const entryTokens = (entry: CollectedEntry) =>
	entry.uncachedInput + entry.cachedInput + entry.cacheWrite5m + entry.cacheWrite1h + entry.output;

const isUnder = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

const projectHref = (path: string) => `/p/${path.split(".").join("/")}`;

type RowLabel = { label: string; detail: string | null; href: string | null; harness: UsageHarness | null };

type Attribution = { run: UsageRun | null; project: { path: string; name: string } | null; other: string | null };

// Joins one entry to Trellis. The session id wins. A cwd inside the
// worktree of a run comes next, then a cwd inside a project directory. A
// cwd that matches nothing keeps its last path segment as a label.
function attribute(
	entry: CollectedEntry,
	runsBySession: ReadonlyMap<string, UsageRun>,
	runsByWorkDir: readonly UsageRun[],
	projectsByDirectory: readonly UsageProject[],
): Attribution {
	const bySession = runsBySession.get(entry.sessionId);
	if (bySession)
		return { run: bySession, project: { path: bySession.projectPath, name: bySession.projectName }, other: null };
	if (entry.cwd === null) return { run: null, project: null, other: null };
	const byWorkDir = runsByWorkDir.find((run) => isUnder(entry.cwd!, run.workDir));
	if (byWorkDir)
		return { run: byWorkDir, project: { path: byWorkDir.projectPath, name: byWorkDir.projectName }, other: null };
	const project = projectsByDirectory.find((candidate) => isUnder(entry.cwd!, candidate.directory));
	if (project) return { run: null, project: { path: project.path, name: project.name }, other: null };
	return { run: null, project: null, other: basename(entry.cwd) };
}

// The row key of every grouping for one entry, with the label the row
// prints the first time the key appears.
function groupKeys(
	entry: CollectedEntry,
	attribution: Attribution,
	input: Pick<UsageReportInputs, "sessionAccounts">,
): Record<UsageGroupBy, { key: string; label: RowLabel }> {
	const { run, project, other } = attribution;
	const outside: RowLabel = {
		label: "Outside Trellis",
		detail: "Sessions that Trellis did not start",
		href: null,
		harness: null,
	};
	const plain = (label: string, detail: string | null = null, href: string | null = null): RowLabel => ({
		label,
		detail,
		href,
		harness: null,
	});
	const ticket = run?.ticketIdentifier
		? {
				key: `ticket:${run.ticketIdentifier}`,
				label: plain(run.ticketIdentifier, run.ticketTitle, `/t/${run.ticketIdentifier}`),
			}
		: run
			? { key: `kind:${run.kind}`, label: plain(`${KIND_LABELS[run.kind] ?? run.kind} without a ticket`) }
			: { key: OUTSIDE, label: outside };
	const agent = run
		? { key: `agent:${run.id}`, label: plain(run.name, run.ticketIdentifier) }
		: { key: OUTSIDE, label: outside };
	const projectRow = project
		? {
				key: `project:${project.path}`,
				label: plain(project.name, project.path.split(".").join("/"), projectHref(project.path)),
			}
		: other !== null
			? { key: `other:${other}`, label: plain(other, "A directory outside every project", null) }
			: { key: OUTSIDE, label: outside };
	const kind = run
		? { key: `kind:${run.kind}`, label: plain(KIND_LABELS[run.kind] ?? run.kind) }
		: { key: OUTSIDE, label: outside };
	const accountName =
		run?.accountName ??
		input.sessionAccounts.get(entry.sessionId) ??
		(entry.accounts.length === 1 ? entry.accounts[0]! : null);
	const account = accountName
		? { key: `account:${accountName}`, label: plain(accountName, HARNESS_LABELS[entry.harness]) }
		: entry.accounts.length > 1
			? {
					key: `shared:${entry.harness}`,
					label: plain(
						"Shared profile",
						`${entry.accounts.length} ${HARNESS_LABELS[entry.harness]} accounts share these sessions`,
					),
				}
			: { key: `default:${entry.harness}`, label: plain("Default login", HARNESS_LABELS[entry.harness]) };
	const model = {
		key: `${entry.harness}|${entry.model}`,
		label: { label: entry.model, detail: HARNESS_LABELS[entry.harness], href: null, harness: entry.harness },
	};
	const harness = {
		key: entry.harness,
		label: { label: HARNESS_LABELS[entry.harness], detail: null, href: null, harness: entry.harness },
	};
	return { ticket, agent, project: projectRow, kind, account, model, harness };
}

type GroupAccumulator = {
	label: RowLabel;
	usd: number;
	tokens: number;
	approximate: boolean;
	sessions: Set<string>;
	runs: Set<string>;
	days: Map<string, { usd: number; tokens: number }>;
};

type SessionAccumulator = {
	sessionId: string;
	harness: UsageHarness;
	usd: number;
	tokens: number;
	turns: number;
	firstMs: number;
	lastMs: number;
	approximate: boolean;
	models: Map<string, number>;
	run: UsageRun | null;
	groupKeys: Record<UsageGroupBy, string>;
};

export function computeUsageReport(input: UsageReportInputs): UsageReport {
	const runsBySession = new Map<string, UsageRun>();
	for (const run of input.runs) if (run.sessionId) runsBySession.set(run.sessionId, run);
	const runsByWorkDir = [...input.runs].sort((a, b) => b.workDir.length - a.workDir.length);
	const projectsByDirectory = input.projects
		.filter((project) => project.directory !== "")
		.sort((a, b) => b.directory.length - a.directory.length);

	const bucketsByDay = new Map<string, UsageDay>();
	const groups = new Map<UsageGroupBy, Map<string, GroupAccumulator>>(
		GROUPINGS.map((grouping) => [grouping, new Map()]),
	);
	const sessions = new Map<string, SessionAccumulator>();
	const totals: UsageTotals = {
		usd: 0,
		tokens: 0,
		uncachedInput: 0,
		cachedInput: 0,
		cacheWrite: 0,
		output: 0,
		reasoningOutput: 0,
		cacheSavingsUsd: 0,
		trellisUsd: 0,
		sessions: 0,
		runs: 0,
		tickets: 0,
		approximate: false,
	};
	const runIds = new Set<string>();
	const ticketIds = new Set<string>();

	for (const entry of input.entries) {
		if (entry.timestampMs < input.cutoffMs) continue;
		const rate = matchModelRate(entry.harness, entry.model, entry.uncachedInput + entry.cachedInput);
		// A cost the harness recorded beats the list rate estimate, and an
		// entry priced by its own harness is never approximate.
		const estimated = entry.costUsd === undefined;
		const approximate = estimated && rate.approximate;
		const usd = entry.costUsd ?? costUsd(rate, entry);
		const tokens = entryTokens(entry);
		const day = dayKey(entry.timestampMs);
		const attribution = attribute(entry, runsBySession, runsByWorkDir, projectsByDirectory);
		const keys = groupKeys(entry, attribution, input);

		let bucket = bucketsByDay.get(day);
		if (!bucket) {
			bucket = { day, usd: 0, tokens: 0, harnesses: {} };
			bucketsByDay.set(day, bucket);
		}
		let slot = bucket.harnesses[entry.harness];
		if (!slot) {
			slot = { usd: 0, tokens: 0 };
			bucket.harnesses[entry.harness] = slot;
		}
		slot.usd += usd;
		slot.tokens += tokens;
		bucket.usd += usd;
		bucket.tokens += tokens;

		for (const grouping of GROUPINGS) {
			const { key, label } = keys[grouping];
			const table = groups.get(grouping)!;
			let row = table.get(key);
			if (!row) {
				row = { label, usd: 0, tokens: 0, approximate: false, sessions: new Set(), runs: new Set(), days: new Map() };
				table.set(key, row);
			}
			row.usd += usd;
			row.tokens += tokens;
			row.approximate ||= approximate;
			row.sessions.add(entry.sessionId);
			if (attribution.run) row.runs.add(attribution.run.id);
			const daySlice = row.days.get(day) ?? { usd: 0, tokens: 0 };
			daySlice.usd += usd;
			daySlice.tokens += tokens;
			row.days.set(day, daySlice);
		}

		let session = sessions.get(entry.sessionId);
		if (!session) {
			session = {
				sessionId: entry.sessionId,
				harness: entry.harness,
				usd: 0,
				tokens: 0,
				turns: 0,
				firstMs: entry.timestampMs,
				lastMs: entry.timestampMs,
				approximate: false,
				models: new Map(),
				run: attribution.run,
				groupKeys: {
					ticket: keys.ticket.key,
					agent: keys.agent.key,
					project: keys.project.key,
					kind: keys.kind.key,
					account: keys.account.key,
					model: keys.model.key,
					harness: keys.harness.key,
				},
			};
			sessions.set(entry.sessionId, session);
		}
		session.usd += usd;
		session.tokens += tokens;
		session.turns += 1;
		session.firstMs = Math.min(session.firstMs, entry.timestampMs);
		session.lastMs = Math.max(session.lastMs, entry.timestampMs);
		session.approximate ||= approximate;
		session.models.set(entry.model, (session.models.get(entry.model) ?? 0) + usd);

		totals.usd += usd;
		totals.tokens += tokens;
		totals.uncachedInput += entry.uncachedInput;
		totals.cachedInput += entry.cachedInput;
		totals.cacheWrite += entry.cacheWrite5m + entry.cacheWrite1h;
		totals.output += entry.output;
		totals.reasoningOutput += entry.reasoningOutput;
		if (attribution.run) {
			totals.trellisUsd += usd;
			runIds.add(attribution.run.id);
			if (attribution.run.ticketIdentifier) ticketIds.add(attribution.run.ticketIdentifier);
		}
		// The savings come from the rate. A harness that priced its own turn
		// may have used a rate the table does not hold, so the savings are
		// estimated only where the cost is.
		if (estimated) {
			totals.cacheSavingsUsd += cacheSavingsUsd(rate, entry);
			totals.approximate ||= rate.approximate;
		}
	}
	totals.sessions = sessions.size;
	totals.runs = runIds.size;
	totals.tickets = ticketIds.size;

	// A contiguous day series, so the chart draws a quiet day as zero.
	const buckets: UsageDay[] = [];
	for (let i = 0; i < input.days; i++) {
		const date = new Date(input.cutoffMs);
		date.setDate(date.getDate() + i);
		const key = dayKey(date.getTime());
		buckets.push(bucketsByDay.get(key) ?? { day: key, usd: 0, tokens: 0, harnesses: {} });
	}

	const allGroupRows = {} as Record<UsageGroupBy, UsageGroupRow[]>;
	for (const grouping of GROUPINGS) {
		allGroupRows[grouping] = [...groups.get(grouping)!.entries()].map(([key, row]) => ({
			key,
			...row.label,
			usd: row.usd,
			tokens: row.tokens,
			sessions: row.sessions.size,
			runs: row.runs.size,
			approximate: row.approximate,
			days: [...row.days.entries()]
				.map(([day, slice]) => ({ day, usd: slice.usd, tokens: slice.tokens }))
				.sort((a, b) => a.day.localeCompare(b.day)),
		}));
	}

	const allSessionRows: UsageSession[] = [...sessions.values()].map((session) => ({
		sessionId: session.sessionId,
		harness: session.harness,
		model: [...session.models.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown",
		label: input.sessionLabels.get(session.sessionId) ?? null,
		usd: session.usd,
		tokens: session.tokens,
		turns: session.turns,
		firstAt: new Date(session.firstMs).toISOString(),
		lastAt: new Date(session.lastMs).toISOString(),
		approximate: session.approximate,
		run: session.run
			? {
					id: session.run.id,
					kind: session.run.kind,
					name: session.run.name,
					ticketIdentifier: session.run.ticketIdentifier,
					ticketTitle: session.run.ticketTitle,
					projectPath: session.run.projectPath,
					account: session.run.accountName,
				}
			: null,
		groupKeys: session.groupKeys,
	}));
	const ranking = (metric: "usd" | "tokens") => {
		const other = metric === "usd" ? "tokens" : "usd";
		const compare = (a: { usd: number; tokens: number }, b: { usd: number; tokens: number }) =>
			b[metric] - a[metric] || b[other] - a[other];
		const rankedGroups = {} as Record<UsageGroupBy, UsageGroupRow[]>;
		for (const grouping of GROUPINGS)
			rankedGroups[grouping] = [...allGroupRows[grouping]].sort(compare).slice(0, MAX_GROUP_ROWS);
		return {
			groups: rankedGroups,
			sessions: [...allSessionRows].sort(compare).slice(0, MAX_SESSIONS),
		};
	};

	return {
		days: input.days,
		buckets,
		totals,
		rankings: { usd: ranking("usd"), tokens: ranking("tokens") },
		scannedFiles: input.scannedFiles,
		pricingTableUpdated: PRICING_TABLE_UPDATED,
		computedAt: input.now.toISOString(),
	};
}
