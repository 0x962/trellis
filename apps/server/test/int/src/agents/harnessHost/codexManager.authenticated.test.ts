import { expect, test } from "bun:test";
import { chmod, copyFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { HarnessHost } from "../../../../../src/agents/harnessHost/harnessHost.ts";
import { harnessHostFixture } from "../../../../helpers/harnessHostFixture.ts";
import { nativeCodexTerminal } from "../../../../helpers/nativeCodexTerminal.ts";

const authHome = process.env.TRELLIS_CODEX_ACCEPTANCE_AUTH_HOME;
test.skipIf(!authHome)(
	"Sol manager calls Trellis tools and recalls its exact resumed conversation",
	async () => {
		const fixture = await harnessHostFixture();
		const calls: Request[] = [];
		const memory = `MEMORY_${crypto.randomUUID().replaceAll("-", "")}`;
		const marker = `PROJECT_${crypto.randomUUID().replaceAll("-", "")}`;
		const api = Bun.serve({
			port: 0,
			fetch(request) {
				calls.push(request.clone());
				return Response.json({ json: [{ id: "fixture", name: marker }] });
			},
		});
		const config = join(fixture.home, "codex-home");
		await mkdir(config, { mode: 0o700 });
		const auth = join(config, "auth.json");
		await copyFile(join(authHome!, "auth.json"), auth);
		await chmod(auth, 0o600);
		const host = new HarnessHost({
			runtime: fixture.client,
			directory: join(fixture.home, "attempts"),
			bun: process.execPath,
			observationTimeoutMs: 90000,
			env: {
				...process.env,
				CODEX_HOME: config,
				CODEX_THREAD_ID: undefined,
				TRELLIS_URL: api.url.href.replace(/\/$/, ""),
				TRELLIS_ACTOR: "agent:isolated-manager",
				TRELLIS_AUTH_TOKEN: "fixture-host-token",
			},
		});
		const input = {
			id: "manager",
			harness: "codex" as const,
			kind: "manager" as const,
			model: "openai/gpt-5.6-sol",
			cwd: fixture.home,
			managerSystemPrompt:
				"You coordinate work through the supplied Trellis tools. Follow the user request exactly. Keep the reply short.",
			prompt: `Remember ${memory}. Call trellis_projects_list, then reply with the project name and the remembered text.`,
			token: "fixture-attempt-token",
		};
		try {
			console.log(`Authenticated Sol manager evidence: ${fixture.home}`);
			const started = await host.start(input);
			const complete = await host.waitFor(
				"manager",
				(state) => state.activity?.state === "idle" && state.result !== null,
			);
			expect(complete.result!.text).toContain(memory);
			expect(complete.result!.text).toContain(marker);
			await nativeCodexTerminal.ready(host, "manager", memory);
			const sessionId = started.process.agent!.sessionId!;
			await host.stop("manager");
			const resumed = await host.resume({
				...input,
				id: "resumed",
				sessionId,
				cwd: started.process.launch!.cwd,
				managerSystemPrompt: `${input.managerSystemPrompt} This is the updated saved persona.`,
				prompt:
					"Call trellis_projects_list again. Reply with the project name and the text I asked you to remember before the restart.",
			});
			expect(resumed.process.agent!.sessionId).toBe(sessionId);
			const result = await host.waitFor(
				"resumed",
				(state) => state.activity?.state === "idle" && state.result !== null,
			);
			expect(result.result!.text).toContain(memory);
			expect(result.result!.text).toContain(marker);
			await nativeCodexTerminal.ready(host, "resumed", memory);
			expect(calls.length).toBeGreaterThanOrEqual(2);
			for (const call of calls) expect(new URL(call.url).pathname).toBe("/rpc/projects/list");
		} finally {
			try {
				for (const id of ["manager", "resumed"])
					if ((await fixture.client.list()).some((state) => state.id === id)) await host.stop(id);
				const exit = new Promise<void>((done) => fixture.daemon.once("exit", () => done()));
				await fixture.client.shutdown();
				await exit;
			} finally {
				api.stop(true);
				await rm(auth);
			}
		}
	},
	180000,
);
