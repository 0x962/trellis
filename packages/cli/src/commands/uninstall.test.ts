import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaultEnv, runCli } from "../../test/deps.ts";

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
});
