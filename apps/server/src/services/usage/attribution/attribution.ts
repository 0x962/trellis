import { basename } from "node:path";
import type { UsageGroupBy, UsageHarness } from "@trellis/api";
import type { CollectedEntry } from "../entries.ts";

// An agent run that Trellis started, with the names its usage rows print.
// `workDir` is the worktree of a ticket agent, which a transcript names as
// its cwd when the session id of the run is not in the transcript.
export type UsageRun = {
	id: string;
	kind: string;
	name: string;
	ticketIdentifier: string | null;
	ticketTitle: string | null;
	projectKey: string;
	projectName: string;
	accountName: string | null;
	sessionId: string | null;
	workDir: string;
};

// A project with the repository directory its agents work in. A session
// that Trellis did not start joins the project whose directory holds its
// cwd. An empty directory never matches.
export type UsageProject = { key: string; name: string; directory: string };

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

const isUnder = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

const projectHref = (key: string) => `/p/${key}`;

export type RowLabel = { label: string; detail: string | null; href: string | null; harness: UsageHarness | null };

type Attribution = { run: UsageRun | null; project: { key: string; name: string } | null; other: string | null };

// Joins one entry to Trellis. The session id wins. A cwd inside the
// worktree of a run comes next, then a cwd inside a project directory. A
// cwd that matches nothing keeps its last path segment as a label.
export function attribute(
	entry: CollectedEntry,
	runsBySession: ReadonlyMap<string, UsageRun>,
	runsByWorkDir: readonly UsageRun[],
	projectsByDirectory: readonly UsageProject[],
): Attribution {
	const bySession = runsBySession.get(entry.sessionId);
	if (bySession)
		return { run: bySession, project: { key: bySession.projectKey, name: bySession.projectName }, other: null };
	if (entry.cwd === null) return { run: null, project: null, other: null };
	const byWorkDir = runsByWorkDir.find((run) => isUnder(entry.cwd!, run.workDir));
	if (byWorkDir)
		return { run: byWorkDir, project: { key: byWorkDir.projectKey, name: byWorkDir.projectName }, other: null };
	const project = projectsByDirectory.find((candidate) => isUnder(entry.cwd!, candidate.directory));
	if (project) return { run: null, project: { key: project.key, name: project.name }, other: null };
	return { run: null, project: null, other: basename(entry.cwd) };
}

// The row key of every grouping for one entry, with the label the row
// prints the first time the key appears.
export function groupKeys(
	entry: CollectedEntry,
	attribution: Attribution,
	input: { sessionAccounts: ReadonlyMap<string, string> },
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
				key: `project:${project.key}`,
				label: plain(project.name, project.key, projectHref(project.key)),
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
