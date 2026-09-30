import type { Project, Status, Ticket, TicketSummary } from "@trellis/api";

export const timestamp = "2026-09-30T12:00:00.000Z";
export const id = (value: number) => `01M3ST0RYB00K${String(value).padStart(13, "0")}`;
export const actor = { name: "Storybook", kind: "human" as const, displayName: "Storybook" };

export const statuses: Status[] = [
	{ name: "Todo", slug: "todo", category: "todo", color: "fg-muted" },
	{ name: "In progress", slug: "in-progress", category: "started", color: "warning" },
	{ name: "Human review", slug: "human-review", category: "review", color: "accent" },
	{ name: "Done", slug: "done", category: "done", color: "success" },
	{ name: "Canceled", slug: "canceled", category: "canceled", color: "fg-faint" },
].map((status, index) => ({
	...status,
	id: id(index + 10),
	projectId: id(1),
	description: "The team uses this status for the current stage.",
	position: index,
	isDefault: index === 0,
	createdAt: timestamp,
	updatedAt: timestamp,
})) as Status[];

export const project: Project = {
	id: id(1),
	key: "DEMO",
	slug: "demo",
	name: "Trellis workspace",
	position: 0,
	openCount: 4,
	openEpicCount: 1,
	openPageCommentCount: 1,
	color: "teal",
	archivedAt: null,
	directory: "/workspace/trellis",
	description: "A synthetic workspace for the Storybook catalog.",
	ticketTemplate: "## Result\n\nDescribe the result.\n\n## Checks\n\nState the required checks.",
	ticketCounter: 42,
	createdAt: timestamp,
	updatedAt: timestamp,
	repos: [{ id: id(2), projectId: id(1), owner: "example", repo: "trellis" }],
	statuses,
};

export const tickets: TicketSummary[] = [
	"Keep the ticket title readable on a narrow screen",
	"Show every active agent in the project board",
	"Keep the review actions beside the pull request summary",
	"Preserve a long project and epic name when the ticket identifier needs space in the board card",
	"Keep a completed ticket in its wave",
].map((title, index) => ({
	id: id(100 + index),
	identifier: `DEMO-${40 + index}`,
	number: 40 + index,
	title,
	priority: index === 0 ? "urgent" : index === 1 ? "high" : index === 2 ? "medium" : "none",
	status: statuses[index === 3 ? 0 : index === 4 ? 3 : index]!,
	project: { id: project.id, key: project.key },
	parent: null,
	ancestors: [],
	epic: { id: id(200), ref: "DEMO/interface-review", name: "Interface review" },
	wave: { id: id(210), ref: "DEMO/interface-review/wave-1", name: "Wave 1" },
	childCount: index === 0 ? 2 : 0,
	childDoneCount: index === 0 ? 1 : 0,
	attachmentCount: 0,
	labels: [],
	waitsOn: index === 3 ? [{ identifier: "DEMO-41", title: "Show every active agent", status: "started" }] : [],
	releases: [],
	ready: index !== 3,
	pr: null,
	prRows: [],
	lastActor: index === 3 ? null : { ...actor, at: timestamp },
	position: index * 1024,
	version: 1,
	createdAt: timestamp,
	updatedAt: timestamp,
	completedAt: index === 4 ? timestamp : null,
}));

export const ticket: Ticket = {
	...tickets[0]!,
	description:
		"Keep the title and properties readable at desktop and phone widths.\n\n- Preserve the ticket identifier.\n- Keep the status and priority controls available.\n- Use the shared page spacing.\n\nThe result supports keyboard navigation and both themes.",
	contract: { result: "The ticket stays readable.", files: [], leaveAlone: [], verify: [], reviewFocus: [] },
	outcome: "",
	children: [tickets[1]!, tickets[4]!],
	prs: [],
	attachments: [],
};

export const archivedProject: Project = { ...project, color: null, archivedAt: timestamp };

export const pending = () => new Promise<never>(() => {});
export const failure = () => {
	throw new Error("The fixture request fails. The local server does not receive this request.");
};
