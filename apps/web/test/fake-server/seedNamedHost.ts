import type { Roots } from "./seed";
import { day, hour, minute, type Seeder } from "./seeder";

// The named tickets of CDE.host: CDE-45 and CDE-40, both in Agent Review.
export const seedNamedHost = (s: Seeder, { host }: Roots) => {
	const t45 = s.addTicket({
		project: host,
		number: 45,
		title: "Setup module skips a hand-run launchd agent",
		status: "agent-review",
		priority: "high",
		actor: "claude",
		updatedAgo: 14 * minute,
		createdAgo: 2 * day,
		statusAgo: 14 * minute,
	});
	s.addStatusActivity(t45, "claude", "In Progress", "Agent Review", 14 * minute);
	s.addPr(
		t45,
		119,
		"Leave a serving launchd agent alone",
		"cde-45-launchd-agent",
		[
			["lint", "pass"],
			["typecheck (desktop)", "pass"],
			["test (host-service)", "pass"],
			["build (macos-arm64)", "pass"],
		],
		"none",
		14 * minute,
		"claude",
	);

	const t40 = s.addTicket({
		project: host,
		number: 40,
		title: "Agent wrapper skips its own ~/.golemapp spelling",
		status: "agent-review",
		priority: "medium",
		actor: "codex",
		updatedAgo: 6 * hour,
		createdAgo: 3 * day,
		statusAgo: 6 * hour,
	});
	s.addStatusActivity(t40, "codex", "In Progress", "Agent Review", 6 * hour);
	s.addComment(t40, "codex", "The wrapper now resolves the symlink before it compares paths.", 6 * hour);
	s.addPr(
		t40,
		117,
		"Resolve the data home symlink in the wrapper",
		"cde-40-golemapp-symlink",
		[
			["lint", "pass"],
			["typecheck (desktop)", "pass"],
			["test (host-service)", "skipping"],
			["build (macos-arm64)", "pass"],
		],
		"none",
		6 * hour,
		"codex",
	);
};
