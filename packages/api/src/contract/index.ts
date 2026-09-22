import { oc } from "@orpc/contract";
import { actors } from "./actors.ts";
import { agentRuns } from "./agentRuns.ts";
import { attachments } from "./attachments.ts";
import { brief } from "./brief.ts";
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
import { resourceComments } from "./resourceComments.ts";
import { resources } from "./resources.ts";
import { reviews } from "./reviews";
import { search } from "./search.ts";
import { sessions } from "./sessions.ts";
import { settings } from "./settings.ts";
import { statuses } from "./statuses.ts";
import { system } from "./system.ts";
import { tickets } from "./tickets.ts";
import { timeline } from "./timeline.ts";
import { usage } from "./usage.ts";
import { waves } from "./waves.ts";

// The whole API. Paths are relative to the `/api` mount of the OpenAPI
// handler; the RPC handler at `/rpc` addresses a procedure by its dotted
// name. The tag is the OpenAPI group.
export const contract = {
	models: oc.tag("models").router(models),
	harnessAccounts: oc.tag("harness accounts").router(harnessAccounts),
	usage: oc.tag("usage").router(usage),
	needsYou: oc.tag("needs you").router(needsYou),
	reviews: oc.tag("reviews").router(reviews),
	agentRuns: oc.tag("agent runs").router(agentRuns),
	flows: oc.tag("flows").router(flows),
	flowExecutions: oc.tag("flow executions").router(flowExecutions),
	labels: oc.tag("labels").router(labels),
	labelGroups: oc.tag("label groups").router(labelGroups),
	projects: oc.tag("projects").router(projects),
	statuses: oc.tag("statuses").router(statuses),
	tickets: oc.tag("tickets").router(tickets),
	timeline: oc.tag("timeline").router(timeline),
	notes: oc.tag("notes").router(notes),
	epics: oc.tag("epics").router(epics),
	waves: oc.tag("waves").router(waves),
	attachments: oc.tag("attachments").router(attachments),
	pullRequests: oc.tag("pull requests").router(pullRequests),
	resources: oc.tag("resources").router(resources),
	resourceComments: oc.tag("resource comments").router(resourceComments),
	sessions: oc.tag("sessions").router(sessions),
	search: oc.tag("search").router(search),
	brief: oc.tag("brief").router(brief),
	actors: oc.tag("actors").router(actors),
	settings: oc.tag("settings").router(settings),
	system: oc.tag("system").router(system),
};
export type TrellisContract = typeof contract;
