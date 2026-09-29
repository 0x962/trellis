import { expect, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { bindLaunchSnapshot } from "../../../../apps/server/src/db/queries/langflowExecution";
import { langflowNativeHandles } from "../../../../apps/server/src/db/tables/langflowExecution";
import { readSnapshot, restoreSnapshot, sealSnapshot } from "../../../../apps/server/src/services/langflowBackup";
import { exportNativeSnapshots } from "../../../../apps/server/src/services/langflowBackup/nativeSnapshots";
import { writeLaunchSnapshot } from "../../../../apps/server/src/services/langflowNative";
import { fixture } from "./fixture/fixture";
import { receiptData } from "./receiptData/receiptData";

for (const mode of ["complete", "historical", "missing", "corrupt"] as const) {
	test(`native launch inventory: ${mode}`, async () => {
		const setup = await fixture();
		const { db } = await receiptData();
		const home = join(setup.root, "native-home");
		await mkdir(home, { mode: 0o700 });
		try {
			const reservations = await db.select().from(langflowNativeHandles);
			const expected = new Map<string, string>();
			for (const [index, row] of reservations.entries()) {
				if (mode === "historical" && index === 0) continue;
				const bytes = JSON.stringify({
					executionId: row.executionId,
					stepId: row.stepId,
					requestDigest: row.requestDigest,
					privatePrompt: `Exact private prompt ${index}`,
				});
				const digest = await writeLaunchSnapshot(home, row.attemptId, bytes);
				await db.transaction((tx) =>
					bindLaunchSnapshot(tx, {
						executionId: row.executionId,
						stepId: row.stepId,
						attemptId: row.attemptId,
						digest,
					}),
				);
				expected.set(row.attemptId, bytes);
			}
			const changed = join(home, "harness-attempts", reservations[0]!.attemptId, "langflow-launch.json");
			if (mode === "missing") await rm(changed);
			if (mode === "corrupt") await writeFile(changed, "changed private bytes");
			const exported = await db.transaction((tx) => exportNativeSnapshots({ home }, tx, { directory: setup.snapshot }));
			expect(exported.manifest.ready).toBe(mode === "complete");
			expect(exported.unavailable).toHaveLength(mode === "complete" ? 0 : 1);
			expect(exported.manifest.files).toHaveLength(mode === "complete" ? 2 : 1);
			await sealSnapshot({
				directory: setup.snapshot,
				metadata: { ...setup.metadata, unavailable: exported.unavailable },
			});
			const restored = await restoreSnapshot(
				{ blockDispatch: async () => {} },
				{
					snapshot: setup.snapshot,
					destination: setup.destination,
					compatibility: setup.metadata.compatibility,
				},
			);
			expect(restored.state).toBe("requires-reconciliation");
			const manifest = await readSnapshot(restored.payload);
			expect(manifest.unavailable).toEqual(exported.unavailable);
			for (const entry of exported.manifest.files) {
				expect(await readFile(join(restored.payload, entry.path), "utf8")).toBe(expected.get(entry.attemptId));
				expect(entry.requestDigest).toBe(reservations.find((row) => row.attemptId === entry.attemptId)!.requestDigest);
			}
			if (mode === "corrupt") expect(await readFile(changed, "utf8")).toBe("changed private bytes");
		} finally {
			await db.$client.close();
			await rm(setup.root, { recursive: true });
		}
	});
}
