import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { graphqlReply } from "../../../apps/server/test/fixtures/graphql.ts";
import { type SpawnedServer, spawnServer, stopServer } from "../../../apps/server/test/helpers/server.ts";
import { cliEntry, followLog, repoRoot, runProcess, startCliServer, watchOne } from "./process.ts";

const servers: SpawnedServer[] = [];

afterEach(async () => {
	for (const server of servers.splice(0)) await stopServer(server);
});

const tempDir = (name: string) => mkdtempSync(join(process.env.TRELLIS_HOME!, `${name}-`));

const ghEnvironment = (dir: string) => {
	const replyFile = join(dir, "gh-replies.json");
	const logFile = join(dir, "gh-spawns.log");
	writeFileSync(
		replyFile,
		JSON.stringify({
			"auth status": { stdout: "Logged in to github.com account navid\n", stderr: "", exitCode: 0 },
			"api graphql": graphqlReply([{ number: 7, title: "Smoke PR" }]),
		}),
	);
	return {
		TRELLIS_GH_BIN: join(repoRoot, "apps", "server", "test", "stubs", "gh.ts"),
		TRELLIS_GH_STUB_FILE: replyFile,
		TRELLIS_GH_STUB_LOG: logFile,
	};
};

const start = async (home: string) => {
	const env = ghEnvironment(home);
	const server = spawnServer({ home, env });
	servers.push(server);
	const { url } = await server.listening();
	return { server, url, env };
};

const cli = (url: string, args: string[], env: Record<string, string> = {}) =>
	runProcess([...args, "--url", url, "--json"], env);

const ok = async (url: string, args: string[], env: Record<string, string> = {}) => {
	const result = await cli(url, args, env);
	expect(result.code, `${args.join(" ")}: ${result.stderr}`).toBe(0);
	return result;
};

describe("the live CLI", () => {
	test("the smoke chain passes against the real server", async () => {
		const home = tempDir("smoke-home");
		const { url, env } = await start(home);

		await ok(url, ["projects", "create", "--key", "CDE", "--name", "Code"], env);
		const created = await ok(url, ["create", "-p", "CDE", "-t", "First"], env);
		expect(JSON.parse(created.stdout).identifier).toBe("CDE-1");
		await ok(url, ["move", "CDE-1", "In Progress"], env);

		const watched = await watchOne(
			url,
			"CDE-1",
			"comment.created",
			async () => {
				await ok(url, ["comment", "CDE-1", "--body", "Smoke note"], env);
			},
			env,
		);
		expect(watched.code).toBe(0);
		expect(watched.stderr).toBe("");
		expect(watched.events.some((event) => event.type === "comment.created")).toBe(true);

		const shown = await ok(url, ["show", "CDE-1", "--comments"], env);
		expect(JSON.stringify(JSON.parse(shown.stdout))).toContain("Smoke note");
		const listed = await ok(url, ["list", "--project", "CDE"], env);
		expect(JSON.parse(listed.stdout)).toHaveLength(1);
		const linked = await ok(url, ["pr", "add", "CDE-1", "https://github.com/acme/web/pull/7"], env);
		expect(JSON.parse(linked.stdout).title).toBe("Smoke PR");
		const brief = await ok(url, ["brief", "CDE-1"], env);
		expect(JSON.parse(brief.stdout).markdown).toContain("# CDE-1");
		const inbox = await ok(url, ["inbox"], env);
		expect(JSON.parse(inbox.stdout)).toHaveProperty("review");
		const backup = await ok(url, ["backup"], env);
		expect(existsSync(JSON.parse(backup.stdout).path)).toBe(true);
		const exported = await ok(url, ["export"], env);
		expect(exported.stdout).toContain('"table":"tickets"');
	});

	test("the policy and connection failures use the specified exit codes", async () => {
		const home = tempDir("codes-home");
		const { url, env } = await start(home);
		await ok(url, ["projects", "create", "--key", "CDE", "--name", "Code"], env);
		await ok(url, ["create", "-p", "CDE", "-t", "First"], env);

		const refused = await runProcess(["move", "CDE-1", "Done", "--url", url, "--as", "agent:smoke"], env);
		expect(refused.code).toBe(4);
		expect(refused.stderr).toContain("(AGENT_CANNOT_COMPLETE)");

		const unknown = await cli(url, ["show", "CDE-404"], env);
		expect(unknown.code).toBe(3);
		expect(unknown.stderr).toContain("(NOT_FOUND)");

		const stopped = await runProcess(["show", "CDE-1", "--url", "http://127.0.0.1:1"]);
		expect(stopped.code).toBe(5);
		expect(stopped.stderr).toContain("(UNREACHABLE)");
	});

	test("serve runs the server until SIGTERM", async () => {
		const home = tempDir("serve-home");
		const server = await startCliServer(home, ghEnvironment(home));
		const health = await fetch(`${server.url}/api/health`);
		expect(health.ok).toBe(true);
		const stopped = await server.stop();
		expect(stopped.code).toBe(0);
		expect(stopped.stderr).toBe("");
		expect(stopped.stdout).toContain('"msg":"closed"');
	});

	test("backup and restore reproduce the ticket list", async () => {
		const source = tempDir("backup-source");
		const started = await start(source);
		await ok(started.url, ["projects", "create", "--key", "CDE", "--name", "Code"], started.env);
		await ok(started.url, ["create", "-p", "CDE", "-t", "First"], started.env);
		const before = await ok(started.url, ["list", "--project", "CDE"], started.env);
		const backup = await ok(started.url, ["backup"], started.env);
		const archive = JSON.parse(backup.stdout).path as string;
		await stopServer(started.server);
		servers.splice(servers.indexOf(started.server), 1);

		const target = tempDir("backup-target");
		const restored = await runProcess(["restore", archive, "--url", started.url], { TRELLIS_HOME: target });
		expect(restored.code, restored.stderr).toBe(0);
		expect(restored.stdout).toContain("trellis serve");

		const second = await start(target);
		const after = await ok(second.url, ["list", "--project", "CDE"], second.env);
		expect(JSON.parse(after.stdout)).toEqual(JSON.parse(before.stdout));
	});

	test("restore refuses while the server answers", async () => {
		const home = tempDir("restore-live");
		const { url } = await start(home);
		const result = await runProcess(["restore", join(home, "backup.tar.gz"), "--url", url], {
			TRELLIS_HOME: tempDir("restore-target"),
		});
		expect(result.code).toBe(4);
		expect(result.stderr).toContain("(SERVER_RUNNING)");
	});

	test("status prints the live health fields", async () => {
		const home = tempDir("status-home");
		const { url, env } = await start(home);
		const result = await ok(url, ["status"], env);
		const health = JSON.parse(result.stdout);
		for (const key of ["ok", "version", "apiVersion", "bootId", "rss", "db", "gh"]) {
			expect(health).toHaveProperty(key);
		}
	});
});

describe("local installation files", () => {
	test("install writes the shim and plist idempotently", async () => {
		const prefix = tempDir("install-prefix");
		const args = ["install", "--prefix", prefix, "--no-launchd"];
		const first = await runProcess(args);
		expect(first.code, first.stderr).toBe(0);
		expect(first.stdout).toContain("  trellis: 4521,");

		const shim = join(prefix, ".local", "bin", "trellis");
		const plist = join(prefix, "Library", "LaunchAgents", "com.trellis.server.plist");
		expect(readFileSync(shim, "utf8")).toBe(`#!/bin/sh\nexec /opt/homebrew/bin/bun "${cliEntry}" "$@"\n`);
		expect(statSync(shim).mode & 0o111).not.toBe(0);
		const plistText = readFileSync(plist, "utf8");
		for (const value of ["RunAtLoad", "KeepAlive", "SuccessfulExit", "ThrottleInterval", "TRELLIS_WEB_DIST"]) {
			expect(plistText).toContain(value);
		}

		const second = await runProcess(args);
		expect(second.code, second.stderr).toBe(0);
		expect(readFileSync(shim, "utf8")).toBe(`#!/bin/sh\nexec /opt/homebrew/bin/bun "${cliEntry}" "$@"\n`);
		expect(readFileSync(plist, "utf8")).toBe(plistText);
	});

	test("uninstall removes the installed files and leaves the data home", async () => {
		const prefix = tempDir("uninstall-prefix");
		const dataHome = tempDir("uninstall-data");
		mkdirSync(dataHome, { recursive: true });
		writeFileSync(join(dataHome, "keep"), "ticket data");
		const env = { TRELLIS_HOME: dataHome };
		expect((await runProcess(["install", "--prefix", prefix, "--no-launchd"], env)).code).toBe(0);

		const result = await runProcess(["uninstall", "--prefix", prefix, "--no-launchd"], env);
		expect(result.code, result.stderr).toBe(0);
		expect(existsSync(join(prefix, ".local", "bin", "trellis"))).toBe(false);
		expect(existsSync(join(prefix, "Library", "LaunchAgents", "com.trellis.server.plist"))).toBe(false);
		expect(readFileSync(join(dataHome, "keep"), "utf8")).toBe("ticket data");
	});

	test("logs prints the last lines and follows appended lines", async () => {
		const home = tempDir("logs-home");
		mkdirSync(home, { recursive: true });
		writeFileSync(join(home, "server.log"), "one\ntwo\nthree\n");
		const last = await runProcess(["logs", "--lines", "2"], { TRELLIS_HOME: home });
		expect(last.code, last.stderr).toBe(0);
		expect(last.stdout).toBe("two\nthree\n");

		const followed = await followLog(home, "four");
		expect(followed.code).toBe(0);
		expect(followed.stderr).toBe("");
		expect(followed.lines).toEqual(["three", "four"]);
	});
});
