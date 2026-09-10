import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import { ghReplies } from "./ghReplies";

// The web workspace, where vite runs, and the server workspace.
const web = fileURLToPath(new URL("..", import.meta.url));
const server = fileURLToPath(new URL("../../server", import.meta.url));
const ghStub = join(server, "test", "stubs", "gh.ts");

// Asks the kernel for a free port, then releases it for the server to bind.
const freePort = () =>
	new Promise<string>((done) => {
		const probe = createServer();
		probe.listen(0, "127.0.0.1", () => {
			const { port } = probe.address() as { port: number };
			probe.close(() => done(String(port)));
		});
	});

// Playwright loads this file in the runner and again in every worker. The
// runner picks the ports and the temp root once and stores them in the
// environment, which every worker inherits, so all loads agree.
if (process.env.TRELLIS_E2E_ROOT === undefined) {
	const root = mkdtempSync(join(tmpdir(), "trellis-e2e-"));
	mkdirSync(join(root, "gh"));
	writeFileSync(join(root, "gh", "replies.json"), JSON.stringify(ghReplies));
	process.env.TRELLIS_E2E_ROOT = root;
	process.env.TRELLIS_E2E_API_PORT = await freePort();
	process.env.TRELLIS_E2E_WEB_PORT = await freePort();
}

const root = process.env.TRELLIS_E2E_ROOT;
const apiPort = process.env.TRELLIS_E2E_API_PORT!;
const webPort = process.env.TRELLIS_E2E_WEB_PORT!;
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;

// The real server with a fresh data home and the gh stub, and vite in front
// of it. onboarding runs alone first, because the first-run flow needs a
// server with no project. Every other spec seeds its own project through
// the CLI. Every spec gets a fresh browser context, so localStorage starts
// empty.
export default defineConfig({
	testDir: ".",
	testMatch: /.*\.spec\.ts$/,
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: "list",
	globalTeardown: "./teardown.ts",
	use: {
		baseURL: webUrl,
		trace: "retain-on-failure",
	},
	projects: [
		{ name: "onboarding", testMatch: /onboarding\.spec\.ts$/ },
		{ name: "flows", testIgnore: /onboarding\.spec\.ts$/, dependencies: ["onboarding"] },
	],
	webServer: [
		{
			command: "bun src/index.ts",
			url: `${apiUrl}/api/health`,
			cwd: server,
			env: {
				TRELLIS_HOME: join(root, "home"),
				TRELLIS_PORT: apiPort,
				TRELLIS_GH_BIN: ghStub,
				TRELLIS_GH_STUB_FILE: join(root, "gh", "replies.json"),
				TRELLIS_GH_STUB_LOG: join(root, "gh", "spawns.log"),
				// paint.spec.ts writes the production build here. The server
				// looks for it on each request, so the build can come after boot.
				TRELLIS_WEB_DIST: join(root, "dist"),
			},
			reuseExistingServer: false,
		},
		{
			command: `bun run dev --port ${webPort}`,
			url: webUrl,
			cwd: web,
			env: { TRELLIS_API_URL: apiUrl },
			reuseExistingServer: false,
		},
	],
});
