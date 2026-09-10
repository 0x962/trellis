import type { LinkedPullRequest } from "@trellis/api";
import {
	type PrSeed,
	reset,
	type Seeder,
	seedAttachment,
	seedComment,
	seedPr,
	seedProject,
	seedTicket,
} from "./seed";

// The one ticket the ticket screen tests open, with every section it draws:
// a parent, three children, four comments, one pull request, and one image.

export const projectKey = "CDE";
export const projectName = "Code";
export const subPath = "CDE.web";

export const title = "Restore the five settings pages the upgrade dropped";
export const parentTitle = "Update the shared build configuration";
export const startedTitle = "Keep the terminal scrollback on a session handoff";
export const agentReviewTitle = "Skip a hand run launch agent in the setup module";
export const lastComment = "Typecheck and tests are green on the PR. Ready for a look.";

export const description = [
	"The build upgrade dropped five settings pages. Restore each page and keep every marked site.",
	"",
	"## Acceptance",
	"",
	"- [x] The five routes render",
	"- [x] Every marked site is listed",
	"- [ ] The desktop typecheck is green",
].join("\n");

export const prSeed: PrSeed = {
	number: 118,
	title: "Restore the settings pages",
	headRef: "cde-restore-settings-pages",
	reviewDecision: "APPROVED",
	checks: [
		{ name: "lint", conclusion: "SUCCESS" },
		{ name: "typecheck (desktop)", conclusion: "SUCCESS" },
		{ name: "test (host-service)", conclusion: "SUCCESS" },
		{ name: "build (macos-arm64)", conclusion: "SUCCESS" },
	],
};

export type TicketData = {
	project: string;
	// The ticket every screen test opens.
	ticket: string;
	parent: string;
	// The three children, oldest first, two of them done.
	children: string[];
	// A ticket in a started status, and one a human never reviews.
	started: string;
	agentReview: string;
	pr: LinkedPullRequest;
};

// Seeds the project and the ticket on a server with nothing else on it.
export const seedTicketScreen = async (seeder: Seeder): Promise<TicketData> => {
	await reset(seeder);
	await seedProject(seeder, { key: projectKey, name: projectName, children: ["web"] });
	const parent = await seedTicket(seeder, {
		project: projectKey,
		title: parentTitle,
		priority: "high",
		status: "in-progress",
	});
	const ticket = await seedTicket(seeder, {
		project: subPath,
		title,
		description,
		priority: "high",
		parent: parent.identifier,
		by: "agent",
	});
	// Two moves, so the timeline carries the pair of status changes the
	// ticket went through.
	await seeder.agent.tickets.move({ ticket: ticket.identifier, status: "in-progress" });
	await seeder.agent.tickets.move({ ticket: ticket.identifier, status: "human-review" });

	const children = [
		{ title: "Keep the starred runs after a reload", status: "done" },
		{ title: "Focus the terminal of a new tab", status: "done" },
		{ title: "Rename a tab on a double click", status: undefined },
	];
	const identifiers: string[] = [];
	for (const child of children) {
		const row = await seedTicket(seeder, {
			project: subPath,
			title: child.title,
			parent: ticket.identifier,
			status: child.status,
		});
		identifiers.push(row.identifier);
	}

	await seedComment(seeder, ticket.identifier, "Plan: restore the five settings pages and keep every marked site.");
	await seedComment(seeder, ticket.identifier, "Restored the five pages. Every keep-marker survived.", "agent");
	await seedComment(seeder, ticket.identifier, "Send it to review when the desktop typecheck is green.");
	await seedComment(seeder, ticket.identifier, lastComment, "agent");

	const pr = await seedPr(seeder, ticket.identifier, prSeed);
	await seedAttachment(seeder, ticket.identifier, "settings-pages.png");

	const started = await seedTicket(seeder, {
		project: subPath,
		title: startedTitle,
		priority: "urgent",
		status: "in-progress",
		by: "agent",
	});
	const agentReview = await seedTicket(seeder, {
		project: subPath,
		title: agentReviewTitle,
		priority: "high",
		status: "agent-review",
		by: "agent",
	});

	return {
		project: projectKey,
		ticket: ticket.identifier,
		parent: parent.identifier,
		children: identifiers,
		started: started.identifier,
		agentReview: agentReview.identifier,
		pr,
	};
};
