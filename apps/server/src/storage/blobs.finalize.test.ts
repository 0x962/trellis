import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { freshHomeWithDirs, sha256Of, tempFilePath, writeTempFile } from "../../test/helpers/home.ts";
import { blobPath, finalize } from "./blobs.ts";

// finalize takes the name of a file under `attachments/tmp` and the sha256 of
// its bytes. It holds the blob lock for that sha, so two uploads of one file
// leave one blob and every caller gets the same path.

const bytesOf = (text: string) => new TextEncoder().encode(text);

describe("finalize", () => {
	test("finalize moves a temp file to its content path", async () => {
		const home = freshHomeWithDirs();
		const bytes = bytesOf("a picture of a cat");
		const sha = sha256Of(bytes);
		await writeTempFile(home, "upload-1", bytes);

		const path = await finalize(home, "upload-1", sha);

		expect(path).toBe(blobPath(home, sha));
		expect(await Bun.file(path).bytes()).toEqual(bytes);
		expect(existsSync(tempFilePath(home, "upload-1"))).toBe(false);
	});

	test("finalize drops the temp file when the blob exists", async () => {
		const home = freshHomeWithDirs();
		const bytes = bytesOf("one file, two uploads");
		const sha = sha256Of(bytes);
		await writeTempFile(home, "upload-1", bytes);
		const path = await finalize(home, "upload-1", sha);
		const inode = statSync(path).ino;
		await writeTempFile(home, "upload-2", bytes);

		expect(await finalize(home, "upload-2", sha)).toBe(path);

		expect(statSync(path).ino).toBe(inode);
		expect(await Bun.file(path).bytes()).toEqual(bytes);
		expect(existsSync(tempFilePath(home, "upload-2"))).toBe(false);
	});

	test("two concurrent finalize calls of one sha leave one blob", async () => {
		const home = freshHomeWithDirs();
		const bytes = bytesOf("the same bytes twice");
		const sha = sha256Of(bytes);
		await writeTempFile(home, "upload-1", bytes);
		await writeTempFile(home, "upload-2", bytes);

		const paths = await Promise.all([finalize(home, "upload-1", sha), finalize(home, "upload-2", sha)]);

		expect(paths).toEqual([blobPath(home, sha), blobPath(home, sha)]);
		expect(readdirSync(dirname(blobPath(home, sha)))).toEqual([sha]);
		expect(readdirSync(join(home, "attachments", "tmp"))).toEqual([]);
	});
});
