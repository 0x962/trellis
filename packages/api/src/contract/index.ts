import { oc } from "@orpc/contract";
import { actors } from "./actors.ts";
import { agentRuns } from "./agentRuns.ts";
import { agents } from "./agents.ts";
import { attachments } from "./attachments.ts";
import { brief } from "./brief.ts";
import { comments } from "./comments.ts";
import { flows } from "./flows.ts";
import { inbox } from "./inbox.ts";
import { personas } from "./personas.ts";
import { projects } from "./projects.ts";
import { pullRequests } from "./pullRequests.ts";
import { reviews } from "./reviews";
import { search } from "./search.ts";
import { settings } from "./settings.ts";
import { statuses } from "./statuses.ts";
import { system } from "./system.ts";
import { tickets } from "./tickets.ts";
import { timeline } from "./timeline.ts";

// The whole API. Paths are relative to the `/api` mount of the OpenAPI
// handler; the RPC handler at `/rpc` addresses a procedure by its dotted
// name. The tag is the OpenAPI group.
export const contract = {
	reviews: oc.tag("reviews").router(reviews),
	agentRuns: oc.tag("agent runs").router(agentRuns),
	personas: oc.tag("personas").router(personas),
	flows: oc.tag("flows").router(flows),
	projects: oc.tag("projects").router(projects),
	statuses: oc.tag("statuses").router(statuses),
	tickets: oc.tag("tickets").router(tickets),
	timeline: oc.tag("timeline").router(timeline),
	comments: oc.tag("comments").router(comments),
	attachments: oc.tag("attachments").router(attachments),
	pullRequests: oc.tag("pull requests").router(pullRequests),
	search: oc.tag("search").router(search),
	inbox: oc.tag("inbox").router(inbox),
	brief: oc.tag("brief").router(brief),
	actors: oc.tag("actors").router(actors),
	settings: oc.tag("settings").router(settings),
	system: oc.tag("system").router(system),
	agents: oc.tag("agents").router(agents),
};
export type TrellisContract = typeof contract;
