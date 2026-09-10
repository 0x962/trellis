import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { type CommandCall, defaultEnv, lines, makeDeps, runCli } from "../../test/deps.ts";
import { cliEntry, repoRoot } from "../../test/process.ts";

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
		const args = ["--allow-host", "canary-jqv57w1hpl.tail4a5b4c.ts.net", "--allow-host", "mac.example"];
		const result = await runCli(["install", "--prefix", prefix, "--no-launchd", ...args], {}, { env });
		expect(result.code, result.stderr).toBe(0);
		expect(readFileSync(plist, "utf8")).toContain(
			"<key>TRELLIS_ALLOWED_HOSTS</key>\n\t\t<string>canary-jqv57w1hpl.tail4a5b4c.ts.net,mac.example</string>",
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
		expect(asked).toEqual(["bun", "superset"]);
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

	// launchd starts the server with a PATH that holds only the bun directory
	// and the system directories. The Superset CLI sits in ~/.superset/bin, so
	// the plist names it by the path that `which` finds. That path is a
	// symlink, and an update of the Superset CLI moves its target.
	test("the plist names the superset path that which finds on PATH, with no symlink resolved", async () => {
		const { prefix, env, plist } = setup();
		const dir = temp("superset");
		const target = join(dir, "superset-1.27");
		const link = join(dir, "bin", "superset");
		writeFileSync(target, "#!/bin/sh\n");
		mkdirSync(dirname(link));
		symlinkSync(target, link);
		const which = (name: string) => (name === "superset" ? link : "/stable/bin/bun");
		const result = await runCli(["install", "--prefix", prefix, "--no-launchd"], {}, { env, which });
		expect(result.code, result.stderr).toBe(0);
		const text = readFileSync(plist, "utf8");
		expect(text).toContain(`<key>TRELLIS_SUPERSET_BIN</key>\n\t\t<string>${link}</string>`);
		expect(text).not.toContain(target);
	});

	test("without superset on PATH the plist sets no TRELLIS_SUPERSET_BIN and install prints one line about agents", async () => {
		const { prefix, env, plist } = setup();
		const which = (name: string) => (name === "bun" ? "/stable/bin/bun" : null);
		const result = await runCli(["install", "--prefix", prefix, "--no-launchd"], {}, { env, which });
		expect(result.code, result.stderr).toBe(0);
		expect(readFileSync(plist, "utf8")).not.toContain("TRELLIS_SUPERSET_BIN");
		const warnings = lines(`${result.stdout}${result.stderr}`).filter((line) => line.includes("Superset CLI"));
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("agents need the Superset CLI");
	});

	test("--superset-bin writes that path into the plist and skips the lookup", async () => {
		const { prefix, env, plist } = setup();
		const asked: string[] = [];
		const which = (name: string) => {
			asked.push(name);
			return `/test/bin/${name}`;
		};
		const args = ["--superset-bin", "/opt/superset/bin/superset"];
		const result = await runCli(["install", "--prefix", prefix, "--no-launchd", ...args], {}, { env, which });
		expect(result.code, result.stderr).toBe(0);
		expect(asked).toEqual(["bun"]);
		expect(readFileSync(plist, "utf8")).toContain(
			"<key>TRELLIS_SUPERSET_BIN</key>\n\t\t<string>/opt/superset/bin/superset</string>",
		);
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
	});

	test("--gateway edits the margin gateway under the injected home", async () => {
		const home = temp("user");
		const gateway = join(home, "projects", "margin", "src", "gateway.ts");
		mkdirSync(dirname(gateway), { recursive: true });
		writeFileSync(gateway, "const ROUTES: Record<string, number> = {\n\tmargin: 4519,\n};\n");
		const result = await runCli(["install", "--gateway", "--no-launchd"], {}, { env: defaultEnv, home });
		expect(result.code, result.stderr).toBe(0);
		expect(readFileSync(gateway, "utf8")).toContain("trellis: 4521,");
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
