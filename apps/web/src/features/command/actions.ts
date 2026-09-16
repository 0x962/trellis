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

export const moveToProject = async (context: ActionContext, ticket: string, project: string): Promise<void> =>
	write(context, "The ticket did not move.", () => context.client.tickets.update({ ticket, project }));

export const setParent = async (context: ActionContext, ticket: string, parent: string | null): Promise<void> =>
	write(context, "The parent did not change.", () => context.client.tickets.update({ ticket, parent }));

export const deleteTicket = async (context: ActionContext, ticket: string): Promise<void> => {
	if (!(await context.confirm(`Delete ${ticket}?`))) return;
	await write(context, `${ticket} is not deleted.`, () => context.client.tickets.delete({ ticket }));
};

export const bulkChangeStatus = async (context: ActionContext, tickets: string[], status: string): Promise<void> =>
	write(context, "The status did not change.", () => context.client.tickets.updateMany({ tickets, status }));

export const bulkSetPriority = async (context: ActionContext, tickets: string[], priority: Priority): Promise<void> =>
	write(context, "The priority did not change.", () => context.client.tickets.updateMany({ tickets, priority }));

export const bulkMoveToProject = async (context: ActionContext, tickets: string[], project: string): Promise<void> =>
	write(context, "The tickets did not move.", () => context.client.tickets.updateMany({ tickets, project }));

export const bulkDelete = async (context: ActionContext, tickets: string[]): Promise<void> => {
	if (!(await context.confirm(`Delete ${tickets.length} tickets?`))) return;
	await write(context, "The tickets are not deleted.", () => context.client.tickets.deleteMany({ tickets }));
};

export const copyId = async (context: ActionContext, ticket: string): Promise<void> => {
	await context.copy(ticket);
	context.notify("Copied the ID.");
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
