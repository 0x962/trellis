import { describe, expect, test } from "bun:test";
import { imageForViewer } from "./imageForViewer.ts";

const target = (tagName: string, attributes: Record<string, string>) => ({
	tagName,
	getAttribute: (name: string) => attributes[name] ?? null,
});

describe("imageForViewer", () => {
	test("opens a stored image in the viewer", () => {
		expect(
			imageForViewer(
				target("IMG", {
					src: "/api/evidence/01M3362000000000000000000A/file",
					alt: "The Overview tab",
				}),
			),
		).toEqual({
			src: "/api/evidence/01M3362000000000000000000A/file",
			alt: "The Overview tab",
		});
	});

	test("opens an animated image in the viewer", () => {
		expect(
			imageForViewer(
				target("IMG", {
					src: "/api/evidence/01M3362000000000000000000B/file",
					alt: "The state changes",
				}),
			),
		).toEqual({
			src: "/api/evidence/01M3362000000000000000000B/file",
			alt: "The state changes",
		});
	});

	test("ignores a click outside an image", () => {
		expect(imageForViewer(target("P", {}))).toBeNull();
	});
});
