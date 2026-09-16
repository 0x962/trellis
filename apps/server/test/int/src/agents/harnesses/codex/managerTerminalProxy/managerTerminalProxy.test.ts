import { afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import WebSocket from "ws";
import { originDir } from "../../../../../../../../../test/originDir.ts";

let home: string;
let proxySource: string;
let engine: ReturnType<typeof Bun.spawn<"ignore", "pipe", "inherit">>;
let proxy: { close: () => Promise<void>; closed: Promise<never> } | undefined;
const engineSource = `
import {createServer} from 'node:http';
import {WebSocketServer} from 'ws';
const server=createServer();
const sockets=new WebSocketServer({server,maxPayload:16*1024*1024});
sockets.on('connection', socket => {
 socket.send(JSON.stringify({method:'thread/started',params:{threadId:'manager'}}));
 socket.on('message', data => {
  const value=JSON.parse(data.toString());
  if(value.method==='fixture/close') return socket.close(1011,'fixture disconnect');
  socket.send(JSON.stringify(value.method ? {id:value.id,result:value} : value));
 });
});
server.listen(process.argv[1],()=>process.stdout.write('ready\\n'));
`;

beforeAll(async () => {
	const build = await Bun.build({
		entrypoints: [join(originDir(import.meta.dir), "index.ts")],
		target: "node",
		format: "esm",
	});
	if (!build.success) throw new AggregateError(build.logs, "Proxy fixture build failed");
	proxySource = await build.outputs[0]!.text();
});

beforeEach(async () => {
	home = await mkdtemp("/tmp/trl-proxy-");
	engine = Bun.spawn([Bun.which("node")!, "--input-type=module", "-e", engineSource, join(home, "engine.sock")], {
		stdin: "ignore",
		stdout: "pipe",
		stderr: "inherit",
	});
	const reader = engine.stdout.getReader();
	await reader.read();
	reader.releaseLock();
});
afterEach(async () => {
	await proxy?.close();
	proxy = undefined;
	engine.kill();
	await engine.exited;
	await rm(home, { recursive: true, force: true });
});

async function startProxy() {
	const entry = join(home, "proxy.mjs");
	await writeFile(entry, proxySource);
	const wrapper = `
const {startManagerTerminalProxy}=await import(process.argv[1]);
const input=JSON.parse(process.argv[2]);
const proxy=await startManagerTerminalProxy({...input,transformRequest: value => value.method==='turn/start' ? {...value, params:{...value.params,environments:[]}} : value});
proxy.closed.catch(error=>process.send({type:'failed',message:error.message}));
process.on('message',async value=>{if(value.type==='close'){await proxy.close();await Promise.resolve();process.send({type:'closed'},()=>process.disconnect());}});
process.send({type:'ready'});
`;
	const child = spawn(
		Bun.which("node")!,
		[
			"--input-type=module",
			"-e",
			wrapper,
			entry,
			JSON.stringify({
				socket: join(home, "terminal.sock"),
				engineSocket: join(home, "engine.sock"),
				threadId: "manager",
			}),
		],
		{ stdio: ["ignore", "ignore", "inherit", "ipc"] },
	);
	let fail!: (error: Error) => void;
	const closed = new Promise<never>((_, reject) => {
		fail = reject;
	});
	const exited = once(child, "exit");
	await new Promise<void>((resolve, reject) => {
		child.once("error", reject);
		child.once("exit", (code) => reject(new Error(`Proxy fixture exited before startup: ${code}`)));
		child.on("message", (value) => {
			const message = value as { type: string; message: string };
			if (message.type === "ready") resolve();
			if (message.type === "failed") fail(new Error(message.message));
		});
	});
	let closing: Promise<void> | undefined;
	return {
		closed,
		close() {
			if (closing) return closing;
			child.send({ type: "close" });
			closing = exited.then(([code]) => {
				expect(code).toBe(0);
			});
			return closing;
		},
	};
}

async function connect() {
	proxy = await startProxy();
	const terminal = new WebSocket(`ws+unix://${home}/terminal.sock:/`, { perMessageDeflate: false });
	const messages: unknown[] = [];
	const readers: Array<(value: unknown) => void> = [];
	terminal.on("message", (data) => {
		const message = JSON.parse(data.toString());
		const reader = readers.shift();
		if (reader) reader(message);
		else messages.push(message);
	});
	await once(terminal, "open");
	return {
		terminal,
		next: () => (messages.length ? Promise.resolve(messages.shift()) : new Promise((resolve) => readers.push(resolve))),
	};
}

test("the terminal proxy preserves IDs, responses, notifications, and request order", async () => {
	const { terminal, next } = await connect();
	expect((await stat(join(home, "terminal.sock"))).mode & 0o777).toBe(0o600);
	expect(await next()).toEqual({ method: "thread/started", params: { threadId: "manager" } });
	for (const id of ["one", 2, "three"])
		terminal.send(
			JSON.stringify({ id, method: "turn/start", params: { threadId: "manager", environments: ["local"] } }),
		);
	for (const id of ["one", 2, "three"])
		expect(await next()).toEqual({
			id,
			result: { id, method: "turn/start", params: { threadId: "manager", environments: [] } },
		});
	const response = { id: "server-request", result: { accepted: true } };
	terminal.send(JSON.stringify(response));
	expect(await next()).toEqual(response);
	await proxy!.close();
	expect(await Bun.file(join(home, "terminal.sock")).exists()).toBe(false);
});

test.each([
	{ id: 1, method: "thread/start", params: {} },
	{ id: 1, method: "thread/fork", params: { threadId: "manager" } },
	{ id: 1, method: "turn/start", params: { threadId: "other" } },
])("the terminal proxy rejects an unowned thread request: %j", async (message) => {
	const { terminal, next } = await connect();
	await next();
	terminal.send(JSON.stringify(message));
	expect(await next()).toEqual({
		id: message.id,
		error: { code: -32600, message: "Codex manager terminal is restricted to its assigned thread" },
	});
	terminal.send(JSON.stringify({ id: "owned", method: "thread/read", params: { threadId: "manager" } }));
	expect(await next()).toMatchObject({ id: "owned", result: { method: "thread/read" } });
});

test("the terminal proxy reports malformed messages", async () => {
	const { terminal, next } = await connect();
	await next();
	terminal.send("{");
	await expect(proxy!.closed).rejects.toThrow(/JSON|message/i);
});

test("the terminal proxy reports an engine disconnect", async () => {
	const { terminal, next } = await connect();
	await next();
	terminal.send(JSON.stringify({ id: 1, method: "fixture/close" }));
	await expect(proxy!.closed).rejects.toThrow(/engine.*closed/i);
});

test("the terminal proxy reports an unavailable engine", async () => {
	engine.kill();
	await engine.exited;
	await rm(join(home, "engine.sock"), { force: true });
	proxy = await startProxy();
	const terminal = new WebSocket(`ws+unix://${home}/terminal.sock:/`);
	await once(terminal, "open");
	await expect(proxy.closed).rejects.toThrow(/ENOENT/);
});

test("the terminal proxy accepts normal terminal close code 1000", async () => {
	const { terminal, next } = await connect();
	await next();
	let failure: Error | undefined;
	void proxy!.closed.catch((error) => {
		failure = error;
	});
	const ended = once(terminal, "close");
	terminal.close(1000);
	await ended;
	await proxy!.close();
	expect(failure).toBeUndefined();
});

test("the terminal proxy reports an abnormal terminal disconnect", async () => {
	const { terminal, next } = await connect();
	await next();
	terminal.terminate();
	await expect(proxy!.closed).rejects.toThrow(/terminal closed \(1006\)/);
});

test("the terminal proxy accepts normal terminal closure without a status code", async () => {
	proxy = await startProxy();
	let failure: Error | undefined;
	void proxy.closed.catch((error) => {
		failure = error;
	});
	const terminal = Bun.spawn(
		[
			Bun.which("node")!,
			"--input-type=module",
			"-e",
			`
 import WebSocket from 'ws';
 const socket = new WebSocket(process.argv[1]);
 socket.once('message', () => socket.close());
 socket.once('close', code => process.stdout.write(String(code)));
 `,
			`ws+unix://${home}/terminal.sock:/`,
		],
		{ stdin: "ignore", stdout: "pipe", stderr: "inherit" },
	);
	const code = await new Response(terminal.stdout).text();
	expect(await terminal.exited).toBe(0);
	expect(code).toBe("1005");
	await proxy.close();
	expect(failure).toBeUndefined();
});
