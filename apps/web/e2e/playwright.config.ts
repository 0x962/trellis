import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import { createRunRoot, sweepDeadRoots } from "../../../test/runRoot.ts";
import { writeHarnessModelsBin } from "../../server/test/helpers/harnessModelsBin.ts";
import { ghReplies } from "./ghReplies";

const ROOT_PREFIX = "trellis-e2e-";

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
//
// The root name carries the pid of the runner. The runner removes its root
// when it exits, and a new runner removes each root whose runner is dead.
if (process.env.TRELLIS_E2E_ROOT === undefined) {
	sweepDeadRoots(tmpdir(), ROOT_PREFIX);
	const root = createRunRoot(tmpdir(), ROOT_PREFIX);
	process.on("exit", () => rmSync(root, { recursive: true, force: true }));
	mkdirSync(join(root, "gh"));
	mkdirSync(join(root, "user"));
	writeFileSync(join(root, "gh", "replies.json"), JSON.stringify(ghReplies));
	writeHarnessModelsBin(join(root, "bin"));
	process.env.TRELLIS_E2E_ROOT = root;
	process.env.TRELLIS_E2E_API_PORT = await freePort();
	process.env.TRELLIS_E2E_WEB_PORT = await freePort();
}

const root = process.env.TRELLIS_E2E_ROOT;
const apiPort = process.env.TRELLIS_E2E_API_PORT!;
const webPort = process.env.TRELLIS_E2E_WEB_PORT!;
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;

// The real server with a fresh data home, the gh stub, and the harness
// stand-ins first on PATH, and vite in front of it. onboarding runs alone
// first, because the first-run flow needs a server with no project. Every other spec seeds its own project through
// the CLI. Every spec gets a fresh browser context, so localStorage starts
// empty.
export default defineConfig({
	testDir: ".",
	testMatch: /.*\.spec\.ts$/,
	fullyParallel: false,
	workers: 1,
	retries: 0,
	// A spec that stops making progress fails after 60 s with its trace. An
	// assertion waits 5 s for the page to reach the state it expects.
	timeout: 60_000,
	expect: { timeout: 5_000 },
	reporter: "list",
	globalTeardown: "./teardown.ts",
	use: {
		baseURL: webUrl,
		trace: "retain-on-failure",
	},
	// A test tagged @timing measures milliseconds in a browser that shares the
	// machine with every other process, so it gets one retry. The list
	// reporter prints a retried test as flaky. No other test retries.
	projects: [
		{ name: "onboarding", testMatch: /onboarding\.spec\.ts$/ },
		{ name: "flows", testIgnore: /onboarding\.spec\.ts$/, grepInvert: /@timing/, dependencies: ["onboarding"] },
		{
			name: "timing",
			testIgnore: /onboarding\.spec\.ts$/,
			grep: /@timing/,
			retries: 1,
			dependencies: ["onboarding"],
		},
	],
	webServer: [
		{
			command: "bun src/index.ts",
			url: `${apiUrl}/api/health`,
			cwd: server,
			env: {
				HOME: join(root, "user"),
				TRELLIS_HOME: join(root, "home"),
				TRELLIS_PORT: apiPort,
				TRELLIS_GH_BIN: ghStub,
				TRELLIS_GH_STUB_FILE: join(root, "gh", "replies.json"),
				TRELLIS_GH_STUB_LOG: join(root, "gh", "spawns.log"),
				// `system.harnessModels` runs a harness program from PATH. The
				// stand-ins answer the model query, so no spec needs a real one.
				PATH: `${join(root, "bin")}:${process.env.PATH}`,
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
