import { expect, test } from "bun:test";
import { detailKey, healthKey, isInvalidated, listKey, setup } from "../test/applierHarness.ts";
import { queryKey } from "../test/fixtures.ts";

const channelsKey = queryKey(["chat", "channels"], { project: "CDE" });
const messagesKey = queryKey(["chat", "list"], { project: "CDE", channel: "ai", limit: 200 });

test("a chat message invalidates the chat queries and nothing else", () => {
	const { queryClient, advanceTo, applier } = setup((client) => {
		client.setQueryData(channelsKey, []);
		client.setQueryData(messagesKey, { channel: "ai", items: [], latestId: null });
		client.setQueryData(listKey, { items: [], nextCursor: null });
		client.setQueryData(detailKey, { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV" });
		client.setQueryData(healthKey, { ok: true });
	});
	applier.applyEvent({
		type: "chat.message",
		id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
		projectId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
		channel: "ai",
		aiOnly: true,
		actor: { name: "dana", kind: "human" },
	});
	advanceTo(1000);
	expect(isInvalidated(queryClient, channelsKey)).toBe(true);
	expect(isInvalidated(queryClient, messagesKey)).toBe(true);
	for (const key of [listKey, detailKey, healthKey]) {
		expect(isInvalidated(queryClient, key)).toBe(false);
	}
});

test("a delivery state change invalidates the chat queries", () => {
	const { queryClient, advanceTo, applier } = setup((client) => {
		client.setQueryData(messagesKey, { channel: "ai", items: [], latestId: null });
	});
	applier.applyEvent({
		type: "chat.delivery",
		id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
		projectId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
		channel: "ai",
	});
	advanceTo(1000);
	expect(isInvalidated(queryClient, messagesKey)).toBe(true);
});

test("a channel list change invalidates the chat queries", () => {
	const { queryClient, advanceTo, applier } = setup((client) => {
		client.setQueryData(channelsKey, []);
	});
	applier.applyEvent({ type: "chat.channels", projectId: "01ARZ3NDEKTSV4RRFFQ69G5FAV" });
	advanceTo(1000);
	expect(isInvalidated(queryClient, channelsKey)).toBe(true);
});
