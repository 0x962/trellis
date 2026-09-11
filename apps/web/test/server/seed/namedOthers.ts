import { day, hour, type TicketSpec } from "./support.ts";

// The named tickets of TRL and MRG.
export const otherNamedSpecs = (): TicketSpec[] => [
	{
		project: "TRL",
		number: 4,
		title: "PR and CI polling",
		actor: "navid",
		ago: 6 * day,
		priority: "medium",
		events: [{ ago: 20 * hour, actor: "navid", move: "in-progress" }],
	},
	{
		project: "TRL",
		number: 7,
		title: "Rotating server log at 10 MB times 5",
		actor: "claude",
		ago: 2 * day,
		priority: "medium",
	},
	{
		project: "TRL",
		number: 8,
		title: "Backup pauses the worker queue around CHECKPOINT",
		actor: "claude",
		ago: 2 * day,
		priority: "medium",
	},
	{
		project: "TRL",
		number: 9,
		title: "PR polling: one batched GraphQL query or per-PR REST calls",
		actor: "claude",
		ago: 3 * day,
		priority: "low",
		parent: 4,
		status: "in-progress",
		events: [{ ago: 6 * hour, actor: "claude", move: "human-review" }],
	},
	{
		project: "TRL",
		number: 12,
		title: "OAuth device flow for the CLI sign-in",
		actor: "navid",
		ago: 28 * hour,
		priority: "urgent",
	},
	{
		project: "MRG",
		number: 3,
		title: "Handle the oauth redirect on the review page",
		actor: "navid",
		ago: 2 * day,
		priority: "medium",
	},
];
