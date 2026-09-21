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
			: sql`root.key = ${parsed.data.key} AND e.slug = ${parsed.data.epicSlug} AND m.slug = ${parsed.data.slug}`;
	const found = await rows<RawWave>(tx, sql`${waveSelect} WHERE ${where}`);
	if (found.length === 0) throw fail("NOT_FOUND", { kind: "wave", ref: canonical });
	return found[0]!;
};

// The wave a ticket of `rootId` can join. The wave sits in the
// same root, and the project of its epic accepts a mutation. The foreign key
// on `tickets.wave_id` cannot hold the root rule, so the service holds
// it.
export const resolveWaveForTicket = async (ctx: ServiceCtx, tx: Tx, rootId: string, ref: string) => {
	const wave = await resolveWave(ctx, tx, ref);
	if (wave.root_id !== rootId) throw fail("CROSS_ROOT_MOVE");
	assertProjectActive(ctx, wave.epic_project_id);
	return wave;
};
