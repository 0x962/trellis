import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { closeSync, openSync } from "node:fs";
import { appendFile, chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createTrellisClient } from "@trellis/api";
import { RuntimeClient } from "@trellis/runtime-protocol/client";

const source = resolve(import.meta.dir, "../../../..");
const [action, root, runId, requestId, decision] = process.argv.slice(2);
const quote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;
const save = (path: string, value: unknown) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
const event = (directory: string, value: unknown) =>
	appendFile(
		join(directory, "events.jsonl"),
		`${JSON.stringify({ at: new Date().toISOString(), ...(value as object) })}\n`,
	);
type State = {
	root: string;
	home: string;
	repo: string;
	url: string;
	token: string;
	pid: number;
	projectId: string;
	managerId: string;
	builderId: string;
	ticketId?: string;
	managerRunId: string;
};
const connect = (state: Pick<State, "url" | "token">) =>
	createTrellisClient(state.url, "human:acceptance", (request, init) => {
		request.headers.set("authorization", `Bearer ${state.token}`);
		return fetch(request, init);
	});

if (action === "setup") {
	const directory = await mkdtemp("/tmp/trl-real-");
	await chmod(directory, 0o700);
	const home = join(directory, "home");
	const repo = join(directory, "repo");
	const bin = join(directory, "bin");
	await Promise.all([mkdir(home), mkdir(repo), mkdir(bin)]);
	const bun = process.execPath;
	const claude = Bun.which("claude")!;
	await writeFile(
		join(bin, "trellis"),
		`#!/bin/sh\nexec ${quote(bun)} ${quote(join(source, "packages/cli/src/index.ts"))} "$@"\n`,
		{ mode: 0o700 },
	);
	await writeFile(
		join(bin, "claude-acceptance"),
		`#!/bin/sh\nexec ${quote(claude)} --safe-mode --no-session-persistence "$@"\n`,
		{ mode: 0o700 },
	);
	await writeFile(
		join(repo, "AGENTS.md"),
		"# Scratch acceptance project\n\nThis repository is a disposable implementation test. Work only in this repository and its Trellis-managed worktree. Use the scratch Trellis URL and actor from the environment. Do not use GitHub, email, Slack, external tools, or global configuration. Do not install dependencies. Ask for each tool permission.\n",
	);
	await writeFile(
		join(repo, "README.md"),
		"# Slug acceptance\n\nA disposable repository for a native manager and worker test.\n",
	);
	execFileSync("git", ["init", "-q", repo]);
	execFileSync("git", ["-C", repo, "add", "."]);
	execFileSync("git", [
		"-C",
		repo,
		"-c",
		"user.name=Acceptance",
		"-c",
		"user.email=acceptance@example.test",
		"commit",
		"-qm",
		"Initial scratch repository",
	]);
	const token = randomBytes(24).toString("hex");
	const log = openSync(join(directory, "host.log"), "a", 0o600);
	const child = spawn(bun, [join(source, "apps/server/src/index.ts")], {
		cwd: join(source, "apps/server"),
		detached: true,
		stdio: ["ignore", log, log],
		env: {
			...process.env,
			NODE_ENV: "production",
			TRELLIS_HOME: home,
			TRELLIS_PORT: "0",
			TRELLIS_AUTH_TOKEN: token,
			TRELLIS_DB_INLINE: "false",
			TRELLIS_GH_BIN: "/usr/bin/false",
			TRELLIS_RUNTIME_SOCKET: join(home, "runtime/runtime.sock"),
			TRELLIS_CLAUDE_BIN: join(bin, "claude-acceptance"),
			TRELLIS_CLOCK_RATE: "1",
			PATH: `${bin}:${dirname(bun)}:${process.env.PATH}`,
			CLAUDE_CODE_SAFE_MODE: "1",
		},
	});
	closeSync(log);
	child.unref();
	await save(join(directory, "boot.json"), { root: directory, home, repo, pid: child.pid, token });
	let port: number | undefined;
	for (let n = 0; n < 300 && !port; n++) {
		await Bun.sleep(100);
		for (const line of (await readFile(join(directory, "host.log"), "utf8")).split("\n")) {
			if (!line.startsWith("{")) continue;
			const value = JSON.parse(line);
			if (value.msg === "listening") port = value.port;
		}
	}
	if (!port) throw new Error(`The scratch host did not start: ${directory}`);
	const url = `http://127.0.0.1:${port}`;
	const client = connect({ url, token });
	const project = await client.projects.create({ key: "RAT", name: "Real harness acceptance" });
	const builder = await client.personas.create({
		name: "Acceptance Builder",
		kind: "builder",
		instruction:
			'Complete the assigned scratch code task with the local Trellis CLI. Do not spawn other agents. Read AGENTS.md. Create slug.ts and slug.test.ts using bun:test. Do not install packages. After all file edits, run trellis evidence check $TRELLIS_RUN_ID --command bun --args \'["test","slug.test.ts"]\' --timeout-ms 10000 --request-id 5178cacf-d5b1-4223-8e2f-4fb3fb3f7710. Register both files with trellis evidence register $TRELLIS_RUN_ID --path <file>. Inspect trellis evidence list $TRELLIS_RUN_ID. Add one ticket comment with the workspace path, check ID, artifacts, and result. Do not mark the ticket done. End your turn with WORKER_COMPLETE and the evidence summary. Do not poll or sleep.',
	});
	const manager = await client.personas.create({
		name: "Acceptance Manager",
		kind: "manager",
		instruction: `This is a bounded scratch acceptance test. On your first assignment, reply MANAGER_IDLE and finish the turn. Do not call any tool on that first turn. A later Trellis activity message contains the new test ticket. When that message arrives, inspect that ticket with trellis show <ticket-id> --json. Start exactly one worker using trellis agents start ${builder.id} --ticket <ticket-id> --request-id acceptance-worker:<ticket-id>. Remember that worker ID. Reuse the request ID if a response is lost. Do not start a replacement or a second worker. End the turn after assignment. On a later worker result, inspect trellis evidence list <worker-id>. If readyForReview is true, add one local ticket comment that says READY_FOR_LOCAL_REVIEW and includes the worker ID and check ID. Then finish the turn. Never poll or sleep. Do not use external services. All Bash tool calls must use the scratch Trellis CLI and inherited URL/actor/token. Do not edit files yourself.`,
	});
	await client.projects.update({
		project: project.id,
		managerConfig: {
			personaId: manager.id,
			concurrency: 1,
			directory: repo,
			ade: "native",
			trustedDirectory: true,
			harness: { preset: "claude" },
		},
	});
	const state: State = {
		root: directory,
		home,
		repo,
		url,
		token,
		pid: child.pid!,
		projectId: project.id,
		managerId: manager.id,
		builderId: builder.id,
		managerRunId: "",
	};
	await save(join(directory, "state.json"), state);
	const managerRun = await client.agentRuns.start({
		project: project.id,
		personaId: manager.id,
		requestId: "acceptance-manager",
	});
	state.managerRunId = managerRun.id;
	await save(join(directory, "state.json"), state);
	await event(directory, {
		action,
		source,
		claudeVersion: execFileSync(claude, ["--version"], { encoding: "utf8" }).trim(),
		url,
		managerRun,
	});
	console.log(JSON.stringify({ root: directory, url, managerRun }, null, 2));
} else {
	if (!root?.startsWith("/tmp/trl-real-")) throw new Error("Supply the scratch /tmp/trl-real-* directory.");
	const state: State = JSON.parse(await readFile(join(root, "state.json"), "utf8"));
	const client = connect(state);
	if (action === "status") {
		const runs = await client.agentRuns.list({ project: state.projectId });
		const agents = await Promise.all(
			runs.map(async (run) => ({ run, harness: await client.agentRuns.harness({ id: run.id }) })),
		);
		const queue = await client.controller.list({ projectId: state.projectId });
		await save(join(root, "latest.json"), { at: new Date().toISOString(), agents, queue });
		await event(root, { action, agents, queue });
		console.log(
			JSON.stringify(
				{
					agents: agents.map(({ run, harness }) => ({
						id: run.id,
						kind: run.kind,
						state: run.state,
						error: run.error,
						workspace: run.workspaceId,
						harnessState: harness?.state,
						result: harness?.result?.slice(0, 1000),
						pending: harness?.pendingPermissions,
						assistantMessages: harness?.transcript.filter((message) => message.role === "assistant").length,
					})),
					queue: queue.map((item) => ({
						id: item.id,
						generation: item.generation,
						state: item.state,
						actions: item.events.map((event) => event.action),
						error: item.error,
					})),
				},
				null,
				2,
			),
		);
	} else if (action === "ticket") {
		if (state.ticketId) throw new Error("This acceptance already has its one ticket.");
		const snapshot = await client.agentRuns.harness({ id: state.managerRunId });
		if (snapshot?.state !== "idle" || !snapshot.result?.includes("MANAGER_IDLE"))
			throw new Error("The manager must finish its initial idle turn before the ticket exists.");
		const ticket = await client.tickets.create({
			project: state.projectId,
			title: "Implement and verify a deterministic slug function",
			description:
				"Create slug.ts with export function slug(input: string): string. Trim leading/trailing whitespace, lowercase ASCII letters, replace every run of characters outside a-z or 0-9 with one hyphen, remove leading/trailing hyphens, and return an empty string if no alphanumeric characters remain. Create slug.test.ts with bun:test cases for mixed case, repeated separators, punctuation-only, numbers, and empty input. Do not install dependencies. Run and register current evidence through Trellis. Report for local human review; do not mark done.",
		});
		state.ticketId = ticket.id;
		await save(join(root, "state.json"), state);
		await event(root, { action, ticket, managerBefore: snapshot });
		console.log(JSON.stringify(ticket, null, 2));
	} else if (action === "permission") {
		if (!runId || !requestId || !["allow", "deny"].includes(decision ?? ""))
			throw new Error("Use permission <root> <run-id> <request-id> <allow|deny>.");
		const runs = await client.agentRuns.list({ project: state.projectId });
		if (!runs.some((run) => run.id === runId))
			throw new Error("The requested run does not belong to this scratch project.");
		const pending = (await client.agentRuns.harness({ id: runId }))?.pendingPermissions.find(
			(request) => request.requestId === requestId,
		);
		if (!pending) throw new Error("The specific permission request is not pending.");
		await event(root, { action, runId, decision, request: pending });
		await client.agentRuns.permission({ id: runId, requestId, behavior: decision as "allow" | "deny" });
		console.log(JSON.stringify({ runId, requestId, decision }));
	} else if (action === "evidence") {
		const runs = await client.agentRuns.list({ project: state.projectId });
		const worker = runs.find((run) => run.kind === "builder");
		if (!worker) throw new Error("The manager has not created a worker.");
		const evidence = await client.evidence.list({ runId: worker.id });
		await save(join(root, "evidence.json"), evidence);
		console.log(JSON.stringify({ worker, evidence }, null, 2));
	} else if (action === "stop") {
		for (const run of await client.agentRuns.list({ project: state.projectId }))
			if (["running", "starting", "interrupted"].includes(run.state)) await client.agentRuns.stop({ id: run.id });
		const runtime = new RuntimeClient(join(state.home, "runtime/runtime.sock"));
		await runtime.shutdown();
		await event(root, { action, hostPid: state.pid });
		process.kill(state.pid, "SIGTERM");
		console.log("Stopped the scratch host and runtime.");
	} else throw new Error("Use setup, status, ticket, permission, evidence, or stop.");
}
