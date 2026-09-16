import { expect, test } from "bun:test";
import { detailKey, healthKey, isInvalidated, listKey, setup } from "../test/applierHarness.ts";
import { queryKey } from "../test/fixtures.ts";

const rootNotesKey = queryKey(["notes", "list"], { project: "CDE" });
const childNotesKey = queryKey(["notes", "list"], { project: "CDE.web", audience: "worker" });

test("a note change invalidates every note list and nothing else", () => {
	const { queryClient, advanceTo, applier } = setup((client) => {
		client.setQueryData(rootNotesKey, []);
		client.setQueryData(childNotesKey, []);
		client.setQueryData(listKey, { items: [], nextCursor: null });
		client.setQueryData(detailKey, { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV" });
		client.setQueryData(healthKey, { ok: true });
	});
	applier.applyEvent({ type: "notes.changed", projectId: "01ARZ3NDEKTSV4RRFFQ69G5FAV" });
	advanceTo(1000);
	expect(isInvalidated(queryClient, rootNotesKey)).toBe(true);
	expect(isInvalidated(queryClient, childNotesKey)).toBe(true);
	for (const key of [listKey, detailKey, healthKey]) {
		expect(isInvalidated(queryClient, key)).toBe(false);
	}
});
