import type { TicketCreateInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../context.ts";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { invalidInput } from "../../../errors.ts";
import { create as createEpic } from "../../epics/epics.ts";
import { resolveEpicForTicket } from "../../epics/resolve.ts";
import { create as createWave } from "../../waves/waves.ts";
import { resolvePlacement } from "../placement.ts";

// tickets.create locks the project counter before this call. The same
// transaction creates the defaults and the ticket, so concurrent requests reuse them.
export const createPlacement = async (ctx: ServiceCtx, tx: Tx, projectId: string, input: TicketCreateInput) => {
	const empty = { epicId: null, epicRef: null, waveId: null, waveRef: null };
	if (input.wave !== undefined) return resolvePlacement(ctx, tx, projectId, empty, input);
	let epicId: string;
	if (input.epic !== undefined) {
		epicId = (await resolveEpicForTicket(ctx, tx, projectId, input.epic)).id;
	} else {
		const epics = await rows<{ id: string; slug: string }>(
			tx,
			sql`SELECT id, slug FROM epics WHERE project_id = ${projectId} LIMIT 2`,
		);
		if (epics.length === 0) {
			epicId = (await createEpic(ctx, tx, { project: projectId, name: "Default", slug: "default" })).id;
		} else if (epics.length === 1 && epics[0]!.slug === "default") {
			epicId = epics[0]!.id;
		} else {
			throw invalidInput("epic", "Choose an epic and a wave. A wave also selects its epic.");
		}
	}
	const waves = await rows<{ id: string; slug: string }>(
		tx,
		sql`SELECT id, slug FROM waves WHERE epic_id = ${epicId} LIMIT 2`,
	);
	let waveId: string;
	if (waves.length === 0) {
		waveId = (await createWave(ctx, tx, { epic: epicId, name: "Default", slug: "default" })).id;
	} else if (waves.length === 1 && waves[0]!.slug === "default") {
		waveId = waves[0]!.id;
	} else {
		throw invalidInput("wave", "Choose a wave from the selected epic.");
	}
	return resolvePlacement(ctx, tx, projectId, empty, { epic: epicId, wave: waveId });
};
