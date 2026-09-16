import { afterEach, beforeEach, expect, test } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { fromHarnessModel, HARNESS_DEFAULT_MODELS, toHarnessModel } from "@trellis/api";
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

test.each(["claude", "codex", "pi", "opencode"] as const)(
	"%s resumes a prepared attempt after the host exits before process launch",
	async (harness) => {
		await host.prepare(
			{ id: "prepared", harness, cwd: home, prompt: "restart notice", model: HARNESS_DEFAULT_MODELS[harness] },
			`provider-${harness}`,
		);
		const replacement = new HarnessHost({
			runtime: client,
			directory: join(home, "attempts"),
			env: { PATH: "/nonexistent" },
			bun: "/nonexistent/bun",
			observationTimeoutMs: 1500,
		});
		const result = await replacement.startPrepared("prepared");
		expect(result.process.agent?.sessionId).toBe(`provider-${harness}`);
		expect(result.process.agent?.model).toBe(HARNESS_DEFAULT_MODELS[harness]);
		expect(result.process.acknowledgedMessageIds).toContain("prepared");
		expect((await client.list()).filter((p) => p.id === "prepared")).toHaveLength(1);
		await host.stop("prepared");
	},
);

test("OpenCode resumes its prepared prompt after process launch and keeps the process deadline", async () => {
	const descriptor = await host.prepare(
		{ id: "prepared", harness: "opencode", cwd: home, prompt: "restart notice", timeoutMs: 60000 },
		"provider-opencode",
	);
	await client.start({ ...descriptor.spec, timeoutMs: 59000 });
	const waiting = await host.waitFor("prepared", (state) => state.agent?.sessionId === "provider-opencode");
	expect(waiting.acknowledgedMessageIds).not.toContain("prepared");
	const result = await host.startPrepared("prepared");
	expect(result.process.pid).toBe(waiting.pid);
	expect(result.process.acknowledgedMessageIds).toContain("prepared");
	expect((await client.list()).filter((p) => p.id === "prepared")).toHaveLength(1);
	await host.stop("prepared");
});

test.each(["claude", "pi", "opencode"] as const)(
	"%s manager resume uses the exact persona and preserves its directory and tools",
	async (harness) => {
		const managerSystemPrompt = `Database persona ${crypto.randomUUID()}`;
		const started = await host.prepare({
			id: "new-manager",
			managerId: "manager",
			kind: "manager",
			managerSystemPrompt,
			harness,
			cwd: home,
			prompt: "Coordinate",
		});
		expect(started.spec.cwd).toBe(join(home, "attempts", "manager-workspaces", "manager"));
		const resumed = await host.prepare(
			{
				id: "old-manager-resumed",
				managerId: "manager",
				kind: "manager",
				managerSystemPrompt,
				harness,
				cwd: home,
				prompt: "Continue",
			},
			`provider-${harness}`,
		);
		expect(resumed.spec.cwd).toBe(home);
		for (const descriptor of [started, resumed]) {
			const system =
				harness === "opencode"
					? JSON.parse(descriptor.spec.env!.OPENCODE_CONFIG_CONTENT!).agent["trellis-manager"].prompt
					: descriptor.spec.args[descriptor.spec.args.indexOf("--system-prompt") + 1];
			expect(system).toBe(managerSystemPrompt);
		}
		if (harness === "claude") {
			expect(resumed.spec.args).toContain("--strict-mcp-config");
			expect(resumed.spec.args).not.toContain("--dangerously-skip-permissions");
		} else if (harness === "pi") expect(resumed.spec.args).toContain("--no-builtin-tools");
		else
			expect(JSON.parse(resumed.spec.env!.OPENCODE_PERMISSION!)).toEqual({ "*": "deny", "trellis_trellis_*": "allow" });
	},
);

test.each([
	["claude", "claude-opus-5"],
	["codex", "gpt-5.6-sol"],
	["opencode", "vercel/anthropic/claude-opus-5"],
	["pi", "vercel-ai-gateway/openai/gpt-5.6-sol"],
] as const)("%s defaults fresh sessions to %s without changing explicit or resumed models", async (harness, model) => {
	const selectedModel = (args: string[]) =>
		harness === "codex"
			? JSON.parse(args[1]!).model
			: args.includes("--model")
				? args[args.indexOf("--model") + 1]
				: undefined;
	const input = { harness, cwd: home, prompt: "Work" };
	const fresh = await host.prepare({ ...input, id: "default-model" });
	expect(selectedModel(fresh.spec.args)).toBe(model);
	const started = await host.startPrepared("default-model");
	expect(started.process.agent?.model).toBe(fromHarnessModel(harness, model));
	await host.stop("default-model");
	const resumed = await host.prepare({ ...input, id: "saved-session-model" }, `provider-${harness}`);
	expect(selectedModel(resumed.spec.args)).toBeUndefined();
	for (const resume of [false, true]) {
		const explicit = await host.prepare(
			{ ...input, id: `explicit-model-${resume}`, model: HARNESS_DEFAULT_MODELS[harness] },
			resume ? `provider-${harness}` : undefined,
		);
		expect(selectedModel(explicit.spec.args)).toBe(toHarnessModel(harness, HARNESS_DEFAULT_MODELS[harness]));
	}
});
