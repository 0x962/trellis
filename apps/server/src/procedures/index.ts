import { agentRuns } from "./agentRuns.ts";
import { attachments } from "./attachments.ts";
import { os } from "./base.ts";
import { chat } from "./chat.ts";
import { comments } from "./comments.ts";
import { controller } from "./controller.ts";
import { flowExecutions } from "./flowExecutions.ts";
import { flows } from "./flows.ts";
import { harnessAccounts } from "./harnessAccounts.ts";
import { labelGroups } from "./labelGroups.ts";
import { loops } from "./loops.ts";
import { models } from "./models.ts";
import { needsYou } from "./needsYou.ts";
import { notes } from "./notes.ts";
import { projects } from "./projects.ts";
import { pullRequests } from "./pullRequests.ts";
import { actors, brief, search, settings, timeline } from "./reads.ts";
import { reviews } from "./reviews";
import { sessions } from "./sessions.ts";
import { statuses } from "./statuses.ts";
import { submanagers } from "./submanagers.ts";
import { system } from "./system.ts";
import { tickets } from "./tickets.ts";
import { usage } from "./usage.ts";

export type { ProcedureContext } from "./base.ts";

// The whole contract, implemented. Both HTTP handlers serve this one router.
export const router = os.router({
	loops,
	models,
	submanagers,
	harnessAccounts,
	usage,
	needsYou,
	controller,
	reviews,
	agentRuns,
	sessions,
	flows,
	flowExecutions,
	labelGroups,
	projects,
	statuses,
	tickets,
	timeline,
	comments,
	chat,
	notes,
	attachments,
	pullRequests,
	search,
	brief,
	actors,
	settings,
	system,
});
