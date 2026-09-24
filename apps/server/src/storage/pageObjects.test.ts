import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { finalizePageObject, gcPageObjects, pageObjectPath, pageTempPath, stagePageObject } from "./pageObjects.ts";

let home: string;

beforeEach(async () => {
	home = await mkdtemp(join(tmpdir(), "trellis-page-objects-"));
});

afterEach(async () => {
	await rm(home, { recursive: true, force: true });
});

test("stores an empty Page object under the separate pages root", async () => {
	const staged = (await stagePageObject(home, new File([], "empty.css", { type: "text/css" })))!;

	expect(staged).toMatchObject({
		sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
		size: 0,
	});
	expect(existsSync(pageTempPath(home, staged.stageId))).toBe(true);

	const object = await finalizePageObject(home, staged);
	expect(object.path).toBe(pageObjectPath(home, staged.sha256));
	expect(object.path).toStartWith(join(home, "pages", "objects"));
	expect(object.path).not.toStartWith(join(home, "attachments"));
	expect(existsSync(object.path)).toBe(true);
	expect(Bun.file(object.path).size).toBe(0);
	expect(existsSync(pageTempPath(home, staged.stageId))).toBe(false);
	object.releaseHash();
});

test("deduplicates concurrent finalization by the content hash", async () => {
	const file = new File(["same Page bytes"], "page.js", { type: "text/javascript" });
	const first = (await stagePageObject(home, file))!;
	const second = (await stagePageObject(home, file))!;

	const [firstObject, secondObject] = await Promise.all([
		finalizePageObject(home, first),
		finalizePageObject(home, second),
	]);

	expect(firstObject.path).toBe(secondObject.path);
	expect(await Bun.file(firstObject.path).text()).toBe("same Page bytes");
	firstObject.releaseHash();
	secondObject.releaseHash();
});

test("keeps a finalized object until its database row can commit", async () => {
	const staged = (await stagePageObject(home, new File(["held"], "held.txt")))!;
	const object = await finalizePageObject(home, staged);

	expect(await gcPageObjects(home, [staged.sha256], async () => false)).toEqual({ removed: [] });
	expect(existsSync(object.path)).toBe(true);

	object.releaseHash();
	expect(await gcPageObjects(home, [staged.sha256], async () => false)).toEqual({
		removed: [staged.sha256],
	});
	expect(existsSync(object.path)).toBe(false);
});

test("keeps an object when a finalize makes the holder check stale", async () => {
	const first = (await stagePageObject(home, new File(["race"], "race.txt")))!;
	const firstObject = await finalizePageObject(home, first);
	firstObject.releaseHash();
	const holdsSha = Promise.withResolvers<boolean>();
	const holdsShaStarted = Promise.withResolvers<void>();
	const collection = gcPageObjects(home, [first.sha256], async () => {
		holdsShaStarted.resolve();
		return holdsSha.promise;
	});
	await holdsShaStarted.promise;

	const replay = (await stagePageObject(home, new File(["race"], "race.txt")))!;
	const replayObject = await finalizePageObject(home, replay);
	replayObject.releaseHash();
	holdsSha.resolve(false);

	expect(await collection).toEqual({ removed: [] });
	expect(existsSync(firstObject.path)).toBe(true);
});

test("keeps an object while a database row holds its hash", async () => {
	const staged = (await stagePageObject(home, new File(["kept"], "kept.txt")))!;
	const object = await finalizePageObject(home, staged);
	object.releaseHash();

	expect(await gcPageObjects(home, [staged.sha256, staged.sha256], async () => true)).toEqual({ removed: [] });
	expect(existsSync(object.path)).toBe(true);
});

test("removes a partial stage when the file stream fails", async () => {
	const file = new File([], "broken.txt");
	let reads = 0;
	Object.defineProperty(file, "stream", {
		value: () =>
			new ReadableStream<Uint8Array>({
				pull(controller) {
					if (reads++ === 0) controller.enqueue(new TextEncoder().encode("partial"));
					else controller.error(new Error("read failed"));
				},
			}),
	});

	await expect(stagePageObject(home, file)).rejects.toThrow("read failed");
	expect(await readdir(join(home, "pages", "tmp"))).toEqual([]);
});

test("removes a stage that exceeds its byte limit", async () => {
	expect(await stagePageObject(home, new File(["12345"], "large.txt"), 4)).toBeNull();
	expect(await readdir(join(home, "pages", "tmp"))).toEqual([]);
});
