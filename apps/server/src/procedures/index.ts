import { agentRuns } from "./agentRuns.ts";
import { attachments } from "./attachments.ts";
import { os } from "./base.ts";
import { comments } from "./comments.ts";
import { epics } from "./epics.ts";
import { flowExecutions } from "./flowExecutions.ts";
import { flows } from "./flows.ts";
import { harnessAccounts } from "./harnessAccounts.ts";
import { labelGroups } from "./labelGroups.ts";
import { labels } from "./labels.ts";
import { milestones } from "./milestones.ts";
import { models } from "./models.ts";
import { needsYou } from "./needsYou.ts";
import { notes } from "./notes.ts";
import { projects } from "./projects.ts";
import { pullRequests } from "./pullRequests.ts";
import { actors, brief, search, settings, timeline } from "./reads.ts";
import { reviews } from "./reviews";
import { sessions } from "./sessions.ts";
import { statuses } from "./statuses.ts";
import { system } from "./system.ts";
import { tickets } from "./tickets.ts";
import { usage } from "./usage.ts";

export type { ProcedureContext } from "./base.ts";

// The whole contract, implemented. Both HTTP handlers serve this one router.
export const router = os.router({
	models,
	harnessAccounts,
	usage,
	needsYou,
	reviews,
	agentRuns,
	sessions,
	flows,
	flowExecutions,
	labels,
	labelGroups,
	projects,
	statuses,
	tickets,
	timeline,
	comments,
	notes,
	epics,
	milestones,
	attachments,
	pullRequests,
	search,
	brief,
	actors,
	settings,
	system,
});
