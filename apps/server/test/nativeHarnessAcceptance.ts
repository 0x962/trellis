import { EventEmitter } from "node:events";
import { appendFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessEvent, HarnessLaunch } from "../src/agents/harnesses/types.ts";

type Exit = { exitCode: number; signal?: number };

export async function createNativeHarnessAcceptance(input: {
	name: string;
	parse: (payload: unknown) => HarnessEvent[];
	env?: Record<string, string>;
}) {
	const directory = await mkdtemp(join(tmpdir(), `trellis-native-${input.name}-`));
	const events: HarnessEvent[] = [];
	const rawEvents: unknown[] = [];
	const updates = new EventEmitter();
	const token = crypto.randomUUID();
	let output = "";
	let failure: Error | undefined;
	let child: ReturnType<typeof Bun.spawn> | undefined;
	let exit: Promise<Exit> | undefined;
	let driverRead: Promise<void> | undefined;
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(request) {
			if (request.headers.get("authorization") !== `Bearer ${token}`)
				return new Response("Unauthorized", { status: 401 });
			const payload = await request.json();
			try {
				rawEvents.push(payload);
				events.push(...input.parse(payload));
				await appendFile(join(directory, "events.jsonl"), `${JSON.stringify(payload)}\n`);
				updates.emit("event");
				return Response.json({});
			} catch (error) {
				failure = error as Error;
				updates.emit("event");
				return new Response(failure.message, { status: 500 });
			}
		},
	});
	const hookPath = join(directory, "hook.ts");
	await writeFile(
		hookPath,
		`const response = await fetch(${JSON.stringify(`http://127.0.0.1:${server.port}`)}, {method:"POST",headers:{authorization:${JSON.stringify(`Bearer ${token}`)},"content-type":"application/json"},body:await Bun.stdin.text()});if(!response.ok)throw new Error(await response.text());console.log("{}");`,
	);
	const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
	const send = (message: unknown) => {
		(child!.stdin as import("bun").FileSink).write(`${JSON.stringify(message)}\n`);
		(child!.stdin as import("bun").FileSink).flush();
	};
	return {
		directory,
		hookCommand: `${quote(process.execPath)} ${quote(hookPath)}`,
		events,
		rawEvents,
		get output() {
			return output;
		},
		async start(launch: HarnessLaunch, cwd: string) {
			const env = { ...process.env, ...input.env, ...launch.env };
			delete env.CLAUDECODE;
			delete env.CLAUDE_SESSION_ID;
			delete env.CODEX_THREAD_ID;
			child = Bun.spawn([process.env.TRELLIS_RUNTIME_NODE ?? "node", join(import.meta.dir, "nativePtyDriver.mjs")], {
				cwd,
				env,
				stdin: "pipe",
				stdout: "pipe",
				stderr: "pipe",
			});
			const ready = Promise.withResolvers<{ pid: number }>();
			const ended = Promise.withResolvers<Exit>();
			exit = ended.promise;
			driverRead = (async () => {
				const reader = (child!.stdout as ReadableStream<Uint8Array>).getReader();
				const decoder = new TextDecoder();
				let pending = "";
				while (true) {
					const next = await reader.read();
					if (next.done) break;
					pending += decoder.decode(next.value, { stream: true });
					let end = pending.indexOf("\n");
					while (end >= 0) {
						const message = JSON.parse(pending.slice(0, end));
						pending = pending.slice(end + 1);
						if (message.type === "ready") ready.resolve({ pid: message.pid });
						if (message.type === "exit") ended.resolve(message);
						if (message.type === "output") {
							output += message.data;
							await appendFile(join(directory, "terminal.txt"), message.data);
						}
						end = pending.indexOf("\n");
					}
				}
			})();
			void child.exited.then(async (code) => {
				await driverRead;
				if (code !== 0) {
					failure = new Error(
						`Native PTY driver exited ${code}: ${await new Response(child!.stderr as ReadableStream).text()}`,
					);
					ready.reject(failure);
					ended.reject(failure);
					updates.emit("event");
				}
			});
			send({ type: "start", launch, cwd, env });
			return ready.promise;
		},
		write(data: string) {
			send({ type: "input", data });
		},
		async waitFor(predicate: (event: HarnessEvent) => boolean, options: { after?: number; timeoutMs?: number } = {}) {
			return new Promise<HarnessEvent>((resolve, reject) => {
				const timer = setTimeout(
					() => finish(new Error(`Native ${input.name} event timeout; evidence: ${directory}`)),
					options.timeoutMs ?? 90_000,
				);
				const finish = (error?: Error, event?: HarnessEvent) => {
					clearTimeout(timer);
					updates.off("event", inspect);
					if (error) reject(error);
					else resolve(event!);
				};
				const inspect = () => {
					if (failure) return finish(failure);
					const event = events.slice(options.after ?? 0).find(predicate);
					if (event) finish(undefined, event);
				};
				updates.on("event", inspect);
				inspect();
			});
		},
		async stop() {
			send({ type: "stop" });
			const result = await exit!;
			await child!.exited;
			await driverRead;
			child = undefined;
			return result;
		},
		async dispose() {
			if (child) {
				send({ type: "stop" });
				await exit;
				await child.exited;
				await driverRead;
				child = undefined;
			}
			await server.stop(true);
		},
	};
}
