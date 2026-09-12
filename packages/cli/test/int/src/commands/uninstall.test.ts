import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { defaultEnv, runCli } from "../../../deps.ts";

const temp = (name: string) => mkdtempSync(join(process.env.TRELLIS_HOME!, `${name}-`));

// Installs the files under a fresh install root with --no-launchd and puts
// one file in the data home that uninstall must keep.
const installed = async () => {
	const dataHome = temp("data");
	const prefix = temp("prefix");
	const env = { ...defaultEnv, TRELLIS_HOME: dataHome };
	writeFileSync(join(dataHome, "keep"), "ticket data");
	expect((await runCli(["install", "--prefix", prefix, "--no-launchd"], {}, { env })).code).toBe(0);
	return {
		dataHome,
		prefix,
		env,
		plist: join(prefix, "Library", "LaunchAgents", "com.trellis.server.plist"),
		shim: join(prefix, ".local", "bin", "trellis"),
		routes: join(prefix, ".config", "localhost-gateway", "routes.json"),
	};
};

describe("uninstall", () => {
	test("--no-launchd removes the shim and the plist, runs no launchctl, and keeps the data home", async () => {
		const { dataHome, prefix, env, plist, shim } = await installed();
		const result = await runCli(["uninstall", "--prefix", prefix, "--no-launchd"], {}, { env });
		expect(result.code, result.stderr).toBe(0);
		expect(result.commands).toEqual([]);
		expect(existsSync(shim)).toBe(false);
		expect(existsSync(plist)).toBe(false);
		expect(readFileSync(join(dataHome, "keep"), "utf8")).toBe("ticket data");
	});

	test("without --no-launchd it boots out the agent in the injected domain", async () => {
		const { prefix, env } = await installed();
		const result = await runCli(["uninstall", "--prefix", prefix], {}, { env, launchdDomain: "gui/test" });
		expect(result.code, result.stderr).toBe(0);
		expect(result.commands).toEqual([{ args: ["launchctl", "bootout", "gui/test/com.trellis.server"] }]);
	});

	test("uninstall removes the trellis route from the gateway routes file and keeps the other routes", async () => {
		const { prefix, env, routes } = await installed();
		mkdirSync(dirname(routes), { recursive: true });
		writeFileSync(routes, JSON.stringify({ docs: 4519, trellis: 4521 }));
		const result = await runCli(["uninstall", "--prefix", prefix, "--no-launchd"], {}, { env });
		expect(result.code, result.stderr).toBe(0);
		expect(JSON.parse(readFileSync(routes, "utf8"))).toEqual({ docs: 4519 });
	});

	test("uninstall writes no routes file when none exists", async () => {
		const { prefix, env, routes } = await installed();
		rmSync(routes, { force: true });
		const result = await runCli(["uninstall", "--prefix", prefix, "--no-launchd"], {}, { env });
		expect(result.code, result.stderr).toBe(0);
		expect(existsSync(routes)).toBe(false);
	});
});
