import type { TicketSummary } from "@trellis/api";

export const waveTicket = (identifier: string, overrides: Partial<TicketSummary> = {}): TicketSummary => ({
	id: identifier,
	identifier,
	number: Number(identifier.split("-")[1]),
	title: `Work for ${identifier}`,
	priority: "none",
	status: { id: "todo", slug: "todo", name: "Todo", category: "todo", color: "fg-muted" },
	project: { id: "project", key: "TRL" },
	parent: null,
	ancestors: [],
	epic: { id: "epic", ref: "TRL/review", name: "September 29 review" },
	wave: { id: "wave", ref: "TRL/review/wave-12", name: "Wave 12" },
	childCount: 0,
	childDoneCount: 0,
	attachmentCount: 0,
	labels: [],
	waitsOn: [],
	releases: [],
	ready: true,
	pr: null,
	prRows: [],
	lastActor: null,
	position: 0,
	version: 1,
	createdAt: "2026-09-30T06:00:00.000Z",
	updatedAt: "2026-09-30T06:00:00.000Z",
	completedAt: null,
	...overrides,
});

export const waitingTicket = (identifier: string, ...dependencies: string[]) =>
	waveTicket(identifier, {
		ready: false,
		waitsOn: dependencies.map((dependency) => ({ identifier: dependency, title: dependency, status: "todo" })),
	});
