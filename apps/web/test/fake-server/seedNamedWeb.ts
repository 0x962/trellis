import type { Roots } from "./seed";
import { day, hour, minute, type Seeder } from "./seeder";
import { newId } from "./state";

// The named tickets of CDE.web: CDE-42 and its comments, CDE-44, CDE-41,
// CDE-38, and CDE-37. CDE-43, their parent, exists before this runs.
export const seedNamedWeb = (s: Seeder, { web }: Roots) => {
	const t42 = s.addTicket({
		project: web,
		number: 42,
		title: "Restore the fork pages after the upstream 1.27 merge",
		status: "human-review",
		priority: "high",
		parent: 43,
		actor: "claude",
		updatedAgo: 2 * hour,
		createdAgo: 3 * day,
		statusAgo: 1 * day,
		description:
			'The upstream 1.27 merge dropped the five fork pages. Restore Actions, Shell+, Local Stack, Databases, and Terminals under `cde/` and keep every marked site.\n\n## Acceptance\n\n- [x] The five routes render\n- [x] `grep -rn "CDE FORK"` lists every marked site\n- [ ] The desktop typecheck is green',
	});
	const batch = newId();
	s.addFieldActivity(t42, "navid", "priority", "none", "high", 3 * day - 10 * minute, batch);
	s.addFieldActivity(t42, "navid", "parent", null, "CDE-43", 3 * day - 10 * minute, batch);
	s.addStatusActivity(t42, "claude", "Todo", "In Progress", 2 * day);
	s.addComment(
		t42,
		"navid",
		"Plan: restore the five fork pages under cde/ and keep every marked site.",
		2 * day - hour,
	);
	s.addComment(
		t42,
		"claude",
		"Merged upstream 1.27. Every keep-marker survived; the lint fixes are in the last commit.",
		36 * hour,
	);
	s.addFieldActivity(t42, "claude", "pr", null, "canary-technologies-corp/de#118", 30 * hour);
	s.addStatusActivity(t42, "claude", "In Progress", "Human Review", 1 * day);
	s.addComment(t42, "navid", "Send it to review when the desktop typecheck is green.", 20 * hour);
	s.addComment(t42, "claude", "Typecheck and tests are green on the PR. Ready for a look.", 2 * hour);
	s.addPr(
		t42,
		118,
		"Restore the fork pages",
		"cde-42-restore-fork-pages",
		[
			["lint", "pass"],
			["typecheck (desktop)", "pass"],
			["test (host-service)", "pass"],
			["build (macos-arm64)", "pass"],
		],
		"approved",
		2 * hour,
		"claude",
	);
	s.addAttachment(t42, "fork-pages-after-merge.png", "image/png", 184_320, "claude", 30 * hour);

	const t44 = s.addTicket({
		project: web,
		number: 44,
		title: "Terminal pane loses scrollback on session handoff",
		status: "in-progress",
		priority: "urgent",
		actor: "claude",
		updatedAgo: 9 * minute,
		createdAgo: 2 * day,
		statusAgo: 6 * hour,
	});
	s.addStatusActivity(t44, "claude", "Todo", "In Progress", 6 * hour);
	s.addComment(t44, "navid", "Repro: hand a session to another agent and scroll up. The buffer is gone.", 5 * hour);
	s.addComment(
		t44,
		"claude",
		"The pane re-creates the terminal on handoff. Keeping the buffer across the swap.",
		9 * minute,
	);
	s.addPr(
		t44,
		121,
		"Keep the scrollback across a handoff",
		"cde-44-scrollback-handoff",
		[
			["lint", "pass"],
			["typecheck (desktop)", "fail"],
			["test (host-service)", "pass"],
			["build (macos-arm64)", "pending"],
		],
		"review_required",
		9 * minute,
		"claude",
	);

	const t41 = s.addTicket({
		project: web,
		number: 41,
		title: "Local Stack tab reads the live checkout from tmux",
		status: "in-progress",
		priority: "medium",
		parent: 43,
		actor: "claude",
		updatedAgo: 3 * hour,
		createdAgo: 3 * day,
		statusAgo: 8 * hour,
	});
	s.addStatusActivity(t41, "claude", "Todo", "In Progress", 8 * hour);
	s.addAttachment(t41, "tmux-status-bar.png", "image/png", 92_160, "claude", 3 * hour);

	const t38 = s.addTicket({
		project: web,
		number: 38,
		title: "Databases page: cancel button for long statements",
		status: "in-progress",
		priority: "medium",
		actor: "claude",
		updatedAgo: 2 * day,
		createdAgo: 5 * day,
		statusAgo: 2 * day,
	});
	s.addStatusActivity(t38, "claude", "Todo", "In Progress", 2 * day);

	const t37 = s.addTicket({
		project: web,
		number: 37,
		title: "Shell+ tabs survive an app restart",
		status: "human-review",
		priority: "medium",
		actor: "codex",
		updatedAgo: 5 * hour,
		createdAgo: 4 * day,
		statusAgo: 12 * hour,
	});
	s.addStatusActivity(t37, "codex", "Todo", "In Progress", 2 * day);
	s.addStatusActivity(t37, "codex", "In Progress", "Human Review", 12 * hour);
	s.addComment(
		t37,
		"codex",
		"The tab list persists under shell-plus-tabs and every session is reattached on boot.",
		11 * hour,
	);
	s.addComment(t37, "codex", "Rebased on main; checks are green.", 5 * hour);
	s.addPr(
		t37,
		115,
		"Persist the Shell+ tab list",
		"cde-37-shell-plus-tabs",
		[
			["lint", "pass"],
			["typecheck (desktop)", "pass"],
			["test (host-service)", "pass"],
			["build (macos-arm64)", "pass"],
		],
		"none",
		5 * hour,
		"codex",
	);

	s.addTicket({
		project: web,
		number: 48,
		title: "Actions page: keep the starred runs after a reload",
		status: "done",
		priority: "medium",
		parent: 42,
		actor: "claude",
		updatedAgo: 3 * hour,
		createdAgo: 2 * day,
	});
	s.addTicket({
		project: web,
		number: 49,
		title: "Shell+ page: focus the new tab's terminal",
		status: "done",
		priority: "low",
		parent: 42,
		actor: "claude",
		updatedAgo: 2 * hour,
		createdAgo: 2 * day,
	});
	s.addTicket({
		project: web,
		number: 50,
		title: "Terminals page: rename a tab on double click",
		status: "todo",
		priority: "low",
		parent: 42,
		actor: "navid",
		updatedAgo: 2 * day,
	});
	s.addTicket({
		project: web,
		number: 51,
		title: "Refresh the OAuth token before the gh poller runs",
		status: "todo",
		priority: "high",
		actor: "navid",
		updatedAgo: 26 * hour,
	});
};
