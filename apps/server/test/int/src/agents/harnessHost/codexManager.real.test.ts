import { expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { HarnessHost } from "../../../../../src/agents/harnessHost/harnessHost.ts";
import { harnessHostFixture } from "../../../../helpers/harnessHostFixture.ts";
import { nativeCodexTerminal } from "../../../../helpers/nativeCodexTerminal.ts";

const enabled = process.env.TRELLIS_REAL_HARNESS_ACCEPTANCE === "1";
test.skipIf(!enabled).each(["gpt-5.6-sol", "gpt-6-astra"])(
	"%s Codex manager retains its restricted catalog and persona through native terminal attachment and resume",
	async (model) => {
		const fixture = await harnessHostFixture();
		const requests: unknown[] = [];
		let mainThread: string | undefined;
		const calls: Request[] = [];
		const forbiddenFile = join(fixture.home, "forbidden-command.txt");
		const api = Bun.serve({
			port: 0,
			fetch(request) {
				calls.push(request.clone());
				return Response.json({ json: { marker: "TOOL_RESULT" } });
			},
		});
		const endpoint = Bun.serve({
			port: 0,
			async fetch(request) {
				const body = await request.json();
				mainThread ??= body.prompt_cache_key;
				const main = body.prompt_cache_key === mainThread;
				if (main) requests.push(body);
				const tool = main && requests.length % 2 === 1;
				const item = tool
					? {
							id: `call-${requests.length}`,
							type: "function_call",
							name: requests.length === 11 ? "exec_command" : "trellis_projects_list",
							call_id: `call-${requests.length}`,
							arguments: requests.length === 11 ? JSON.stringify({ cmd: `touch ${forbiddenFile}` }) : "{}",
						}
					: {
							id: `message-${requests.length}`,
							type: "message",
							phase: "final_answer",
							role: "assistant",
							content: [{ type: "output_text", text: "MANAGER_DONE", annotations: [] }],
						};
				const events = [
					{
						type: "response.created",
						response: {
							id: "r",
							object: "response",
							created_at: 123,
							status: "in_progress",
							model,
							output: [],
						},
					},
					{ type: "response.output_item.added", output_index: 0, item },
					{ type: "response.output_item.done", output_index: 0, item },
					{
						type: "response.completed",
						response: {
							id: "r",
							object: "response",
							status: "completed",
							output: [item],
							usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
						},
					},
				];
				return new Response(
					events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""),
					{ headers: { "content-type": "text/event-stream" } },
				);
			},
		});
		const config = join(fixture.home, "codex-home");
		await mkdir(config);
		await writeFile(
			join(config, "config.toml"),
			`developer_instructions="FOREIGN_PERSONA"\nmodel_provider="local"\n[model_providers.local]\nname="local"\nbase_url="http://127.0.0.1:${endpoint.port}/v1"\nwire_api="responses"\nrequires_openai_auth=false\nrequest_max_retries=0\nstream_max_retries=0\n[mcp_servers."unwanted.with.dot"]\ncommand="/usr/bin/false"\nenabled=true\n`,
		);
		const persona = "Exact database persona. Retain spacing. ";
		const host = new HarnessHost({
			runtime: fixture.client,
			directory: join(fixture.home, "attempts"),
			bun: process.execPath,
			observationTimeoutMs: 20000,
			env: {
				...process.env,
				CODEX_HOME: config,
				CODEX_THREAD_ID: undefined,
				TRELLIS_URL: api.url.href.replace(/\/$/, ""),
				TRELLIS_AUTH_TOKEN: "host-secret",
				TRELLIS_ACTOR: "agent:manager",
			},
		});
		const input = {
			id: "manager",
			harness: "codex" as const,
			kind: "manager" as const,
			managerSystemPrompt: persona,
			model,
			cwd: fixture.home,
			prompt: "Reply MANAGER_DONE",
			token: "fixture-secret",
		};
		try {
			const started = await host.start(input);
			await host.waitFor(input.id, (s) => s.result?.text === "MANAGER_DONE");
			await nativeCodexTerminal.ready(host, input.id, "MANAGER_DONE");
			console.log(`Manager evidence: ${fixture.home}`);
			expect(started.process.agent?.model).toBe(input.model);
			const sessionId = started.process.agent!.sessionId!;
			await host.send(input.id, "Reply MANAGER_DONE", "followup");
			await host.waitFor(
				input.id,
				(s) =>
					s.activity?.state === "idle" &&
					s.result?.text === "MANAGER_DONE" &&
					s.acknowledgedMessageIds.includes("followup"),
			);
			const beforeTerminal = requests.length;
			await nativeCodexTerminal.submit(host, input.id, "Reply MANAGER_DONE");
			await host.waitFor(input.id, (s) => s.activity?.state === "idle" && requests.length >= beforeTerminal + 2);
			await host.stop(input.id);
			await host.resume({
				...input,
				id: "resumed",
				managerSystemPrompt: `${persona}Updated saved persona.`,
				sessionId,
				cwd: started.process.launch!.cwd,
			});
			await host.waitFor("resumed", (s) => s.result?.text === "MANAGER_DONE");
			await nativeCodexTerminal.ready(host, "resumed", "MANAGER_DONE");
			const beforeResumedTerminal = requests.length;
			await nativeCodexTerminal.submit(host, "resumed", "Reply MANAGER_DONE");
			await host.waitFor(
				"resumed",
				(s) => s.activity?.state === "idle" && requests.length >= beforeResumedTerminal + 2,
			);
			expect((await host.status("resumed")).agent?.sessionId).toBe(sessionId);
			await writeFile(join(fixture.home, "provider-requests.json"), JSON.stringify(requests, null, 2));
			expect(calls).toHaveLength(5);
			for (const call of calls) {
				expect(call.headers.get("x-trellis-actor")).toBe("agent:manager");
				expect(call.headers.get("x-trellis-attempt")).toBe("fixture-secret");
				expect(call.headers.get("authorization")).toBe("Bearer host-secret");
			}
			expect(requests.length).toBe(10);
			for (const [index, request] of requests.entries()) {
				const serialized = JSON.stringify(request);
				expect(serialized).toContain(index < 6 ? persona : `${persona}Updated saved persona.`);
				expect(serialized).toContain("trellis_projects_list");
				expect(serialized).not.toContain("FOREIGN_PERSONA");
				for (const tool of [
					"apply_patch",
					"exec_command",
					"view_image",
					"spawn_agent",
					"web__run",
					"read_mcp_resource",
				]) {
					expect(serialized).not.toContain(`### \`${tool}\``);
					expect(serialized).not.toContain(`"name":"${tool}"`);
				}
			}
			if (model === "gpt-5.6-sol") {
				await host.send("resumed", "Attempt the forbidden command.", "forbidden");
				await host.waitFor("resumed", (state) => state.activity?.state === "idle" && requests.length === 12);
				expect(await Bun.file(forbiddenFile).exists()).toBe(false);
				expect(JSON.stringify(requests[11])).toContain("unsupported call: exec_command");
				expect(calls).toHaveLength(5);
			}
			await nativeCodexTerminal.submit(host, "resumed", "/quit");
			const exited = await host.waitFor("resumed", (state) => state.status === "exited", { rejectAgentError: false });
			expect(exited.agent?.error).toBeNull();
			expect(exited.error).toBeNull();
		} finally {
			for (const id of ["manager", "resumed"])
				if ((await fixture.client.list()).some((s) => s.id === id)) await host.stop(id);
			const exit = new Promise<void>((done) => fixture.daemon.once("exit", () => done()));
			await fixture.client.shutdown();
			await exit;
			endpoint.stop(true);
			api.stop(true);
		}
	},
	60000,
);
