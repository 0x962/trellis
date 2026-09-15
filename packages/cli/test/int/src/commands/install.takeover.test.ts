import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Deps } from "../../../../src/index.ts";
import { runCli, testCommit } from "../../../deps.ts";
import { launchctlCalls, setup } from "../../../installEnv.ts";
import { repoRoot } from "../../../process.ts";

// install replaces the launchd service com.trellis.server. The live service
// can run from another checkout, and an install that fails half way must not
// leave the server stopped.

const otherCheckout = "/Users/dana/projects/trellis-release";

// The plist that an install from `checkout` wrote.
const plistOf = (checkout: string) => `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>com.trellis.server</string>
	<key>ProgramArguments</key>
	<array>
		<string>/opt/homebrew/bin/bun</string>
		<string>${checkout}/apps/server/src/index.ts</string>
	</array>
	<key>EnvironmentVariables</key>
	<dict>
		<key>TRELLIS_COMMIT</key>
		<string>1111111111111111111111111111111111111111</string>
	</dict>
</dict>
</plist>
`;

const writeFile = (path: string, text: string) => {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, text);
};

// A `launchctl print` of a job that runs lists its pid.
const runningPrint = "gui/test/com.trellis.server = {\n\tstate = running\n\tpid = 4242\n}\n";

type Answer = { code: number; stdout: string; stderr: string };
const ok: Answer = { code: 0, stdout: "", stderr: "" };
const gone: Answer = { code: 113, stdout: "", stderr: "Could not find service" };

// A runner that records each call and gives each launchctl subcommand the
// answers in `launchctl`, in order. The last answer repeats. A subcommand
// with no answers succeeds, and `launchctl print` then finds no job.
const scriptedRun = (launchctl: Record<string, Answer[]>) => {
	const calls: string[][] = [];
	const run: Deps["run"] = async (args) => {
		calls.push(args);
		if (args[0] === "git") return { ...ok, stdout: `${testCommit}\n` };
		if (args[0] !== "launchctl") return ok;
		const answers = launchctl[args[1]!] ?? (args[1] === "print" ? [gone] : [ok]);
		return answers.length > 1 ? answers.shift()! : answers[0]!;
	};
	return { calls, run };
};

const healthy = async () => new Response("{}");

describe("install over an existing service", () => {
	test("a plist from another checkout stops the install and prints the checkout, the pid, the port, and the override command", async () => {
		const { prefix, env, plist, shim } = setup();
		writeFile(plist, plistOf(otherCheckout));
		const { calls, run } = scriptedRun({ print: [{ ...ok, stdout: runningPrint }] });

		const result = await runCli(["install", "--prefix", prefix], {}, { env, run, fetch: healthy });

		expect(result.code).toBe(1);
		expect(result.stderr).toContain(otherCheckout);
		expect(result.stderr).toContain("1111111111111111111111111111111111111111");
		expect(result.stderr).toContain(repoRoot);
		expect(result.stderr).toContain("pid 4242, port 4521");
		expect(result.stderr).toContain(`trellis install --prefix ${prefix} --force`);
		expect(result.stderr).toContain("(INSTALL_REFUSED)");
		expect(readFileSync(plist, "utf8")).toBe(plistOf(otherCheckout));
		expect(existsSync(shim)).toBe(false);
		expect(launchctlCalls(calls.map((args) => ({ args })))).toEqual([
			["launchctl", "print", "gui/test/com.trellis.server"],
		]);
		expect(calls.some((args) => args.includes("build"))).toBe(false);
	});

	test("a plist from another checkout whose job launchd does not hold stops the install and says the server is not running", async () => {
		const { prefix, env, plist } = setup();
		writeFile(plist, plistOf(otherCheckout));

		const result = await runCli(["install", "--prefix", prefix, "--no-launchd"], {}, { env });

		expect(result.code).toBe(1);
		expect(result.stderr).toContain("not running");
		expect(result.stderr).toContain(`trellis install --prefix ${prefix} --no-launchd --force`);
		expect(readFileSync(plist, "utf8")).toBe(plistOf(otherCheckout));
	});

	test("--force replaces the service of another checkout with this checkout", async () => {
		const { prefix, env, plist } = setup();
		writeFile(plist, plistOf(otherCheckout));
		const { calls, run } = scriptedRun({});

		const result = await runCli(["install", "--prefix", prefix, "--force"], {}, { env, run, fetch: healthy });

		expect(result.code, result.stderr).toBe(0);
		expect(readFileSync(plist, "utf8")).toContain(
			`<string>${join(repoRoot, "apps", "server", "src", "index.ts")}</string>`,
		);
		expect(launchctlCalls(calls.map((args) => ({ args })))).toEqual([
			["launchctl", "bootout", "gui/test/com.trellis.server"],
			["launchctl", "print", "gui/test/com.trellis.server"],
			["launchctl", "bootstrap", "gui/test", plist],
		]);
	});

	test("a plist from this checkout installs again with no --force", async () => {
		const { prefix, env, plist } = setup();
		writeFile(plist, plistOf(repoRoot));

		const result = await runCli(["install", "--prefix", prefix], {}, { env, fetch: healthy });

		expect(result.code, result.stderr).toBe(0);
		expect(readFileSync(plist, "utf8")).toContain(`<string>${testCommit}</string>`);
	});

	test("the plist records the checkout and the commit of the install", async () => {
		const { prefix, env, plist } = setup();

		const result = await runCli(["install", "--prefix", prefix, "--no-launchd"], {}, { env });

		expect(result.code, result.stderr).toBe(0);
		const text = readFileSync(plist, "utf8");
		expect(text).toContain(`<key>TRELLIS_CHECKOUT</key>\n\t\t<string>${repoRoot}</string>`);
		expect(text).toContain(`<key>TRELLIS_COMMIT</key>\n\t\t<string>${testCommit}</string>`);
	});

	test("a failed bootstrap restores the plist and the shim it replaced, starts that service again, and reports the failure", async () => {
		const { prefix, env, plist, shim } = setup();
		writeFile(plist, plistOf(otherCheckout));
		writeFile(shim, "#!/bin/sh\nexec old-trellis\n");
		const failed = { code: 5, stdout: "", stderr: "Bootstrap failed: 5: Input/output error" };
		const { calls, run } = scriptedRun({ bootstrap: [failed, ok] });
		const asked: string[] = [];
		const fetch = async (request: Request) => {
			asked.push(new URL(request.url).host);
			return new Response("{}");
		};

		const result = await runCli(["install", "--prefix", prefix, "--force"], {}, { env, run, fetch });

		expect(result.code).toBe(1);
		expect(result.stderr).toContain("Bootstrap failed: 5: Input/output error");
		expect(result.stderr).toContain("restored the previous service");
		expect(result.stderr).toContain("(INSTALL_FAILED)");
		expect(readFileSync(plist, "utf8")).toBe(plistOf(otherCheckout));
		expect(readFileSync(shim, "utf8")).toBe("#!/bin/sh\nexec old-trellis\n");
		const service = "gui/test/com.trellis.server";
		expect(launchctlCalls(calls.map((args) => ({ args })))).toEqual([
			["launchctl", "bootout", service],
			["launchctl", "print", service],
			["launchctl", "bootstrap", "gui/test", plist],
			["launchctl", "bootout", service],
			["launchctl", "print", service],
			["launchctl", "bootstrap", "gui/test", plist],
		]);
		expect(asked).toEqual(["127.0.0.1:4521"]);
	});

	// server.log of the outage held a "closed" line and no "listening" line
	// after it: launchd held the new job, and the server never answered.
	test("a server that never answers health restores the plist it replaced and reports the failure", async () => {
		const { prefix, env, plist } = setup();
		writeFile(plist, plistOf(repoRoot));
		const before = readFileSync(plist, "utf8");
		let asks = 0;
		const fetch = async () => {
			asks += 1;
			if (asks <= 50) throw new TypeError("Unable to connect");
			return new Response("{}");
		};

		const result = await runCli(["install", "--prefix", prefix], {}, { env, fetch });

		expect(result.code).toBe(5);
		expect(result.stderr).toContain("trellis server not running at http://127.0.0.1:4521");
		expect(result.stderr).toContain("restored the previous service");
		expect(readFileSync(plist, "utf8")).toBe(before);
	});

	test("a restore that fails too reports both failures", async () => {
		const { prefix, env, plist } = setup();
		writeFile(plist, plistOf(otherCheckout));
		const failed = { code: 5, stdout: "", stderr: "Bootstrap failed: 5: Input/output error" };
		const { run } = scriptedRun({ bootstrap: [failed] });

		const result = await runCli(["install", "--prefix", prefix, "--force"], {}, { env, run, fetch: healthy });

		expect(result.code).toBe(1);
		expect(result.stderr).toContain("could not restore the previous service");
		expect(result.stderr.match(/Bootstrap failed: 5/g)).toHaveLength(2);
		expect(readFileSync(plist, "utf8")).toBe(plistOf(otherCheckout));
	});
});
