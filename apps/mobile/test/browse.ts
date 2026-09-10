import { agent, human, setGhReply } from "./server";
import { reset, type Seeder, seedProject, seedTicket } from "./seed";

// The projects and the tickets the browse screens read: the project tree, the
// ticket list of one project, and the search results.

export const seeder: Seeder = { human, agent, setGhReply };

export const rootKey = "CDE";
export const rootName = "Code";
export const webPath = "CDE.web";
export const hostPath = "CDE.host";
// A second root with three tickets, so one page holds its whole list.
export const smallKey = "MRG";
export const smallName = "Margin";

export const reviewTitle = "Persist the open tabs across an app restart";
export const oauthTitles = [
	"Refresh the OAuth token before the poller runs",
	"Store the OAuth device token in the keychain",
	"Retry the OAuth handshake after a timeout",
];
export const terminalTitle = "Keep the terminal scrollback on a session handoff";
export const namedTitle = "Write the code review checklist for the release";

// The first page of a ticket list holds 25 rows, so the root needs more
// active tickets than that for a second page to exist.
const fillers = 24;

export type BrowseData = {
	root: string;
	web: string;
	host: string;
	small: string;
	// The one ticket waiting in Human Review, under CDE.web.
	review: string;
	// The three tickets whose title names OAuth, one of them under MRG.
	oauth: string[];
	terminal: string;
	named: string;
};

export const seedBrowse = async (): Promise<BrowseData> => {
	await reset(seeder);
	await seedProject(seeder, { key: rootKey, name: rootName, children: ["web", "host"] });
	await seedProject(seeder, { key: smallKey, name: smallName });

	const oauth: string[] = [];
	const review = await seedTicket(seeder, {
		project: webPath,
		title: reviewTitle,
		priority: "high",
		status: "human-review",
		by: "agent",
	});
	const terminal = await seedTicket(seeder, { project: webPath, title: terminalTitle, priority: "urgent" });
	const named = await seedTicket(seeder, { project: rootKey, title: namedTitle, priority: "low" });
	for (const [index, project] of [webPath, hostPath].entries()) {
		const ticket = await seedTicket(seeder, { project, title: oauthTitles[index]!, priority: "high" });
		oauth.push(ticket.identifier);
	}
	for (let index = 0; index < fillers; index += 1) {
		await seedTicket(seeder, {
			project: index % 2 === 0 ? rootKey : webPath,
			title: `Split the settings screen, step ${index + 1}`,
		});
	}
	for (let index = 0; index < 2; index += 1) {
		await seedTicket(seeder, { project: smallKey, title: `Trim the margin report, step ${index + 1}` });
	}
	const small = await seedTicket(seeder, { project: smallKey, title: oauthTitles[2]!, priority: "medium" });
	oauth.push(small.identifier);

	return {
		root: rootKey,
		web: webPath,
		host: hostPath,
		small: smallKey,
		review: review.identifier,
		oauth,
		terminal: terminal.identifier,
		named: named.identifier,
	};
};
