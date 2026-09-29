import { expect, test } from "bun:test";
import type { EditorContent, EditorEvent, EditorFocus } from "../protocol";
import { createFrameDriver } from "./frameDriver";

const identity = {
	host: "host/data-home",
	actor: "human:editor",
	flowId: "flow-1",
	revision: 2,
	documentHash: "a".repeat(64),
	componentManifestHash: "b".repeat(64),
};
const content: EditorContent = {
	schemaVersion: 1,
	engine: "langflow",
	componentManifestHash: identity.componentManifestHash,
	graphDocument: { nodes: [], edges: [] },
};
const envelope = {
	protocol: "trellis-editor-v1",
	channel: "b28466dd-b7bc-4020-98b1-191a3b0e64a9",
	identity,
	sequence: 1,
};
function fixture(initialize: (content: EditorContent) => Promise<void> = async () => {}) {
	const sent: EditorEvent[] = [];
	const focused: (EditorFocus | null)[] = [];
	let now = 0;
	let unsubscribed = 0;
	let callbacks: {
		draftChanged: (content: EditorContent) => void;
		selectionChanged: (focus: EditorFocus | null) => void;
	};
	const driver = createFrameDriver({
		identity,
		channel: envelope.channel,
		parentOrigin: "http://localhost:4521",
		editorOrigin: "http://localhost:4172",
		expiresAt: new Date(1000).toISOString(),
		now: () => now,
		send: (event, origin) => {
			expect(origin).toBe("http://localhost:4521");
			sent.push(event);
		},
		driver: {
			initialize,
			subscribe: (listener) => {
				callbacks = listener;
				return () => {
					unsubscribed++;
				};
			},
			selectIssue: (focus) => {
				focused.push(focus);
			},
			restoreFocus: (focus) => {
				focused.push(focus);
			},
		},
	});
	const receive = (data: unknown, origin = "http://localhost:4521", parent = true) =>
		driver.receive({ origin, data }, parent);
	return {
		driver,
		receive,
		sent,
		focused,
		callbacks: () => callbacks,
		unsubscribed: () => unsubscribed,
		expire: () => {
			now = 1000;
		},
	};
}
const initial = { ...envelope, type: "initialize", content };

test("hydrates the retained draft before ready and forwards editor events", async () => {
	let complete!: () => void;
	const f = fixture(async (loaded) => {
		expect(loaded).toEqual(content);
		await new Promise<void>((resolve) => {
			complete = resolve;
		});
	});
	const pending = f.receive(initial);
	expect(f.sent).toHaveLength(0);
	expect(await f.receive(initial)).toBe(false);
	complete();
	expect(await pending).toBe(true);
	expect(f.sent.map((event) => event.type)).toEqual(["ready"]);
	f.callbacks().draftChanged(content);
	f.callbacks().selectionChanged({ nodeId: "nested-child", field: "instruction" });
	expect(f.sent.map((event) => event.sequence)).toEqual([1, 2, 3]);
	const focus = { nodeId: "nested-child", field: "instruction" };
	expect(await f.receive({ ...envelope, sequence: 2, type: "select-issue", focus })).toBe(true);
	expect(await f.receive({ ...envelope, sequence: 3, type: "restore-focus", focus: null })).toBe(true);
	expect(f.focused).toEqual([focus, null]);
});

test("refuses another parent, origin, document, channel, execution command and replay", async () => {
	const f = fixture();
	for (const [data, origin, parent] of [
		[initial, "http://localhost:4521", false],
		[initial, "http://localhost:4522", true],
		[{ ...initial, channel: crypto.randomUUID() }, "http://localhost:4521", true],
		[{ ...initial, identity: { ...identity, revision: 3 } }, "http://localhost:4521", true],
		[{ ...initial, content: { ...content, componentManifestHash: "c".repeat(64) } }, "http://localhost:4521", true],
		[{ ...envelope, type: "run" }, "http://localhost:4521", true],
	] as const)
		expect(await f.receive(data, origin, parent)).toBe(false);
	expect(f.sent).toHaveLength(0);
	expect(await f.receive(initial)).toBe(true);
	expect(await f.receive({ ...envelope, type: "restore-focus", focus: null })).toBe(false);
	expect(f.focused).toHaveLength(0);
});

test("disposal during hydration cannot acknowledge or subscribe", async () => {
	let complete!: () => void;
	const f = fixture(
		() =>
			new Promise<void>((resolve) => {
				complete = resolve;
			}),
	);
	const pending = f.receive(initial);
	f.driver.dispose();
	complete();
	expect(await pending).toBe(false);
	expect(f.sent).toHaveLength(0);
	expect(f.callbacks()).toBeUndefined();
});

test("expiry and disposal stop events and commands", async () => {
	const f = fixture();
	await f.receive(initial);
	f.expire();
	f.callbacks().draftChanged(content);
	expect(await f.receive({ ...envelope, sequence: 2, type: "restore-focus", focus: null })).toBe(false);
	expect(f.sent).toHaveLength(1);
	f.driver.dispose();
	f.driver.dispose();
	expect(f.unsubscribed()).toBe(1);
});

test("connect announces the installed listener once before hydration", async () => {
	const f = fixture();
	f.driver.connect();
	f.driver.connect();
	expect(f.sent.map((event) => event.type)).toEqual(["connected"]);
	expect(await f.receive(initial)).toBe(true);
	expect(f.sent.map((event) => event.type)).toEqual(["connected", "ready"]);
	expect(f.sent.map((event) => event.sequence)).toEqual([1, 2]);
	const expired = fixture();
	expired.expire();
	expired.driver.connect();
	expect(expired.sent).toHaveLength(0);
});
