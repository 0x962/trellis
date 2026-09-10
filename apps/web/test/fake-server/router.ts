import { os } from "./implementer";
import { attachments } from "./procedures/attachments";
import { comments, timeline } from "./procedures/comments";
import { brief, inbox, search } from "./procedures/inbox";
import { actors, pullRequests, settings, system } from "./procedures/misc";
import { projects } from "./procedures/projects";
import { statuses } from "./procedures/statuses";
import { tickets } from "./procedures/tickets";
import { ticketWrites } from "./procedures/ticketWrites";

// The whole contract, implemented in memory.
export const router = os.router({
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
