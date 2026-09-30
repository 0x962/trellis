import { describe, expect, test } from "bun:test";
import { authorizedHostRequest } from "./authorizedHostRequest.ts";

const origin = "http://127.0.0.1:4521";
const preview = "http://127.0.0.1:5173";

describe("authorizedHostRequest", () => {
	test("preview forwards authentication only for API and RPC traffic from the app", () => {
		for (const path of ["/api", "/api/events", "/rpc/tickets/get"])
			expect(
				authorizedHostRequest(
					{ url: `${preview}${path}`, resourceType: "xhr", webContentsId: 42 },
					42,
					origin,
					preview,
				),
			).toBe(true);
		expect(
			authorizedHostRequest(
				{ url: "ws://127.0.0.1:5173/api/terminal", resourceType: "webSocket", webContentsId: 42 },
				42,
				origin,
				preview,
			),
		).toBe(true);
		for (const path of ["/", "/@vite/client", "/src/main.tsx", "/api-other", "/.trellis-preview"])
			expect(
				authorizedHostRequest(
					{ url: `${preview}${path}`, resourceType: "script", webContentsId: 42 },
					42,
					origin,
					preview,
				),
			).toBe(false);
	});

	test("preview authentication ends when preview stops and excludes other windows", () => {
		const details = { url: `${preview}/api/projects`, resourceType: "xhr", webContentsId: 42 };
		expect(authorizedHostRequest(details, 42, origin)).toBe(false);
		expect(authorizedHostRequest({ ...details, webContentsId: 43 }, 42, origin, preview)).toBe(false);
	});

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
