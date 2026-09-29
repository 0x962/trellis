import { expect, test } from "bun:test";
import { validateFlowGraph } from "@trellis/api";
import { exportDrafts, importDrafts } from "./draftTransfer";
import type { DraftEntry } from "./types";

const storage = () => {
	const values = new Map<string, string>();
	return {
		get length() {
			return values.size;
		},
		key: (index: number) => [...values.keys()][index] ?? null,
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		},
		removeItem: (key: string) => {
			values.delete(key);
		},
	};
};
const stores = () => ({ local: storage(), session: storage() });
const entriesOf = (text: string) => (JSON.parse(text) as { entries: DraftEntry[] }).entries;
const roundTrip = (source: ReturnType<typeof stores>) => {
	const target = stores();
	const exported = exportDrafts(source);
	importDrafts(target, exported);
	return { exported, entries: entriesOf(exportDrafts(target)) };
};
const graphItemId = (index: number) => `01ARZ3NDEKTSV4RRFFQ${String(index).padStart(7, "0")}`;

test("malformed bundles and unsupported keys change no storage", () => {
	const target = stores();
	for (const text of [
		"{",
		JSON.stringify({ format: "other", version: 1, exportedAt: new Date().toISOString(), entries: [] }),
		JSON.stringify({ format: "trellis-drafts", version: 9, exportedAt: new Date().toISOString(), entries: [] }),
		JSON.stringify({
			format: "trellis-drafts",
			version: 1,
			exportedAt: new Date().toISOString(),
			entries: [{ area: "local", key: "trellis.token", value: "secret" }],
		}),
	])
		expect(() => importDrafts(target, text)).toThrow();
	expect(target.local.length).toBe(0);
	expect(target.session.length).toBe(0);
});

test("round trip preserves the exact bytes of each draft kind", () => {
	const source = stores();
	const expected: DraftEntry[] = [
		{
			area: "local",
			key: "trellis.flow-draft.tab.flow",
			value: '{\n  "version": 2,\n  "graph": {"nodes": [], "edges": []}\n}',
		},
		{
			area: "local",
			key: "trellis.review.drafts:dana:https://github.com/example/repo/pull/1",
			value:
				'[{ "id": "finding", "path": "file.ts", "side": "new", "line": 2, "startLine": 1, "body": "Résumé\\r\\n", "revisionId": null }]',
		},
		{ area: "local", key: "trellis.review.summary:owner/repo/1", value: "Summary\u0000\r\nRésumé" },
		{
			area: "session",
			key: "trellis-composer-draft",
			value: '{ "title": "Ticket", "description": "Line 1\\r\\nLine 2" }',
		},
	];
	for (const entry of expected) source[entry.area].setItem(entry.key, entry.value);
	expect(roundTrip(source).entries).toEqual(expected);
});

test("round trip preserves more than 1000 entries", () => {
	const source = stores();
	const expected = Array.from({ length: 1001 }, (_, index) => ({
		area: "local" as const,
		key: `trellis.review.summary:large-list:${index}`,
		value: `Draft ${index}`,
	}));
	for (const entry of expected) source.local.setItem(entry.key, entry.value);
	expect(roundTrip(source).entries).toEqual(expected);
});

test("round trip preserves one value larger than 8 MiB", () => {
	const source = stores();
	const value = JSON.stringify({
		title: "Large ticket",
		description: `start\u0000${"x".repeat(8 * 1024 * 1024)}\r\nend`,
	});
	source.session.setItem("trellis-composer-draft", value);
	expect(roundTrip(source).entries).toEqual([{ area: "session", key: "trellis-composer-draft", value }]);
});

test("round trip preserves a bundle larger than 10 MiB", () => {
	const source = stores();
	const first = "a".repeat(6 * 1024 * 1024);
	const second = "b".repeat(6 * 1024 * 1024);
	source.local.setItem("trellis.review.summary:bundle-a", first);
	source.local.setItem("trellis.review.summary:bundle-b", second);
	const result = roundTrip(source);
	expect(new TextEncoder().encode(result.exported).length).toBeGreaterThan(10 * 1024 * 1024);
	expect(result.entries).toEqual([
		{ area: "local", key: "trellis.review.summary:bundle-a", value: first },
		{ area: "local", key: "trellis.review.summary:bundle-b", value: second },
	]);
});

test("round trip preserves a supported key longer than 8192 characters", () => {
	const source = stores();
	const key = `trellis.review.summary:${"k".repeat(8192)}`;
	source.local.setItem(key, "Long key");
	expect(roundTrip(source).entries).toEqual([{ area: "local", key, value: "Long key" }]);
});

test("round trip preserves a valid graph above the former node and edge limits", () => {
	const source = stores();
	const nodes = Array.from({ length: 501 }, (_, index) => ({
		id: graphItemId(index),
		parentId: null,
		kind: "agent" as const,
		title: `Agent ${index}`,
		instruction: `Do task ${index}.`,
		parallel: false,
		minutes: null,
		maxRounds: null,
		x: index,
		y: 0,
		width: null,
		height: null,
		harness: null,
	}));
	const edges = [];
	for (let from = 0; from < nodes.length && edges.length < 2001; from++)
		for (let to = from + 1; to < nodes.length && edges.length < 2001; to++)
			edges.push({
				id: graphItemId(10_000 + edges.length),
				fromNodeId: nodes[from]!.id,
				toNodeId: nodes[to]!.id,
				branch: "out" as const,
			});
	expect(validateFlowGraph({ nodes, edges })).toEqual([]);
	const value = JSON.stringify({ version: 1, graph: { nodes, edges } });
	source.local.setItem("trellis.flow-draft.large.flow", value);
	expect(roundTrip(source).entries).toEqual([{ area: "local", key: "trellis.flow-draft.large.flow", value }]);
});

test("storage errors remain visible", () => {
	const exportSource = stores();
	exportSource.local.setItem("trellis.review.summary:export", "Draft");
	exportSource.local.getItem = () => {
		throw new Error("The browser cannot read storage.");
	};
	expect(() => exportDrafts(exportSource)).toThrow("The browser cannot read storage.");

	const importTarget = stores();
	importTarget.local.setItem = () => {
		throw new Error("The browser cannot write storage.");
	};
	expect(() =>
		importDrafts(
			importTarget,
			JSON.stringify({
				format: "trellis-drafts",
				version: 1,
				exportedAt: new Date().toISOString(),
				entries: [{ area: "local", key: "trellis.review.summary:import", value: "Draft" }],
			}),
		),
	).toThrow("The browser cannot write storage.");
});
