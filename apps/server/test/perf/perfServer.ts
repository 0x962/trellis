import { createTrellisClient, type FetchLike, type TrellisClient } from "@trellis/api";
import { type SpawnedServer, spawnServer, stopServer } from "../helpers/server.ts";
import { perfHome } from "./perfHome.ts";

// A real server, the one `bun src/index.ts` boots, on a copy of the seeded
// home. gh points at a path with no file, so the poller never reaches
// GitHub and the measurements hold only the requests of the test.

const MB = 1024 * 1024;

// `db;dur=12.3` in the Server-Timing header is the time the database worker
// spent on the request, in milliseconds.
const DB_DURATION = /(?:^|,)\s*db;dur=([\d.]+)/;

export const dbDuration = (response: Response) => {
	const header = response.headers.get("server-timing");
	const match = header === null ? null : DB_DURATION.exec(header);
	if (match === null) throw new Error(`${response.url} answered without a db duration in Server-Timing: ${header}`);
	return Number(match[1]);
};

// A typed client that keeps the db duration of its last response. One
// client runs one call at a time, so `timed` reads the duration of its own
// call.
export type TimedClient = {
	client: TrellisClient;
	timed: (call: (client: TrellisClient) => Promise<unknown>) => Promise<number>;
};

export const timedClient = (url: string, actor = "agent:perf"): TimedClient => {
	let last = Number.NaN;
	const fetchTimed: FetchLike = async (request, init) => {
		const response = await fetch(request, init);
		last = dbDuration(response);
		return response;
	};
	const client = createTrellisClient(url, actor, fetchTimed);
	return {
		client,
		timed: async (call) => {
			await call(client);
			return last;
		},
	};
};

export type PerfServer = {
	url: string;
	home: string;
	process: SpawnedServer;
	rssMb: () => Promise<number>;
	stop: () => Promise<void>;
};

export const startPerfServer = async (home?: string): Promise<PerfServer> => {
	const dataHome = home ?? (await perfHome());
	const server = spawnServer({ home: dataHome, env: { TRELLIS_GH_BIN: "/nonexistent/gh" } });
	const { url } = await server.listening();
	// The resident size of the whole server process, the database worker
	// included, as the health answer reports it.
	const rssMb = async () => {
		const health = (await (await fetch(`${url}/api/health`)).json()) as { rss: number };
		return health.rss / MB;
	};
	return { url, home: dataHome, process: server, rssMb, stop: () => stopServer(server) };
};
