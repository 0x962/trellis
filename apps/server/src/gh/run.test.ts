import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { ghStub } from "../../test/helpers/gh-stub.ts";
import { createGhRunner } from "./run.ts";

// createGhRunner() returns the runner as a callable: runGh(kind, args). It
// carries `bin` and `timeoutMs` as properties. Every test points the runner at
// test/stubs/gh.ts through ghStub and restores the env afterwards.
const scratch = () => mkdtempSync(join(process.env.TRELLIS_HOME!, "gh-run-"));
const restores: Array<() => void> = [];
afterEach(() => {
	for (const restore of restores.splice(0)) restore();
});
const stub = (replies: Parameters<typeof ghStub>[1]) => {
	const handle = ghStub(scratch(), replies);
	restores.push(handle.restore);
	return handle;
};

const notLoggedIn = "You are not logged into any GitHub hosts. To log in, run: gh auth login";

describe("runGh", () => {
	test("runs TRELLIS_GH_BIN with the given args and returns code, stdout, stderr", async () => {
		const handle = stub({ "api graphql": { stdout: "{}", stderr: "", exitCode: 0 } });
		const runGh = createGhRunner();
		const result = await runGh("poller", ["api", "graphql"]);
		expect(result).toEqual({ ok: true, code: 0, stdout: "{}", stderr: "" });
		expect(handle.spawns()).toHaveLength(1);
		expect(handle.spawns()[0]!.args).toEqual(["api", "graphql"]);
	});

	test("defaults the binary to gh when TRELLIS_GH_BIN is unset", () => {
		const saved = process.env.TRELLIS_GH_BIN;
		delete process.env.TRELLIS_GH_BIN;
		restores.push(() => {
			if (saved !== undefined) process.env.TRELLIS_GH_BIN = saved;
		});
		expect(createGhRunner().bin).toBe("gh");
	});

	test("passes GH_PROMPT_DISABLED=1 and NO_COLOR=1 to the child on top of process.env", async () => {
		const handle = stub({ "auth status": { stdout: "ok", stderr: "", exitCode: 0 } });
		await createGhRunner()("poller", ["auth", "status"]);
		const [spawn] = handle.spawns();
		expect(spawn!.env.GH_PROMPT_DISABLED).toBe("1");
		expect(spawn!.env.NO_COLOR).toBe("1");
		expect(spawn!.env.PATH).toBe(process.env.PATH!);
	});

	test("classifies ENOENT on spawn as missing", async () => {
		const handle = stub({});
		const missing = join(scratch(), "missing-gh");
		process.env.TRELLIS_GH_BIN = missing;
		const result = await createGhRunner()("poller", ["auth", "status"]);
		expect(result).toMatchObject({ ok: false, reason: "missing" });
		expect((result as { message: string }).message).toContain(missing);
		expect(handle.spawns()).toEqual([]);
	});

	test("classifies a stderr that contains gh auth login as unauthenticated", async () => {
		stub({ "auth status": { stdout: "", stderr: notLoggedIn, exitCode: 1 } });
		const result = await createGhRunner()("poller", ["auth", "status"]);
		expect(result).toMatchObject({ ok: false, reason: "unauthenticated", message: notLoggedIn });
	});

	// gh prints "gh auth login" only when no host is signed in. A stored token
	// that GitHub rejects gives an HTTP 401 with "Bad credentials" instead. Both
	// mean the person must sign in again, so both give the unauthenticated
	// reason and the one sign-in banner.
	test("classifies an HTTP 401 from a rejected token as unauthenticated", async () => {
		for (const stderr of [
			"gh: Bad credentials (HTTP 401)",
			"HTTP 401: Bad credentials (https://api.github.com/graphql)",
		]) {
			stub({ "api graphql": { stdout: "", stderr, exitCode: 1 } });
			const result = await createGhRunner()("poller", ["api", "graphql"]);
			expect(result, stderr).toEqual({ ok: false, reason: "unauthenticated", message: stderr });
		}
	});

	test("classifies a non-zero exit with any other stderr as error and keeps the stderr as the message", async () => {
		stub({ "api graphql": { stdout: "", stderr: "HTTP 502: Bad Gateway", exitCode: 1 } });
		const result = await createGhRunner()("poller", ["api", "graphql"]);
		expect(result).toMatchObject({ ok: false, reason: "error", message: "HTTP 502: Bad Gateway", code: 1, stdout: "" });
	});

	test("kills the child and returns error when the timeout passes", async () => {
		const handle = stub({ "auth status": { stdout: "late", stderr: "", exitCode: 0, delayMs: 5000 } });
		const started = Date.now();
		const result = await createGhRunner({ timeoutMs: 100 })("poller", ["auth", "status"]);
		expect(Date.now() - started).toBeLessThan(1000);
		expect(result).toMatchObject({ ok: false, reason: "error" });
		expect((result as { message: string }).message).toContain("timeout");
		// A killed child that the runner has awaited is reaped, so a signal 0
		// probe to its pid throws ESRCH.
		await Bun.sleep(50);
		const { pid } = handle.spawns()[0]!;
		expect(() => process.kill(pid, 0)).toThrow();
	});

	test("defaults the timeout to 30 s", () => {
		expect(createGhRunner().timeoutMs).toBe(30_000);
	});
});
