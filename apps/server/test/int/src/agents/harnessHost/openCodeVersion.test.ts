import { afterEach, beforeEach, expect, test } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import { HarnessHost } from "../../../../../src/agents/harnessHost/harnessHost.ts";
import { harnessHostFixture } from "../../../../helpers/harnessHostFixture.ts";

let home: string, daemon: ChildProcess, client: RuntimeClient, host: HarnessHost;
beforeEach(async () => {
	({ home, client, daemon, host } = await harnessHostFixture());
});
afterEach(async () => {
	await client.shutdown();
	await new Promise<void>((done) => daemon.once("exit", () => done()));
	await rm(home, { recursive: true, force: true });
});

test("an older OpenCode version fails before attempt files or processes exist", async () => {
	host = new HarnessHost({
		runtime: client,
		directory: join(home, "attempts"),
		env: { ...process.env, PATH: join(home, "bin"), HARNESS_FIXTURE_VERSION: "1.4.11" },
		bun: process.execPath,
	});
	await expect(host.start({ id: "old", harness: "opencode", cwd: home, prompt: "hello" })).rejects.toMatchObject({
		code: "HARNESS_VERSION_UNSUPPORTED",
		message: expect.stringContaining("1.4.11"),
	});
	await expect(host.start({ id: "old", harness: "opencode", cwd: home, prompt: "hello" })).rejects.toThrow(
		"tested minimum is 1.18.31",
	);
	expect(await client.list()).toEqual([]);
	await expect(readdir(join(home, "attempts"))).rejects.toMatchObject({ code: "ENOENT" });
});

test("a duplicate OpenCode attempt does not repeat the version command", async () => {
	const input = { id: "version-once", harness: "opencode" as const, cwd: home, prompt: "hello" };
	const first = await host.start(input);
	const duplicate = await host.start(input);
	expect(duplicate.process.pid).toBe(first.process.pid);
	expect(await readFile(join(home, "bin", "version-reads.txt"), "utf8")).toBe("version\n");
});

test("empty OpenCode version output fails without launch artifacts", async () => {
	host = new HarnessHost({
		runtime: client,
		directory: join(home, "attempts"),
		env: { ...process.env, PATH: join(home, "bin"), HARNESS_FIXTURE_VERSION: "" },
		bun: process.execPath,
	});
	await expect(host.start({ id: "unknown-version", harness: "opencode", cwd: home, prompt: "hello" })).rejects.toThrow(
		"version",
	);
	expect(await client.list()).toEqual([]);
	await expect(readdir(join(home, "attempts"))).rejects.toMatchObject({ code: "ENOENT" });
});
