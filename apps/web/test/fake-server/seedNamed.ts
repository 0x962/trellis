import type { Roots } from "./seed";
import { day, hour, minute, type Seeder } from "./seeder";
import { seedNamedHost } from "./seedNamedHost";
import { seedNamedOthers } from "./seedNamedOthers";
import { seedNamedWeb } from "./seedNamedWeb";

// The named tickets the canvas shows, in one fixed order: CDE-43 first,
// because CDE-42 and CDE-41 name it as their parent, then CDE.web, CDE.host,
// the other root tickets of CDE, then TRL and MRG.
export const seedNamed = (s: Seeder, roots: Roots) => {
	const { cde } = roots;
	const t43 = s.addTicket({
		project: cde,
		number: 43,
		title: "Merge upstream 1.27 and keep every marked site",
		status: "in-progress",
		priority: "high",
		actor: "navid",
		updatedAgo: 41 * minute,
		createdAgo: 4 * day,
		statusAgo: 3 * day,
	});
	s.addPr(
		t43,
		116,
		"Merge upstream 1.27",
		"cde-43-upstream-1-27",
		[
			["lint", "pending"],
			["typecheck (desktop)", "pending"],
			["test (host-service)", "pending"],
			["build (macos-arm64)", "pending"],
		],
		"review_required",
		41 * minute,
		"navid",
	);

	seedNamedWeb(s, roots);
	seedNamedHost(s, roots);

	s.addTicket({
		project: cde,
		number: 47,
		title: "Shell+ tab rename by double click",
		status: "todo",
		priority: "low",
		actor: "navid",
		updatedAgo: 3 * day,
	});
	const t47 = s.byNumber.get("CDE-47")!;
	s.addAttachment(t47, "rename-flow.png", "image/png", 61_440, "navid", 3 * day);
	s.addAttachment(t47, "notes.md", "text/markdown", 2_048, "navid", 3 * day);
	s.addTicket({
		project: cde,
		number: 39,
		title: "Local Stack: stop the running checkout before a new one starts",
		status: "todo",
		priority: "medium",
		parent: 43,
		actor: "navid",
		updatedAgo: 4 * day,
	});
	s.addTicket({
		project: cde,
		number: 36,
		title: "Terminals page: reopen a dead shell in the same directory",
		status: "todo",
		priority: "low",
		actor: "navid",
		updatedAgo: 5 * day,
	});
	s.addTicket({
		project: cde,
		number: 35,
		title: "Databases page: keep the server's time zone on timestamptz",
		status: "todo",
		priority: "none",
		actor: "navid",
		updatedAgo: 6 * day,
	});
	s.addTicket({
		project: cde,
		number: 46,
		title: "Notices: the version feed guard for the fork build",
		status: "todo",
		priority: "medium",
		actor: "navid",
		updatedAgo: 30 * hour,
	});
	s.addTicket({
		project: cde,
		number: 33,
		title: "Keep the Linear theme row in app-state.test.ts",
		status: "done",
		priority: "low",
		parent: 43,
		actor: "codex",
		updatedAgo: 4 * hour,
		createdAgo: 3 * day,
	});
	s.addTicket({
		project: cde,
		number: 34,
		title: "Re-add the shared package exports after the merge",
		status: "done",
		priority: "medium",
		parent: 43,
		actor: "codex",
		updatedAgo: 5 * hour,
		createdAgo: 3 * day,
	});

	seedNamedOthers(s, roots);
};
