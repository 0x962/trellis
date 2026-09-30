import { expect, test } from "bun:test";
import { chmod, lstat, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { withRuntimeMutationExclusion } from "@trellis/runtime-protocol/mutation-exclusion";
import { lockHome } from "../../../homeLock";
import { protocolDigest } from "../../../langflowContracts";
import { LangflowHostControl } from "../../../langflowHost/hostControl";
import { withIsolatedRestore } from "../../../langflowHost/restoreExclusion";
import { readLaunchSnapshot, writeLaunchSnapshot } from "../../langflowNative/launchSnapshot";
import { fixture } from "./components/fixture";
import { restoreNativeSnapshots } from "./restoreNativeSnapshots";

test("installs exact private bytes and preserves a closed restore block on replay", async () => {
	const f = await fixture();
	try {
		const receipt = await restoreNativeSnapshots(f.input);
		expect(receipt.record.intent.capture.manifest.sourceBytes).toBe(f.manifestBytes);
		expect(receipt.record.intent.capture.manifest.sourceDigest).toBe(protocolDigest(f.manifestBytes));
		expect(receipt.record.intent.identity).toEqual(f.restored.identity);
		expect(receipt.record.intent.block).toEqual(f.input.block);
		expect(receipt.record.intent.capture.sourceDataHomeId).toBe("captured-home");
		expect(receipt.record.complete).toBe(true);
		for (const [index, row] of f.rows.entries()) {
			const file = receipt.record.files[index]!;
			expect(await readLaunchSnapshot(f.input.home, row.attemptId, row.digest)).toBe(row.bytes);
			expect(file.destination).toEqual({ path: join(f.input.home, "harness-attempts", row.attemptId, "langflow-launch.json"),
				digest: row.digest, size: Buffer.byteLength(row.bytes), mode: 0o600, uid: process.getuid!(), gid: process.getgid!() });
			expect((await lstat(join(f.input.home, "harness-attempts", row.attemptId))).mode & 0o777).toBe(0o700);
		}
		expect(await restoreNativeSnapshots(f.input)).toEqual(receipt);
		expect(await f.read(receipt.receiptId)).toEqual(receipt);
		expect(LangflowHostControl.recovery(f.input.home)).toEqual({ state: "blocked", generation: f.input.block.generation });
		expect(receipt.sourceBytes).not.toContain("synthetic-token");
	} finally { await rm(f.root, { recursive: true }); }
});

test("a historical null snapshot remains unavailable without a fabricated file", async () => {
	const f = await fixture({ historical: true });
	try {
		const receipt = await restoreNativeSnapshots(f.input);
		expect(receipt.record.complete).toBe(false);
		expect(receipt.record.unavailable).toEqual(f.nativeInventory.unavailable);
		expect(receipt.record.files).toHaveLength(1);
		await expect(lstat(join(f.input.home, "harness-attempts", f.rows[0]!.attemptId))).rejects.toThrow("ENOENT");
	} finally { await rm(f.root, { recursive: true }); }
});

for (const change of ["missing", "changed"] as const) {
	test(`refuses ${change} captured bytes before a target copy`, async () => {
		const f = await fixture();
		try {
			const path = join(f.restored.payload, "workspaces", "native-launches", `${f.rows[0]!.attemptId}.json`);
			if (change === "missing") await rm(path);
			else await writeFile(path, "changed");
			await expect(restoreNativeSnapshots(f.input)).rejects.toThrow("snapshot_inventory_mismatch");
			await expect(lstat(join(f.input.home, "harness-attempts"))).rejects.toThrow("ENOENT");
		} finally { await rm(f.root, { recursive: true }); }
	});
}

for (const option of ["unsafePath", "wrongBinding"] as const) {
	test(`refuses a sealed ${option} inventory`, async () => {
		const f = await fixture({ [option]: true });
		try {
			await expect(restoreNativeSnapshots(f.input)).rejects.toThrow(option === "unsafePath" ? "native_restore_path_unsafe" : "native_restore_binding_conflict");
		} finally { await rm(f.root, { recursive: true }); }
	});
}

for (const field of ["hostId", "dataHomeId"] as const) {
	test(`refuses a foreign target ${field}`, async () => {
		const f = await fixture();
		try { await expect(restoreNativeSnapshots({ ...f.input, [field]: crypto.randomUUID() })).rejects.toThrow("restored_engine_target_identity_conflict"); }
		finally { await rm(f.root, { recursive: true }); }
	});
}

test("refuses a different restore block", async () => {
	const f = await fixture();
	try { await expect(restoreNativeSnapshots({ ...f.input, block: { ...f.input.block, id: crypto.randomUUID() } })).rejects.toThrow("restored_engine_block_changed"); }
	finally { await rm(f.root, { recursive: true }); }
});

test("refuses a symlink at the target attempts root", async () => {
	const f = await fixture();
	try {
		const outside = join(f.root, "outside");
		await mkdir(outside, { mode: 0o700 });
		await symlink(outside, join(f.input.home, "harness-attempts"));
		await expect(restoreNativeSnapshots(f.input)).rejects.toThrow("native_restore_directory_unsafe");
		await expect(lstat(join(outside, f.rows[0]!.attemptId))).rejects.toThrow("ENOENT");
	} finally { await rm(f.root, { recursive: true }); }
});

test("retains intent and partial files until exact replay can finish", async () => {
	const f = await fixture();
	try {
		const conflict = f.rows[1]!;
		await writeLaunchSnapshot(f.input.home, conflict.attemptId, "unrelated bytes");
		await expect(restoreNativeSnapshots(f.input)).rejects.toThrow("native_snapshot_digest_conflict");
		expect(await readLaunchSnapshot(f.input.home, f.rows[0]!.attemptId, f.rows[0]!.digest)).toBe(f.rows[0]!.bytes);
		const objects = join(LangflowHostControl.directory(f.input.home), "restored-native");
		expect(await readFile(join(objects, `binding-${protocolDigest("intent")}.json`), "utf8")).toContain('"key":"intent"');
		await expect(lstat(join(objects, `binding-${protocolDigest("installation")}.json`))).rejects.toThrow("ENOENT");
		expect(await readFile(join(f.input.home, "harness-attempts", conflict.attemptId, "langflow-launch.json"), "utf8")).toBe("unrelated bytes");
		await rm(join(f.input.home, "harness-attempts", conflict.attemptId, "langflow-launch.json"));
		const completed = await restoreNativeSnapshots(f.input);
		expect(await f.read(completed.receiptId)).toEqual(completed);
	} finally { await rm(f.root, { recursive: true }); }
});

test("readback refuses a changed destination after a receipt exists", async () => {
	const f = await fixture();
	try {
		const receipt = await restoreNativeSnapshots(f.input);
		await writeFile(receipt.record.files[0]!.destination.path, "changed");
		await expect(f.read(receipt.receiptId)).rejects.toThrow("native_snapshot_digest_conflict");
	} finally { await rm(f.root, { recursive: true }); }
});

for (const change of ["mode", "missing"] as const) {
	test(`readback refuses a ${change} destination`, async () => {
		const f = await fixture();
		try {
			const receipt = await restoreNativeSnapshots(f.input);
			const path = receipt.record.files[0]!.destination.path;
			if (change === "mode") await chmod(path, 0o644);
			else await rm(path);
			await expect(f.read(receipt.receiptId)).rejects.toThrow(change === "mode" ? "native_restore_file_unsafe" : "ENOENT");
		} finally { await rm(f.root, { recursive: true }); }
	});
}

test("refuses a foreign restored journal target", async () => {
	const f = await fixture();
	try {
		const path = join(LangflowHostControl.directory(f.input.home), "paired-snapshots", f.restored.manifest.snapshotId, "restored.json");
		await writeFile(path, JSON.stringify({ payload: f.restored.payload, manifestDigest: f.restored.manifestDigest, targetHome: f.root }));
		await expect(restoreNativeSnapshots(f.input)).rejects.toThrow("native_restore_journal_conflict");
	} finally { await rm(f.root, { recursive: true }); }
});

test("the installer waits for the actual native retention scope", async () => {
	const f = await fixture();
	const entered = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const holding = withRuntimeMutationExclusion(f.input.home, [{ kind: "attempt-retention", directory: join(f.input.home, "harness-attempts") }], async () => {
		entered.resolve();
		await release.promise;
	});
	await entered.promise;
	let completed = false;
	const pending = restoreNativeSnapshots(f.input).then((receipt) => { completed = true; return receipt; });
	try {
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(completed).toBe(false);
		await expect(lstat(join(f.input.home, "harness-attempts"))).rejects.toThrow("ENOENT");
		release.resolve();
		await holding;
		expect((await pending).record.complete).toBe(true);
	} finally {
		release.resolve();
		await holding;
		await pending;
		await rm(f.root, { recursive: true });
	}
});

test("the real home exclusion refuses a second installer until callback settlement", async () => {
	const f = await fixture();
	try {
		await withIsolatedRestore(f.input, async () => {
			await Promise.resolve();
			expect(() => lockHome(f.input.home, "restore", null)).toThrow();
			await expect(restoreNativeSnapshots(f.input)).rejects.toThrow();
		});
		expect((await restoreNativeSnapshots(f.input)).record.complete).toBe(true);
	} finally { await rm(f.root, { recursive: true }); }
});
