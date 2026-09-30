import { afterAll, expect, test } from "bun:test";
import { previewArgument } from "./previewArgument";
import { createUiPreview } from "./uiPreview";

const hostOrigin = "http://127.0.0.1:4521";
let requests = 0;
const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	fetch: (request) => {
		requests += 1;
		expect(request.headers.has("Authorization")).toBe(false);
		return Response.json({ hostOrigin });
	},
});
afterAll(() => server.stop(true));
const address = server.url.origin;
const fixture = (host = hostOrigin) => {
	let reloads = 0;
	const changes: boolean[] = [];
	const preview = createUiPreview({
		hostOrigin: () => host,
		reload: async () => {
			reloads += 1;
		},
		changed: (active) => changes.push(active),
	});
	return { preview, changes, reloads: () => reloads };
};

test("normal startup makes no preview request and keeps the installed UI", async () => {
	const f = fixture();
	const before = requests;
	expect(await f.preview.apply(["Trellis", "trellis://open/t/TRL-1"])).toBe(false);
	expect(f.preview.origin()).toBeUndefined();
	expect(f.reloads()).toBe(0);
	expect(requests).toBe(before);
});

test("an explicit command selects a matching preview and off restores the installed UI", async () => {
	const f = fixture();
	expect(await f.preview.apply([`--ui-preview=${address}`])).toBe(true);
	expect(f.preview.origin()).toBe(address);
	expect(f.changes).toEqual([true]);
	await f.preview.apply(["--ui-preview=off"]);
	expect(f.preview.origin()).toBeUndefined();
	expect(f.reloads()).toBe(2);
	expect(f.changes).toEqual([true, false]);
});

test("a different host refuses preview before a reload", async () => {
	const f = fixture("http://127.0.0.1:4522");
	await expect(f.preview.apply([`--ui-preview=${address}`])).rejects.toThrow("this Trellis host");
	expect(f.preview.origin()).toBeUndefined();
	expect(f.reloads()).toBe(0);
	await f.preview.stop();
	expect(f.reloads()).toBe(1);
});

test("a host port cannot be the preview server", async () => {
	const f = fixture(address);
	await expect(f.preview.apply([`--ui-preview=${address}`])).rejects.toThrow("separate server port");
});

test("queued stop follows an in-flight preview selection", async () => {
	const f = fixture();
	await Promise.all([f.preview.apply([`--ui-preview=${address}`]), f.preview.stop()]);
	expect(f.preview.origin()).toBeUndefined();
	expect(f.changes).toEqual([true, false]);
});

test.each([
	"https://127.0.0.1:5173",
	"http://localhost:5173",
	"http://example.com:5173",
	"http://127.0.0.1",
	"http://user:secret@127.0.0.1:5173",
	"http://127.0.0.1:5173/path",
	"http://127.0.0.1:5173/?query",
	"http://127.0.0.1:5173/#hash",
])("refuses a preview address outside the explicit local origin: %s", (url) => {
	expect(() => previewArgument([`--ui-preview=${url}`])).toThrow();
});

test("refuses missing and repeated preview arguments", () => {
	expect(() => previewArgument(["--ui-preview"])).toThrow();
	expect(() => previewArgument([`--ui-preview=${address}`, "--ui-preview=off"])).toThrow();
});
