import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { mkdtemp, open, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashFile } from "../../../../../src/services/evidence/hashFile.ts";

const directories: string[] = [];
afterEach(async () => {
	for (const path of directories.splice(0)) await rm(path, { recursive: true });
});
const fixture = async (bytes: Uint8Array) => {
	const directory = await mkdtemp(join(tmpdir(), "trellis-hash-file-"));
	directories.push(directory);
	const path = join(directory, "file.bin");
	await writeFile(path, bytes);
	return path;
};

test("repeated hashes return the Bun child descriptor count to its baseline", async () => {
	const bytes = Buffer.alloc(192 * 1024 + 17);
	for (let index = 0; index < bytes.length; index++) bytes[index] = index % 251;
	const path = await fixture(bytes);
	const output = execFileSync(
		process.execPath,
		[join(import.meta.dir, "../../../../fixtures/evidence/hashFileProcess.ts"), path],
		{ encoding: "utf8", timeout: 15000 },
	);
	const result = JSON.parse(output);
	expect(result.bun).toBe(Bun.version);
	expect(result.hashes).toEqual(Array(128).fill(createHash("sha256").update(bytes).digest("hex")));
	expect(result.after).toBe(result.before);
});

test("a borrowed file handle remains open and hashes from the beginning", async () => {
	const bytes = Buffer.from("borrowed file contents");
	const path = await fixture(bytes);
	const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
	try {
		await handle.read(Buffer.alloc(4), 0, 4, null);
		expect(await hashFile(handle)).toBe(createHash("sha256").update(bytes).digest("hex"));
		expect((await handle.stat()).size).toBe(bytes.length);
	} finally {
		await handle.close();
	}
});

test("an empty file has the standard SHA-256 digest", async () => {
	expect(await hashFile(await fixture(Buffer.alloc(0)))).toBe(createHash("sha256").digest("hex"));
});

test("a path through a symlink cannot be hashed", async () => {
	const path = await fixture(Buffer.from("protected"));
	const link = `${path}.link`;
	await symlink(path, link);
	await expect(hashFile(link)).rejects.toMatchObject({ code: "ELOOP" });
});
