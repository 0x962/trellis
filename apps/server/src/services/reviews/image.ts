import { reviewImage } from "@trellis/api";
import { encodeReviewImage } from "../../db/reviewImageStream.ts";
import { invalidInput } from "../../errors";
import type { PrepareCtx } from "../support";
import { gh } from "./revision";

type ImageFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;
type ImageDeps = {
	fetch: ImageFetch;
	token: (ctx: PrepareCtx) => Promise<string>;
};

const defaultDeps: ImageDeps = {
	fetch,
	token: (ctx) => gh(ctx, ["auth", "token", "--hostname", "github.com"]),
};

const supportedTypes = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/svg+xml"];

export async function image(ctx: PrepareCtx, input: { url: string }, deps: ImageDeps = defaultDeps) {
	const source = reviewImage(input.url);
	if (!source) throw invalidInput("url", "Use a GitHub image URL.");
	const token = (await deps.token(ctx)).trim();
	let currentUrl = source;
	let response = await deps.fetch(source, {
		headers: { authorization: `Bearer ${token}` },
		redirect: "manual",
		signal: AbortSignal.timeout(15000),
	});
	for (let redirects = 0; response.status >= 300 && response.status < 400 && redirects < 5; redirects++) {
		const location = new URL(response.headers.get("location")!, currentUrl);
		if (
			location.protocol !== "https:" ||
			location.username ||
			location.password ||
			location.port ||
			![
				"github.com",
				"raw.githubusercontent.com",
				"private-user-images.githubusercontent.com",
				"github-production-user-asset-6210df.s3.amazonaws.com",
				"objects.githubusercontent.com",
			].includes(location.hostname)
		)
			throw invalidInput("url", "GitHub redirected this image to an unsupported host.");
		currentUrl = location.href;
		response = await deps.fetch(location, { redirect: "manual", signal: AbortSignal.timeout(15000) });
	}
	if (!response.ok) throw invalidInput("url", `GitHub returned HTTP ${response.status} for this image.`);
	const type = response.headers.get("content-type")?.split(";")[0] ?? "";
	if (!supportedTypes.includes(type)) throw invalidInput("url", "The URL does not serve a supported image.");
	return encodeReviewImage(type, response.body!);
}
