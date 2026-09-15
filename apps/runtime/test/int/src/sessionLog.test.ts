import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SessionLog } from "../../../src/sessionLog.ts";

const homes: string[] = [];
const path = () => {
	const home = mkdtempSync("/tmp/trl-log-");
	homes.push(home);
	return join(home, "output.json");
};
afterEach(() => {
	for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

test("retained output replays every byte in bounded chunks after reload", () => {
	const file = path();
	const log = new SessionLog(file);
	const bytes = Buffer.alloc(2_000_000, 120);
	log.append(bytes);
	const restored = new SessionLog(file);
	let offset = 0;
	const chunks: Buffer[] = [];
	while (offset < bytes.length) {
		const output = restored.read(offset);
		expect(output.startOffset).toBe(offset);
		expect(output.truncated).toBe(false);
		const chunk = Buffer.from(output.data, "base64");
		expect(chunk.length).toBeLessThanOrEqual(65536);
		chunks.push(chunk);
		offset = output.nextOffset;
	}
	expect(Buffer.concat(chunks)).toEqual(bytes);
});

test("append notifications expose durable bytes and unsubscribe cleanly", () => {
	const log = new SessionLog(path());
	const seen: string[] = [];
	const unsubscribe = log.subscribe(() => seen.push(Buffer.from(log.read(0).data, "base64").toString()));
	log.append(Buffer.from("one"));
	unsubscribe();
	log.append(Buffer.from("two"));
	expect(seen).toEqual(["one"]);
});

test("legacy retained bytes keep their offsets beside new output", () => {
	const file = path();
	writeFileSync(file, JSON.stringify({ offset: 7, data: Buffer.from("old").toString("base64") }));
	const log = new SessionLog(file);
	log.append(Buffer.from("new"));
	expect(log.read(0)).toEqual({
		startOffset: 7,
		nextOffset: 13,
		truncated: true,
		data: Buffer.from("oldnew").toString("base64"),
	});
	expect(new SessionLog(file).read(10)).toEqual({
		startOffset: 10,
		nextOffset: 13,
		truncated: false,
		data: Buffer.from("new").toString("base64"),
	});
});
