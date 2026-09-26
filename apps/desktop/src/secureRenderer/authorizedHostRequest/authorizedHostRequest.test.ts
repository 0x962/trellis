import { describe, expect, test } from "bun:test";
import { authorizedHostRequest } from "./authorizedHostRequest.ts";

const origin = "http://127.0.0.1:4521";

describe("authorizedHostRequest", () => {
	test("accepts a request from the Trellis window", () => {
		expect(
			authorizedHostRequest({ url: `${origin}/api/rpc`, resourceType: "xhr", webContentsId: 42 }, 42, origin),
		).toBe(true);
	});

	test("accepts a Trellis image request without a window id", () => {
		expect(
			authorizedHostRequest(
				{
					url: `${origin}/api/evidence/file-id/file`,
					resourceType: "image",
					frame: { url: `${origin}/reviews/0x962/trellis/469` },
				},
				42,
				origin,
			),
		).toBe(true);
	});

	test("refuses a host image that external content requests", () => {
		expect(
			authorizedHostRequest(
				{
					url: `${origin}/api/evidence/file-id/file`,
					resourceType: "image",
					frame: { url: "https://example.com" },
				},
				42,
				origin,
			),
		).toBe(false);
	});

	test("refuses a host image without a requesting frame", () => {
		expect(
			authorizedHostRequest({ url: `${origin}/api/evidence/file-id/file`, resourceType: "image" }, 42, origin),
		).toBe(false);
	});

	test("refuses a request to another origin", () => {
		expect(
			authorizedHostRequest(
				{ url: "https://example.com/image.png", resourceType: "image", webContentsId: 42 },
				42,
				origin,
			),
		).toBe(false);
	});
});
