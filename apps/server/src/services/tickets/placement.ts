import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";
import { resolveEpicForTicket } from "../epics/resolve.ts";
import { epicRefOf } from "../epics/rows.ts";
import { resolveWaveForTicket } from "../waves/resolve.ts";
import { waveRefOf } from "../waves/rows.ts";

// The epic and the wave of one ticket, each as its id and its canonical
// ref. A ticket with a wave always has the epic of that wave.
export type Placement = {
	epicId: string | null;
	epicRef: string | null;
	waveId: string | null;
	waveRef: string | null;
};

// A ref is a canonical string. `null` clears the field, and an absent field
// asks for no change.
type PlacementInput = { epic?: string | null | undefined; wave?: string | null | undefined };

const noWave = { waveId: null, waveRef: null };

// The placement a ticket of `rootId` has after a write that holds `input`.
// A `wave` value places the ticket in the epic of that wave, so
// one call places a ticket. An `epic` value beside it must name that same
// epic (WAVE_OUTSIDE_EPIC). An `epic` value that differs from the
// current epic, or `epic: null`, clears the wave, because the wave
// belongs to the epic that the ticket leaves.
export const resolvePlacement = async (
	ctx: ServiceCtx,
	tx: Tx,
	rootId: string,
	current: Placement,
	input: PlacementInput,
): Promise<Placement> => {
	if (typeof input.wave === "string") {
		const wave = await resolveWaveForTicket(ctx, tx, rootId, input.wave);
		if (input.epic !== undefined) {
			const named = input.epic === null ? null : await resolveEpicForTicket(ctx, tx, rootId, input.epic);
			if (named?.id !== wave.epic_id) throw fail("WAVE_OUTSIDE_EPIC");
		}
		return {
			epicId: wave.epic_id,
			epicRef: epicRefOf({ root_key: wave.root_key, slug: wave.epic_slug }),
			waveId: wave.id,
			waveRef: waveRefOf(wave),
		};
	}
	let next = current;
	if (input.epic !== undefined) {
		const epic = input.epic === null ? null : await resolveEpicForTicket(ctx, tx, rootId, input.epic);
		if ((epic?.id ?? null) !== current.epicId) {
			next = { epicId: epic?.id ?? null, epicRef: epic === null ? null : epicRefOf(epic), ...noWave };
		}
	}
	if (input.wave === null) next = { ...next, ...noWave };
	return next;
};

// The activity values and the SET clause of each placement field that
// differs between `from` and `to`, the epic first.
export const placementChanges = (from: Placement, to: Placement) => [
	...(from.epicId === to.epicId
		? []
		: [
				{
					field: "epic",
					from: from.epicRef,
					to: to.epicRef,
					meta: { fromId: from.epicId, toId: to.epicId },
					set: sql`epic_id = ${to.epicId}`,
				},
			]),
	...(from.waveId === to.waveId
		? []
		: [
				{
					field: "wave",
					from: from.waveRef,
					to: to.waveRef,
					meta: { fromId: from.waveId, toId: to.waveId },
					set: sql`wave_id = ${to.waveId}`,
				},
			]),
];
