import { expect, test } from "bun:test";
import type { EditorCommand, EditorContent, EditorEvent, EditorFocus, EditorIdentity } from "../protocol";
import { createEditorChannel } from "./editorChannel";

const identity: EditorIdentity = {
	host: "host/data-home",
	actor: "human:editor",
	flowId: "flow-1",
	revision: 4,
	documentHash: "a".repeat(64),
	componentManifestHash: "b".repeat(64),
};
const content: EditorContent = {
	schemaVersion: 1,
	engine: "langflow",
	componentManifestHash: identity.componentManifestHash,
	graphDocument: { nodes: [], edges: [] },
};
const channelId = "b28466dd-b7bc-4020-98b1-191a3b0e64a9";
const envelope = { protocol: "trellis-editor-v1" as const, channel: channelId, identity, sequence: 1 };

function fixture() {
	const sent: EditorCommand[] = [];
	const drafts: EditorContent[] = [];
	const selections: (EditorFocus | null)[] = [];
	let ready = 0;
	let now = Date.parse("2026-09-29T17:00:00Z");
	const options = {
		identity,
		content,
		channel: channelId,
		editorOrigin: "http://127.0.0.1:4172",
		parentOrigin: "http://127.0.0.1:4521",
		expiresAt: "2026-09-29T18:00:00Z",
		now: () => now,
		send: (command: EditorCommand, origin: string) => {
			expect(origin).toBe("http://127.0.0.1:4172");
			sent.push(command);
		},
		draftChanged: (draft: EditorContent) => drafts.push(draft),
		selectionChanged: (focus: EditorFocus | null) => selections.push(focus),
		ready: () => ready++,
	};
	const channel = createEditorChannel(options);
	const receive = (data: unknown, origin = options.editorOrigin, current = true) =>
		channel.receive({ origin, data }, current);
	const start = () => {
		channel.initialize();
		return receive({ ...envelope, type: "ready" });
	};
	return {
		options,
		channel,
		sent,
		drafts,
		selections,
		start,
		receive,
		ready: () => ready,
		expire: () => {
			now = Date.parse(options.expiresAt);
		},
	};
}

test("requires the exact separate origin, frame, channel and immutable identity", () => {
	const f = fixture();
	f.channel.initialize();
	const message = { ...envelope, type: "ready" };
	expect(f.receive(message, "https://other.test")).toBe(false);
	expect(f.receive(message, undefined, false)).toBe(false);
	expect(f.receive({ ...message, channel: crypto.randomUUID() })).toBe(false);
	for (const key of Object.keys(identity) as (keyof EditorIdentity)[]) {
		const changed = { ...identity, [key]: key === "revision" ? 5 : "different" };
		expect(f.receive({ ...message, identity: changed })).toBe(false);
	}
	expect(f.receive(message)).toBe(true);
	expect(f.ready()).toBe(1);
	expect(() => createEditorChannel({ ...f.options, editorOrigin: f.options.parentOrigin })).toThrow();
	for (const editorOrigin of ["javascript:alert(1)", "https://editor.test/path", "https://user:secret@editor.test"]) {
		expect(() => createEditorChannel({ ...f.options, editorOrigin })).toThrow();
	}
});

test("refuses direct execution, save receipts and additional command fields", () => {
	const f = fixture();
	f.start();
	for (const type of ["run", "save", "decision", "cancel", "provider-key", "publication"]) {
		expect(f.receive({ ...envelope, sequence: 2, type })).toBe(false);
	}
	expect(f.receive({ ...envelope, sequence: 2, type: "draft-changed", content, execute: true })).toBe(false);
	expect(f.drafts).toHaveLength(0);
});

test("requires ready and rejects duplicate or out-of-order drafts", () => {
	const f = fixture();
	const draft = { ...envelope, type: "draft-changed", sequence: 2, content };
	expect(f.receive(draft)).toBe(false);
	f.start();
	expect(f.receive(draft)).toBe(true);
	expect(f.receive(draft)).toBe(false);
	expect(f.receive({ ...draft, sequence: 1 })).toBe(false);
	expect(f.receive({ ...envelope, type: "ready", sequence: 3 })).toBe(false);
	expect(f.drafts).toHaveLength(1);
});

test("rejects catalog replacement while retaining all valid graph bytes", () => {
	const f = fixture();
	f.start();
	const graphDocument = {
		nodes: Array.from({ length: 501 }, (_, id) => ({ id, instruction: "x".repeat(5001), rounds: 51, x: 1e9 })),
		edges: Array.from({ length: 2001 }, (_, id) => ({ id })),
	};
	const changed = { ...content, graphDocument };
	const event: EditorEvent = { ...envelope, sequence: 2, type: "draft-changed", content: changed };
	expect(f.receive({ ...event, content: { ...changed, componentManifestHash: "c".repeat(64) } })).toBe(false);
	expect(f.receive(event)).toBe(true);
	expect(f.drafts[0]).toEqual(changed);
});

test("revocation and exact expiry refuse incoming and outgoing events", () => {
	for (const end of ["revoke", "expire"] as const) {
		const f = fixture();
		f.start();
		if (end === "revoke") f.channel.revoke();
		else f.expire();
		f.channel.selectIssue({ nodeId: "node-1", field: "instruction" });
		f.channel.restoreFocus(null);
		f.channel.initialize();
		expect(f.receive({ ...envelope, sequence: 2, type: "draft-changed", content })).toBe(false);
		expect(f.channel.active()).toBe(false);
		expect(f.sent).toHaveLength(1);
		expect(f.drafts).toHaveLength(0);
	}
});

test("sends issue and focus commands without graph writes", () => {
	const f = fixture();
	f.start();
	const focus = { nodeId: "child/in-loop", field: "instruction" };
	f.channel.selectIssue(focus);
	expect(f.receive({ ...envelope, sequence: 2, type: "selection-changed", focus })).toBe(true);
	f.channel.restoreFocus(focus);
	expect(f.sent.map((command) => command.type)).toEqual(["initialize", "select-issue", "restore-focus"]);
	expect(f.sent.map((command) => command.sequence)).toEqual([1, 2, 3]);
	expect(f.selections).toEqual([focus]);
	expect(f.drafts).toEqual([]);
});

test("a late frame connection recovers initialization after the load event", () => {
	const f = fixture();
	f.channel.initialize();
	expect(f.sent).toHaveLength(1);
	expect(f.receive({ ...envelope, type: "connected" })).toBe(true);
	expect(f.sent.map((command) => command.sequence)).toEqual([1, 2]);
	expect(f.sent[1]).toEqual({ ...f.sent[0], sequence: 2 });
	expect(f.receive({ ...envelope, type: "connected", sequence: 2 })).toBe(false);
	expect(f.receive({ ...envelope, type: "ready", sequence: 2 })).toBe(true);
	expect(f.receive({ ...envelope, type: "connected", sequence: 3 })).toBe(false);
	expect(f.ready()).toBe(1);
});

test("an early connection initializes once and retains the origin and expiry checks", () => {
	const f = fixture();
	const connected = { ...envelope, type: "connected" };
	expect(f.receive(connected, "https://other.test")).toBe(false);
	expect(f.receive(connected, undefined, false)).toBe(false);
	expect(f.sent).toHaveLength(0);
	expect(f.receive(connected)).toBe(true);
	f.channel.initialize();
	expect(f.sent).toHaveLength(1);
	const expired = fixture();
	expired.expire();
	expect(expired.receive(connected)).toBe(false);
	expect(expired.sent).toHaveLength(0);
});
