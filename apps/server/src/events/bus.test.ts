import { expect, test } from "bun:test";
import { EventSchema, type TrellisEvent } from "@trellis/api";
import { ulid } from "ulid";
import { matches } from "./bus.ts";

test("scopes every Page event to its project", () => {
	const projectId = ulid();
	const otherProjectId = ulid();
	const pageId = ulid();
	const events = [
		{ type: "pages.changed", projectId, pageId },
		{ type: "page-comments.changed", projectId, pageId, version: 2 },
		{ type: "page-watches.changed", projectId, pageId },
		{ type: "page-pins.changed", projectId, pageId, actor: { kind: "human", name: "Navid" } },
	] satisfies TrellisEvent[];

	for (const event of events) {
		expect(EventSchema.parse(event)).toEqual(event);
		expect(matches(event, { projectIds: [projectId] })).toBe(true);
		expect(matches(event, { projectIds: [otherProjectId] })).toBe(false);
	}
});
