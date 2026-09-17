import { beforeAll, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { originDir } from "../../../../../../../test/originDir.ts";
import { buildRuntime } from "../../../../../../runtime/test/runtimeBuild.ts";
import { HarnessHost } from "../../../../../src/agents/harnessHost/harnessHost.ts";

const enabled = process.env.TRELLIS_REAL_MANAGER_READY === "1";
const repo = resolve(originDir(import.meta.dir), "../../../../..");
beforeAll(async () => {
	if (enabled) await buildRuntime();
});

async function fixture(delay: number, connectTimeout: number) {
	const authHome = process.env.TRELLIS_NATIVE_ACCEPTANCE_HOME;
	if (!authHome) throw new Error("Set TRELLIS_NATIVE_ACCEPTANCE_HOME to the authenticated provider home.");
	const home = await mkdtemp("/tmp/trl-manager-ready-");
	const marker = join(home, "bridge-started");
	const wrapper = join(home, "bun-wrapper");
	const calls: string[] = [];
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch(request) {
			calls.push(new URL(request.url).pathname);
			return Response.json({ json: [] });
		},
	});
	await writeFile(
		wrapper,
		`#!${process.execPath}
if (process.argv[2].endsWith("/managerTools/entry.ts")) {
 await Bun.sleep(${delay});
 await Bun.write(${JSON.stringify(marker)}, "ready");
}
const child = Bun.spawn([${JSON.stringify(process.execPath)}, ...process.argv.slice(2)], {
 stdin: "inherit", stdout: "inherit", stderr: "inherit"
});
process.exit(await child.exited);
`,
	);
	await chmod(wrapper, 0o700);
	const runtime = new RuntimeClient(join(home, "runtime.sock"));
	const daemon = spawn("node", [join(repo, "apps/runtime/dist/index.js"), "--home", home], {
		stdio: ["ignore", "pipe", "inherit"],
	});
	const exited = new Promise<void>((done) => daemon.once("exit", () => done()));
	await new Promise<void>((done, reject) => {
		daemon.once("error", reject);
		daemon.stdout!.once("data", () => done());
	});
	const host = new HarnessHost({
		runtime,
		directory: join(home, "attempts"),
		bun: wrapper,
		observationTimeoutMs: 45000,
		env: {
			...process.env,
			HOME: authHome,
			PATH: `${join(authHome, ".local/bin")}:${process.env.PATH}`,
			XDG_CONFIG_HOME: join(authHome, ".config"),
			XDG_DATA_HOME: join(authHome, ".local/share"),
			XDG_CACHE_HOME: join(authHome, ".cache"),
			XDG_STATE_HOME: join(authHome, ".local/state"),
			CLAUDECODE: undefined,
			CLAUDE_SESSION_ID: undefined,
			MCP_CONNECT_TIMEOUT_MS: String(connectTimeout),
			TRELLIS_URL: server.url.origin,
			TRELLIS_ACTOR: "agent:readiness-fixture",
		},
	});
	console.log(`Manager readiness evidence: ${home}`);
	return {
		home,
		marker,
		calls,
		host,
		async close() {
			await runtime.shutdown();
			await exited;
			server.stop(true);
		},
	};
}

const assignment = (home: string, id: string) => {
	const model = process.env.TRELLIS_NATIVE_CLAUDE_MODEL;
	if (!model) throw new Error("Set TRELLIS_NATIVE_CLAUDE_MODEL to the effective model ID.");
	return {
		id,
		harness: "claude" as const,
		kind: "manager" as const,
		managerId: "readiness-fixture",
		cwd: home,
		model,
		managerSystemPrompt:
			"Call the project-list tool once. Reply with MCP_READY_PROOF after it returns. Do not do other work.",
		prompt: "List the projects and report MCP_READY_PROOF.",
	};
};

test.skipIf(!enabled)(
	"interactive managers discover delayed tools before their first start and resume prompts",
	async () => {
		const f = await fixture(2500, 10000);
		try {
			const initial = "manager-initial";
			const started = await f.host.start(assignment(f.home, initial));
			expect(existsSync(f.marker)).toBe(true);
			await f.host.waitFor(initial, (state) => state.result?.text.includes("MCP_READY_PROOF") === true);
			expect(f.calls).toEqual(["/rpc/projects/list"]);
			const sessionId = started.process.agent!.sessionId!;
			const descriptor = JSON.parse(await readFile(join(f.home, "attempts", initial, "launch.json"), "utf8"));
			await f.host.stop(initial);
			const resumed = await f.host.resume({
				...assignment(descriptor.spec.cwd, "manager-resumed"),
				sessionId,
			});
			expect(resumed.process.agent?.sessionId).toBe(sessionId);
			await f.host.waitFor("manager-resumed", (state) => state.result?.text.includes("MCP_READY_PROOF") === true);
			expect(f.calls).toEqual(["/rpc/projects/list", "/rpc/projects/list"]);
		} finally {
			await f.close();
		}
	},
	150000,
);

test.skipIf(!enabled)(
	"interactive managers block the first turn if MCP discovery exceeds its deadline",
	async () => {
		const f = await fixture(8000, 200);
		try {
			await expect(f.host.start(assignment(f.home, "manager-unready"))).rejects.toThrow(/Trellis tools|MCP/);
			const current = await f.host.status("manager-unready");
			expect(current.acknowledgedMessageIds).not.toContain("manager-unready");
			expect(current.result).toBeNull();
			expect(f.calls).toEqual([]);
		} finally {
			await f.close();
		}
	},
	60000,
);
