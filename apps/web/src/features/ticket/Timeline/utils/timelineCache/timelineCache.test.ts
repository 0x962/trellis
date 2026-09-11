import { describe, expect, test } from "bun:test";
import { type InfiniteData, QueryClient } from "@tanstack/react-query";
import type { TimelineListOutput } from "@trellis/api";
import { prependTimeline } from "./timelineCache";

const reply = {
	kind: "comment" as const,
	id: "01J8Z6X4Q3M2K1H0G9F8E7D6C1",
	ticketId: "01J8Z6X4Q3M2K1H0G9F8E7D6C2",
	parentId: "01J8Z6X4Q3M2K1H0G9F8E7D6C3",
	resolvedAt: null,
	body: "The reply already arrived through the live stream.",
	actor: { name: "dana", kind: "human" as const },
	createdAt: "2026-09-10T12:00:00Z",
	updatedAt: "2026-09-10T12:00:00Z",
};

describe("timeline cache", () => {
	test("a reply response preserves a reply already fetched on an older page", () => {
		const queryClient = new QueryClient();
		const key = ["timeline"];
		const pages: TimelineListOutput[] = [
			{ items: [{ ...reply, id: "01J8Z6X4Q3M2K1H0G9F8E7D6C4" }], nextCursor: "older" },
			{ items: [reply], nextCursor: null },
		];
		queryClient.setQueryData(key, { pages, pageParams: [undefined, "older"] });
		prependTimeline(queryClient, key, reply);
		expect(queryClient.getQueryData<InfiniteData<TimelineListOutput>>(key)).toEqual({
			pages,
			pageParams: [undefined, "older"],
		});
	});
});
