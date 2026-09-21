import { describe, expect, test } from "bun:test";
import type { Resource } from "@trellis/api";
import { resourceUrl } from "./resourceUrl";

const base = {
	id: "01AAAAAAAAAAAAAAAAAAAAAAA1",
	epicId: "01M2YRWY0TEG6ETHHWRHVDQ5AH",
	body: null,
	url: null,
	blob: null,
	ticketId: null,
	pullRequestNumber: null,
	actor: { name: "crisp-fjord", kind: "agent" as const },
	createdAt: "2026-09-19T10:00:00.000Z",
	updatedAt: "2026-09-19T10:00:00.000Z",
};

const blob = { sha256: "a".repeat(64), url: "/api/resources/01AAAAAAAAAAAAAAAAAAAAAAA1/blob", size: 56320 };

describe("resourceUrl", () => {
	test("gives the url of a link", () => {
		const resource = { ...base, kind: "link", name: "canary#55569", url: "https://github.com/c/c/pull/1" } as Resource;

		expect(resourceUrl(resource)).toBe("https://github.com/c/c/pull/1");
	});

	test("gives the blob route of an image and of a file", () => {
		const image = { ...base, kind: "image", name: "op27-send-timeout.gif", blob } as Resource;
		const file = { ...base, kind: "file", name: "settle-sequence.mmd", blob } as Resource;

		expect(resourceUrl(image)).toBe(blob.url);
		expect(resourceUrl(file)).toBe(blob.url);
	});
});
