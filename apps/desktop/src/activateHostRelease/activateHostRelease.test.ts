import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RUNTIME_PROTOCOL_VERSION } from "@trellis/runtime-protocol";
import type { PinnedRelease } from "../pinnedResources/pinnedResources.ts";
import { recordActiveRelease } from "../updateStatus/updateStatus.ts";
import { activateHostRelease } from "./activateHostRelease.ts";

const directories: string[] = [];

afterEach(async () => {
	await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const release = async (home: string, digit: string): Promise<PinnedRelease> => {
	const manifest = { id: digit.repeat(64), version: "test", protocol: RUNTIME_PROTOCOL_VERSION };
	const root = join(home, "releases", manifest.id);
	await mkdir(root, { recursive: true });
	await writeFile(join(root, "release.json"), JSON.stringify(manifest));
	return { root, manifest };
};

test.each([
	{
		name: "keeps a compatible runtime active during host activation",
		protocol: RUNTIME_PROTOCOL_VERSION,
		calls: ["unregister", "wait", "register", "adopt"],
	},
	{
		name: "stops the protocol 16 runtime after the host exits and before activation",
		protocol: 16,
		calls: ["unregister", "wait", "shutdown", "register", "adopt"],
	},
])("$name", async ({ protocol, calls: expectedCalls }) => {
	const home = await mkdtemp(join(tmpdir(), "trellis-activate-release-"));
	directories.push(home);
	const active = await release(home, "a");
	const available = await release(home, "b");
	await recordActiveRelease(home, active);
	await mkdir(join(home, "runtime"));
	await writeFile(
		join(home, "runtime/manifest.json"),
		JSON.stringify({ pid: process.pid, version: protocol, releaseId: active.manifest.id }),
	);
	const calls: string[] = [];

	await activateHostRelease(home, "helper", available, {
		ensureService: async () => {
			calls.push("ensure");
		},
		unregister: async () => {
			calls.push("unregister");
		},
		wait: async () => {
			calls.push("wait");
		},
		shutdown: async () => {
			calls.push("shutdown");
			await rm(join(home, "runtime/manifest.json"));
		},
		register: async () => {
			calls.push("register");
			await recordActiveRelease(home, available);
		},
		adopt: async () => {
			calls.push("adopt");
			return { origin: "http://127.0.0.1:1", token: "test", pid: process.pid };
		},
	});

	expect(calls).toEqual([...expectedCalls]);
});
