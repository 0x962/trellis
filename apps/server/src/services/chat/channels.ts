import {
	type ChatChannel,
	ChatChannelCreateInputSchema,
	ChatProjectInputSchema,
	chatChannelName,
	DEFAULT_CHAT_CHANNELS,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx, SYSTEM_ACTOR } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";
import { upsert } from "../actors.ts";
import { assertProjectActive, resolveProject } from "../refs.ts";
import { channelSelect, type RawChannel, toChannel } from "./rows.ts";

// The room of any project is the room of its root.
export const resolveRoom = async (ctx: ServiceCtx, tx: Tx, ref: string) => {
	const project = await resolveProject(ctx, tx, ref);
	return ctx.cache.get(project.rootId)!;
};

// Inserts the channels every room starts with. The project create calls it
// for a new root.
export const seedDefaultChannels = async (ctx: ServiceCtx, tx: Tx, rootId: string) => {
	await upsert(ctx, tx, SYSTEM_ACTOR);
	for (const name of DEFAULT_CHAT_CHANNELS) {
		await tx.execute(
			sql`INSERT INTO chat_channels (project_id, name, actor_name, actor_kind, created_at)
				VALUES (${rootId}, ${name}, ${SYSTEM_ACTOR.name}, ${SYSTEM_ACTOR.kind}, ${ctx.now}) ON CONFLICT DO NOTHING`,
		);
	}
};

// Inserts a channel when the room has none of that name. Returns true when
// it inserted one.
export const ensureChannel = async (ctx: ServiceCtx, tx: Tx, rootId: string, name: string) => {
	const actor = requireActor(ctx);
	await upsert(ctx, tx, actor);
	const inserted = await rows<{ name: string }>(
		tx,
		sql`INSERT INTO chat_channels (project_id, name, actor_name, actor_kind, created_at)
			VALUES (${rootId}, ${name}, ${actor.name}, ${actor.kind}, ${ctx.now}) ON CONFLICT DO NOTHING RETURNING name`,
	);
	if (inserted.length === 0) return false;
	ctx.emit({ type: "chat.channels", projectId: rootId });
	return true;
};

export const list = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<ChatChannel[]> => {
	const input = ChatProjectInputSchema.parse(rawInput);
	const root = await resolveRoom(ctx, tx, input.project);
	const found = await rows<RawChannel>(tx, sql`${channelSelect} WHERE c.project_id = ${root.id} ORDER BY c.name`);
	return found.map(toChannel);
};

export const create = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<ChatChannel> => {
	const input = ChatChannelCreateInputSchema.parse(rawInput);
	const root = await resolveRoom(ctx, tx, input.project);
	assertProjectActive(ctx, root.id);
	const name = chatChannelName(input.channel);
	if (!(await ensureChannel(ctx, tx, root.id, name))) throw fail("DUPLICATE", { field: "channel" });
	const [row] = await rows<RawChannel>(tx, sql`${channelSelect} WHERE c.project_id = ${root.id} AND c.name = ${name}`);
	return toChannel(row!);
};
