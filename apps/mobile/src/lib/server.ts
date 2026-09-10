import {
	ActorHeaderSchema,
	CountsOutputSchema,
	createTrellisClient,
	DefaultActorSchema,
	type FetchLike,
	HealthSchema,
} from "@trellis/api";

export type ProbeResult =
	| { ok: true; version: string; apiVersion: string; ticketCount: number; actorName: string }
	| { ok: false; kind: "timeout" }
	| { ok: false; kind: "unreachable"; detail: string }
	| { ok: false; kind: "not-trellis" };

export const probeTimeoutMs = 3_000;

const schemeError = "Start the URL with http:// or https://, for example http://192.168.1.20:4521.";
const shapeError = "Write the URL as http://<host>:<port>.";
const nameError = "Write the name with 1 to 64 printable ASCII characters and no colon.";

// The `x-trellis-actor` value for a person. The mobile app always acts as a
// human; agents reach the server through the CLI.
export const actorHeader = (name: string) => `human:${name}`;

// The person's name, trimmed, or the message the setup screen shows. The
// typed client and the event stream both parse the header against the actor
// grammar and throw on a name outside it, so a name is checked before it
// reaches either.
export const validateActorName = (input: string): { ok: true; name: string } | { ok: false; error: string } => {
	const name = input.trim();
	if (!ActorHeaderSchema.safeParse(actorHeader(name)).success) return { ok: false, error: nameError };
	return { ok: true, name };
};

// A scheme, a host, an optional port, and an optional path. Hermes ships no
// URL class, so the shape is a pattern.
const urlPattern = /^https?:\/\/[^\s/?#:]+(:\d{1,5})?(\/[^\s]*)?$/i;

// The person's URL, trimmed and without a trailing slash, or the message the
// setup screen shows.
export const validateServerUrl = (input: string): { ok: true; url: string } | { ok: false; error: string } => {
	const trimmed = input.trim();
	if (!/^https?:\/\//i.test(trimmed)) return { ok: false, error: schemeError };
	if (!urlPattern.test(trimmed)) return { ok: false, error: shapeError };
	return { ok: true, url: trimmed.replace(/\/+$/, "") };
};

// A rejected fetch is a TypeError in every runtime. The cause names the
// socket error when the runtime knows it.
const describe = (error: TypeError) => {
	const cause = error.cause as { message?: string; code?: string } | undefined;
	if (cause === undefined) return error.message;
	return `${error.message}: ${cause.message ?? cause.code}`;
};

const classify = (error: unknown): ProbeResult => {
	if (error instanceof TypeError) return { ok: false, kind: "unreachable", detail: describe(error) };
	return { ok: false, kind: "not-trellis" };
};

// Asks the server for its health, its ticket count, and the default actor
// through the typed client. One 3 s timer covers the three calls; when it
// fires, the result is `timeout` and the request in flight is aborted. The
// client decodes any 200 response, so each answer is checked against its
// schema; a server that fails a check is `not-trellis`.
export const probeHealth = async (
	url: string,
	actor: string,
	options: { fetch?: FetchLike } = {},
): Promise<ProbeResult> => {
	const controller = new AbortController();
	const { signal } = controller;
	const client = createTrellisClient(url, actor, options.fetch ?? ((request, init) => globalThis.fetch(request, init)));
	const read = async (): Promise<ProbeResult> => {
		const health = HealthSchema.parse(await client.system.health(undefined, { signal }));
		const counts = CountsOutputSchema.parse(await client.tickets.counts({}, { signal }));
		const defaultActor = DefaultActorSchema.parse(await client.actors.default(undefined, { signal }));
		return {
			ok: true,
			version: health.version,
			apiVersion: health.apiVersion,
			ticketCount: counts.total,
			actorName: defaultActor.name,
		};
	};
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<ProbeResult>((resolve) => {
		timer = setTimeout(() => {
			resolve({ ok: false, kind: "timeout" });
			controller.abort();
		}, probeTimeoutMs);
	});
	const result = await Promise.race([read().catch(classify), timeout]);
	clearTimeout(timer);
	return result;
};

// What the app knows about the server: the last probe and the last time a
// probe succeeded.
export type ServerState = {
	lastResult: ProbeResult | undefined;
	lastReachedAt: number | undefined;
};

// `never` is a server no probe has reached, which points at a typo in the
// URL. `lost` is a server that answered before, which points at the network.
export type Reachability = { status: "reachable" } | { status: "never" } | { status: "lost"; since: number };

export const recordProbe = (state: ServerState, result: ProbeResult, now: number): ServerState => ({
	lastResult: result,
	lastReachedAt: result.ok ? now : state.lastReachedAt,
});

export const reachability = (state: ServerState): Reachability => {
	if (state.lastResult?.ok) return { status: "reachable" };
	if (state.lastReachedAt === undefined) return { status: "never" };
	return { status: "lost", since: state.lastReachedAt };
};
