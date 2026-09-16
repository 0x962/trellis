import { agentRuns } from "./agentRuns.ts";
import { attachments } from "./attachments.ts";
import { os } from "./base.ts";
import { chat } from "./chat.ts";
import { comments } from "./comments.ts";
import { controller } from "./controller.ts";
import { evidence } from "./evidence.ts";
import { flowExecutions } from "./flowExecutions.ts";
import { flows } from "./flows.ts";
import { needsYou } from "./needsYou.ts";
import { personas } from "./personas.ts";
import { projects } from "./projects.ts";
import { pullRequests } from "./pullRequests.ts";
import { actors, brief, search, settings, timeline } from "./reads.ts";
import { reviews } from "./reviews";
import { statuses } from "./statuses.ts";
import { system } from "./system.ts";
import { tickets } from "./tickets.ts";

export type { ProcedureContext } from "./base.ts";

// The whole contract, implemented. Both HTTP handlers serve this one router.
export const router = os.router({
	needsYou,
	evidence,
	controller,
	reviews,
	agentRuns,
	personas,
	flows,
	flowExecutions,
	projects,
	statuses,
	tickets,
	timeline,
	comments,
	chat,
	attachments,
	pullRequests,
	search,
	brief,
	actors,
	settings,
	system,
});
