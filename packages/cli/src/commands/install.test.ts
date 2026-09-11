import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { defaultEnv, makeDeps, runCli } from "../../test/deps.ts";
import { launchctlCalls, setup, temp } from "../../test/installEnv.ts";
import { cliEntry, repoRoot } from "../../test/process.ts";

describe("install", () => {
	test("--no-launchd writes the shim and the plist and runs no launchctl", async () => {
		const { prefix, env, plist, shim } = setup();
		const result = await runCli(["install", "--prefix", prefix, "--no-launchd"], {}, { env });
		expect(result.code, result.stderr).toBe(0);
		expect(launchctlCalls(result.commands)).toEqual([]);
		expect(statSync(shim).mode & 0o111).not.toBe(0);
		expect(readFileSync(plist, "utf8")).toContain("<string>com.trellis.server</string>");
	});

	test("the plist serves and logs the TRELLIS_HOME of the run and never names ~/.trellis", async () => {
		const { dataHome, prefix, env, plist } = setup();
		const result = await runCli(["install", "--prefix", prefix, "--no-launchd"], {}, { env });
		expect(result.code, result.stderr).toBe(0);
		const text = readFileSync(plist, "utf8");
		expect(text).toContain(`<key>TRELLIS_HOME</key>\n\t\t<string>${dataHome}</string>`);
		expect(text).toContain(`<string>${join(dataHome, "server.log")}</string>`);
		expect(text).not.toContain(join(homedir(), ".trellis"));
	});

	test("--host writes TRELLIS_HOST into the plist", async () => {
		const { prefix, env, plist } = setup();
		const result = await runCli(["install", "--prefix", prefix, "--no-launchd", "--host", "0.0.0.0"], {}, { env });
		expect(result.code, result.stderr).toBe(0);
		expect(readFileSync(plist, "utf8")).toContain("<key>TRELLIS_HOST</key>\n\t\t<string>0.0.0.0</string>");
	});

	// The server binds 127.0.0.1 when TRELLIS_HOST is unset.
	test("without --host the plist sets no TRELLIS_HOST", async () => {
		const { prefix, env, plist } = setup();
		const result = await runCli(["install", "--prefix", prefix, "--no-launchd"], {}, { env });
		expect(result.code, result.stderr).toBe(0);
		expect(readFileSync(plist, "utf8")).not.toContain("TRELLIS_HOST");
	});

	test("each --allow-host joins TRELLIS_ALLOWED_HOSTS in the plist", async () => {
		const { prefix, env, plist } = setup();
		const args = ["--allow-host", "my-laptop.tail1a2b3c.ts.net", "--allow-host", "mac.example"];
		const result = await runCli(["install", "--prefix", prefix, "--no-launchd", ...args], {}, { env });
		expect(result.code, result.stderr).toBe(0);
		expect(readFileSync(plist, "utf8")).toContain(
			"<key>TRELLIS_ALLOWED_HOSTS</key>\n\t\t<string>my-laptop.tail1a2b3c.ts.net,mac.example</string>",
		);
	});

	test("without --allow-host the plist sets no TRELLIS_ALLOWED_HOSTS", async () => {
		const { prefix, env, plist } = setup();
		const result = await runCli(["install", "--prefix", prefix, "--no-launchd"], {}, { env });
		expect(result.code, result.stderr).toBe(0);
		expect(readFileSync(plist, "utf8")).not.toContain("TRELLIS_ALLOWED_HOSTS");
	});

	test("the web build runs through the injected runner in apps/web", async () => {
		const { prefix, env } = setup();
		const result = await runCli(["install", "--prefix", prefix, "--no-launchd"], {}, { env });
		expect(result.commands).toEqual([{ args: [process.execPath, "run", "build"], cwd: join(repoRoot, "apps", "web") }]);
	});

	test("without --no-launchd it boots out and bootstraps the injected domain, then waits for health", async () => {
		const { prefix, env, plist } = setup();
		const asked: string[] = [];
		const fetch = async (request: Request) => {
			const url = new URL(request.url);
			asked.push(`${url.host}${url.pathname}`);
			return new Response("{}");
		};
		const result = await runCli(["install", "--prefix", prefix], {}, { env, launchdDomain: "gui/test", fetch });
		expect(result.code, result.stderr).toBe(0);
		expect(launchctlCalls(result.commands)).toEqual([
			["launchctl", "bootout", "gui/test/com.trellis.server"],
			["launchctl", "print", "gui/test/com.trellis.server"],
			["launchctl", "bootstrap", "gui/test", plist],
		]);
		expect(asked).toEqual(["127.0.0.1:4521/api/health", "127.0.0.1/api/health"]);
	});

	// launchctl bootout returns before launchd removes the job. A bootstrap
	// of the label while the job is still there fails with "Bootstrap failed:
	// 5" and leaves the server stopped.
	test("a job that stays loaded after bootout delays the bootstrap until launchctl print no longer finds it", async () => {
		const { prefix, env, plist } = setup();
		const calls: string[][] = [];
		let prints = 0;
		const run = async (args: string[]) => {
			calls.push(args);
			if (args[1] !== "print") return { code: 0, stderr: "" };
			prints += 1;
			return prints <= 2 ? { code: 0, stderr: "" } : { code: 113, stderr: "Could not find service" };
		};
		const fetch = async () => new Response("{}");
		const result = await runCli(["install", "--prefix", prefix], {}, { env, launchdDomain: "gui/test", run, fetch });
		expect(result.code, result.stderr).toBe(0);
		expect(calls.filter((args) => args[0] === "launchctl")).toEqual([
			["launchctl", "bootout", "gui/test/com.trellis.server"],
			["launchctl", "print", "gui/test/com.trellis.server"],
			["launchctl", "print", "gui/test/com.trellis.server"],
			["launchctl", "print", "gui/test/com.trellis.server"],
			["launchctl", "bootstrap", "gui/test", plist],
		]);
		expect(result.sleeps).toEqual([200, 200]);
	});

	test("a job that launchctl print still finds after 5 s fails as INSTALL_FAILED with no bootstrap", async () => {
		const { prefix, env } = setup();
		const calls: string[][] = [];
		const run = async (args: string[]) => {
			calls.push(args);
			return { code: 0, stderr: "" };
		};
		const result = await runCli(["install", "--prefix", prefix], {}, { env, launchdDomain: "gui/test", run });
		expect(result.code).toBe(1);
		expect(result.stderr).toContain("gui/test/com.trellis.server");
		expect(result.stderr).toContain("(INSTALL_FAILED)");
		expect(calls.some((args) => args[1] === "bootstrap")).toBe(false);
		expect(result.sleeps.reduce((sum, ms) => sum + ms, 0)).toBe(5000);
	});

	// process.execPath names the versioned Homebrew Cellar directory, which a
	// brew upgrade deletes. The bun on PATH is a symlink that the upgrade
	// moves to the new version, so the agent keeps a program to run.
	test("the plist runs the stable bun path that which finds on PATH", async () => {
		const { prefix, env, plist } = setup();
		const asked: string[] = [];
		const which = (name: string) => {
			asked.push(name);
			return "/stable/bin/bun";
		};
		const result = await runCli(["install", "--prefix", prefix, "--no-launchd"], {}, { env, which });
		expect(result.code, result.stderr).toBe(0);
		expect(asked).toEqual(["bun"]);
		const text = readFileSync(plist, "utf8");
		expect(text).toContain("<array>\n\t\t<string>/stable/bin/bun</string>");
		expect(text).toContain("<key>PATH</key>\n\t\t<string>/stable/bin:");
		expect(text).not.toContain(process.execPath);
	});

	// A bun from the bun.sh installer sits in ~/.bun/bin, and an Intel
	// Homebrew bun in /usr/local/bin. The shim runs the bun that the plist
	// runs, so every `trellis` command finds a program on each machine.
	test("the shim runs the bun that which finds on PATH", async () => {
		const { prefix, env, shim } = setup();
		const which = () => "/Users/me/.bun/bin/bun";
		const result = await runCli(["install", "--prefix", prefix, "--no-launchd"], {}, { env, which });
		expect(result.code, result.stderr).toBe(0);
		expect(readFileSync(shim, "utf8")).toBe(`#!/bin/sh\nexec "/Users/me/.bun/bin/bun" "${cliEntry}" "$@"\n`);
	});

	test("a bun that is not on PATH fails the install as INSTALL_FAILED", async () => {
		const { prefix, env, plist } = setup();
		const result = await runCli(["install", "--prefix", prefix, "--no-launchd"], {}, { env, which: () => null });
		expect(result.code).toBe(1);
		expect(result.stderr).toContain("bun is not on PATH");
		expect(result.stderr).toContain("(INSTALL_FAILED)");
		expect(existsSync(plist)).toBe(false);
	});

	test("the test deps inject a user home under the TRELLIS_HOME of the test process", () => {
		const { deps } = makeDeps();
		expect(deps.home.startsWith(process.env.TRELLIS_HOME!)).toBe(true);
		expect(deps.home).not.toBe(homedir());
	});

	test("without --prefix every install file lands under the injected home", async () => {
		const home = temp("user");
		const result = await runCli(["install", "--no-launchd"], {}, { env: defaultEnv, home });
		expect(result.code, result.stderr).toBe(0);
		const plist = join(home, "Library", "LaunchAgents", "com.trellis.server.plist");
		expect(existsSync(plist)).toBe(true);
		expect(existsSync(join(home, ".local", "bin", "trellis"))).toBe(true);
		expect(readFileSync(plist, "utf8")).toContain(`<string>${join(home, ".trellis")}</string>`);
		const routes = join(home, ".config", "localhost-gateway", "routes.json");
		expect(JSON.parse(readFileSync(routes, "utf8"))).toEqual({ trellis: 4521 });
	});

	test("a failed bootstrap fails as INSTALL_FAILED with the launchctl message", async () => {
		const { prefix, env } = setup();
		const run = async (args: string[]) => {
			if (args[1] === "bootstrap") return { code: 5, stderr: "Bootstrap failed: 5: Input/output error" };
			if (args[1] === "print") return { code: 113, stderr: "Could not find service" };
			return { code: 0, stderr: "" };
		};
		const result = await runCli(["install", "--prefix", prefix], {}, { env, launchdDomain: "gui/test", run });
		expect(result.code).toBe(1);
		expect(result.stderr).toContain("Bootstrap failed: 5: Input/output error");
		expect(result.stderr).toContain("(INSTALL_FAILED)");
	});
});
