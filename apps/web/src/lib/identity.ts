import type { DefaultActor } from "@trellis/api";
import { readActor, setActorName } from "./actor";
import type { AppContext } from "./appContext";

// The server settings hold the name every browser acts as
// (`defaultActorName`). localStorage keeps a copy, because the client reads
// the `x-trellis-actor` header from it on every request.

type Clients = Pick<AppContext, "client" | "orpc" | "queryClient">;

// Records in the query cache that the server holds `name`. The root route
// copies the cached `actors.default` to localStorage on every navigation, so
// every rename must update it.
export const rememberStoredName = ({ orpc, queryClient }: Pick<Clients, "orpc" | "queryClient">, name: string) =>
	queryClient.setQueryData(orpc.actors.default.queryKey({}), { name, kind: "human", stored: true });

// Stores `name` in this browser and in the server settings. The browser copy
// comes first, so the settings write carries the new name in its header.
// `settings.set` replaces the whole record, so the write sends every other
// setting unchanged.
export const saveActorName = async (clients: Clients, name: string) => {
	const { client, orpc, queryClient } = clients;
	setActorName(name);
	const settings = await queryClient.ensureQueryData(orpc.settings.get.queryOptions({}));
	const stored = await client.settings.set({ ...settings, defaultActorName: name });
	queryClient.setQueriesData({ queryKey: orpc.settings.get.key() }, stored);
	rememberStoredName(clients, name);
};

// Makes this browser act as the server identity. Returns false only on a
// first run: the server stores no name and holds no project, and this
// browser has no name either. A server with no stored name takes this
// browser's name, or else its own suggestion, so every later browser
// agrees with the first one.
export const resolveActor = async (clients: Clients, identity: DefaultActor, projectCount: number) => {
	if (identity.stored) {
		if (readActor()?.name !== identity.name) setActorName(identity.name);
		return true;
	}
	const cached = readActor();
	if (cached === null && projectCount === 0) return false;
	await saveActorName(clients, cached?.name ?? identity.name);
	return true;
};
