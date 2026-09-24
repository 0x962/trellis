import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ulid } from "ulid";
import {
	finalizePageObject,
	gcPageObjects,
	pageObjectPath,
	pageTempPath,
	stagePageObject,
} from "./pageObjects.ts";

let home: string;

beforeEach(async () => {
	home = await mkdtemp(join(tmpdir(), "trellis-page-objects-"));
});

afterEach(async () => {
	await rm(home, { recursive: true, force: true });
});

test("stores an empty Page object under the separate pages root", async () => {
	const uploadId = ulid();
	const staged = await stagePageObject(home, uploadId, new File([], "empty.css", { type: "text/css" }));

	expect(staged).toMatchObject({
		uploadId,
		sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
		size: 0,
	});
	expect(existsSync(pageTempPath(home, uploadId))).toBe(true);

	const object = await finalizePageObject(home, staged);
	expect(object.path).toBe(pageObjectPath(home, staged.sha256));
	expect(object.path).toStartWith(join(home, "pages", "objects"));
	expect(object.path).not.toStartWith(join(home, "attachments"));
	expect(existsSync(object.path)).toBe(true);
	expect(Bun.file(object.path).size).toBe(0);
	expect(existsSync(pageTempPath(home, uploadId))).toBe(false);
	object.release();
});

test("deduplicates concurrent finalization by the content hash", async () => {
	const file = new File(["same Page bytes"], "page.js", { type: "text/javascript" });
	const first = await stagePageObject(home, ulid(), file);
	const second = await stagePageObject(home, ulid(), file);

	const [firstObject, secondObject] = await Promise.all([
		finalizePageObject(home, first),
		finalizePageObject(home, second),
	]);

	expect(firstObject.path).toBe(secondObject.path);
	expect(await Bun.file(firstObject.path).text()).toBe("same Page bytes");
	firstObject.release();
	secondObject.release();
});

test("keeps a finalized object until its database row can commit", async () => {
	const staged = await stagePageObject(home, ulid(), new File(["held"], "held.txt"));
	const object = await finalizePageObject(home, staged);

	expect(await gcPageObjects(home, [staged.sha256], async () => false)).toEqual({ removed: [] });
	expect(existsSync(object.path)).toBe(true);

	object.release();
	expect(await gcPageObjects(home, [staged.sha256], async () => false)).toEqual({
		removed: [staged.sha256],
	});
	expect(existsSync(object.path)).toBe(false);
});

test("keeps an object when finalization invalidates the holder snapshot", async () => {
	const first = await stagePageObject(home, ulid(), new File(["race"], "race.txt"));
	const firstObject = await finalizePageObject(home, first);
	firstObject.release();
	const holder = Promise.withResolvers<boolean>();
	const holderStarted = Promise.withResolvers<void>();
	const collection = gcPageObjects(home, [first.sha256], async () => {
		holderStarted.resolve();
		return holder.promise;
	});
	await holderStarted.promise;

	const replay = await stagePageObject(home, ulid(), new File(["race"], "race.txt"));
	const replayObject = await finalizePageObject(home, replay);
	replayObject.release();
	holder.resolve(false);

	expect(await collection).toEqual({ removed: [] });
	expect(existsSync(firstObject.path)).toBe(true);
});

test("keeps an object while a database row holds its hash", async () => {
	const staged = await stagePageObject(home, ulid(), new File(["kept"], "kept.txt"));
	const object = await finalizePageObject(home, staged);
	object.release();

	expect(await gcPageObjects(home, [staged.sha256, staged.sha256], async () => true)).toEqual({ removed: [] });
	expect(existsSync(object.path)).toBe(true);
});
