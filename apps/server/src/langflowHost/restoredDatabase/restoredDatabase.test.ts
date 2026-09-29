import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { protocolDigest } from "../../langflowContracts";
import { manifestName, snapshotRoots } from "../../services/langflowBackup/manifest";
import { sealSnapshot } from "../../services/langflowBackup/sealSnapshot";
import { LangflowHostControl } from "../hostControl";
import { installRestoredDatabase, readRestoredDatabaseOpen, withRestoredDatabaseOpen } from "./index";

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture() {
	const root = await realpath(await mkdtemp(join(tmpdir(), "trellis-restored-database-")));
	roots.push(root);
	const home = join(root, "target");
	const directory = join(root, "envelope");
	const payload = join(directory, "payload");
	await mkdir(home, { mode: 0o700 });
	await mkdir(payload, { recursive: true, mode: 0o700 });
	for (const name of snapshotRoots) await mkdir(join(payload, name), { mode: 0o700 });
	await mkdir(join(payload, "trellis/db/base"), { recursive: true, mode: 0o700 });
	await writeFile(join(payload, "trellis/db/PG_VERSION"), "17\n", { mode: 0o600 });
	await writeFile(join(payload, "trellis/db/base/data"), "sealed rows", { mode: 0o600 });
	const manifest = await sealSnapshot({
		directory: payload,
		metadata: {
			snapshotId: crypto.randomUUID(),
			sourceDataHomeId: crypto.randomUUID(),
			sourceHostId: crypto.randomUUID(),
			createdAt: "2026-09-29T00:00:00.000Z",
			compatibility: {
				trellisRelease: "fixture",
				enginePackageDigest: "a".repeat(64),
				trellisDatabaseVersion: "migration",
				engineDatabaseVersion: "head",
				secretVersion: "secret",
			},
			boundary: { kind: "quiesced-export", receiptId: "boundary" },
			unavailable: [],
		},
	});
	const { identity, block } = LangflowHostControl.initialize({
		home,
		initialBlock: {
			requestId: crypto.randomUUID(),
			reason: {
				kind: "restore", directory, snapshotId: manifest.snapshotId,
				sourceDataHomeId: manifest.sourceDataHomeId,
				manifestDigest: protocolDigest(await readFile(join(payload, manifestName), "utf8")),
			},
		},
	});
	return { home, identity, block, payload, dataDir: join(home, "db"), signal: new AbortController().signal };
}

function evidence(dataDir: string, bootId: string) {
	const sourceBytes = JSON.stringify({ fixture: "callback evidence" });
	const source = { sourceBytes, sourceDigest: protocolDigest(sourceBytes) };
	return { dataDir, bootId, migrations: source, facts: source };
}

test("install and open retain exact source identity while target dispatch stays closed", async () => {
	const f = await fixture();
	const installed = await installRestoredDatabase(f);
	expect(await readFile(join(f.dataDir, "base/data"), "utf8")).toBe("sealed rows");
	expect(installed.record.identity).toEqual(f.identity);
	expect(installed.record.sourceDataHomeId).not.toBe(f.identity.dataHomeId);
	const bootId = crypto.randomUUID();
	let closed = false;
	const opened = await withRestoredDatabaseOpen({ ...f, installReceiptId: installed.receiptId, bootId }, async (verified) => {
		expect(verified.block).toEqual(f.block);
		expect(verified.installReceiptId).toBe(installed.receiptId);
		await writeFile(join(f.dataDir, "base/data"), "opened rows");
		return { value: { async close() { closed = true; } }, receipt: evidence(f.dataDir, bootId) };
	});
	expect(closed).toBe(false);
	const read = readRestoredDatabaseOpen({ home: f.home, bootId, receiptId: opened.receiptId });
	expect(read.sourceBytes).toBe(opened.sourceBytes);
	expect(read.record.verified.inventoryDigest).toBe(installed.record.inventoryDigest);
	expect(LangflowHostControl.recovery(f.home).state).toBe("blocked");
});

test("changed installed bytes prevent the database callback", async () => {
	const f = await fixture();
	const installed = await installRestoredDatabase(f);
	await writeFile(join(f.dataDir, "base/data"), "changed rows");
	let called = false;
	await expect(withRestoredDatabaseOpen({ ...f, installReceiptId: installed.receiptId, bootId: "boot" }, async () => {
		called = true;
		return { value: { async close() {} }, receipt: evidence(f.dataDir, "boot") };
	})).rejects.toThrow("restored_database_bytes_changed");
	expect(called).toBe(false);
	expect(LangflowHostControl.recovery(f.home).state).toBe("blocked");
});

test("a false callback digest closes the returned database without an open receipt", async () => {
	const f = await fixture();
	const installed = await installRestoredDatabase(f);
	let closed = false;
	await expect(withRestoredDatabaseOpen({ ...f, installReceiptId: installed.receiptId, bootId: "boot" }, async () => ({
		value: { async close() { closed = true; } },
		receipt: { ...evidence(f.dataDir, "boot"), facts: { sourceBytes: "changed", sourceDigest: "0".repeat(64) } },
	}))).rejects.toThrow("restored_database_open_digest_conflict");
	expect(closed).toBe(true);
	expect(LangflowHostControl.recovery(f.home).state).toBe("blocked");
});

test("the external restore lock excludes another open until callback evidence is durable", async () => {
	const f = await fixture();
	const installed = await installRestoredDatabase(f);
	const input = { ...f, installReceiptId: installed.receiptId, bootId: "boot" };
	await withRestoredDatabaseOpen(input, async () => {
		await expect(withRestoredDatabaseOpen({ ...input, bootId: "other" }, async () => ({
			value: { async close() {} }, receipt: evidence(f.dataDir, "other"),
		}))).rejects.toThrow("uses");
		return { value: { async close() {} }, receipt: evidence(f.dataDir, "boot") };
	});
	await expect(withRestoredDatabaseOpen(input, async () => ({
		value: { async close() {} }, receipt: evidence(f.dataDir, "boot"),
	}))).rejects.toThrow("restored_database_boot_already_opened");
});

test("a wrong boot receipt closes the database and leaves the block", async () => {
	const f = await fixture();
	const installed = await installRestoredDatabase(f);
	let closed = false;
	await expect(withRestoredDatabaseOpen({ ...f, installReceiptId: installed.receiptId, bootId: "boot" }, async () => ({
		value: { async close() { closed = true; } }, receipt: evidence(f.dataDir, "other"),
	}))).rejects.toThrow("restored_database_open_scope_conflict");
	expect(closed).toBe(true);
	expect(LangflowHostControl.recovery(f.home).state).toBe("blocked");
});

test("an existing destination or a changed sealed source cannot be installed", async () => {
	const f = await fixture();
	await mkdir(f.dataDir);
	await expect(installRestoredDatabase(f)).rejects.toThrow();
	await rm(f.dataDir, { recursive: true });
	await rm(join(f.payload, "trellis/db/base/data"));
	await symlink("../PG_VERSION", join(f.payload, "trellis/db/base/data"));
	await expect(installRestoredDatabase(f)).rejects.toThrow("snapshot_link_or_special_file");
	expect(LangflowHostControl.recovery(f.home).state).toBe("blocked");
});
