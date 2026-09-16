import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import {
	create as createChannel,
	list as listChannels,
	seedDefaultChannels,
} from "../../../../../src/services/chat/channels.ts";
import { list, post } from "../../../../../src/services/chat/messages.ts";
import { create as createProject } from "../../../../../src/services/projects.ts";
import { seedChild, seedProject } from "../../../../fixtures";
import { expectError, type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let rootId: string;
let childId: string;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	rootId = (await seedProject(h.db)).rootId;
	childId = await seedChild(h.db, rootId, rootId, "web");
	await h.rows(sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,terminal_id,session_id,created_at,updated_at)
		VALUES ('manager','Trellis','Trellis','manager','Coordinate',${rootId},'CDE','manager-terminal','manager-session',now(),now()),
		('builder','Builder','Builder','builder','Build',${rootId},'CDE','builder-terminal','builder-session',now(),now()),
		('reviewer','Careful reviewer','Careful reviewer','reviewer','Review',${rootId},'CDE','reviewer-terminal',NULL,now(),now())`);
	await h.rows(sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,terminal_id,session_id,created_at,updated_at)
		VALUES ('web-builder','Builder','Builder','builder','Build',${childId},'CDE.web','web-terminal',NULL,now(),now()),
		('web-reviewer','Careful reviewer','Careful reviewer','reviewer','Review',${childId},'CDE.web','web-reviewer-terminal',NULL,now(),now())`);
	await h.rows(sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,closed_at,created_at,updated_at)
		VALUES ('gone','Builder','Builder','builder','Build',${childId},'CDE.web',now(),now(),now())`);
	await h.rebuild();
	await h.run((ctx, tx) => seedDefaultChannels(ctx, tx, rootId));
	await h.run((ctx, tx) => seedDefaultChannels(ctx, tx, childId));
});

const deliveries = () =>
	h.rows<{ run_id: string; message_id: string; state: string }>(
		sql`SELECT run_id, message_id, state FROM chat_deliveries ORDER BY run_id`,
	);

test("every project has #ai and #general, and a new project gets them at create", async () => {
	const channels = await h.run((ctx, tx) => listChannels(ctx, tx, { project: "CDE" }));
	expect(channels.map((channel) => channel.name)).toEqual(["ai", "general"]);
	expect(channels.map((channel) => channel.aiOnly)).toEqual([true, false]);
	expect(channels[0]).toMatchObject({ projectId: rootId, messageCount: 0, latestId: null, lastMessageAt: null });
	await h.run((ctx, tx) => createProject(ctx, tx, { key: "NEW", name: "New" }));
	const fresh = await h.run((ctx, tx) => listChannels(ctx, tx, { project: "NEW" }));
	expect(fresh.map((channel) => channel.name)).toEqual(["ai", "general"]);
	await h.run((ctx, tx) => createProject(ctx, tx, { parent: "NEW", slug: "api", name: "API" }));
	const sub = await h.run((ctx, tx) => listChannels(ctx, tx, { project: "NEW.api" }));
	expect(sub.map((channel) => channel.name)).toEqual(["ai", "general"]);
});

test("a sub-project has its own room, and its post reaches its own agents only", async () => {
	const posted = await h.run((ctx, tx) => post(ctx, tx, { project: "CDE.web", channel: "#General", body: "hello" }));
	expect(posted).toMatchObject({
		projectId: childId,
		channel: "general",
		body: "hello",
		actor: { name: "dana", kind: "human" },
	});
	const child = await h.run((ctx, tx) => list(ctx, tx, { project: "CDE.web", channel: "general" }));
	expect(child.items.map((message) => message.id)).toEqual([posted.id]);
	expect(child.latestId).toBe(posted.id);
	const root = await h.run((ctx, tx) => list(ctx, tx, { project: "CDE", channel: "general" }));
	expect(root.items).toEqual([]);
	expect((await deliveries()).map((row) => row.run_id)).toEqual(["web-builder", "web-reviewer"]);
	expect(h.flushed).toContainEqual({
		type: "chat.message",
		id: posted.id,
		projectId: childId,
		channel: "general",
		aiOnly: false,
		actor: { name: "dana", kind: "human" },
	});
});

test("a post reaches every live agent of the project except its author", async () => {
	await h.run((ctx, tx) => post(ctx, tx, { project: "CDE", channel: "ai", body: "who owns the migration?" }), {
		actor: { kind: "agent", name: "builder" },
	});
	expect((await deliveries()).map((row) => row.run_id)).toEqual(["manager", "reviewer"]);
	expect((await deliveries()).every((row) => row.state === "pending")).toBe(true);
});

test("a mention by run id, persona name, or role restricts the recipients and marks them direct", async () => {
	await h.run((ctx, tx) => post(ctx, tx, { project: "CDE", channel: "general", body: "@builder rebase first" }));
	expect((await deliveries()).map((row) => row.run_id)).toEqual(["builder"]);
	expect(await h.rows(sql`SELECT direct FROM chat_deliveries`)).toEqual([{ direct: true }]);
	await h.rows(sql`DELETE FROM chat_deliveries`);
	await h.run((ctx, tx) => post(ctx, tx, { project: "CDE", channel: "general", body: "@manager where are we?" }));
	expect((await deliveries()).map((row) => row.run_id)).toEqual(["manager"]);
	await h.rows(sql`DELETE FROM chat_deliveries`);
	await h.run((ctx, tx) => post(ctx, tx, { project: "CDE", channel: "general", body: "@Careful Reviewer take TRL-1" }));
	expect((await deliveries()).map((row) => row.run_id)).toEqual(["reviewer"]);
	await h.rows(sql`DELETE FROM chat_deliveries`);
	await h.run((ctx, tx) => post(ctx, tx, { project: "CDE", channel: "general", body: "@nobody is here" }));
	expect((await deliveries()).map((row) => row.run_id)).toEqual(["builder", "manager", "reviewer"]);
	expect(await h.rows(sql`SELECT DISTINCT direct FROM chat_deliveries`)).toEqual([{ direct: false }]);
});

test("a message shows the delivery state of each recipient", async () => {
	const posted = await h.run((ctx, tx) => post(ctx, tx, { project: "CDE", channel: "general", body: "@Trellis ping" }));
	expect(posted.notifications).toEqual([
		{ runId: "manager", personaName: "Trellis", state: "pending", error: null, direct: true },
	]);
	const page = await h.run((ctx, tx) => list(ctx, tx, { project: "CDE", channel: "general" }));
	expect(page.items[0]!.actor).toEqual({ name: "dana", kind: "human" });
});

test("a post to an unknown channel creates it, and a read of one does not", async () => {
	await h.run((ctx, tx) => post(ctx, tx, { project: "CDE", channel: "release", body: "cut 1.2" }));
	const channels = await h.run((ctx, tx) => listChannels(ctx, tx, { project: "CDE" }));
	expect(channels.map((channel) => channel.name)).toEqual(["ai", "general", "release"]);
	expect(channels[2]).toMatchObject({
		messageCount: 1,
		latestId: expect.any(String),
		lastMessageAt: "2026-09-09T12:00:00.000Z",
	});
	expect(h.flushed).toContainEqual({ type: "chat.channels", projectId: rootId });
	await expectError(
		h.run((ctx, tx) => list(ctx, tx, { project: "CDE", channel: "missing" })),
		"NOT_FOUND",
	);
});

test("a channel create refuses a duplicate name", async () => {
	const created = await h.run((ctx, tx) => createChannel(ctx, tx, { project: "CDE", channel: "#Deploys" }));
	expect(created).toMatchObject({ name: "deploys", messageCount: 0 });
	await expectError(
		h.run((ctx, tx) => createChannel(ctx, tx, { project: "CDE", channel: "deploys" })),
		"DUPLICATE",
	);
});

test("after reads only what follows one id, and the default read is the newest page", async () => {
	const ids: string[] = [];
	for (const body of ["one", "two", "three"]) {
		ids.push((await h.run((ctx, tx) => post(ctx, tx, { project: "CDE", channel: "general", body }))).id);
	}
	const tail = await h.run((ctx, tx) => list(ctx, tx, { project: "CDE", channel: "general", after: ids[0] }));
	expect(tail.items.map((message) => message.body)).toEqual(["two", "three"]);
	const newest = await h.run((ctx, tx) => list(ctx, tx, { project: "CDE", channel: "general", limit: 2 }));
	expect(newest.items.map((message) => message.body)).toEqual(["two", "three"]);
	expect(newest.latestId).toBe(ids[2]!);
});

test("an archived root refuses a post and a channel", async () => {
	await h.rows(sql`UPDATE projects SET archived_at = now() WHERE id = ${rootId}`);
	await h.rebuild();
	await expectError(
		h.run((ctx, tx) => post(ctx, tx, { project: "CDE.web", channel: "general", body: "x" })),
		"PROJECT_ARCHIVED",
	);
	await expectError(
		h.run((ctx, tx) => createChannel(ctx, tx, { project: "CDE", channel: "x" })),
		"PROJECT_ARCHIVED",
	);
});

test("a project delete removes its room", async () => {
	await h.run((ctx, tx) => post(ctx, tx, { project: "CDE", channel: "general", body: "bye" }));
	await h.rows(sql`DELETE FROM agent_runs`);
	await h.rows(sql`DELETE FROM tickets`);
	await h.rows(sql`DELETE FROM projects WHERE id = ${childId}`);
	await h.rows(sql`DELETE FROM projects WHERE id = ${rootId}`);
	expect(await h.rows(sql`SELECT 1 FROM chat_channels`)).toEqual([]);
	expect(await h.rows(sql`SELECT 1 FROM chat_messages`)).toEqual([]);
});
