import type { Priority, Settings, TrellisClient } from "@trellis/api";

// Every palette action. Each one takes the page's own context, so the
// actor header of the page reaches the server and the effects stay
// replaceable in a test.

export type NotifyOptions = {
	// The text a Start-with-agent message shows in mono.
	command?: string;
	// Runs the same call again.
	retry?: () => void;
};

export type ActionContext = {
	client: TrellisClient;
	settings: Settings;
	// The page origin a copied link starts with.
	origin: string;
	copy: (text: string) => Promise<void>;
	confirm: (message: string) => Promise<boolean>;
	notify: (message: string, options?: NotifyOptions) => void;
	// Opens a URL outside the app.
	openUrl: (url: string) => void;
	navigate: (to: string) => void;
};

// The fields a branch name needs.
export type ActionTicket = { identifier: string; title: string };

export const changeStatus = async (_context: ActionContext, _ticket: string, _status: string): Promise<void> => {};

export const setPriority = async (_context: ActionContext, _ticket: string, _priority: Priority): Promise<void> => {};

export const moveToProject = async (_context: ActionContext, _ticket: string, _project: string): Promise<void> => {};

export const setParent = async (_context: ActionContext, _ticket: string, _parent: string | null): Promise<void> => {};

export const deleteTicket = async (_context: ActionContext, _ticket: string): Promise<void> => {};

export const bulkChangeStatus = async (
	_context: ActionContext,
	_tickets: string[],
	_status: string,
): Promise<void> => {};

export const bulkDelete = async (_context: ActionContext, _tickets: string[]): Promise<void> => {};

export const copyId = async (_context: ActionContext, _ticket: string): Promise<void> => {};

// `CDE-42` and `Restore the fork pages!` give `cde-42-restore-the-fork-pages`.
export const branchName = (_ticket: ActionTicket): string => "";

export const copyBranchName = async (_context: ActionContext, _ticket: ActionTicket): Promise<void> => {};

export const copyLink = async (_context: ActionContext, _ticket: string): Promise<void> => {};

// Copies the command from `settings.startWithAgentTemplate`, with `{brief}`
// replaced by the identifier.
export const startWithAgent = async (_context: ActionContext, _ticket: string): Promise<void> => {};

export const copyAgentBrief = async (_context: ActionContext, _ticket: string): Promise<void> => {};

export const openPullRequest = (_context: ActionContext, _url: string): void => {};
