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

// Every project, a root or a sub-project, has its own room. A sub-project
// shares nothing with its parent.
export const resolveRoom = (ctx: ServiceCtx, tx: Tx, ref: string) => resolveProject(ctx, tx, ref);

// Inserts the channels every room starts with. The project create calls it
// for every new project.
export const seedDefaultChannels = async (ctx: ServiceCtx, tx: Tx, rootId: string) => {
	await upsert(ctx, tx, SYSTEM_ACTOR);
	for (const name of DEFAULT_CHAT_CHANNELS) {
		await tx.execute(
			sql`INSERT INTO chat_channels (project_id, name, ai_only, actor_name, actor_kind, created_at)
				VALUES (${rootId}, ${name}, ${name === "ai"}, ${SYSTEM_ACTOR.name}, ${SYSTEM_ACTOR.kind}, ${ctx.now}) ON CONFLICT DO NOTHING`,
		);
	}
};

// Inserts a channel when the room has none of that name. Returns the row's
// `ai_only` flag and whether this call inserted it.
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
		return { inserted: true, aiOnly };
	}
	const [existing] = await rows<{ ai_only: boolean }>(
		tx,
		sql`SELECT ai_only FROM chat_channels WHERE project_id = ${rootId} AND name = ${name}`,
	);
	return { inserted: false, aiOnly: existing!.ai_only };
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
	const ensured = await ensureChannel(ctx, tx, root.id, name, input.aiOnly ?? false);
	if (!ensured.inserted) throw fail("DUPLICATE", { field: "channel" });
	const [row] = await rows<RawChannel>(tx, sql`${channelSelect} WHERE c.project_id = ${root.id} AND c.name = ${name}`);
	return toChannel(row!);
};
