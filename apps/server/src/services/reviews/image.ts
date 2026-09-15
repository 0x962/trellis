import { reviewImage } from "@trellis/api";
import { invalidInput } from "../../errors";
import type { PrepareCtx } from "../support";
import { gh } from "./revision";

const limit = 10 * 1024 * 1024;
export async function image(ctx: PrepareCtx, input: { url: string }) {
	const source = reviewImage(input.url);
	if (!source) throw invalidInput("url", "Use a GitHub image URL.");
	const token = (await gh(ctx, ["auth", "token", "--hostname", "github.com"])).trim();
	let currentUrl = source;
	let response = await fetch(source, {
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
		response = await fetch(location, { redirect: "manual", signal: AbortSignal.timeout(15000) });
	}
	if (!response.ok) throw invalidInput("url", `GitHub returned HTTP ${response.status} for this image.`);
	const type = response.headers.get("content-type")?.split(";")[0] ?? "";
	if (!["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/svg+xml"].includes(type))
		throw invalidInput("url", "The URL does not serve a supported image.");
	const reader = response.body!.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > limit) {
			await reader.cancel();
			throw invalidInput("url", "The image exceeds 10 MB.");
		}
		chunks.push(value);
	}
	return { type, data: Buffer.concat(chunks).toString("base64") };
}
