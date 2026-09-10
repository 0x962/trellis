import type { Priority } from "@trellis/api";
import type { Roots } from "./seed";
import { type ActorName, day, hour, type Seeder } from "./seeder";
import type { ProjectRow } from "./state";

const fillerTitles = [
	"Keep the terminal font size after a restart",
	"Sidebar: remember the last opened project",
	"Workspace list: sort by the last activity",
	"Notifications: one sound per event, never a burst",
	"Settings: a search box over every option",
	"Command palette: fuzzy match on the project name",
	"Diff view: fold a file over 1500 changed lines",
	"Live Branch: show the port of the running preview",
	"Host list: mark a host that missed its check-in",
	"Agent picker: keep the last chosen model",
	"Pane layout: restore the split sizes on boot",
	"Deep link: open a workspace from a PR link",
	"Release notes: link the changelog from the menu",
	"Keyboard map: one page that lists every key",
	"Clipboard: copy a run id from the run board",
	"Tab strip: scroll to the active tab",
	"Theme: a high-contrast variant of the dark palette",
	"Log viewer: tail the server log in a pane",
	"Onboarding: skip the sign-in on a local build",
	"Perf: memoize the row renderer under 10k rows",
	"Search: rank a title match above a body match",
	"Export: one NDJSON file per table",
	"Backup: keep the last five archives",
	"Import: read a Linear CSV into a project",
	"Mobile: a smaller tab bar on short screens",
	"Cache: drop a stale worktree entry on boot",
	"CLI: print the server URL after install",
	"Docs: one page per command",
	"Icons: align the status glyphs on the baseline",
	"Table: a fixed footer with the row count",
	"Board: a WIP badge per column",
	"Composer: keep the draft in sessionStorage",
	"Ticket page: a copy button on the branch name",
	"Peek: close on Escape when nothing is focused",
	"Timeline: collapse a run of moves by one actor",
	"Attachments: a lightbox with arrow keys",
	"Inbox: a dismiss action on the stalled section",
	"Hotkeys: a hint while a sequence is pending",
];

const priorities: Priority[] = ["medium", "low", "high", "none"];
const fillerActors: ActorName[] = ["navid", "claude", "codex"];

// The unnamed rows. No filler sits in a started or a review status, so the
// inbox holds only the named rows.
export const seedFillers = (s: Seeder, { cde, web, host, trl, mrg }: Roots) => {
	const filler = (project: ProjectRow, number: number, status: "todo" | "done" | "canceled", index: number) => {
		const daysAgo = (index % 20) + 2;
		s.addTicket({
			project,
			number,
			title: fillerTitles[index % fillerTitles.length]!,
			status,
			priority: priorities[index % priorities.length]!,
			actor: fillerActors[index % fillerActors.length]!,
			updatedAgo: daysAgo * day + (index % 7) * hour,
			createdAgo: (daysAgo + 3) * day,
		});
	};
	let index = 0;
	for (const number of [1, 2, 3, 4, 5, 6]) filler(cde, number, "todo", index++);
	for (const number of [7, 8, 9, 10, 11]) filler(web, number, "todo", index++);
	for (const number of [12, 13, 14, 15, 16]) filler(host, number, "todo", index++);
	const doneProjects = [cde, web, host];
	for (const number of [17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]) {
		filler(doneProjects[number % 3]!, number, "done", index++);
	}
	for (const number of [32, 52]) filler(cde, number, "canceled", index++);
	for (const number of [1, 2, 3, 5, 6, 10, 11, 13, 14, 15, 16]) filler(trl, number, "todo", index++);
	for (const number of [17, 18, 19]) filler(trl, number, "done", index++);
	for (const number of [1, 2]) filler(mrg, number, "todo", index++);
	for (const number of [4, 5]) filler(mrg, number, "done", index++);
};
