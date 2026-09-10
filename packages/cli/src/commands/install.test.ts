import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { type CommandCall, defaultEnv, runCli } from "../../test/deps.ts";
import { repoRoot } from "../../test/process.ts";

const temp = (name: string) => mkdtempSync(join(process.env.TRELLIS_HOME!, `${name}-`));

// One run's data home and install root. Both sit under the TRELLIS_HOME of
// the test process, so no path in a test plist reaches ~/.trellis.
const setup = () => {
	const dataHome = temp("data");
	const prefix = temp("prefix");
	return {
		dataHome,
		prefix,
		env: { ...defaultEnv, TRELLIS_HOME: dataHome },
		plist: join(prefix, "Library", "LaunchAgents", "com.trellis.server.plist"),
		shim: join(prefix, ".local", "bin", "trellis"),
	};
};

const launchctlCalls = (commands: CommandCall[]) =>
	commands.map((call) => call.args).filter((args) => args[0] === "launchctl");

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

	test("the web build runs through the injected runner in apps/web", async () => {
		const { prefix, env } = setup();
		const result = await runCli(["install", "--prefix", prefix, "--no-launchd"], {}, { env });
		expect(result.commands).toEqual([{ args: [process.execPath, "run", "build"], cwd: join(repoRoot, "apps", "web") }]);
	});

	test("without --no-launchd it boots out and bootstraps the injected domain, then waits for health", async () => {
		const { prefix, env, plist } = setup();
		const asked: string[] = [];
		const fetch = async (request: Request) => {
			asked.push(new URL(request.url).pathname);
			return new Response("{}");
		};
		const result = await runCli(["install", "--prefix", prefix], {}, { env, launchdDomain: "gui/test", fetch });
		expect(result.code, result.stderr).toBe(0);
		expect(launchctlCalls(result.commands)).toEqual([
			["launchctl", "bootout", "gui/test/com.trellis.server"],
			["launchctl", "bootstrap", "gui/test", plist],
		]);
		expect(asked).toEqual(["/api/health"]);
	});

	test("a failed bootstrap fails as INSTALL_FAILED with the launchctl message", async () => {
		const { prefix, env } = setup();
		const run = async (args: string[]) =>
			args[1] === "bootstrap"
				? { code: 5, stderr: "Bootstrap failed: 5: Input/output error" }
				: { code: 0, stderr: "" };
		const result = await runCli(["install", "--prefix", prefix], {}, { env, launchdDomain: "gui/test", run });
		expect(result.code).toBe(1);
		expect(result.stderr).toContain("Bootstrap failed: 5: Input/output error");
		expect(result.stderr).toContain("(INSTALL_FAILED)");
	});
});
