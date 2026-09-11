import { expect, test } from "bun:test";
import { detailKey, healthKey, isInvalidated, listKey, setup } from "../test/applierHarness.ts";
import { queryKey } from "../test/fixtures.ts";

test("personas.changed invalidates the persona list without a ticket refetch", () => {
	const personaKey = queryKey(["personas", "list"], {});
	const { queryClient, advanceTo, applier } = setup((client) => {
		client.setQueryData(personaKey, []);
		client.setQueryData(listKey, { items: [], nextCursor: null });
		client.setQueryData(detailKey, { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV" });
		client.setQueryData(healthKey, { ok: true });
	});
	applier.applyEvent({ type: "personas.changed", id: "01ARZ3NDEKTSV4RRFFQ69G5FAV" });
	advanceTo(1000);
	expect(isInvalidated(queryClient, personaKey)).toBe(true);
	for (const key of [listKey, detailKey, healthKey]) {
		expect(isInvalidated(queryClient, key)).toBe(false);
	}
});
