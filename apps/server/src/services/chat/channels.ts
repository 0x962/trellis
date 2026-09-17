import {
	type ChatChannel,
	ChatChannelCreateInputSchema,
	ChatProjectInputSchema,
	chatChannelName,
	DEFAULT_CHAT_CHANNELS,
} from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import { requireActor, type ServiceCtx, SYSTEM_ACTOR } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";
import { upsert } from "../actors.ts";
import { assertProjectActive, resolveProject } from "../refs.ts";
import { channelSelect, type RawChannel, toChannel } from "./rows.ts";

// Every project, a root or a sub-project, has its own room. A sub-project
// shares nothing with its parent.
export const resolveRoom = (ctx: ServiceCtx, tx: Tx, ref: string) => resolveProject(ctx, tx, ref);

// Inserts the channels every room starts with. The project create calls it
// for every new project.
export const seedDefaultChannels = async (ctx: ServiceCtx, tx: Tx, rootId: string) => {
	await upsert(ctx, tx, SYSTEM_ACTOR);
	for (const channel of DEFAULT_CHAT_CHANNELS) {
		await tx.execute(
			sql`INSERT INTO chat_channels (project_id, name, ai_only, direct, actor_name, actor_kind, created_at)
				VALUES (${rootId}, ${channel.name}, ${channel.aiOnly}, ${channel.direct}, ${SYSTEM_ACTOR.name}, ${SYSTEM_ACTOR.kind}, ${ctx.now}) ON CONFLICT DO NOTHING`,
		);
	}
};

// Inserts a channel when the room has none of that name. Returns the row's
// flags and whether this call inserted it.
export const ensureChannel = async (ctx: ServiceCtx, tx: Tx, rootId: string, name: string, aiOnly = false) => {
	const actor = requireActor(ctx);
	await upsert(ctx, tx, actor);
	const inserted = await rows<{ name: string }>(
		tx,
		sql`INSERT INTO chat_channels (project_id, name, ai_only, actor_name, actor_kind, created_at)
			VALUES (${rootId}, ${name}, ${aiOnly}, ${actor.name}, ${actor.kind}, ${ctx.now}) ON CONFLICT DO NOTHING RETURNING name`,
	);
	if (inserted.length > 0) {
		ctx.emit({ type: "chat.channels", projectId: rootId });
		return { inserted: true, aiOnly, direct: false };
	}
	const [existing] = await rows<{ ai_only: boolean; direct: boolean }>(
		tx,
		sql`SELECT ai_only, direct FROM chat_channels WHERE project_id = ${rootId} AND name = ${name}`,
	);
	return { inserted: false, aiOnly: existing!.ai_only, direct: existing!.direct };
};

export const list = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<ChatChannel[]> => {
	const input = ChatProjectInputSchema.parse(rawInput);
	const root = await resolveRoom(ctx, tx, input.project);
	const filters: SQL[] = [sql`c.project_id = ${root.id}`];
	if (input.q !== undefined) {
		const pattern = `%${input.q.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
		filters.push(sql`c.name ILIKE ${pattern}`);
	}
	if (input.aiOnly !== undefined) filters.push(sql`c.ai_only = ${input.aiOnly}`);
	if (input.direct !== undefined) filters.push(sql`c.direct = ${input.direct}`);
	const order = {
		name: sql`c.name`,
		"-name": sql`c.name DESC`,
		lastMessageAt: sql`last_message_at NULLS LAST, c.name`,
		"-lastMessageAt": sql`last_message_at DESC NULLS LAST, c.name`,
		messageCount: sql`message_count, c.name`,
		"-messageCount": sql`message_count DESC, c.name`,
	}[input.sort];
	const limit = input.limit === undefined ? sql`` : sql`LIMIT ${input.limit}`;
	const found = await rows<RawChannel>(
		tx,
		sql`${channelSelect} WHERE ${sql.join(filters, sql` AND `)} ORDER BY ${order} ${limit}`,
	);
	return found.map(toChannel);
};

export const create = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<ChatChannel> => {
	const input = ChatChannelCreateInputSchema.parse(rawInput);
	const root = await resolveRoom(ctx, tx, input.project);
	assertProjectActive(ctx, root.id);
	const name = chatChannelName(input.channel);
	const ensured = await ensureChannel(ctx, tx, root.id, name, input.aiOnly ?? false);
	if (!ensured.inserted) throw fail("DUPLICATE", { field: "channel" });
	const [row] = await rows<RawChannel>(tx, sql`${channelSelect} WHERE c.project_id = ${root.id} AND c.name = ${name}`);
	return toChannel(row!);
};
