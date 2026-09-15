import { afterEach, expect, spyOn, test } from "bun:test";
import { image } from "../../../../../src/services/reviews/image";
import type { PrepareCtx } from "../../../../../src/services/support";

const ctx = { gh: async () => ({ ok: true, stdout: "fixture-token", stderr: "", code: 0 }) } as unknown as PrepareCtx;
let fetchSpy: ReturnType<typeof spyOn>;
afterEach(() => fetchSpy.mockRestore());

test("image redirects resolve from the last URL and never forward the token", async () => {
	const calls: { url: string; auth: string | null }[] = [];
	fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
		Object.assign(
			async (input: string | URL | Request, init?: RequestInit) => {
				calls.push({ url: String(input), auth: new Headers(init?.headers).get("authorization") });
				if (calls.length === 1)
					return new Response(null, {
						status: 302,
						headers: { location: "https://raw.githubusercontent.com/owner/repo/main/first.png" },
					});
				if (calls.length === 2) return new Response(null, { status: 302, headers: { location: "second.png" } });
				return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } });
			},
			{ preconnect: globalThis.fetch.preconnect },
		),
	);
	const result = await image(ctx, { url: "https://github.com/user-attachments/assets/image" });
	expect(result).toEqual({ type: "image/png", data: "AQID" });
	expect(calls).toEqual([
		{ url: "https://github.com/user-attachments/assets/image", auth: "Bearer fixture-token" },
		{ url: "https://raw.githubusercontent.com/owner/repo/main/first.png", auth: null },
		{ url: "https://raw.githubusercontent.com/owner/repo/main/second.png", auth: null },
	]);
});

test("an image redirect to another host is refused before a fetch", async () => {
	fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
		new Response(null, { status: 302, headers: { location: "https://example.com/image.png" } }),
	);
	await expect(image(ctx, { url: "https://github.com/user-attachments/assets/image" })).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
	});
	expect(fetchSpy).toHaveBeenCalledTimes(1);
});
