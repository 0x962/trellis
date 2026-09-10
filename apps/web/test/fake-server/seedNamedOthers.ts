import type { Roots } from "./seed";
import { day, hour, type Seeder } from "./seeder";

// The named tickets of TRL and MRG.
export const seedNamedOthers = (s: Seeder, { trl, mrg }: Roots) => {
	const trl4 = s.addTicket({
		project: trl,
		number: 4,
		title: "PR and CI polling",
		status: "in-progress",
		priority: "medium",
		actor: "navid",
		updatedAgo: 20 * hour,
		createdAgo: 6 * day,
		statusAgo: 20 * hour,
	});
	s.addStatusActivity(trl4, "navid", "Todo", "In Progress", 20 * hour);
	const trl9 = s.addTicket({
		project: trl,
		number: 9,
		title: "PR polling: one batched GraphQL query or per-PR REST calls",
		status: "human-review",
		priority: "low",
		parent: 4,
		actor: "claude",
		updatedAgo: 1 * day,
		createdAgo: 3 * day,
		statusAgo: 6 * hour,
	});
	s.addStatusActivity(trl9, "claude", "In Progress", "Human Review", 6 * hour);
	s.addTicket({
		project: trl,
		number: 12,
		title: "OAuth device flow for the CLI sign-in",
		status: "todo",
		priority: "urgent",
		actor: "navid",
		updatedAgo: 28 * hour,
	});
	s.addTicket({
		project: trl,
		number: 7,
		title: "Rotating server log at 10 MB times 5",
		status: "done",
		priority: "medium",
		actor: "claude",
		updatedAgo: 1 * hour,
		createdAgo: 2 * day,
	});
	s.addTicket({
		project: trl,
		number: 8,
		title: "Backup pauses the worker queue around CHECKPOINT",
		status: "done",
		priority: "medium",
		actor: "claude",
		updatedAgo: 6 * hour,
		createdAgo: 2 * day,
	});

	s.addTicket({
		project: mrg,
		number: 3,
		title: "Handle the oauth redirect on the review page",
		status: "todo",
		priority: "medium",
		actor: "navid",
		updatedAgo: 2 * day,
	});
};
