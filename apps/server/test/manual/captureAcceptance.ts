import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createTrellisClient } from "@trellis/api";
import { dispatchMessageId } from "../../src/services/controller/messageId.ts";

const root = process.argv[2];
if (!root?.startsWith("/tmp/trl-real-")) throw new Error("Supply the scratch /tmp/trl-real-* directory.");
const state = JSON.parse(await readFile(join(root, "state.json"), "utf8"));
const source = resolve(import.meta.dir, "../../../..");
const output = resolve(process.argv[3] ?? join(root, "capture"));
await mkdir(output, { recursive: true });
const client = createTrellisClient(state.url, "human:acceptance", (request, init) => {
	request.headers.set("authorization", `Bearer ${state.token}`);
	return fetch(request, init);
});
const runs = await client.agentRuns.list({ project: state.projectId });
const agents = await Promise.all(
	runs.map(async (run) => ({
		id: run.id,
		kind: run.kind,
		terminalId: run.terminalId,
		workspaceId: run.workspaceId,
		harness: await client.agentRuns.harness({ id: run.id }),
	})),
);
const worker = runs.find((run) => run.kind === "builder")!;
const manager = runs.find((run) => run.kind === "manager")!;
const evidence = await client.evidence.list({ runId: worker.id });
const ticket = await client.tickets.get({ ticket: state.ticketId });
const timeline = await client.timeline.list({ ticket: state.ticketId, limit: 100 });
const queue = await client.controller.list({ projectId: state.projectId });
const before = JSON.parse(await readFile(join(root, "before-fix.json"), "utf8")) as { queue: typeof queue };
const unknown = before.queue.find((row) => row.state === "unknown")!;
const messageId = dispatchMessageId(unknown);
const raw = JSON.parse(
	await readFile(join(state.home, "runtime/sessions", `${manager.terminalId}.output.json`), "utf8"),
) as { offset: number; data: string };
const records = Buffer.from(raw.data, "base64")
	.toString()
	.split("\n")
	.filter(Boolean)
	.map((line) => JSON.parse(line) as { type?: string; uuid?: string });
const acknowledgementCount = records.filter((row) => row.type === "user" && row.uuid === messageId).length;
const events = (await readFile(join(root, "events.jsonl"), "utf8"))
	.split("\n")
	.filter(Boolean)
	.map((line) => JSON.parse(line) as { action: string; at: string; [key: string]: unknown });
const permissions = events.filter((row) => row.action === "permission");
const independent = execFileSync(process.execPath, [join(root, "independent.ts")], { encoding: "utf8" }).trim();
const test = execFileSync(process.execPath, ["test", "slug.test.ts"], {
	cwd: worker.workspaceId!,
	encoding: "utf8",
	stdio: ["ignore", "pipe", "pipe"],
});
const files = await Promise.all(
	["slug.ts", "slug.test.ts"].map(async (path) => {
		const bytes = await readFile(join(worker.workspaceId!, path));
		await writeFile(join(output, `${path}.txt`), bytes);
		return { path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
	}),
);
const controllerFiles = ["controller.ts", "dispatch.ts", "reconcile.ts"];
const code = await Promise.all(
	controllerFiles.map(async (path) => ({
		path: `apps/server/src/services/controller/${path}`,
		sha256: createHash("sha256")
			.update(await readFile(join(source, "apps/server/src/services/controller", path)))
			.digest("hex"),
	})),
);
const assertions = {
	oneManager: runs.filter((run) => run.kind === "manager").length === 1,
	oneWorker: runs.filter((run) => run.kind === "builder").length === 1,
	allIdle: agents.every((agent) => agent.harness?.state === "idle" && agent.harness.pendingPermissions.length === 0),
	queueClear: queue.every((row) => row.state === "sent"),
	originalGenerationPreserved: queue.find((row) => row.id === unknown.id)?.generation === unknown.generation,
	oneAcknowledgement: raw.offset === 0 && acknowledgementCount === 1,
	currentEvidence:
		evidence.readyForReview &&
		evidence.artifacts.length === 2 &&
		evidence.artifacts.every((artifact) => artifact.current),
	artifactHashesMatch: files.every((file) =>
		evidence.artifacts.some((artifact) => artifact.path === file.path && artifact.sha256 === file.sha256),
	),
	managerReview:
		agents.find((agent) => agent.kind === "manager")?.harness?.result?.includes("READY_FOR_LOCAL_REVIEW") === true,
};
const result = {
	capturedAt: new Date().toISOString(),
	sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: source, encoding: "utf8" }).trim(),
	code,
	root,
	url: state.url,
	assertions,
	ticket,
	timeline,
	agents,
	evidence,
	queue,
	originalUnknownDispatch: unknown,
	messageId,
	acknowledgementCount,
	permissionCount: permissions.length,
	restart: events.find((event) => event.action === "host-restart"),
	independent: JSON.parse(independent),
	ownBunTestExitCode: 0,
	ownBunTestStdout: test,
	files,
};
await writeFile(join(output, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
await writeFile(
	join(output, "permissions.jsonl"),
	`${permissions.map((record) => JSON.stringify(record)).join("\n")}\n`,
);
await writeFile(join(output, "independent.ts.txt"), await readFile(join(root, "independent.ts")));
console.log(JSON.stringify({ output, assertions, permissionCount: permissions.length }, null, 2));
if (Object.values(assertions).some((passed) => !passed)) throw new Error("A real acceptance assertion failed.");
