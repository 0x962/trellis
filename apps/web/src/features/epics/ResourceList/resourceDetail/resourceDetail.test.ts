import { describe, expect, test } from "bun:test";
import type { Resource } from "@trellis/api";
import { resourceDetail } from "./resourceDetail";

const base = {
	id: "01AAAAAAAAAAAAAAAAAAAAAAA1",
	epicId: "01M2YRWY0TEG6ETHHWRHVDQ5AH",
	name: "A resource",
	body: null,
	url: null,
	blob: null,
	ticketId: null,
	pullRequestNumber: null,
	actor: { name: "crisp-fjord", kind: "agent" as const },
	createdAt: "2026-09-19T10:00:00.000Z",
	updatedAt: "2026-09-19T10:00:00.000Z",
};

const blob = { sha256: "a".repeat(64), url: "/blobs/a", size: 56320 };

describe("resourceDetail", () => {
	test("names the day and the actor of a doc", () => {
		const doc: Resource = { ...base, kind: "doc", body: "# The runtime" };

		expect(resourceDetail(doc)).toBe("Edited Sep 19 by crisp-fjord");
	});

	test("prefers the display name of the actor of a doc", () => {
		const doc: Resource = { ...base, kind: "doc", actor: { ...base.actor, displayName: "you" } };

		expect(resourceDetail(doc)).toBe("Edited Sep 19 by you");
	});

	test("names the host of a link", () => {
		const link: Resource = { ...base, kind: "link", url: "https://github.com/canary/canary/pull/55569" };

		expect(resourceDetail(link)).toBe("github.com");
	});

	test("names the size of an image", () => {
		const image: Resource = { ...base, kind: "image", blob };

		expect(resourceDetail(image)).toBe("55.0 KB");
	});

	test("names the size of a file", () => {
		const file: Resource = { ...base, kind: "file", blob: { ...blob, size: 1229 } };

		expect(resourceDetail(file)).toBe("1.2 KB");
	});
});
