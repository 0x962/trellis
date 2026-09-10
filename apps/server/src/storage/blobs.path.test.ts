import { describe, expect, test } from "bun:test";
import { dirname, join, relative } from "node:path";
import { blobPath } from "./blobs.ts";

// A blob is addressed by its own sha256. No row stores a path, so the whole
// address is the data home plus the hash.

const shaOf = (character: string) => character.repeat(64);

describe("blobPath", () => {
	test("a blob path is the hash sharded by its first two characters", () => {
		const home = "/tmp/trellis-home";
		const first = `ab${"0".repeat(62)}`;
		const second = `ab${"1".repeat(62)}`;
		expect(blobPath(home, first)).toBe(join(home, "attachments", "ab", first));
		expect(blobPath(home, second)).toBe(join(home, "attachments", "ab", second));
		expect(dirname(blobPath(home, first))).toBe(dirname(blobPath(home, second)));
		expect(blobPath(home, shaOf("c"))).toBe(join(home, "attachments", "cc", shaOf("c")));
	});

	test("a blob path follows the data home, so a moved home still resolves", () => {
		const sha = shaOf("d");
		const one = blobPath("/one/.trellis", sha);
		const two = blobPath("/two/data/store", sha);
		expect(relative("/one/.trellis", one)).toBe(relative("/two/data/store", two));
		expect(one).toBe(join("/one/.trellis", "attachments", "dd", sha));
		expect(two).toBe(join("/two/data/store", "attachments", "dd", sha));
	});
});
