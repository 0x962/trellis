import { expect, test } from "bun:test";
import { isInvalidated, setup } from "../test/applierHarness.ts";
import { queryKey } from "../test/fixtures.ts";

test("personal changes and thread resolution refresh inbox lists and the indicator", () => {
	for (const event of [
		{ type: "needs-you.changed", actorName: "dana" },
		{
			type: "comment.updated",
			id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
			parentId: null,
			threadId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
			ticketId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
			projectId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
			resolved: true,
		},
	]) {
		const keys = [queryKey(["needsYou", "list"], {}), queryKey(["needsYou", "summary"], {})];
		const { queryClient, advanceTo, applier } = setup((client) => {
			for (const key of keys) client.setQueryData(key, {});
		});
		applier.applyEvent(event);
		advanceTo(1000);
		for (const key of keys) expect(isInvalidated(queryClient, key)).toBe(true);
	}
});
