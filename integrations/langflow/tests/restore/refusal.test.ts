import { expect, test } from "bun:test";
import { link, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	assertRestoreReconciled,
	readSnapshot,
	restoreSnapshot,
	sealSnapshot,
} from "../../../../apps/server/src/services/langflowBackup";
import { manifestName } from "../../../../apps/server/src/services/langflowBackup/manifest";
import { fixture } from "./fixture";

for (const corruption of ["changed", "missing", "extra", "symlink", "hardlink", "traversal", "capability"] as const) {
	test(`refuses ${corruption} before the restore gate or copy`, async () => {
		const f = await fixture();
		try {
			const manifest = await sealSnapshot({ directory: f.snapshot, metadata: f.metadata });
			const secret = join(f.snapshot, "secrets", "encryption.key");
			if (corruption === "changed") await writeFile(secret, "changed");
			if (corruption === "missing") await rm(secret);
			if (corruption === "extra") await writeFile(join(f.snapshot, "engine", "extra"), "extra");
			if (corruption === "symlink" || corruption === "hardlink") {
				await rm(secret);
				const external = join(f.root, "external");
				await writeFile(external, "synthetic-test-secret");
				if (corruption === "symlink") await symlink(external, secret);
				else await link(external, secret);
			}
			if (corruption === "traversal" || corruption === "capability") {
				const changed = structuredClone(manifest) as Record<string, unknown>;
				if (corruption === "traversal") changed.directories = ["../outside"];
				else changed.capability = "future-format";
				await writeFile(join(f.snapshot, manifestName), JSON.stringify(changed));
			}
			let called = false;
			await expect(
				restoreSnapshot(
					{
						blockDispatch: async () => {
							called = true;
						},
					},
					{
						snapshot: f.snapshot,
						destination: f.destination,
						compatibility: f.metadata.compatibility,
					},
				),
			).rejects.toThrow();
			expect(called).toBe(false);
			expect(await Bun.file(join(f.destination, manifestName)).exists()).toBe(false);
		} finally {
			await rm(f.root, { recursive: true });
		}
	});
}

test("requires exact package, database, and secret versions", async () => {
	const f = await fixture();
	try {
		await sealSnapshot({ directory: f.snapshot, metadata: f.metadata });
		for (const field of Object.keys(f.metadata.compatibility)) {
			await expect(
				restoreSnapshot(
					{
						blockDispatch: async () => {
							throw new Error("must-not-run");
						},
					},
					{
						snapshot: f.snapshot,
						destination: f.destination,
						compatibility: { ...f.metadata.compatibility, [field]: "different" },
					},
				),
			).rejects.toThrow("restore_version_mismatch");
		}
	} finally {
		await rm(f.root, { recursive: true });
	}
});

test("a failed durable gate retains the block and starts no copy", async () => {
	const f = await fixture();
	try {
		await sealSnapshot({ directory: f.snapshot, metadata: f.metadata });
		await expect(
			restoreSnapshot(
				{
					blockDispatch: async () => {
						throw new Error("gate-store-unavailable");
					},
				},
				{
					snapshot: f.snapshot,
					destination: f.destination,
					compatibility: f.metadata.compatibility,
				},
			),
		).rejects.toThrow("gate-store-unavailable");
		await expect(assertRestoreReconciled(f.destination)).rejects.toThrow("restore_requires_reconciliation");
		expect(await Bun.file(join(f.destination, "payload.partial", "secrets", "encryption.key")).exists()).toBe(false);
	} finally {
		await rm(f.root, { recursive: true });
	}
});

test("a source change after validation retains an incomplete restore", async () => {
	const f = await fixture();
	try {
		await sealSnapshot({ directory: f.snapshot, metadata: f.metadata });
		await expect(
			restoreSnapshot(
				{
					blockDispatch: async () => {
						await writeFile(join(f.snapshot, "secrets", "encryption.key"), "changed-during-copy");
					},
				},
				{ snapshot: f.snapshot, destination: f.destination, compatibility: f.metadata.compatibility },
			),
		).rejects.toThrow("snapshot_inventory_mismatch");
		await expect(assertRestoreReconciled(f.destination)).rejects.toThrow("restore_requires_reconciliation");
		expect(await readFile(join(f.destination, "payload.partial", "secrets", "encryption.key"), "utf8")).toBe(
			"changed-during-copy",
		);
		await expect(readSnapshot(join(f.destination, "payload"))).rejects.toThrow("ENOENT");
	} finally {
		await rm(f.root, { recursive: true });
	}
});
