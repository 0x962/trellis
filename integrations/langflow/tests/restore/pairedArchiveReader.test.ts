import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { protocolDigest } from "../../../../apps/server/src/langflowContracts";
import { archivePairedSnapshot, readSnapshot, restorePairedArchive, sealSnapshot, withPairedArchive } from "../../../../apps/server/src/services/langflowBackup";
import { manifestName, recoveryName } from "../../../../apps/server/src/services/langflowBackup/manifest";
import { fixture } from "./fixture";
import { pairedTarFixture } from "./pairedTarFixture";

test("a FIFO without a writer is refused before the consumer runs", async () => {
	const f = await fixture();
	const archive = join(f.root, "archive.fifo");
	let consumed = false;
	try {
		execFileSync("mkfifo", ["-m", "600", archive]);
		await expect(withPairedArchive({ liveHome: f.snapshot }, {
			archive, signal: new AbortController().signal,
		}, async () => { consumed = true; })).rejects.toThrow("paired_archive_invalid_source");
		expect(consumed).toBe(false);
		expect((await stat(archive)).isFIFO()).toBe(true);
	} finally { await rm(f.root, { recursive: true }); }
}, 2000);

async function archiveFixture() {
	const f = await fixture();
	const liveHome = join(f.root, "live");
	await mkdir(liveHome, { mode: 0o700 });
	await writeFile(join(liveHome, "retained"), "live bytes");
	const longName = "é".repeat(80);
	await writeFile(join(f.snapshot, "workspaces", longName), "long path bytes", { mode: 0o700 });
	const manifest = await sealSnapshot({ directory: f.snapshot, metadata: f.metadata });
	const bytes = `${JSON.stringify(manifest, null, 2)}\n`;
	await writeFile(join(f.snapshot, manifestName), bytes);
	const archive = join(f.root, "paired.tar.gz");
	await archivePairedSnapshot({ directory: f.snapshot, manifestDigest: protocolDigest(bytes), path: archive });
	return { ...f, liveHome, archive, bytes, manifest, longName };
}

test("the real paired archive restores exact bytes into a fresh blocked envelope", async () => {
	const f = await archiveFixture();
	try {
		const before = await readFile(f.archive);
		const restored = await restorePairedArchive({ liveHome: f.liveHome }, {
			archive: f.archive, destination: f.destination, targetHome: join(f.root, "target"),
			requestId: "restore-fixture", compatibility: f.metadata.compatibility, signal: new AbortController().signal,
		});
		expect(await readFile(join(restored.payload, manifestName), "utf8")).toBe(f.bytes);
		expect(await readSnapshot(restored.payload)).toEqual(f.manifest);
		expect(restored.manifest.unavailable).toEqual(f.metadata.unavailable);
		expect(restored.block.reason).toMatchObject({ kind: "restore", manifestDigest: protocolDigest(f.bytes) });
		expect(await Bun.file(join(restored.directory, recoveryName)).exists()).toBe(true);
		expect((await stat(join(restored.payload, "workspaces", f.longName))).mode & 0o777).toBe(0o700);
		expect(await readFile(f.archive)).toEqual(before);
		expect(await readFile(join(f.liveHome, "retained"), "utf8")).toBe("live bytes");
	} finally { await rm(f.root, { recursive: true }); }
});

for (const outcome of ["success", "failure", "abort"] as const) {
	test(`private staging spans the callback and is removed after ${outcome}`, async () => {
		const f = await archiveFixture();
		let staged = "";
		const signal = new AbortController();
		const failure = new Error("consumer_stopped");
		try {
			const result = withPairedArchive({ liveHome: f.liveHome }, { archive: f.archive, signal: signal.signal }, async (value) => {
				staged = value.directory;
				expect(value.manifestBytes).toBe(f.bytes);
				expect((await stat(staged)).mode & 0o777).toBe(0o700);
				await Promise.resolve();
				expect(await Bun.file(join(staged, manifestName)).exists()).toBe(true);
				if (outcome === "failure") throw failure;
				if (outcome === "abort") signal.abort(failure);
				return "consumed";
			});
			if (outcome === "success") expect(await result).toBe("consumed");
			else await expect(result).rejects.toBe(failure);
			expect(staged).not.toBe("");
			await expect(stat(staged)).rejects.toThrow("ENOENT");
			expect(await Bun.file(f.archive).exists()).toBe(true);
		} finally { await rm(f.root, { recursive: true }); }
	});
}

for (const [name, entries, expected] of [
	["duplicate", [{ path: "trellis/", type: "5" }, { path: "trellis/", type: "5" }], "paired_archive_duplicate_entry"],
	["escape", [{ path: "../outside" }], "paired_archive_unsafe_path"],
	["absolute", [{ path: "/outside" }], "paired_archive_unsafe_path"],
	["root", [{ path: "unrelated/", type: "5" }], "paired_archive_unsupported_root"],
	["symbolic link", [{ path: "trellis", type: "2", link: "/outside" }], "paired_archive_unsupported_entry"],
	["hard link", [{ path: "trellis", type: "1", link: "/outside" }], "paired_archive_unsupported_entry"],
	["device", [{ path: "trellis", type: "3" }], "paired_archive_unsupported_entry"],
] as const) {
	test(`archive input rejects ${name} before the consumer runs`, async () => {
		const f = await fixture();
		try {
			const archive = join(f.root, "malformed.tar.gz");
			await writeFile(archive, pairedTarFixture([...entries]));
			await expect(withPairedArchive({ liveHome: f.snapshot }, { archive, signal: new AbortController().signal }, async () => {
				throw new Error("unexpected_consumer");
			})).rejects.toThrow(expected);
			expect(await Bun.file(archive).exists()).toBe(true);
		} finally { await rm(f.root, { recursive: true }); }
	});
}

test("changed and missing payload files never reach the consumer", async () => {
	const f = await fixture();
	try {
		const manifest = await sealSnapshot({ directory: f.snapshot, metadata: f.metadata });
		for (const changed of [false, true]) {
			const entries = [{ path: manifestName, body: Buffer.from(JSON.stringify(manifest)) },
				...manifest.directories.map((path) => ({ path, type: "5" }))];
			for (const file of manifest.files) {
				if (!changed && file === manifest.files[0]) continue;
				entries.push({ path: file.path, body: changed && file === manifest.files[0] ? Buffer.from("changed") : await readFile(join(f.snapshot, file.path)) });
			}
			const archive = join(f.root, `invalid-${changed}.tar.gz`);
			await writeFile(archive, pairedTarFixture(entries));
			await expect(withPairedArchive({ liveHome: f.snapshot }, { archive, signal: new AbortController().signal }, async () => "unexpected"))
				.rejects.toThrow("snapshot_inventory_mismatch");
		}
	} finally { await rm(f.root, { recursive: true }); }
});

for (const [key, value, expected] of [
	["path", "../outside", "paired_archive_unsafe_path"],
	["GNU.sparse.name", "trellis/hidden", "paired_archive_unsupported_pax"],
] as const) {
	test(`PAX ${key} cannot bypass entry validation`, async () => {
		const f = await fixture();
		try {
			const record = ` ${key}=${value}\n`;
			let length = Buffer.byteLength(record) + 1;
			while (Buffer.byteLength(`${length}${record}`) !== length) length = Buffer.byteLength(`${length}${record}`);
			const archive = join(f.root, "pax.tar.gz");
			await writeFile(archive, pairedTarFixture([
				{ path: "PaxHeader", type: "x", body: Buffer.from(`${length}${record}`) },
				{ path: "trellis/", type: "5" },
			]));
			await expect(withPairedArchive({ liveHome: f.snapshot }, { archive, signal: new AbortController().signal }, async () => "unexpected"))
				.rejects.toThrow(expected);
		} finally { await rm(f.root, { recursive: true }); }
	});
}
