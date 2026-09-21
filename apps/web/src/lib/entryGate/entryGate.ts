import type { DefaultActor, TrellisClient } from "@trellis/api";
import type { AppContext } from "../appContext";
import { resolveActor } from "../identity";

type Clients = Pick<AppContext, "client" | "orpc" | "queryClient">;

export type Projects = Awaited<ReturnType<TrellisClient["projects"]["list"]>>;

export type Entry = { projects: Projects; identity: DefaultActor };

// What the app reads before it draws its first page: the projects, the
// name the server stores, and the settings. The settings come in the same
// batched request, because the palette reads the agent command template on
// the first Cmd+K.
//
// Every one of the three throws when the server refuses the request (a
// missing or wrong host token, a foreign origin) and when the server does
// not answer at all. A caller therefore never reads a refusal as a server
// that holds no project and stores no name.
export const loadEntry = async (context: Clients): Promise<Entry> => {
	const [projects, identity] = await Promise.all([
		context.queryClient.fetchQuery(context.orpc.projects.list.queryOptions({ input: {} })),
		context.queryClient.ensureQueryData(context.orpc.actors.default.queryOptions({})),
		context.queryClient.ensureQueryData(context.orpc.settings.get.queryOptions()),
	]);
	return { projects, identity };
};

// The page this browser belongs on. `app` keeps the page it asked for.
// `name` and `project` are the two steps of the first run. `loadEntry`
// above answers only when the server answered every call, so a refused
// request opens neither step.
export type EntryStep = "app" | "name" | "project";

export const entryStep = async (context: Clients, entry: Entry): Promise<EntryStep> => {
	if (!(await resolveActor(context, entry.identity, entry.projects.length))) return "name";
	return entry.projects.length === 0 ? "project" : "app";
};
