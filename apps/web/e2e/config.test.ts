import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import config from "./playwright.config";

type WebServer = { command: string; cwd?: string; url?: string; env?: Record<string, string> };

const servers = (): WebServer[] => {
	const value = config.webServer as WebServer | WebServer[] | undefined;
	if (value === undefined) return [];
	return Array.isArray(value) ? value : [value];
};

// A live server and its web app hold these ports, so the suite never
// binds them.
const livePorts = ["4521", "4522", "5173"];

const portOf = (url: string) => new URL(url).port;

type Project = { name: string; testMatch?: RegExp; testIgnore?: RegExp; dependencies?: string[] };

// Loading the config makes a temp root, and only a Playwright run tears it
// down, so this file removes the root its own import made.
afterAll(() => rmSync(process.env.TRELLIS_E2E_ROOT!, { recursive: true, force: true }));

describe("playwright.config", () => {
	// The e2e suite runs the web app over the real server: `bun src/index.ts`
	// with a temporary data home, the gh stub, and a free port. Vite proxies
	// /api and /rpc to that server from a second free port.
	test("the Playwright config starts the real server on a free port with a temp home and the gh stub", () => {
		const list = servers();
		const server = list.find((entry) => entry.command.includes("src/index.ts"));
		expect(server).toBeDefined();
		expect(resolve(server!.cwd!)).toBe(resolve(import.meta.dir, "../../server"));
		const env = server!.env!;
		expect(env.TRELLIS_HOME!.startsWith(resolve(tmpdir()))).toBe(true);
		expect(resolve(env.TRELLIS_HOME!)).not.toBe(join(homedir(), ".trellis"));
		expect(env.TRELLIS_GH_BIN).toBe(resolve(import.meta.dir, "../../server/test/stubs/gh.ts"));
		expect(env.TRELLIS_GH_STUB_FILE).toBeString();
		expect(env.TRELLIS_GH_STUB_LOG).toBeString();
		expect(livePorts).not.toContain(env.TRELLIS_PORT);
		expect(portOf(server!.url!)).toBe(env.TRELLIS_PORT!);

		const vite = list.find((entry) => entry !== server);
		expect(vite).toBeDefined();
		expect(vite!.env?.TRELLIS_API_URL).toBe(`http://127.0.0.1:${env.TRELLIS_PORT}`);
		const webPort = portOf(config.use!.baseURL!);
		expect(livePorts).not.toContain(webPort);
		expect(vite!.command).toContain(`--port ${webPort}`);
		expect(vite!.url).toBe(config.use!.baseURL);
		expect(config.use?.storageState).toBeUndefined();
	});

	// The pid in the name lets the next run remove a root whose runner died.
	// The server resolves `~` paths through HOME, so HOME sits in the root too.
	test("the temp root carries the runner pid and holds the HOME of the server", () => {
		const root = process.env.TRELLIS_E2E_ROOT!;
		expect(basename(root).startsWith(`trellis-e2e-${process.pid}-`)).toBe(true);
		const server = servers().find((entry) => entry.command.includes("src/index.ts"))!;
		expect(server.env!.HOME!.startsWith(`${root}/`)).toBe(true);
	});

	// A fresh load of the config in a runner removes the root of a dead
	// runner, and the runner removes its own root when it exits.
	test("a runner removes the root of a dead runner at load and its own root at exit", () => {
		const parent = mkdtempSync(join(process.env.TRELLIS_HOME!, "e2e-tmp-"));
		const deadPid = Bun.spawnSync(["true"]).pid;
		mkdirSync(join(parent, `trellis-e2e-${deadPid}-aaaaaa`, "home"), { recursive: true });
		const env: Record<string, string | undefined> = { ...process.env, TMPDIR: parent };
		delete env.TRELLIS_E2E_ROOT;
		const run = Bun.spawnSync(
			["bun", "-e", `await import(${JSON.stringify(join(import.meta.dir, "playwright.config.ts"))})`],
			{
				env,
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		expect(run.exitCode, run.stderr.toString()).toBe(0);
		expect(readdirSync(parent)).toEqual([]);
	}, 30_000);

	// The first-run flow needs a server with no project, so onboarding runs
	// before every spec that seeds one.
	test("onboarding runs first and every other spec depends on it", () => {
		const projects = config.projects as Project[];
		const onboarding = projects.find((project) => project.name === "onboarding")!;
		const flows = projects.find((project) => project.name === "flows")!;
		expect(onboarding.testMatch!.test("onboarding.spec.ts")).toBe(true);
		expect(flows.testIgnore!.test("onboarding.spec.ts")).toBe(true);
		expect(flows.dependencies).toEqual(["onboarding"]);
		const testMatch = config.testMatch as RegExp;
		expect(testMatch.test("create.spec.ts")).toBe(true);
		expect(testMatch.test("config.test.ts")).toBe(false);
	});
});
