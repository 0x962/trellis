import { agentRuns } from "./agentRuns.ts";
import { attachments } from "./attachments.ts";
import { os } from "./base.ts";
import { comments } from "./comments.ts";
import { personas } from "./personas.ts";
import { projects } from "./projects.ts";
import { pullRequests } from "./pullRequests.ts";
import { actors, brief, inbox, search, settings, timeline } from "./reads.ts";
import { statuses } from "./statuses.ts";
import { system } from "./system.ts";
import { tickets } from "./tickets.ts";

export type { ProcedureContext } from "./base.ts";

// The whole contract, implemented. Both HTTP handlers serve this one router.
export const router = os.router({
	agentRuns,
	personas,
	projects,
	statuses,
	tickets,
	timeline,
	comments,
	attachments,
	pullRequests,
	search,
	inbox,
	brief,
	actors,
	settings,
	system,
});
