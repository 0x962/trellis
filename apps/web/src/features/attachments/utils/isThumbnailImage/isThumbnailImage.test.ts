import { describe, expect, test } from "bun:test";
import { isThumbnailImage } from "./isThumbnailImage";

describe("isThumbnailImage", () => {
	// OUT-35. A browser runs the script inside an SVG, so an SVG rendered
	// inline on the app origin is stored XSS.
	test("accepts the allowlisted raster images and rejects SVG", () => {
		for (const mime of ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]) {
			expect(isThumbnailImage(mime)).toBe(true);
		}
		expect(isThumbnailImage("image/svg+xml")).toBe(false);
		expect(isThumbnailImage("application/pdf")).toBe(false);
	});
});
