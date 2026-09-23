import type { Priority, Ticket, TrellisClient } from "@trellis/api";
import { conflictCurrent, conflictMessage } from "../../lib/conflict";

// Every palette action. Each one takes the page's own context, so the
// actor header of the page reaches the server and the effects stay
// replaceable in a test.

export type NotifyOptions = {
	// Runs the same call again.
	retry?: () => void;
};

export type ActionContext = {
	client: TrellisClient;
	// The page origin a copied link starts with.
	origin: string;
	copy: (text: string) => Promise<void>;
	// Asks the person a question with two answers and waits for one. The
	// palette host draws the dialog. False stops the action.
	confirm: (question: string) => Promise<boolean>;
	notify: (message: string, options?: NotifyOptions) => void;
	// Puts a row the server sent into every cached list and detail entry.
	applyCurrent: (current: Ticket) => void;
	// Opens a URL outside the app.
	openUrl: (url: string) => void;
	navigate: (to: string) => void;
};

// The fields a branch name needs.
export type ActionTicket = { identifier: string; title: string };

// The server is a boundary. A refused write says so and offers the same
// call again, so nothing is lost between the palette and the database.
// A 412 is the exception: another actor wrote the ticket first, that
// version goes into the cache, and the person gets no retry, because a
// retry would write over it before the person reads it.
const write = async (context: ActionContext, message: string, call: () => Promise<unknown>): Promise<void> => {
	try {
		await call();
	} catch (error) {
		const current = conflictCurrent(error);
		if (current !== null) {
			context.applyCurrent(current);
			context.notify(conflictMessage(current.identifier));
			return;
		}
		context.notify(message, { retry: () => void write(context, message, call) });
	}
};

export const changeStatus = async (context: ActionContext, ticket: string, status: string): Promise<void> =>
	write(context, "The status did not change.", () => context.client.tickets.update({ ticket, status }));

export const setPriority = async (context: ActionContext, ticket: string, priority: Priority): Promise<void> =>
	write(context, "The priority did not change.", () => context.client.tickets.update({ ticket, priority }));

export const setParent = async (context: ActionContext, ticket: string, parent: string | null): Promise<void> =>
	write(context, "The parent did not change.", () => context.client.tickets.update({ ticket, parent }));

// `on` is the state the label takes. A label write carries no
// `expectedVersion`: an add and a remove of two labels never contradict each
// other, and a second pick would otherwise be refused as a conflict.
export const setLabel = async (context: ActionContext, ticket: string, label: string, on: boolean): Promise<void> =>
	write(context, "The labels did not change.", () =>
		context.client.tickets.update({ ticket, ...(on ? { addLabels: [label] } : { removeLabels: [label] }) }),
	);

export const setEpic = async (context: ActionContext, ticket: string, epic: string | null): Promise<void> =>
	write(context, "The epic did not change.", () => context.client.tickets.update({ ticket, epic }));

export const deleteTicket = async (context: ActionContext, ticket: string): Promise<void> => {
	if (!(await context.confirm(`Delete ${ticket}?`))) return;
	await write(context, `${ticket} is not deleted.`, () => context.client.tickets.delete({ ticket }));
};

export const copyId = async (context: ActionContext, ticket: string): Promise<void> => {
	await context.copy(ticket);
	context.notify("Copied the ID.");
};

const plural = (count: number) => `${count} ${count === 1 ? "ticket" : "tickets"}`;

// One identifier per line, in the order the rows are selected.
export const copyIds = async (context: ActionContext, tickets: string[]): Promise<void> => {
	await context.copy(tickets.join("\n"));
	context.notify(`Copied the IDs of ${plural(tickets.length)}.`);
};

// One ticket URL per line, in the order the rows are selected.
export const copyLinks = async (context: ActionContext, tickets: string[]): Promise<void> => {
	await context.copy(tickets.map((ticket) => `${context.origin}/t/${ticket}`).join("\n"));
	context.notify(`Copied the links of ${plural(tickets.length)}.`);
};

// `CDE-42` and `Restore the export pages!` give `cde-42-restore-the-export-pages`.
export const branchName = (ticket: ActionTicket): string => {
	const slug = ticket.title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	return `${ticket.identifier.toLowerCase()}-${slug}`;
};

export const copyBranchName = async (context: ActionContext, ticket: ActionTicket): Promise<void> => {
	await context.copy(branchName(ticket));
	context.notify("Copied the branch name.");
};

export const copyLink = async (context: ActionContext, ticket: string): Promise<void> => {
	await context.copy(`${context.origin}/t/${ticket}`);
	context.notify("Copied the link.");
};

export const copyAgentBrief = async (context: ActionContext, ticket: string): Promise<void> => {
	const brief = await context.client.brief.get({ ticket });
	await context.copy(brief.markdown);
	context.notify("Copied the agent brief.");
};

export const openPullRequest = (context: ActionContext, url: string): void => context.openUrl(url);
