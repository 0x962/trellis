import { afterEach, beforeEach, expect, test } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import type { HarnessHost } from "../../../../../src/agents/harnessHost/harnessHost.ts";
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

test("a manager gets private working context and cannot reuse an unrestricted launch descriptor", async () => {
	const input = {
		id: "manager-tools",
		managerId: "assignment",
		harness: "claude" as const,
		cwd: home,
		prompt: "Coordinate",
	};
	const managerSystemPrompt = `Database persona ${crypto.randomUUID()}`;
	const descriptor = await host.prepare({ ...input, kind: "manager", managerSystemPrompt });
	expect(descriptor.spec.cwd).toBe(join(home, "attempts", "manager-workspaces", "assignment"));
	expect(descriptor.spec.args).toContain("--strict-mcp-config");
	expect(descriptor.spec.args).not.toContain("--dangerously-skip-permissions");
	expect(await host.prepare({ ...input, kind: "manager", managerSystemPrompt })).toEqual(descriptor);
	const resumed = await host.prepare(
		{ ...input, cwd: descriptor.spec.cwd, id: "manager-resumed", kind: "manager", managerSystemPrompt },
		"same-provider-session",
	);
	expect(resumed.spec.cwd).toBe(descriptor.spec.cwd);
	await expect(
		host.prepare({ ...input, kind: "manager", managerSystemPrompt: "Changed database instruction" }),
	).rejects.toThrow("different launch request");
	await expect(host.prepare(input)).rejects.toThrow("different launch request");
	expect(await client.list()).toEqual([]);
});
