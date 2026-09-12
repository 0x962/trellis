import { describe, expect, test } from "bun:test";
import type { HtmlTagDescriptor, IndexHtmlTransformContext, ResolvedConfig } from "vite";
import { fontPreloads } from "./fontPreloads";

type Handler = (html: string, context: IndexHtmlTransformContext) => HtmlTagDescriptor[];

const asset = (fileName: string) => ({ type: "asset", fileName });

// Runs the plugin's index.html hook over a bundle that holds `fileNames`,
// as a build with the site base `base` would.
const tags = (fileNames: string[], base = "/") => {
	const plugin = fontPreloads();
	(plugin.configResolved as (config: ResolvedConfig) => void)({ base } as ResolvedConfig);
	const hook = plugin.transformIndexHtml as { handler: Handler };
	const bundle = Object.fromEntries(fileNames.map((name) => [name, asset(name)]));
	return hook.handler("", { bundle } as unknown as IndexHtmlTransformContext);
};

const built = [
	"assets/index-D_M8n0HD.js",
	"assets/index-D_M8n0HD.css",
	"assets/inter-latin-wght-normal-Dx4kXJAl.woff2",
	"assets/inter-latin-wght-italic-Q1w2E3r4.woff2",
	"assets/jetbrains-mono-latin-400-normal-V6pRDFza.woff2",
	"assets/jetbrains-mono-latin-500-normal-BWZEU5yA.woff2",
	"assets/jetbrains-mono-latin-600-normal-C8RAYTDA.woff2",
	"assets/jetbrains-mono-cyrillic-400-normal-Zx9Yw8Vu.woff2",
];

describe("fontPreloads", () => {
	// The href is the hashed file the built CSS asks for, so the browser
	// reuses the preloaded bytes.
	test("the build preloads the latin Inter file and JetBrains Mono 400 by their hashed names", () => {
		const hrefs = tags(built).map((tag) => tag.attrs!.href);
		expect(hrefs.sort()).toEqual(
			[
				"/assets/inter-latin-wght-normal-Dx4kXJAl.woff2",
				"/assets/jetbrains-mono-latin-400-normal-V6pRDFza.woff2",
			].sort(),
		);
	});

	// A font preload without crossorigin is fetched twice.
	test("every tag is a crossorigin woff2 font preload in the head", () => {
		for (const tag of tags(built)) {
			expect(tag.tag).toBe("link");
			expect(tag.injectTo).toBe("head");
			expect(tag.attrs).toMatchObject({ rel: "preload", as: "font", type: "font/woff2", crossorigin: true });
		}
	});

	test("the href starts with the site base", () => {
		const hrefs = tags(built, "/trellis/").map((tag) => tag.attrs!.href as string);
		expect(hrefs.every((href) => href.startsWith("/trellis/assets/"))).toBe(true);
	});

	test("the dev server gets no preload", () => {
		expect(fontPreloads().apply).toBe("build");
	});
});
