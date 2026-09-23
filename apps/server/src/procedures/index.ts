import { agentRuns } from "./agentRuns.ts";
import { attachments } from "./attachments.ts";
import { os } from "./base.ts";
import { epics } from "./epics.ts";
import { flowExecutions } from "./flowExecutions.ts";
import { flows } from "./flows.ts";
import { harnessAccounts } from "./harnessAccounts.ts";
import { labelGroups } from "./labelGroups.ts";
import { labels } from "./labels.ts";
import { models } from "./models.ts";
import { needsYou } from "./needsYou.ts";
import { notes } from "./notes.ts";
import { projects } from "./projects.ts";
import { pullRequests } from "./pullRequests.ts";
import { actors, brief, search, settings, timeline } from "./reads.ts";
import { resourceComments } from "./resourceComments.ts";
import { resources } from "./resources.ts";
import { reviews } from "./reviews";
import { sessions } from "./sessions.ts";
import { statistics } from "./statistics.ts";
import { statuses } from "./statuses.ts";
import { system } from "./system.ts";
import { tickets } from "./tickets.ts";
import { usage } from "./usage.ts";
import { waves } from "./waves.ts";

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
	statistics,
	statuses,
	tickets,
	timeline,
	notes,
	epics,
	waves,
	attachments,
	pullRequests,
	resources,
	resourceComments,
	search,
	brief,
	actors,
	settings,
	system,
});
