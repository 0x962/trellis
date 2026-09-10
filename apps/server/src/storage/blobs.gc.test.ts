import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { freshHomeWithDirs, sha256Of, writeTempFile } from "../../test/helpers/home.ts";
import { blobPath, finalize, gc } from "./blobs.ts";

// gc unlinks the blob of one sha when no attachment row holds it. It takes
// the same blob lock as finalize, so the row check of a delete never runs
// while an upload of that sha is between its rename and its row.

const bytesOf = (text: string) => new TextEncoder().encode(text);

const writeBlob = async (home: string, text: string) => {
	const bytes = bytesOf(text);
	const sha = sha256Of(bytes);
	await writeTempFile(home, `upload-${sha.slice(0, 8)}`, bytes);
	await finalize(home, `upload-${sha.slice(0, 8)}`, sha);
	return sha;
};

describe("gc", () => {
	test("gc unlinks a blob that no row holds", async () => {
		const home = freshHomeWithDirs();
		const sha = await writeBlob(home, "the last row is gone");

		const removed = await gc(home, sha, async () => false);

		expect(removed).toBe(true);
		expect(existsSync(blobPath(home, sha))).toBe(false);
	});

	test("gc keeps a blob that a row still holds", async () => {
		const home = freshHomeWithDirs();
		const sha = await writeBlob(home, "a second ticket holds this file");

		const removed = await gc(home, sha, async () => true);

		expect(removed).toBe(false);
		expect(existsSync(blobPath(home, sha))).toBe(true);
	});

	test("gc waits for a finalize of the same sha", async () => {
		const home = freshHomeWithDirs();
		const bytes = bytesOf("an upload and a delete of one sha");
		const sha = sha256Of(bytes);
		await writeTempFile(home, "upload-1", bytes);

		// The finalize starts first and holds the lock. The row check runs
		// after it, so it sees the blob the finalize wrote and reports the row
		// of that upload.
		const finalizing = finalize(home, "upload-1", sha);
		let sawBlob = false;
		const removed = await gc(home, sha, async () => {
			sawBlob = existsSync(blobPath(home, sha));
			return sawBlob;
		});
		await finalizing;

		expect(sawBlob).toBe(true);
		expect(removed).toBe(false);
		expect(existsSync(blobPath(home, sha))).toBe(true);
	});
});
