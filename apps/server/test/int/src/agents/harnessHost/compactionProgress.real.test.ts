import { expect, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { HarnessHost } from "../../../../../src/agents/harnessHost/harnessHost.ts";
import { harnessHostFixture } from "../../../../helpers/harnessHostFixture.ts";

const enabled = process.env.TRELLIS_REAL_HARNESS_ACCEPTANCE === "1";
test.skipIf(!enabled)(
	"the native Codex engine forwards provider compaction progress",
	async () => {
		const fixture = await harnessHostFixture();
		const timers = new Set<ReturnType<typeof setInterval>>();
		let compacting = false;
		const endpoint = Bun.serve({
			port: 0,
			fetch(request, server) {
				if (server.upgrade(request)) return;
				return new Response("WebSocket required", { status: 400 });
			},
			websocket: {
				message(socket, message) {
					const request = JSON.parse(String(message));

					if (!compacting || request.generate === false) {
						socket.send(
							JSON.stringify({
								type: "response.completed",
								response: {
									id: "r",
									status: "completed",
									output: [],
									usage: { input_tokens: 1, output_tokens: 0, total_tokens: 1 },
								},
							}),
						);
						return;
					}
					socket.send(
						JSON.stringify({
							type: "response.created",
							response: {
								id: "r2",
								object: "response",
								created_at: 123,
								status: "in_progress",
								model: "test-model",
								output: [],
							},
						}),
					);
					const timer = setInterval(() => socket.send(JSON.stringify({ type: "response.compaction.compacting" })), 200);
					timers.add(timer);
				},
			},
		});
		const config = join(fixture.home, "codex-home");
		await mkdir(config);
		await writeFile(
			join(config, "config.toml"),
			`model_provider="local"\nmodel="test-model"\n[projects.${JSON.stringify(fixture.home)}]\ntrust_level="trusted"\n[model_providers.local]\nname="OpenAI"\nbase_url="http://127.0.0.1:${endpoint.port}/v1"\nwire_api="responses"\nsupports_websockets=true\nrequires_openai_auth=false\nrequest_max_retries=0\nstream_max_retries=0\n`,
		);
		const host = new HarnessHost({
			runtime: fixture.client,
			directory: join(fixture.home, "attempts"),
			bun: process.execPath,
			observationTimeoutMs: 15000,
			env: { ...process.env, CODEX_HOME: config, CODEX_THREAD_ID: undefined },
		});
		try {
			const started = await host.start({
				id: "native-compact",
				harness: "codex",
				cwd: fixture.home,
				prompt: "Reply hello.",
			});
			await host.waitFor("native-compact", (state) => state.activity?.state === "idle");
			compacting = true;
			const descriptor = JSON.parse(await readFile(join(fixture.home, "attempts/native-compact/launch.json"), "utf8"));
			const control = Bun.spawn(
				[
					"node",
					"--input-type=module",
					"-e",
					`
                import WebSocket from ${JSON.stringify(Bun.resolveSync("ws", import.meta.dir))};
                const socket = new WebSocket(\`ws+unix://\${process.argv[1]}:/\`, {perMessageDeflate:false});
                socket.on("open", () => socket.send(JSON.stringify({id: 1, method: "initialize", params: {clientInfo:{name:"compaction_test",version:"1"},capabilities:{experimentalApi:true}}})));
                socket.on("message", (data) => {
                    const reply = JSON.parse(data.toString());
                    if (reply.error) throw new Error(JSON.stringify(reply.error));
                    if (reply.id === 1) socket.send(JSON.stringify({id:2,method:"thread/compact/start",params:{threadId:process.argv[2]}}));
                    if (reply.id === 2) socket.close();
                });
            `,
					descriptor.spec.env.TRELLIS_CODEX_ENGINE_SOCKET,
					started.process.agent!.sessionId!,
				],
				{ stderr: "inherit" },
			);
			expect(await control.exited).toBe(0);
			const observed = await host.waitFor(
				"native-compact",
				(state) =>
					state.agent?.lastTool?.name === "contextCompaction" &&
					state.agent.lastTool.updatedAt !== state.agent.lastTool.startedAt,
			);
			expect(observed.agent?.lastTool?.status).toBe("running");
			expect(observed.agent?.lastTool?.updatedAt).toBeTruthy();
		} finally {
			await host.stop("native-compact");
			for (const timer of timers) clearInterval(timer);
			endpoint.stop(true);
			const exited = new Promise<void>((done) => fixture.daemon.once("exit", () => done()));
			await fixture.client.shutdown();
			await exited;
			await rm(fixture.home, { recursive: true, force: true });
		}
	},
	30000,
);
