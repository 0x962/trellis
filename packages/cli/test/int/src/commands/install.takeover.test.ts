import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Deps } from "../../../../src/index.ts";
import { runCli, testCommit } from "../../../deps.ts";
import { healthFrom, launchctlCalls, setup } from "../../../installEnv.ts";
import { repoRoot } from "../../../process.ts";

// install replaces the launchd service com.trellis.server. The live service
// can run from another checkout, another process can hold the port, and an
// install that fails half way must not leave the server stopped.

const otherCheckout = "/Users/dana/projects/trellis-release";
const service = "gui/test/com.trellis.server";
const serverEntry = join(repoRoot, "apps", "server", "src", "index.ts");

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
const bootstrapFailed: Answer = { code: 5, stdout: "", stderr: "Bootstrap failed: 5: Input/output error" };

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

const launchctlOf = (calls: string[][]) => launchctlCalls(calls.map((args) => ({ args })));

const answersFrom = (checkout: string | null) => async () => healthFrom(checkout);

const refused = async (): Promise<Response> => {
	throw new TypeError("Unable to connect");
};

// Refuses the first `polls` health requests, then answers from `checkout`.
const answersAfter = (polls: number, checkout: string) => {
	let asked = 0;
	return async () => {
		asked += 1;
		return asked <= polls ? refused() : healthFrom(checkout);
	};
};

const slept = (sleeps: number[]) => sleeps.reduce((sum, ms) => sum + ms, 0);

describe("install over an existing service", () => {
	test("a plist from another checkout stops the install and prints the checkout, the pid, the port, the answering server, and the override command", async () => {
		const { prefix, env, plist, shim } = setup();
		writeFile(plist, plistOf(otherCheckout));
		const { calls, run } = scriptedRun({ print: [{ ...ok, stdout: runningPrint }] });

		const result = await runCli(["install", "--prefix", prefix], {}, { env, run, fetch: answersFrom(otherCheckout) });

		expect(result.code).toBe(1);
		expect(result.stderr).toContain(`checkout:       ${otherCheckout}`);
		expect(result.stderr).toContain("1111111111111111111111111111111111111111");
		expect(result.stderr).toContain(repoRoot);
		expect(result.stderr).toContain("pid 4242, port 4521");
		expect(result.stderr).toContain(`http://127.0.0.1:4521: the server that answers runs ${otherCheckout}`);
		expect(result.stderr).toContain(`trellis install --prefix ${prefix} --force`);
		expect(result.stderr).toContain("(INSTALL_REFUSED)");
		expect(readFileSync(plist, "utf8")).toBe(plistOf(otherCheckout));
		expect(existsSync(shim)).toBe(false);
		expect(launchctlOf(calls)).toEqual([["launchctl", "print", service]]);
		expect(calls.some((args) => args.includes("build"))).toBe(false);
	});

	// A process that launchd does not manage can hold the port. The refusal
	// names what answers there.
	test("a plist from another checkout whose job launchd does not hold stops the install and says the job is not running", async () => {
		const { prefix, env, plist } = setup();
		writeFile(plist, plistOf(otherCheckout));

		const result = await runCli(["install", "--prefix", prefix, "--no-launchd"], {}, { env, fetch: refused });

		expect(result.code).toBe(1);
		expect(result.stderr).toContain("launchd job:    not running");
		expect(result.stderr).toContain("http://127.0.0.1:4521: no server answers");
		expect(result.stderr).toContain(`trellis install --prefix ${prefix} --no-launchd --force`);
		expect(readFileSync(plist, "utf8")).toBe(plistOf(otherCheckout));
	});

	test("--force replaces the service of another checkout with this checkout", async () => {
		const { prefix, env, plist } = setup();
		writeFile(plist, plistOf(otherCheckout));
		const { calls, run } = scriptedRun({});

		const result = await runCli(
			["install", "--prefix", prefix, "--force"],
			{},
			{ env, run, fetch: answersFrom(repoRoot) },
		);

		expect(result.code, result.stderr).toBe(0);
		expect(readFileSync(plist, "utf8")).toContain(`<string>${serverEntry}</string>`);
		expect(launchctlOf(calls)).toEqual([
			["launchctl", "bootout", service],
			["launchctl", "print", service],
			["launchctl", "bootstrap", "gui/test", plist],
		]);
	});

	test("a plist from this checkout installs again with no --force", async () => {
		const { prefix, env, plist } = setup();
		writeFile(plist, plistOf(repoRoot));

		const result = await runCli(["install", "--prefix", prefix], {}, { env, fetch: answersFrom(repoRoot) });

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
});

describe("install waits for its own server", () => {
	// A boot of the launchd server on a data home in daily use takes about
	// 30 s.
	test("a server that answers after 30 s of boot is a success and gets no restore", async () => {
		const { prefix, env, plist } = setup();
		writeFile(plist, plistOf(repoRoot));
		const { calls, run } = scriptedRun({});

		const result = await runCli(["install", "--prefix", prefix], {}, { env, run, fetch: answersAfter(150, repoRoot) });

		expect(result.code, result.stderr).toBe(0);
		expect(launchctlOf(calls)).toEqual([
			["launchctl", "bootout", service],
			["launchctl", "print", service],
			["launchctl", "bootstrap", "gui/test", plist],
		]);
		expect(slept(result.sleeps)).toBe(30_000);
	});

	// The desktop app can hold port 4521. The new server then cannot bind the
	// port, and the answer of the desktop server must not count as success.
	test("an answer from a server of another checkout on the port is not a success", async () => {
		const { prefix, env } = setup();

		const result = await runCli(["install", "--prefix", prefix], {}, { env, fetch: answersFrom(otherCheckout) });

		expect(result.code).toBe(5);
		expect(result.stderr).toContain(`the server that answers runs ${otherCheckout}`);
		expect(result.stdout).not.toContain("trellis: http");
	});

	test("an answer that names no checkout is not a success for the new server", async () => {
		const { prefix, env } = setup();

		const result = await runCli(["install", "--prefix", prefix], {}, { env, fetch: answersFrom(null) });

		expect(result.code).toBe(5);
		expect(result.stderr).toContain("a server answers with HTTP 200 and names no checkout");
	});

	// The new server can be in the middle of its migrations when the wait
	// ends. A restore then would stop it, and would start the old checkout on
	// the schema that the new server migrated.
	test("a server that never answers keeps its job: install starts no old checkout and names the log", async () => {
		const { dataHome, prefix, env, plist } = setup();
		writeFile(plist, plistOf(otherCheckout));
		const { calls, run } = scriptedRun({});

		const result = await runCli(["install", "--prefix", prefix, "--force"], {}, { env, run, fetch: refused });

		expect(result.code).toBe(5);
		expect(result.stderr).toContain("did not answer at http://127.0.0.1:4521 in 60 s: no server answers");
		expect(result.stderr).toContain("launchd keeps the new job");
		expect(result.stderr).toContain(join(dataHome, "server.log"));
		expect(result.stderr).not.toContain("restore");
		expect(readFileSync(plist, "utf8")).toContain(`<string>${serverEntry}</string>`);
		expect(launchctlOf(calls)).toEqual([
			["launchctl", "bootout", service],
			["launchctl", "print", service],
			["launchctl", "bootstrap", "gui/test", plist],
		]);
		expect(slept(result.sleeps)).toBe(60_000);
	});
});

// The desktop release on port 4521 answers health with HTTP 401 when a
// request carries no host token.
describe("install names the status of a server that refuses health", () => {
	const unauthorized = async () => new Response("The Trellis host token is missing or incorrect", { status: 401 });

	test("the refusal names a server that answers with HTTP 401", async () => {
		const { prefix, env, plist } = setup();
		writeFile(plist, plistOf(otherCheckout));

		const result = await runCli(["install", "--prefix", prefix, "--no-launchd"], {}, { env, fetch: unauthorized });

		expect(result.code).toBe(1);
		expect(result.stderr).toContain("http://127.0.0.1:4521: a server answers with HTTP 401 and names no checkout");
		expect(result.stderr).not.toContain("no server answers");
	});

	test("a 401 answer is not a success, and the timeout names its status", async () => {
		const { prefix, env } = setup();

		const result = await runCli(["install", "--prefix", prefix], {}, { env, fetch: unauthorized });

		expect(result.code).toBe(5);
		expect(result.stderr).toContain("in 60 s: a server answers with HTTP 401 and names no checkout");
		expect(result.stdout).not.toContain("trellis: http");
	});
});

describe("install restores the service it replaced", () => {
	test("a failed bootstrap restores the plist and the shim it replaced, starts that service again, and reports the failure", async () => {
		const { prefix, env, plist, shim } = setup();
		writeFile(plist, plistOf(otherCheckout));
		writeFile(shim, "#!/bin/sh\nexec old-trellis\n");
		const { calls, run } = scriptedRun({ bootstrap: [bootstrapFailed, ok] });
		const asked: string[] = [];
		const fetch = async (request: Request) => {
			asked.push(new URL(request.url).host);
			return healthFrom(otherCheckout);
		};

		const result = await runCli(["install", "--prefix", prefix, "--force"], {}, { env, run, fetch });

		expect(result.code).toBe(1);
		expect(result.stderr).toContain("Bootstrap failed: 5: Input/output error");
		expect(result.stderr).toContain("install restored the previous service");
		expect(result.stderr).toContain("(INSTALL_FAILED)");
		expect(readFileSync(plist, "utf8")).toBe(plistOf(otherCheckout));
		expect(readFileSync(shim, "utf8")).toBe("#!/bin/sh\nexec old-trellis\n");
		expect(launchctlOf(calls)).toEqual([
			["launchctl", "bootout", service],
			["launchctl", "print", service],
			["launchctl", "bootstrap", "gui/test", plist],
			["launchctl", "bootout", service],
			["launchctl", "print", service],
			["launchctl", "bootstrap", "gui/test", plist],
		]);
		expect(asked).toEqual(["127.0.0.1:4521"]);
	});

	// A server of an earlier release sends no `source` in its health answer.
	test("a restored server of an earlier release that names no checkout counts as restored", async () => {
		const { prefix, env, plist } = setup();
		writeFile(plist, plistOf(otherCheckout));
		const { run } = scriptedRun({ bootstrap: [bootstrapFailed, ok] });

		const result = await runCli(["install", "--prefix", prefix, "--force"], {}, { env, run, fetch: answersFrom(null) });

		expect(result.code).toBe(1);
		expect(result.stderr).toContain("install restored the previous service");
	});

	test("a restore that fails too reports both failures", async () => {
		const { prefix, env, plist } = setup();
		writeFile(plist, plistOf(otherCheckout));
		const { run } = scriptedRun({ bootstrap: [bootstrapFailed] });

		const result = await runCli(
			["install", "--prefix", prefix, "--force"],
			{},
			{ env, run, fetch: answersFrom(otherCheckout) },
		);

		expect(result.code).toBe(1);
		expect(result.stderr).toContain("could not restore the previous service");
		expect(result.stderr.match(/Bootstrap failed: 5/g)).toHaveLength(2);
		expect(readFileSync(plist, "utf8")).toBe(plistOf(otherCheckout));
	});
});
