import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { freshHome, freshHomeWithDirs, sha256Of, tempFilePath, writeTempFile } from "../../test/helpers/home.ts";
import { blobPath, finalize, markLiveTempFile, sweep } from "./blobs.ts";

// sweep runs at boot, before the server accepts a request. It unlinks every
// blob that no attachment row holds and empties `attachments/tmp`, which
// repairs a process that stopped between a commit and an unlink.

const bytesOf = (text: string) => new TextEncoder().encode(text);

const writeBlob = async (home: string, text: string) => {
	const bytes = bytesOf(text);
	const sha = sha256Of(bytes);
	const name = `upload-${sha.slice(0, 8)}`;
	await writeTempFile(home, name, bytes);
	await finalize(home, name, sha);
	return sha;
};

describe("sweep", () => {
	test("sweep unlinks a blob that no row holds", async () => {
		const home = freshHomeWithDirs();
		const sha = await writeBlob(home, "no row points here");

		const result = await sweep(home, []);

		expect(result.removedBlobs).toEqual([sha]);
		expect(existsSync(blobPath(home, sha))).toBe(false);
	});

	test("sweep repairs a stop between the commit and the unlink", async () => {
		const home = freshHomeWithDirs();
		const orphan = await writeBlob(home, "the rows of this file were deleted");
		const held = await writeBlob(home, "a row still holds this file");

		const result = await sweep(home, [held]);

		expect(result.removedBlobs).toEqual([orphan]);
		expect(existsSync(blobPath(home, orphan))).toBe(false);
		expect(existsSync(blobPath(home, held))).toBe(true);
	});

	test("sweep empties the tmp directory", async () => {
		const home = freshHomeWithDirs();
		await writeTempFile(home, "upload-1", bytesOf("a stopped upload"));
		await writeTempFile(home, "upload-2", bytesOf("a second stopped upload"));

		const result = await sweep(home, []);

		expect(result.removedTemp.sort()).toEqual(["upload-1", "upload-2"]);
		expect(readdirSync(join(home, "attachments", "tmp"))).toEqual([]);
	});

	test("sweep keeps a temp file that a live upload marked", async () => {
		const home = freshHomeWithDirs();
		await writeTempFile(home, "upload-live", bytesOf("an upload in flight"));
		await writeTempFile(home, "upload-dead", bytesOf("an upload that stopped"));
		const release = markLiveTempFile("upload-live");

		const result = await sweep(home, []);

		expect(result.removedTemp).toEqual(["upload-dead"]);
		expect(existsSync(tempFilePath(home, "upload-live"))).toBe(true);
		release();
		expect((await sweep(home, [])).removedTemp).toEqual(["upload-live"]);
	});

	test("sweep creates the attachment directories on a fresh home", async () => {
		const home = freshHome();

		const result = await sweep(home, []);

		expect(existsSync(join(home, "attachments"))).toBe(true);
		expect(existsSync(join(home, "attachments", "tmp"))).toBe(true);
		expect(result).toEqual({ removedBlobs: [], removedTemp: [] });
	});
});
