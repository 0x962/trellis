import { WaveRefSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";
import { assertProjectActive } from "../refs.ts";
import { type RawWave, waveSelect } from "./rows.ts";

// A wave ref is a ULID or `KEY/epic-slug/wave-slug`, in any letter
// case.
export const resolveWave = async (_ctx: ServiceCtx, tx: Tx, ref: string): Promise<RawWave> => {
	const parsed = WaveRefSchema.safeParse(ref);
	if (!parsed.success) throw fail("NOT_FOUND", { kind: "wave", ref });
	const canonical = WaveRefSchema.canonicalize(ref);
	const where =
		parsed.data.kind === "ulid"
			? sql`m.id = ${parsed.data.id}`
			: sql`proj.key = ${parsed.data.key} AND e.slug = ${parsed.data.epicSlug} AND m.slug = ${parsed.data.slug}`;
	const found = await rows<RawWave>(tx, sql`${waveSelect} WHERE ${where}`);
	if (found.length === 0) throw fail("NOT_FOUND", { kind: "wave", ref: canonical });
	return found[0]!;
};

// The wave a ticket of `projectId` can join. The epic of the wave sits in
// the same project, and that project accepts a mutation. The foreign key on
// `tickets.wave_id` cannot hold the project rule, so the service holds it.
export const resolveWaveForTicket = async (ctx: ServiceCtx, tx: Tx, projectId: string, ref: string) => {
	const wave = await resolveWave(ctx, tx, ref);
	if (wave.epic_project_id !== projectId) throw fail("CROSS_PROJECT_LINK");
	assertProjectActive(ctx, wave.epic_project_id);
	return wave;
};
