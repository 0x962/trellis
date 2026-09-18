import { join } from "node:path";
import { HarnessSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { HarnessDescriptor } from "../../agents/harnessHost/types.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";

export async function restoreHarnesses(ctx: { home: string }, tx: Tx) {
	const runs = await rows<{ id: string; terminalId: string }>(
		tx,
		sql`SELECT id, terminal_id AS "terminalId" FROM agent_runs WHERE runtime='native' AND harness IS NULL AND terminal_id IS NOT NULL`,
	);
	for (const run of runs) {
		const file = Bun.file(join(ctx.home, "harness-attempts", run.terminalId, "launch.json"));
		if (!(await file.exists())) continue;
		const descriptor: HarnessDescriptor | { harness: "custom" } = await file.json();
		if (descriptor.harness === "custom") continue;
		const model: string | null = JSON.parse(descriptor.fingerprint)[3];
		const harness = HarnessSchema.safeParse({
			preset: descriptor.harness,
			...(model === null ? {} : { model }),
			...(descriptor.effort === undefined ? {} : { effort: descriptor.effort }),
		});
		if (!harness.success) continue;
		await tx.execute(
			sql`UPDATE agent_runs SET harness=${JSON.stringify(harness.data)}::jsonb WHERE id=${run.id} AND terminal_id=${run.terminalId} AND harness IS NULL`,
		);
	}
}
