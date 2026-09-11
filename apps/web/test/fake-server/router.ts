import { os } from "./implementer";
import { agentRuns } from "./procedures/agentRuns";
import { attachments } from "./procedures/attachments";
import { comments, timeline } from "./procedures/comments";
import { brief, inbox, search } from "./procedures/inbox";
import { actors, settings, system } from "./procedures/misc";
import { personas } from "./procedures/personas";
import { projects } from "./procedures/projects";
import { pullRequests } from "./procedures/prs";
import { statuses } from "./procedures/statuses";
import { tickets } from "./procedures/tickets";
import { ticketWrites } from "./procedures/ticketWrites";

// The whole contract, implemented in memory.
export const router = os.router({
	agentRuns,
	personas,
	projects,
	statuses,
	tickets: { ...tickets, ...ticketWrites },
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
