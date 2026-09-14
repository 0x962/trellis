import { expect, test } from "bun:test";
import { acknowledgeCopy, exportDrafts, importDrafts, listRecoveryCopies, restoreDraft } from "./draftTransfer";

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
const draft = JSON.stringify({ version: 2, graph: { nodes: [], edges: [] } });
test("export includes drafts but excludes auth, identity, and preferences", () => {
	const source = stores();
	source.local.setItem("trellis.flow-draft.tab.flow", draft);
	source.local.setItem("trellis.review.summary:owner/repo/1", "Summary");
	source.session.setItem("trellis-composer-draft", JSON.stringify({ title: "Ticket", description: "Text" }));
	for (const key of ["trellis.actor", "trellis.review.mode", "trellis.theme", "trellis.token"])
		source.local.setItem(key, "private");
	const bundle = JSON.parse(exportDrafts(source));
	expect(bundle.entries).toHaveLength(3);
	expect(JSON.stringify(bundle)).not.toContain("private");
});
test("import across origins retains copies and preserves a differing live draft", () => {
	const source = stores();
	source.local.setItem("trellis.review.summary:pr", "Imported");
	const target = stores();
	target.local.setItem("trellis.review.summary:pr", "Existing");
	const copies = importDrafts(target, exportDrafts(source));
	expect(copies).toHaveLength(1);
	expect(target.local.getItem("trellis.review.summary:pr")).toBe("Existing");
	restoreDraft(target, copies[0]!.id);
	expect(target.local.getItem("trellis.review.summary:pr")).toBe("Imported");
	expect(
		listRecoveryCopies(target.local)
			.map((copy) => copy.entry.value)
			.sort(),
	).toEqual(["Existing", "Imported"]);
	acknowledgeCopy(target.local, copies[0]!.id);
	expect(listRecoveryCopies(target.local).map((copy) => copy.entry.value)).toEqual(["Existing"]);
});
test("repeated imports keep one recovery copy for identical bytes", () => {
	const source = stores();
	source.local.setItem("trellis.flow-draft.old.flow", draft);
	const target = stores();
	const text = exportDrafts(source);
	importDrafts(target, text);
	importDrafts(target, text);
	expect(listRecoveryCopies(target.local)).toHaveLength(1);
});
test("malformed and non-draft imports change no storage", () => {
	const target = stores();
	for (const text of [
		"{",
		JSON.stringify({ format: "trellis-drafts", version: 9, entries: [] }),
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
test("an unresolved imported session draft survives a second export", () => {
	const source = stores();
	source.session.setItem("trellis-composer-draft", JSON.stringify({ title: "Unsent", description: "Body" }));
	const target = stores();
	importDrafts(target, exportDrafts(source));
	const another = stores();
	importDrafts(another, exportDrafts(target));
	expect(listRecoveryCopies(another.local)[0]?.entry.area).toBe("session");
});

test("review findings and unfinished review text survive a transfer", () => {
	const source = stores();
	const key = "trellis.review.drafts:dana:https://github.com/example/repo/pull/1";
	source.local.setItem(
		key,
		JSON.stringify([
			{ id: "finding", path: "file.ts", side: "new", line: 2, startLine: 1, body: "Review text", revisionId: null },
		]),
	);
	source.local.setItem(`${key}:edit:finding`, "Edited text");
	source.local.setItem(`${key}:compose:file.ts:new:1:2`, "Unsent finding");
	const target = stores();
	const imported = importDrafts(target, exportDrafts(source));
	for (const copy of imported) restoreDraft(target, copy.id);
	for (const copy of imported) expect(target.local.getItem(copy.entry.key)).toBe(source.local.getItem(copy.entry.key));
	expect(imported).toHaveLength(3);
});
test("a structurally valid flow draft keeps invalid graph connections for repair", () => {
	const source = stores();
	const value = JSON.stringify({
		version: 1,
		graph: {
			nodes: [],
			edges: [
				{
					id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
					fromNodeId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
					toNodeId: "01ARZ3NDEKTSV4RRFFQ69G5FAX",
					branch: "out",
				},
			],
		},
	});
	source.local.setItem("trellis.flow-draft.tab.flow", value);
	const target = stores();
	expect(importDrafts(target, exportDrafts(source))[0]?.entry.value).toBe(value);
});

test("acknowledgement cannot erase a copy imported by another window", () => {
	const target = stores();
	const [first] = importDrafts(
		target,
		JSON.stringify({
			format: "trellis-drafts",
			version: 1,
			exportedAt: new Date().toISOString(),
			entries: [{ area: "local", key: "trellis.review.summary:first", value: "First" }],
		}),
	);
	const set = target.local.setItem;
	const remove = target.local.removeItem;
	let armed = true;
	const otherWindow = () => {
		if (!armed) return;
		armed = false;
		importDrafts(
			target,
			JSON.stringify({
				format: "trellis-drafts",
				version: 1,
				exportedAt: new Date().toISOString(),
				entries: [{ area: "local", key: "trellis.review.summary:second", value: "Second" }],
			}),
		);
	};
	target.local.setItem = (key, value) => {
		otherWindow();
		set(key, value);
	};
	target.local.removeItem = (key) => {
		otherWindow();
		remove(key);
	};
	acknowledgeCopy(target.local, first!.id);
	expect(listRecoveryCopies(target.local).map((copy) => copy.entry.value)).toEqual(["Second"]);
});

test("a copy removed during storage enumeration does not break recovery", () => {
	const target = stores();
	const imported = importDrafts(
		target,
		JSON.stringify({
			format: "trellis-drafts",
			version: 1,
			exportedAt: new Date().toISOString(),
			entries: [{ area: "local", key: "trellis.review.summary:first", value: "First" }],
		}),
	);
	const get = target.local.getItem;
	target.local.getItem = (key) => {
		if (key.endsWith(imported[0]!.id)) target.local.removeItem(key);
		return get(key);
	};
	expect(listRecoveryCopies(target.local)).toEqual([]);
});
