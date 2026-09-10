// A fetch that records, holds, and fails the RPC calls the screen makes.
// The typed client posts one call to `/rpc/<path>` with the body
// `{"json": <input>}`, so the wrapper reads the procedure and the input from
// the request and passes the request on unchanged.

export type Call = { procedure: string; input: unknown };

// The shape both the recorder and the fetch it forwards to answer. The
// platform `fetch` carries more, and a test never calls that part.
export type FetchFn = (input: Request | string | URL, init?: RequestInit) => Promise<Response>;

// A hold on one procedure. `state.held` counts the requests that wait, so a
// test reads the screen between a press and the response.
export type Hold = { release: () => void; state: { held: number } };

export type Recorder = {
	calls: Call[];
	callsTo: (procedure: string) => Call[];
	inputsTo: (procedure: string) => unknown[];
	// The calls that change data. Every other call is a read.
	writes: () => Call[];
	hold: (procedure: string) => Hold;
	// Answers the procedure with a 500 until the returned function runs.
	fail: (procedure: string) => () => void;
	restore: () => void;
};

// The procedures a screen reads with. A call to any other procedure writes.
const reads = new Set([
	"inbox.get",
	"settings.get",
	"projects.list",
	"projects.get",
	"pullRequests.list",
	"search.query",
	"statuses.list",
	"tickets.counts",
	"tickets.get",
	"tickets.list",
	"timeline.list",
	"attachments.list",
	"system.health",
]);

const procedureOf = (url: string) => {
	const { pathname } = new URL(url);
	const at = pathname.indexOf("/rpc/");
	return at === -1 ? undefined : pathname.slice(at + 5).replaceAll("/", ".");
};

const inputOf = async (request: Request) => {
	if (!(request.headers.get("content-type") ?? "").includes("json")) return undefined;
	return ((await request.clone().json()) as { json?: unknown }).json;
};

const failure = () =>
	new Response(JSON.stringify({ json: { code: "INTERNAL_SERVER_ERROR", status: 500, message: "boom" } }), {
		status: 500,
		headers: { "content-type": "application/json" },
	});

// `forward` answers every request the recorder passes on. `restore` puts back
// the fetch the environment held before the call.
export const recordFetch = (forward: FetchFn): Recorder => {
	const previous = globalThis.fetch;
	const calls: Call[] = [];
	const holds = new Map<string, Hold>();
	const gates = new Map<string, Promise<void>>();
	const failing = new Set<string>();

	globalThis.fetch = (async (input: Request | string | URL, init?: RequestInit) => {
		const request = input instanceof Request ? input : new Request(input, init);
		const procedure = procedureOf(request.url);
		if (procedure === undefined) return forward(input as Request, init);
		calls.push({ procedure, input: await inputOf(request) });
		const gate = gates.get(procedure);
		if (gate !== undefined) {
			holds.get(procedure)!.state.held += 1;
			await gate;
		}
		if (failing.has(procedure)) return failure();
		return forward(input as Request, init);
	}) as typeof globalThis.fetch;

	const callsTo = (procedure: string) => calls.filter((call) => call.procedure === procedure);
	return {
		calls,
		callsTo,
		inputsTo: (procedure) => callsTo(procedure).map((call) => call.input),
		writes: () => calls.filter((call) => !reads.has(call.procedure)),
		hold: (procedure) => {
			let open = () => {};
			gates.set(
				procedure,
				new Promise<void>((resolve) => {
					open = resolve;
				}),
			);
			const hold: Hold = {
				state: { held: 0 },
				release: () => {
					gates.delete(procedure);
					open();
				},
			};
			holds.set(procedure, hold);
			return hold;
		},
		fail: (procedure) => {
			failing.add(procedure);
			return () => void failing.delete(procedure);
		},
		restore: () => {
			globalThis.fetch = previous;
		},
	};
};
