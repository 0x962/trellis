import { afterEach, beforeEach, expect, test } from "bun:test";
import type { ActorRef } from "@trellis/api";
import { sql } from "drizzle-orm";
import { linkPr, seedPr } from "../../../fixtures/prs.ts";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

const runId = "01M2HGY58VB4J2AYRVGDFHHB3P";
let t: TestApp;
beforeEach(async () => {
	t = await createTestApp();
	await t.seedProject("NAME");
	await t.editServerTx(async (tx) => {
		await tx.execute(sql`INSERT INTO agent_runs
			(id, name, persona_name, kind, instruction, project_path, closed_at, created_at, updated_at)
			VALUES (${runId}, 'Hana', 'Manager', 'manager', 'Manage', 'NAME', now(), now(), now())`);
	});
});
afterEach(async () => {
	await t.serverTx(assertStatusInvariant);
	await t.close();
});

test.each<ActorRef>([
	{ name: runId, kind: "agent", displayName: "Manager" },
	{ name: runId, kind: "human" },
	{ name: "external-builder", kind: "agent" },
])("ticket summaries, attachments and filters retain actor identity for $kind:$name", async (actor) => {
	const header = `${actor.kind}:${actor.name}`;
	const created = await t.createTicket({ project: "NAME", title: "Named actor" }, header);
	expect(created.lastActor).toMatchObject(actor);
	expect(created.lastActor?.displayName).toBe(actor.displayName);
	const form = new FormData();
	form.set("file", new File(["evidence"], "evidence.txt", { type: "text/plain" }));
	const uploaded = await t.api(`/api/tickets/${created.identifier}/attachments`, {
		method: "POST",
		actor: header,
		raw: form,
	});
	expect(uploaded.status).toBe(201);
	expect(uploaded.body.attachment.actor).toEqual(actor);
	await t.editServerTx(async (tx) => {
		const prId = await seedPr(tx, { number: 17 });
		await linkPr(tx, created.id, prId, actor);
	});
	const ticket = await t.api(`/api/tickets/${created.identifier}`);
	expect(ticket.body.lastActor).toMatchObject(actor);
	expect(ticket.body.attachments[0].actor).toEqual(actor);
	expect(ticket.body.prs[0].linkedBy).toEqual(actor);
	const prs = await t.api(`/api/tickets/${created.identifier}/prs`);
	expect(prs.body[0].linkedBy).toEqual(actor);
	const list = await t.api("/api/tickets?project=NAME");
	expect(list.body.items[0].lastActor).toMatchObject(actor);
	const attachments = await t.api(`/api/tickets/${created.identifier}/attachments`);
	expect(attachments.body[0].actor).toEqual(actor);
	const seen = await t.api("/api/actors");
	const found = seen.body.find(
		(item: { name: string; kind: string }) => item.name === actor.name && item.kind === actor.kind,
	);
	expect(found).toMatchObject(actor);
	expect(found.displayName).toBe(actor.displayName);
});
