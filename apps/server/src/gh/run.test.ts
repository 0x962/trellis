import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGhRunner } from "./run.ts";

let directory: string;
let configuredBin: string | undefined;
const controllers: AbortController[] = [];

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), "trellis-gh-run-"));
	configuredBin = process.env.TRELLIS_GH_BIN;
	delete process.env.TRELLIS_GH_BIN;
});

afterEach(async () => {
	for (const controller of controllers.splice(0)) controller.abort();
	if (configuredBin === undefined) delete process.env.TRELLIS_GH_BIN;
	else process.env.TRELLIS_GH_BIN = configuredBin;
	await rm(directory, { recursive: true, force: true });
});

function runner(timeoutMs?: number) {
	const controller = new AbortController();
	controllers.push(controller);
	const gh = createGhRunner({
		timeoutMs,
		signal: controller.signal,
		environment: async () => ({ TRELLIS_GH_BIN: process.execPath }),
	});
	return { gh, controller };
}

function script(name: string, delay: number) {
	const path = join(directory, name);
	return {
		path,
		args: [
			"-e",
			`console.log(process.pid);
await Bun.write(${JSON.stringify(path)}, String(process.pid));
await Bun.sleep(${delay});
console.log("complete");`,
		],
	};
}

async function started(path: string) {
	while (!(await Bun.file(path).exists())) await Bun.sleep(10);
	return Number(await Bun.file(path).text());
}

function expectExited(pid: number) {
	expect(() => process.kill(pid, 0)).toThrow();
}

test.each([0, 7])("reads complete output from both pipes with exit code %i", async (code) => {
	const { gh } = runner();
	const stdout = JSON.stringify({ message: `${"x".repeat(4078)}é漢🚀${"tail".repeat(100_000)}` });
	const stderr = `${"d".repeat(4090)}é漢🚀${"diagnostic".repeat(30_000)}`;
	await Bun.write(join(directory, "stdout"), stdout);
	await Bun.write(join(directory, "stderr"), stderr);
	const result = await gh("interactive", [
		"-e",
		`import { readFileSync, writeSync } from "node:fs";
const output = readFileSync(process.argv[1]);
const error = readFileSync(process.argv[2]);
writeSync(1, output.subarray(0, 4091));
writeSync(2, error.subarray(0, 4091));
await Bun.sleep(20);
for (const [fd, bytes] of [[1, output], [2, error]]) {
	let offset = 4091;
	while (offset < bytes.length) offset += writeSync(fd, bytes.subarray(offset, offset + 16384));
}
process.exit(Number(process.argv[3]));`,
		join(directory, "stdout"),
		join(directory, "stderr"),
		String(code),
	]);
	if (code === 0) expect(result).toEqual({ ok: true, code, stdout, stderr });
	else expect(result).toEqual({ ok: false, reason: "error", code, stdout, message: stderr });
});

test("a default command completes after the former 30 second deadline", async () => {
	const { gh } = runner();
	const command = script("slow", 30_100);
	expect(gh.timeoutMs).toBeUndefined();
	const result = await gh("interactive", command.args);
	expect(result.ok).toBe(true);
	if (!result.ok) throw new Error(result.message);
	expect(result.stdout).toContain("complete");
	expectExited(Number(await Bun.file(command.path).text()));
}, 60_000);

test("caller cancellation waits for process exit and retains its output", async () => {
	const { gh, controller } = runner();
	const command = script("cancel", 60_000);
	const pending = gh("interactive", command.args);
	const pid = await started(command.path);
	controller.abort();
	const result = await pending;
	expect(result).toMatchObject({ ok: false, reason: "error", code: null });
	if (result.ok) throw new Error("Expected cancellation");
	expect(result.message).toContain("canceled");
	if (result.reason === "error") expect(result.stdout).toContain(String(pid));
	expectExited(pid);
});

test("a caller-selected deadline stops the command", async () => {
	const { gh } = runner(1000);
	const command = script("timeout", 60_000);
	const result = await gh("poller", command.args);
	expect(result).toMatchObject({ ok: false, reason: "error", code: null });
	if (result.ok) throw new Error("Expected a timeout");
	expect(result.message).toContain("timeout of 1000 ms");
	expectExited(Number(await Bun.file(command.path).text()));
});

test("a canceled queued command never starts and leaves the queue usable", async () => {
	const first = runner();
	const second = runner();
	const waiting = runner();
	const a = script("first", 60_000);
	const b = script("second", 60_000);
	const canceled = script("queued", 0);
	const running = [first.gh("poller", a.args), second.gh("poller", b.args)];
	const pids = await Promise.all([started(a.path), started(b.path)]);
	let resolvedEnvironment!: () => void;
	const environmentReady = new Promise<void>((resolve) => {
		resolvedEnvironment = resolve;
	});
	const queued = createGhRunner({
		signal: waiting.controller.signal,
		environment: async () => {
			resolvedEnvironment();
			return { TRELLIS_GH_BIN: process.execPath };
		},
	})("poller", canceled.args);
	await environmentReady;
	await Bun.sleep(0);
	waiting.controller.abort();
	expect(await queued).toMatchObject({ ok: false, message: "The caller canceled the gh command." });
	expect(await Bun.file(canceled.path).exists()).toBe(false);
	first.controller.abort();
	second.controller.abort();
	await Promise.all(running);
	for (const pid of pids) expectExited(pid);
	const fresh = runner();
	expect((await fresh.gh("poller", ["-e", 'console.log("next")'])).ok).toBe(true);
});

test("pre-canceled calls never resolve an environment or start a process", async () => {
	const controller = new AbortController();
	controller.abort();
	const gh = createGhRunner({
		signal: controller.signal,
		environment: async () => {
			throw new Error("Unexpected environment read");
		},
	});
	expect(await gh("interactive", [])).toMatchObject({ ok: false, message: "The caller canceled the gh command." });
});

test("nonzero exits retain the process error and output", async () => {
	const { gh } = runner();
	expect(await gh("interactive", ["-e", 'console.log("partial"); console.error("failure"); process.exit(7)'])).toEqual({
		ok: false,
		reason: "error",
		code: 7,
		stdout: "partial\n",
		message: "failure",
	});
});
