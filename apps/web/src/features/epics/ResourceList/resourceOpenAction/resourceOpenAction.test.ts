import { describe, expect, test } from "bun:test";
import type { Resource } from "@trellis/api";
import { resourceOpenAction } from "./resourceOpenAction";

const resource = (kind: Resource["kind"]) => ({ kind }) as Resource;

describe("resourceOpenAction", () => {
	test("maps each kind to its browser or desktop action", () => {
		expect(resourceOpenAction(resource("doc"), false)).toBe("doc");
		expect(resourceOpenAction(resource("link"), false)).toBe("new-tab");
		expect(resourceOpenAction(resource("link"), true)).toBe("link-sheet");
		expect(resourceOpenAction(resource("image"), false)).toBe("new-tab");
		expect(resourceOpenAction(resource("image"), true)).toBe("image-sheet");
		expect(resourceOpenAction(resource("file"), true)).toBe("download");
	});
});
