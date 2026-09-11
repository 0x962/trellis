import { day, hour, minute, type PrSpec, type TicketSpec } from "./support.ts";

// The named tickets of the CDE tree. Every story is a create and the changes
// that followed it, each at its own instant, so the activity, the versions,
// and the timestamps are the ones the services write.

const pr116: PrSpec = {
	number: 116,
	title: "Merge upstream 1.27",
	headRef: "cde-43-upstream-1-27",
	checks: [
		["lint", "pending"],
		["typecheck (desktop)", "pending"],
		["test (host-service)", "pending"],
		["build (macos-arm64)", "pending"],
	],
	review: "REVIEW_REQUIRED",
};

const pr118: PrSpec = {
	number: 118,
	title: "Restore the fork pages",
	headRef: "cde-42-restore-fork-pages",
	checks: [
		["lint", "pass"],
		["typecheck (desktop)", "pass"],
		["test (host-service)", "pass"],
		["build (macos-arm64)", "pass"],
	],
	review: "APPROVED",
};

const pr121: PrSpec = {
	number: 121,
	title: "Keep the scrollback across a handoff",
	headRef: "cde-44-scrollback-handoff",
	checks: [
		["lint", "pass"],
		["typecheck (desktop)", "fail"],
		["test (host-service)", "pass"],
		["build (macos-arm64)", "pending"],
	],
	review: "REVIEW_REQUIRED",
};

const pr115: PrSpec = {
	number: 115,
	title: "Persist the Shell+ tab list",
	headRef: "cde-37-shell-plus-tabs",
	checks: [
		["lint", "pass"],
		["typecheck (desktop)", "pass"],
		["test (host-service)", "pass"],
		["build (macos-arm64)", "pass"],
	],
	review: null,
};

const pr119: PrSpec = {
	number: 119,
	title: "Leave a serving launchd agent alone",
	headRef: "cde-45-launchd-agent",
	checks: [
		["lint", "pass"],
		["typecheck (desktop)", "pass"],
		["test (host-service)", "pass"],
		["build (macos-arm64)", "pass"],
	],
	review: null,
};

const pr117: PrSpec = {
	number: 117,
	title: "Resolve the data home symlink in the wrapper",
	headRef: "cde-40-golemapp-symlink",
	checks: [
		["lint", "pass"],
		["typecheck (desktop)", "pass"],
		["test (host-service)", "skipping"],
		["build (macos-arm64)", "pass"],
	],
	review: null,
};

const description42 =
	'The upstream 1.27 merge dropped the five fork pages. Restore Actions, Shell+, Local Stack, Databases, and Terminals under `cde/` and keep every marked site.\n\n## Acceptance\n\n- [x] The five routes render\n- [x] `grep -rn "CDE FORK"` lists every marked site\n- [ ] The desktop typecheck is green';

export const cdeNamedSpecs = (): TicketSpec[] => [
	{
		project: "CDE",
		number: 33,
		title: "Keep the Linear theme row in app-state.test.ts",
		actor: "codex",
		ago: 3 * day,
		priority: "low",
		events: [{ ago: 22 * minute, actor: "codex", update: { parent: "CDE-43" } }],
	},
	{
		project: "CDE",
		number: 34,
		title: "Re-add the shared package exports after the merge",
		actor: "codex",
		ago: 3 * day,
		priority: "medium",
		events: [{ ago: 26 * minute, actor: "codex", update: { parent: "CDE-43" } }],
	},
	{
		project: "CDE",
		number: 35,
		title: "Databases page: keep the server's time zone on timestamptz",
		actor: "navid",
		ago: 6 * day,
	},
	{
		project: "CDE",
		number: 36,
		title: "Terminals page: reopen a dead shell in the same directory",
		actor: "navid",
		ago: 5 * day,
		priority: "low",
	},
	{
		project: "CDE.web",
		number: 37,
		title: "Shell+ tabs survive an app restart",
		actor: "codex",
		ago: 4 * day,
		priority: "medium",
		events: [
			{ ago: 2 * day, actor: "codex", move: "in-progress" },
			{ ago: 12 * hour, actor: "codex", move: "human-review" },
			{
				ago: 11 * hour,
				actor: "codex",
				comment: "The tab list persists under shell-plus-tabs and every session is reattached on boot.",
			},
			{ ago: 5 * hour, actor: "codex", comment: "Rebased on main; checks are green." },
			{ ago: 5 * hour, actor: "codex", pr: pr115 },
		],
	},
	{
		project: "CDE.web",
		number: 38,
		title: "Databases page: cancel button for long statements",
		actor: "claude",
		ago: 5 * day,
		priority: "medium",
		events: [{ ago: 2 * day, actor: "claude", move: "in-progress" }],
	},
	{
		project: "CDE",
		number: 39,
		title: "Local Stack: stop the running checkout before a new one starts",
		actor: "navid",
		ago: 4 * day,
		priority: "medium",
		parent: 43,
	},
	{
		project: "CDE.host",
		number: 40,
		title: "Agent wrapper skips its own ~/.golemapp spelling",
		actor: "codex",
		ago: 3 * day,
		priority: "medium",
		status: "in-progress",
		events: [
			{ ago: 6 * hour, actor: "codex", move: "agent-review" },
			{ ago: 6 * hour, actor: "codex", comment: "The wrapper now resolves the symlink before it compares paths." },
			{ ago: 6 * hour, actor: "codex", pr: pr117 },
		],
	},
	{
		project: "CDE.web",
		number: 41,
		title: "Local Stack tab reads the live checkout from tmux",
		actor: "claude",
		ago: 3 * day,
		priority: "medium",
		parent: 43,
		events: [
			{ ago: 8 * hour, actor: "claude", move: "in-progress" },
			{
				ago: 3 * hour,
				actor: "claude",
				attachment: { filename: "tmux-status-bar.png", mime: "image/png", size: 92_160 },
			},
		],
	},
	{
		project: "CDE.web",
		number: 42,
		title: "Restore the fork pages after the upstream 1.27 merge",
		actor: "navid",
		ago: 3 * day,
		description: description42,
		events: [
			{ ago: 3 * day - 10 * minute, actor: "navid", update: { priority: "high", parent: "CDE-43" } },
			{ ago: 2 * day, actor: "claude", move: "in-progress" },
			{
				ago: 2 * day - hour,
				actor: "navid",
				comment: "Plan: restore the five fork pages under cde/ and keep every marked site.",
			},
			{
				ago: 36 * hour,
				actor: "claude",
				comment: "Merged upstream 1.27. Every keep-marker survived; the lint fixes are in the last commit.",
			},
			{
				ago: 30 * hour,
				actor: "claude",
				attachment: { filename: "fork-pages-after-merge.png", mime: "image/png", size: 184_320 },
			},
			{ ago: 1 * day, actor: "claude", move: "human-review" },
			{ ago: 20 * hour, actor: "navid", comment: "Send it to review when the desktop typecheck is green." },
			{ ago: 2 * hour, actor: "claude", pr: pr118 },
			{ ago: 2 * hour, actor: "claude", comment: "Typecheck and tests are green on the PR. Ready for a look." },
		],
	},
	{
		project: "CDE",
		number: 43,
		title: "Merge upstream 1.27 and keep every marked site",
		actor: "navid",
		ago: 4 * day,
		priority: "high",
		events: [
			{ ago: 3 * day, actor: "navid", move: "in-progress" },
			{ ago: 41 * minute, actor: "navid", pr: pr116 },
		],
	},
	{
		project: "CDE.web",
		number: 44,
		title: "Terminal pane loses scrollback on session handoff",
		actor: "claude",
		ago: 2 * day,
		priority: "urgent",
		events: [
			{ ago: 6 * hour, actor: "claude", move: "in-progress" },
			{
				ago: 5 * hour,
				actor: "navid",
				comment: "Repro: hand a session to another agent and scroll up. The buffer is gone.",
			},
			{
				ago: 9 * minute,
				actor: "claude",
				comment: "The pane re-creates the terminal on handoff. Keeping the buffer across the swap.",
			},
			{ ago: 9 * minute, actor: "claude", pr: pr121 },
		],
	},
	{
		project: "CDE.host",
		number: 45,
		title: "Setup module skips a hand-run launchd agent",
		actor: "claude",
		ago: 2 * day,
		priority: "high",
		status: "in-progress",
		events: [
			{ ago: 14 * minute, actor: "claude", move: "agent-review" },
			{ ago: 14 * minute, actor: "claude", pr: pr119 },
		],
	},
	{
		project: "CDE",
		number: 46,
		title: "Notices: the version feed guard for the fork build",
		actor: "navid",
		ago: 30 * hour,
		priority: "medium",
	},
	{
		project: "CDE",
		number: 47,
		title: "Shell+ tab rename by double click",
		actor: "navid",
		ago: 3 * day,
		priority: "low",
		events: [
			{ ago: 3 * day, actor: "navid", attachment: { filename: "rename-flow.png", mime: "image/png", size: 61_440 } },
			{ ago: 3 * day, actor: "navid", attachment: { filename: "notes.md", mime: "text/markdown", size: 2_048 } },
		],
	},
	{
		project: "CDE.web",
		number: 48,
		title: "Actions page: keep the starred runs after a reload",
		actor: "claude",
		ago: 2 * day,
		priority: "medium",
		parent: 42,
	},
	{
		project: "CDE.web",
		number: 49,
		title: "Shell+ page: focus the new tab's terminal",
		actor: "claude",
		ago: 2 * day,
		priority: "low",
		parent: 42,
	},
	{
		project: "CDE.web",
		number: 50,
		title: "Terminals page: rename a tab on double click",
		actor: "navid",
		ago: 2 * day,
		priority: "low",
		parent: 42,
	},
	{
		project: "CDE.web",
		number: 51,
		title: "Refresh the OAuth token before the gh poller runs",
		actor: "navid",
		ago: 26 * hour,
		priority: "high",
	},
];
