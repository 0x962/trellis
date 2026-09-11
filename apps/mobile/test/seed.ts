import type { Project, Ticket, TrellisClient } from "@trellis/api";

// Seeding through the real API. Every mobile test seeds the rows it reads,
// so the suite carries no fixture database and no sample project.
//
// A seed owns the whole server: `reset` drops every project first, so one
// test file never reads another file's rows.

export type Seeder = {
	// The person the app writes as.
	human: TrellisClient;
	// The agent a comment or a completed ticket comes from.
	agent: TrellisClient;
	// Writes one gh stub reply, keyed by the first two gh arguments.
	setGhReply: (key: string, stdout: string) => void;
};

// Replaces the stalled threshold and keeps the other two settings.
export const setStalledHours = async (seeder: Seeder, hours: number) => {
	const settings = await seeder.human.settings.get();
	return seeder.human.settings.set({ ...settings, stalledHours: hours });
};

// Drops every project the server holds, and the tickets under them. `keep`
// names the project keys that stay.
export const reset = async (seeder: Seeder, keep: readonly string[] = []) => {
	const projects = await seeder.human.projects.list({});
	for (const project of projects) {
		if (project.parentId !== null || keep.includes(project.key)) continue;
		await seeder.human.projects.delete({ project: project.path, force: true });
	}
};

export type ProjectSeed = { key: string; name: string; children?: readonly string[] };

// One root project with its six seeded statuses, and one sub-project per
// name in `children`.
export const seedProject = async (seeder: Seeder, seed: ProjectSeed): Promise<Project> => {
	const root = await seeder.human.projects.create({ key: seed.key, name: seed.name });
	for (const child of seed.children ?? []) {
		await seeder.human.projects.create({ parent: root.path, slug: child, name: child });
	}
	return root;
};

export type TicketSeed = {
	project: string;
	title: string;
	description?: string;
	priority?: "urgent" | "high" | "medium" | "low" | "none";
	parent?: string;
	// The status slug the ticket ends in. A ticket without one stays in Todo.
	status?: string;
	// The actor that creates the ticket and makes the status move.
	by?: "human" | "agent";
};

// One ticket, moved into its status by the actor that owns it. An agent needs
// `force` to enter a done status, which is the human's explicit override.
export const seedTicket = async (seeder: Seeder, seed: TicketSeed): Promise<Ticket> => {
	const client = seed.by === "agent" ? seeder.agent : seeder.human;
	const ticket = await client.tickets.create({
		project: seed.project,
		title: seed.title,
		description: seed.description,
		priority: seed.priority,
		parent: seed.parent,
	});
	if (seed.status === undefined) return ticket;
	return client.tickets.move({ ticket: ticket.identifier, status: seed.status, force: true });
};

export const seedComment = (seeder: Seeder, ticket: string, body: string, by: "human" | "agent" = "human") =>
	(by === "agent" ? seeder.agent : seeder.human).comments.create({ ticket, body });

// A 1 by 1 PNG, so an attachment carries an image mime and real bytes.
const pngBytes = Uint8Array.from(
	atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
	(character) => character.charCodeAt(0),
);

export const seedAttachment = (seeder: Seeder, ticket: string, filename: string) =>
	seeder.human.attachments.upload({ ticket, file: new File([pngBytes], filename, { type: "image/png" }) });

// The repository every seeded pull request lives in.
export const prRepo = "acme/web";

export type CheckSeed = { name: string; conclusion: "SUCCESS" | "FAILURE" | "SKIPPED" | null };

export type PrSeed = {
	number: number;
	title: string;
	headRef: string;
	checks: readonly CheckSeed[];
	reviewDecision?: "REVIEW_REQUIRED" | "APPROVED" | "CHANGES_REQUESTED";
};

export const prUrl = (number: number) => `https://github.com/${prRepo}/pull/${number}`;

// The one `gh api graphql` answer a link or a refresh reads. Alias pr0 holds
// the single pull request the call asks about.
export const ghPullRequest = (seed: PrSeed) => ({
	data: {
		pr0: {
			pullRequest: {
				number: seed.number,
				title: seed.title,
				state: "OPEN",
				isDraft: false,
				url: prUrl(seed.number),
				headRefName: seed.headRef,
				baseRefName: "main",
				mergedAt: null,
				closedAt: null,
				reviewDecision: seed.reviewDecision ?? null,
				commits: {
					nodes: [
						{
							commit: {
								statusCheckRollup: {
									contexts: {
										nodes: seed.checks.map((check) => ({
											__typename: "CheckRun",
											name: check.name,
											status: check.conclusion === null ? "IN_PROGRESS" : "COMPLETED",
											conclusion: check.conclusion,
											detailsUrl: `https://github.com/${prRepo}/runs/${seed.number}`,
											checkSuite: { workflowRun: { workflow: { name: "ci" } } },
										})),
									},
								},
							},
						},
					],
				},
			},
		},
	},
});

// Links one pull request to a ticket with the checks the seed names. The
// stub answers this one link, so the fields land on the row.
export const seedPr = async (seeder: Seeder, ticket: string, seed: PrSeed) => {
	seeder.setGhReply("api graphql", JSON.stringify(ghPullRequest(seed)));
	return seeder.human.pullRequests.link({ ticket, url: prUrl(seed.number) });
};

// Polls one pull request again, so a test moves its checks after the link.
export const refreshPr = async (seeder: Seeder, id: string, seed: PrSeed) => {
	seeder.setGhReply("api graphql", JSON.stringify(ghPullRequest(seed)));
	return seeder.human.pullRequests.refresh({ id });
};
