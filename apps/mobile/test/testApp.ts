import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { createTrellisClient, type TrellisClient } from "@trellis/api";
import { createTestApp } from "../../server/test/helpers/app.ts";
import { ghStub } from "../../server/test/helpers/gh-stub.ts";
import type { Seeder } from "./seed";

// The real server in this process, for the tests `bun test` runs. The Hono
// app answers over `app.request`, so a mobile module reaches the same
// procedures the phone calls, with no socket and no fixture database.

export type AppCall = { procedure: string; input: unknown };

// The origin the clients address. `app.request` reads the path only.
const origin = "http://trellis.test";

export const createMobileApp = async () => {
	// The gh runner reads TRELLIS_GH_BIN when it is built, so the stub comes
	// before the app.
	const stub = ghStub(mkdtempSync(join(process.env.TRELLIS_HOME!, "gh-mobile-")), {});
	const app = await createTestApp();
	const calls: AppCall[] = [];

	const record = async (request: Request) => {
		const path = new URL(request.url).pathname;
		const at = path.indexOf("/rpc/");
		const json = (request.headers.get("content-type") ?? "").includes("json");
		if (at !== -1 && json) {
			const body = (await request.clone().json()) as { json?: unknown };
			calls.push({ procedure: path.slice(at + 5).replaceAll("/", "."), input: body.json });
		}
		return app.app.request(request);
	};

	const as = (actor: string): TrellisClient => createTrellisClient(origin, actor, (request) => record(request));
	const seeder: Seeder = {
		human: as("human:navid"),
		agent: as("agent:claude-code"),
		setGhReply: (key, stdout) => stub.reply(key, { stdout, stderr: "", exitCode: 0 }),
	};

	return {
		seeder,
		client: seeder.human,
		agent: seeder.agent,
		calls,
		callsTo: (procedure: string) => calls.filter((call) => call.procedure === procedure),
		close: async () => {
			await app.close();
			stub.restore();
		},
	};
};

export type MobileApp = Awaited<ReturnType<typeof createMobileApp>>;
