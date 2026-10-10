import { agentRuns } from "./agentRuns.ts";
import { attachments } from "./attachments.ts";
import { os } from "./base.ts";
import { epicChatter } from "./epicChatter";
import { epics } from "./epics.ts";
import { flowExecutions } from "./flowExecutions.ts";
import { flows } from "./flows.ts";
import { harnessAccounts } from "./harnessAccounts.ts";
import { internalLinks } from "./internalLinks.ts";
import { labelGroups } from "./labelGroups.ts";
import { labels } from "./labels.ts";
import { models } from "./models.ts";
import { notes } from "./notes.ts";
import { pages } from "./pages.ts";
import { projects } from "./projects.ts";
import { promptRewrite } from "./promptRewrite/index.ts";
import { providers } from "./providers.ts";
import { pullRequests } from "./pullRequests.ts";
import { actors, brief, search, settings, timeline } from "./reads.ts";
import { resourceComments } from "./resourceComments.ts";
import { resources } from "./resources.ts";
import { reviews } from "./reviews";
import { roles } from "./roles.ts";
import { sessionObservers } from "./sessionObservers.ts";
import { sessions } from "./sessions.ts";
import { sessionUpdates } from "./sessionUpdates.ts";
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
	internalLinks,
	usage,
	reviews,
	agentRuns,
	sessions,
	sessionObservers,
	sessionUpdates,
	flows,
	flowExecutions,
	labels,
	labelGroups,
	projects,
	promptRewrite,
	providers,
	statuses,
	tickets,
	timeline,
	notes,
	roles,
	pages,
	epicChatter,
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
