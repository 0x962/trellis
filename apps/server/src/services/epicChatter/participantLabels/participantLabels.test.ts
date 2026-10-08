import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { fixture } from "../../../db/epicCancellation/fixture.ts";
import { rows } from "../../../db/queries/support.ts";
import { beginMessage } from "../beginMessage";
import { list } from "../list";

let h: Awaited<ReturnType<typeof fixture>>;
let epic: string;
const at = new Date("2026-09-30T20:00:00Z");

beforeAll(async () => {
	h = await fixture();
	epic = (await h.create("Messages")).id;
}, 30_000);
afterAll(async () => h.db.$client.close());

async function agent(ticketed: boolean, sessionName?: string, identifier?: string) {
	const ticket = ticketed ? await h.ticket(epic) : null;
	const id = ulid();
	await h.db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_id, project_key, ticket_id, ticket_identifier, created_at, updated_at)
		VALUES (${id}, 'Agent', ${ticketed ? "agent" : "session"}, '', ${h.projectId}, 'CAN',
		${ticket?.id ?? null}, ${identifier ?? null}, ${at}, ${at})`);
	if (sessionName)
		await h.db.execute(sql`INSERT INTO sessions (id, name, directory, harness, run_id, created_at, updated_at)
			VALUES (${ulid()}, ${sessionName}, '/fixture', '{"preset":"claude"}'::jsonb, ${id}, ${at}, ${at})`);
	return { id, ticket };
}

const send = (sender: string, recipient: string) =>
	h.run((tx) =>
		beginMessage({ actor: { kind: "agent", name: sender }, now: () => at }, tx, {
			id: recipient,
			text: "Complete message",
			messageId: ulid(),
		}),
	);
const message = async (id: string) =>
	(await h.run((tx) => list(h.ctx(), tx, { epic }))).items.find((item) => item.id === id)!;

test("ticket identifiers and session titles survive later record changes", async () => {
	const sender = await agent(true);
	const recipient = await agent(false, "Plan the next release");
	const receipt = (await send(sender.id, recipient.id))!;
	expect(await message(receipt.id)).toMatchObject({
		senderName: sender.ticket!.identifier,
		recipientName: "Plan the next release",
	});
	await h.db.execute(sql`UPDATE sessions SET name='New title' WHERE run_id=${recipient.id}`);
	await h.db.execute(sql`UPDATE agent_runs SET ticket_id=NULL WHERE id=${sender.id}`);
	expect(await message(receipt.id)).toMatchObject({
		senderName: sender.ticket!.identifier,
		recipientName: "Plan the next release",
	});
	await h.db.execute(sql`DELETE FROM sessions WHERE run_id=${recipient.id}`);
	await h.db.execute(sql`DELETE FROM agent_runs WHERE id IN (${sender.id}, ${recipient.id})`);
	expect(await message(receipt.id)).toMatchObject({
		senderName: sender.ticket!.identifier,
		recipientName: "Plan the next release",
	});
});

test("historical generic labels resolve in both directions without rewriting their records", async () => {
	const sender = await agent(true);
	const title = "Session with a complete title ".repeat(50).trim();
	const recipient = await agent(false, title);
	const receipt = (await send(sender.id, recipient.id))!;
	await h.db.execute(
		sql`UPDATE chatter_messages SET sender_name='Agent', recipient_name=${recipient.id} WHERE id=${receipt.id}`,
	);
	expect(await message(receipt.id)).toMatchObject({ senderName: sender.ticket!.identifier, recipientName: title });
	const stored = await h.run((tx) =>
		rows<{ sender: string; recipient: string }>(
			tx,
			sql`SELECT sender_name AS sender, recipient_name AS recipient FROM chatter_messages WHERE id=${receipt.id}`,
		),
	);
	expect(stored).toEqual([{ sender: "Agent", recipient: recipient.id }]);
	await h.db.execute(sql`DELETE FROM sessions WHERE run_id=${recipient.id}`);
	await h.db.execute(sql`DELETE FROM agent_runs WHERE id=${recipient.id}`);
	expect((await message(receipt.id)).recipientName).toBe(`Agent ${recipient.id.slice(-6)}`);
});

test("agents without a ticket or session retain a short ID and the full identity", async () => {
	const sender = await agent(false);
	const recipient = await agent(true);
	const receipt = (await send(sender.id, recipient.id))!;
	expect(await message(receipt.id)).toMatchObject({
		senderId: sender.id,
		senderName: `Agent ${sender.id.slice(-6)}`,
		recipientId: recipient.id,
		recipientName: recipient.ticket!.identifier,
	});
});

test("a retained ticket identifier labels an agent after the ticket reference clears", async () => {
	const sender = await agent(false, undefined, "CAN-204");
	const recipient = await agent(true);
	const receipt = (await send(sender.id, recipient.id))!;
	expect((await message(receipt.id)).senderName).toBe("CAN-204");
});
