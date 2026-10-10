import { WaveCreateWithTicketsInputSchema } from "@trellis/api";
import { requireActor, type ServiceCtx } from "../../../context.ts";
import type { Tx } from "../../../db/tx.ts";
import { invalidInput } from "../../../errors.ts";
import { resolveEpic } from "../../epics/resolve.ts";
import { assertProjectActive, resolveTicket } from "../../refs.ts";
import { updateMany } from "../../tickets/update.ts";
import { create, wavesOf } from "../waves.ts";

export async function createWithTickets(ctx: ServiceCtx, tx: Tx, rawInput: unknown) {
	const { tickets, ...input } = WaveCreateWithTicketsInputSchema.parse(rawInput);
	const epic = await resolveEpic(ctx, tx, input.epic);
	assertProjectActive(ctx, epic.project_id);
	requireActor(ctx);
	for (const id of tickets) {
		const ticket = await resolveTicket(ctx, tx, id);
		if (ticket.epicId !== epic.id) throw invalidInput("tickets", "Every selected ticket must belong to this epic.");
	}
	const wave = await create(ctx, tx, input);
	if (tickets.length === 0) return wave;
	await updateMany(ctx, tx, { tickets, wave: wave.id });
	return (await wavesOf(tx, epic.id)).find((entry) => entry.id === wave.id)!;
}
