import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { getRun, type LaunchRun } from "../agentRuns/queries.ts";
import { create as createEpic } from "../epics/epics.ts";
import { create as createNote } from "../notes/notes.ts";
import { create as createTicket } from "../tickets/create.ts";
import { create as createWave } from "../waves/waves.ts";
import { agentPrompt } from "./agentPrompt.ts";
import { launchGuide } from "./launchGuide.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: ServiceCtx;
let run: LaunchRun;
let lastResource: string;
const projectId = ulid();
const at = new Date("2026-09-23T10:00:00Z");
const tx = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(
		sql`INSERT INTO projects (id,key,slug,name,created_at,updated_at) VALUES (${projectId},'DEMO','demo','Example app',${at},${at})`,
	);
	await db.execute(
		sql`INSERT INTO statuses (id,project_id,name,slug,category,color,position,is_default,description,created_at,updated_at) VALUES (${ulid()},${projectId},'Author validation','author-validation','todo','fg-muted',0,true,'The author verifies the change.',${at},${at})`,
	);
	const cache = createCache();
	await tx((tx) => cache.rebuild(tx));
	ctx = {
		actor: { kind: "human", name: "Sam" },
		session: null,
		reqId: ulid(),
		now: at,
		cache,
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://example.local",
	};
	const epic = await tx((tx) =>
		createEpic(ctx, tx, { project: "DEMO", name: "Accounts", description: "The account plan." }),
	);
	const other = await tx((tx) => createEpic(ctx, tx, { project: "DEMO", name: "Billing" }));
	const wave = await tx((tx) => createWave(ctx, tx, { epic: epic.ref, name: "Foundation" }));
	await tx((tx) => createWave(ctx, tx, { epic: epic.ref, name: "Release" }));
	const ticket = await tx((tx) =>
		createTicket(ctx, tx, {
			project: "DEMO",
			title: "Edit settings",
			description: "Preserve the user's values.",
			wave: wave.ref,
		}),
	);
	await tx((tx) => createTicket(ctx, tx, { project: "DEMO", title: "Peer task", wave: wave.ref }));
	for (let i = 0; i < 41; i++) {
		lastResource = ulid();
		await db.execute(
			sql`INSERT INTO epic_resources (id,epic_id,kind,name,body,actor_name,actor_kind,created_at,updated_at) VALUES (${lastResource},${other.id},'doc',${`Resource ${i}`},'Reference text','Sam','human',${at},${at})`,
		);
	}
	await tx((tx) =>
		createNote(ctx, tx, {
			project: "DEMO",
			title: "Repository checks",
			body: "Run the project checks.",
			audience: "worker",
			expiresAt: null,
		}),
	);
	const id = ulid();
	await db.execute(
		sql`INSERT INTO agent_runs (id,name,kind,instruction,project_id,project_key,ticket_id,ticket_identifier,created_at,updated_at) VALUES (${id},'Builder','agent','Saved task',${projectId},'DEMO',${ticket.id},${ticket.identifier},${at},${at})`,
	);
	await db.execute(
		sql`INSERT INTO agent_start_requests (request_id,actor_kind,actor_name,run_id,target,created_at) VALUES (${crypto.randomUUID()},'human','Sam',${id},'{}',${at})`,
	);
	run = await tx((tx) => getRun(tx, id));
}, 30_000);

afterAll(async () => db.$client.close());

const input = () => ({
	run,
	workspace: "/workspace",
	branch: "work",
	attemptId: "attempt",
	host: "example-host",
	request: "Current task message",
});

test("the common guide includes full project, epic, wave, ticket, and user context", async () => {
	const prompt = await tx((tx) => agentPrompt(ctx, tx, input()));
	expect(prompt.match(/^# Trellis$/gm)).toHaveLength(1);
	expect(prompt).not.toMatch(/\{\{[a-z_.]+\}\}/);
	for (const text of [
		"Sam",
		"human:Sam",
		"Author validation",
		"The author verifies the change.",
		"Billing",
		"Release",
		"Peer task",
		lastResource,
		"Run the project checks.",
		"Preserve the user's values.",
		"Current task message",
		"example-host",
		"| Branch | work |",
	])
		expect(prompt).toContain(text);
	expect(prompt).toContain("| Timezone, when supplied | Not recorded |");
});

test("a later launch reads current ticket data and retains the specific request", async () => {
	await db.execute(sql`UPDATE tickets SET description='Updated scope' WHERE id=${run.ticketId}`);
	const prompt = await tx((tx) => agentPrompt(ctx, tx, { ...input(), request: "CI returned an error. Inspect it." }));
	expect(prompt).toContain("Updated scope");
	expect(prompt).toContain("CI returned an error. Inspect it.");
});

test("a standalone session receives the guide without another project's context", async () => {
	const prompt = await tx((tx) =>
		agentPrompt(ctx, tx, {
			...input(),
			run: { ...run, id: ulid(), kind: "session", projectId: null, ticketId: null },
			request: "Plan a small app.",
		}),
	);
	expect(prompt).toContain("# Trellis CLI");
	expect(prompt).toContain("Plan a small app.");
	expect(prompt).not.toContain("Author validation");
	expect(prompt).not.toContain(lastResource);
	expect(prompt).toContain("| Task type | session |");
});

test("a ticket resume replaces stale platform text and retains the resume message", async () => {
	const runtime = { core: ctx, now: () => at, newTx: tx } as Parameters<typeof launchGuide>[0];
	const prompt = await launchGuide(runtime, {
		run: { ...run, instruction: "Stale project-specific launch rules" },
		workspace: "/not-a-repository",
		attemptId: "attempt-2",
		message: "Resume after CI failure",
		env: {},
	});
	expect(prompt).toContain("Resume after CI failure");
	expect(prompt).not.toContain("Stale project-specific launch rules");
	expect(prompt.match(/^# Trellis$/gm)).toHaveLength(1);
});

test("flow instructions and session requests remain in the common guide", async () => {
	const runtime = { core: ctx, now: () => at, newTx: tx } as Parameters<typeof launchGuide>[0];
	for (const kind of ["flow", "session"] as const) {
		const prompt = await launchGuide(runtime, {
			run: { ...run, kind, instruction: "Preserve this specific responsibility." },
			workspace: "/not-a-repository",
			attemptId: "attempt-2",
			message: "Continue the same conversation",
			env: {},
		});
		expect(prompt).toContain("Preserve this specific responsibility.");
		expect(prompt).toContain("Continue the same conversation");
		expect(prompt.match(/^# Trellis$/gm)).toHaveLength(1);
	}
});
