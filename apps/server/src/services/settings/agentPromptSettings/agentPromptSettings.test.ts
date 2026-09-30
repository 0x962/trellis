import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { defaultAgentPrompt } from "@trellis/api/agent-guide";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../../context";
import { createCache } from "../../../db/cache";
import { openTestDb } from "../../../db/testDb";
import type { Tx } from "../../../db/tx";
import { agentPrompt } from "../../agentPrompt/agentPrompt";
import { launchGuide } from "../../agentPrompt/launchGuide";
import { getRun, type LaunchRun } from "../../agentRuns/queries";
import { create as createTicket } from "../../tickets/create";
import { setAgentPrompt } from "../setAgentPrompt";
import { agentPromptSettings } from "./agentPromptSettings";

let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: ServiceCtx;
let run: LaunchRun;
const at = new Date("2026-09-30T08:00:00Z");
const tx = <T>(callback: (tx: Tx) => Promise<T>) => db.transaction(callback);
const read = () => tx((tx) => agentPromptSettings(ctx, tx));
const save = async (template: string | null, expectedTemplate?: string) =>
	tx(async (tx) =>
		setAgentPrompt(ctx, tx, {
			template,
			expectedTemplate: expectedTemplate ?? (await agentPromptSettings(ctx, tx)).template,
		}),
	);

beforeAll(async () => {
	db = await openTestDb();
	const project = ulid();
	await db.execute(sql`INSERT INTO projects (id,key,slug,name,created_at,updated_at)
		VALUES (${project},'PROMPT','prompt','Prompt project',${at},${at})`);
	await db.execute(sql`INSERT INTO statuses (id,project_id,name,slug,category,color,position,is_default,created_at,updated_at)
		VALUES (${ulid()},${project},'Todo','todo','todo','fg-muted',0,true,${at},${at})`);
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
	const ticket = await tx((tx) => createTicket(ctx, tx, { project: "PROMPT", title: "Edit the prompt" }));
	const id = ulid();
	await db.execute(sql`INSERT INTO agent_runs
		(id,name,kind,instruction,project_id,project_key,ticket_id,ticket_identifier,session_id,created_at,updated_at)
		VALUES (${id},'Builder','agent','Specific responsibility',${project},'PROMPT',${ticket.id},${ticket.identifier},'provider-conversation',${at},${at})`);
	await db.execute(sql`INSERT INTO agent_start_requests (request_id,actor_kind,actor_name,run_id,target,created_at)
		VALUES (${crypto.randomUUID()},'human','Sam',${id},'{}',${at})`);
	run = await tx((tx) => getRun(tx, id));
}, 30_000);

afterEach(async () => {
	await save(null);
});
afterAll(async () => {
	await db.$client.close();
});

test("an absent override exposes the full default and variable list", async () => {
	const value = await read();
	expect(value.template).toBe(defaultAgentPrompt);
	expect(value.defaultTemplate).toBe(defaultAgentPrompt);
	expect(value.isCustom).toBe(false);
	expect(value.variables).toContain("ticket.title");
	expect(value.variables).toContain("session.request");
});

test("saves preserve exact text and restore the current default", async () => {
	const template = " # Prompt\n\t{{ticket.title}}\n\n{{session.request}}  \n";
	expect((await save(template)).template).toBe(template);
	expect((await read()).isCustom).toBe(true);
	expect((await save(null)).template).toBe(defaultAgentPrompt);
	expect((await read()).isCustom).toBe(false);
});

test("a stale save or reset cannot overwrite another edit", async () => {
	await save("New instructions. {{session.request}}", defaultAgentPrompt);
	for (const template of ["Stale instructions.", null])
		await expect(save(template, defaultAgentPrompt)).rejects.toThrow("differs from your copy");
	expect((await read()).template).toBe("New instructions. {{session.request}}");
});

test("invalid templates and anonymous writes leave the saved value intact", async () => {
	for (const template of [" \n ", "{{ticket.typo}}"]) await expect(save(template)).rejects.toThrow();
	await expect(
		tx((tx) =>
			setAgentPrompt({ ...ctx, actor: null }, tx, {
				template: "Other instructions",
				expectedTemplate: defaultAgentPrompt,
			}),
		),
	).rejects.toThrow();
	expect((await read()).template).toBe(defaultAgentPrompt);
});

test("the saved template receives fresh context without changing the assignment or conversation", async () => {
	await save(
		"{{user.name}} / {{project.name}} / {{ticket.title}}\n{{session.request}}\n{{session.workspace}} / {{session.branch}}",
	);
	await db.execute(sql`UPDATE tickets SET title='Current task' WHERE id=${run.ticketId}`);
	const prompt = await tx((tx) =>
		agentPrompt(ctx, tx, {
			run,
			workspace: "/workspace",
			branch: "work",
			attemptId: "attempt",
			host: "host",
			request: "Keep {{ticket.title}} literal.",
		}),
	);
	expect(prompt).toBe("Sam / Prompt project / Current task\nKeep {{ticket.title}} literal.\n/workspace / work");
	const stored = await tx((tx) => getRun(tx, run.id));
	expect(stored.sessionId).toBe("provider-conversation");
	expect(stored.closedAt).toBeNull();
	expect(stored.workspaceId).toBe(run.workspaceId);
	expect(stored.instruction).toBe(run.instruction);
});

test("the next ticket, flow, and session start or resume uses the current template", async () => {
	const runtime = { core: ctx, now: () => at, newTx: tx } as Parameters<typeof launchGuide>[0];
	for (const kind of ["agent", "flow", "session"] as const) {
		await save("First: {{session.task_type}}\n{{session.request}}");
		const input = { run: { ...run, kind }, workspace: "/not-a-repository", attemptId: "next", env: {} };
		const start = await launchGuide(runtime, input);
		expect(start).toStartWith(`First: ${kind}\n`);
		expect(start).toContain(kind === "agent" ? "Complete the assigned ticket" : "Specific responsibility");
		await save("Second: {{session.task_type}}\n{{session.request}}");
		const resume = await launchGuide(runtime, { ...input, message: "Continue the same conversation" });
		expect(resume).toStartWith(`Second: ${kind}\n`);
		expect(resume).toContain("Continue the same conversation");
	}
});
