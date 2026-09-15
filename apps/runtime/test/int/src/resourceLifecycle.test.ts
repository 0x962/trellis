import { afterAll, beforeAll, expect, test } from "bun:test";
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import type { RuntimeOutputEvent } from "@trellis/runtime-protocol";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { originDir } from "../../../../../test/originDir.ts";
import { buildRuntime } from "../../runtimeBuild.ts";

const home = mkdtempSync("/tmp/trl-resources-");
const socket = join(home, "runtime.sock");
const runtimeNode = process.env.TRELLIS_RUNTIME_NODE ?? "node";
const client = new RuntimeClient(socket);
let daemon: ChildProcess;
let baseline: number;
const descriptors = () => {
	const listed = spawnSync("/usr/sbin/lsof", ["-p", String(daemon.pid), "-Ff"], { encoding: "utf8" });
	expect(listed.status).toBe(0);
	return listed.stdout.split("\n").filter((line) => /^f\d/.test(line)).length;
};
const expectReleased = async (check: string) => {
	const until = Date.now() + 5000;
	let current = descriptors();
	while (current !== baseline && Date.now() < until) {
		await Bun.sleep(25);
		current = descriptors();
	}
	expect(current).toBe(baseline);
	console.info(JSON.stringify({ check, baselineFileDescriptors: baseline, finalFileDescriptors: current }));
};
beforeAll(async () => {
	await buildRuntime();
	daemon = spawn(runtimeNode, [resolve(originDir(import.meta.dir), "../dist/index.js"), "--home", home], {
		stdio: ["ignore", "pipe", "inherit"],
	});
	await new Promise<void>((done, reject) => {
		daemon.stdout!.once("data", () => done());
		daemon.once("exit", (code) => reject(new Error(`Runtime exited ${code}`)));
	});
	for (const mode of ["pty", "stdio"] as const) {
		await client.start({ id: `warm-${mode}`, command: "/bin/cat", args: [], cwd: home, mode });
		await client.stop(`warm-${mode}`);
	}
	baseline = descriptors();
	expect(baseline).toBeGreaterThan(0);
});
afterAll(async () => {
	for (const session of await client.list()) if (session.status === "running") await client.stop(session.id);
	const exited = new Promise<void>((done) => daemon.once("exit", () => done()));
	await client.shutdown();
	await exited;
	rmSync(home, { recursive: true, force: true });
});

test("100 process and subscription reconnect cycles return every descriptor to baseline", async () => {
	for (let index = 0; index < 100; index++) {
		const connection = new RuntimeClient(socket);
		const id = `cycle-${index}`;
		await connection.start({ id, command: "/bin/cat", args: [], cwd: home, mode: index % 2 === 0 ? "pty" : "stdio" });
		const first = connection.subscribe(id, 0, AbortSignal.timeout(5000));
		expect((await first.next()).value).toMatchObject({ type: "session", session: { id, status: "running" } });
		await connection.input(id, Buffer.from(`cycle-${index}\n`).toString("base64"));
		let offset = 0;
		for await (const event of first) {
			if (event.type !== "output") continue;
			expect(event.startOffset).toBe(0);
			offset = event.nextOffset;
			break;
		}
		expect(offset).toBeGreaterThan(0);
		const reconnected = new RuntimeClient(socket);
		const second = reconnected.subscribe(id, offset, AbortSignal.timeout(5000));
		await second.next();
		expect((await reconnected.stop(id)).status).toBe("exited");
		for await (const event of second) {
			if (event.type === "output") {
				expect(event.startOffset).toBe(offset);
				offset = event.nextOffset;
			}
		}
	}
	await expectReleased("100 process and reconnect cycles");
}, 45000);

test("a slow reader and a reconnecting reader receive identical binary output above two MiB", async () => {
	const count = 2 * 1024 * 1024 + 257;
	const expected = Buffer.alloc(count);
	for (let index = 0; index < count; index++) expected[index] = (index * 31 + (index >>> 8)) % 256;
	const id = "binary-readers";
	await client.start({
		id,
		command: runtimeNode,
		args: [
			"-e",
			`process.stdin.once('data',()=>{const b=Buffer.alloc(${count});for(let i=0;i<b.length;i++)b[i]=(i*31+(i>>>8))%256;process.stdout.write(b,()=>process.exit(0));})`,
		],
		cwd: home,
		mode: "stdio",
	});
	const slow = client.subscribe(id, 0, AbortSignal.timeout(10000));
	const fast = new RuntimeClient(socket).subscribe(id, 0, AbortSignal.timeout(10000));
	await Promise.all([slow.next(), fast.next()]);
	const consume = async (events: AsyncGenerator<RuntimeOutputEvent>, pause: boolean, reconnect: boolean) => {
		let offset = 0;
		const chunks: Buffer[] = [];
		const append = (event: RuntimeOutputEvent) => {
			if (event.type !== "output") return;
			expect(event.startOffset).toBe(offset);
			expect(event.truncated).toBe(false);
			chunks.push(Buffer.from(event.data, "base64"));
			offset = event.nextOffset;
		};
		for await (const event of events) {
			append(event);
			if (reconnect && offset >= 350000) break;
			if (pause && event.type === "output") await Bun.sleep(chunks.length === 1 ? 100 : 10);
		}
		if (reconnect)
			for await (const event of new RuntimeClient(socket).subscribe(id, offset, AbortSignal.timeout(10000)))
				append(event);
		expect(offset).toBe(count);
		return Buffer.concat(chunks);
	};
	const readers = [consume(slow, true, false), consume(fast, false, true)];
	await client.input(id, Buffer.from("start").toString("base64"));
	const received = await Promise.all(readers);
	for (const bytes of received) expect(bytes).toEqual(expected);
	expect((await client.inspect(id)).status).toBe("exited");
	expect(await consume(client.subscribe(id, 0, AbortSignal.timeout(10000)), false, false)).toEqual(expected);
	console.info(JSON.stringify({ binaryBytes: expected.length, concurrentReaders: 2, exactReplayAfterExit: true }));
	await expectReleased("binary output and three subscriptions");
}, 15000);
