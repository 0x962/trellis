import {
	type ChatList,
	ChatListInputSchema,
	type ChatMessage,
	ChatPostInputSchema,
	chatChannelName,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { requireActor, type ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";
import { upsert } from "../actors.ts";
import { assertProjectActive } from "../refs.ts";
import { ensureChannel, resolveRoom } from "./channels.ts";
import { enqueue } from "./enqueue.ts";
import { messageById, messageSelect, type RawMessage, toMessage } from "./rows.ts";

const channelExists = async (tx: Tx, rootId: string, name: string) =>
	(await rows(tx, sql`SELECT 1 FROM chat_channels WHERE project_id = ${rootId} AND name = ${name}`)).length > 0;

export const list = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<ChatList> => {
	const input = ChatListInputSchema.parse(rawInput);
	const root = await resolveRoom(ctx, tx, input.project);
	const name = chatChannelName(input.channel);
	if (!(await channelExists(tx, root.id, name))) throw fail("NOT_FOUND", { kind: "channel", ref: `#${name}` });
	const scope = sql`m.project_id = ${root.id} AND m.channel = ${name}`;
	const found =
		input.after === undefined
			? (
					await rows<RawMessage>(tx, sql`${messageSelect} WHERE ${scope} ORDER BY m.id DESC LIMIT ${input.limit}`)
				).reverse()
			: await rows<RawMessage>(
					tx,
					sql`${messageSelect} WHERE ${scope} AND m.id > ${input.after} ORDER BY m.id LIMIT ${input.limit}`,
				);
	const [latest] = await rows<{ id: string | null }>(
		tx,
		sql`SELECT max(m.id) AS id FROM chat_messages m WHERE ${scope}`,
	);
	return { channel: name, items: found.map(toMessage), latestId: latest!.id };
};

// A post to a channel the room lacks creates the channel first, as a JOIN
// does on IRC.
export const post = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<ChatMessage> => {
	const input = ChatPostInputSchema.parse(rawInput);
	const root = await resolveRoom(ctx, tx, input.project);
	assertProjectActive(ctx, root.id);
	const actor = requireActor(ctx);
	const name = chatChannelName(input.channel);
	await ensureChannel(ctx, tx, root.id, name);
	await upsert(ctx, tx, actor);
	const id = ulid();
	await tx.execute(
		sql`INSERT INTO chat_messages (id, project_id, channel, body, actor_name, actor_kind, created_at)
			VALUES (${id}, ${root.id}, ${name}, ${input.body}, ${actor.name}, ${actor.kind}, ${ctx.now})`,
	);
	await enqueue(tx, { messageId: id, rootId: root.id, body: input.body, actor });
	ctx.emit({ type: "chat.message", id, projectId: root.id, channel: name, actor });
	return messageById(tx, id);
};
