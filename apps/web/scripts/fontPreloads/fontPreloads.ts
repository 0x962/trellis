import { basename } from "node:path";
import type { HtmlTagDescriptor, Plugin } from "vite";

// The font files fonts.css declares: the latin Inter variable file and the
// latin JetBrains Mono weights 400, 500, and 600. The build names each file
// `<fontsource name>-<hash>.woff2`, so a pattern matches the name before the
// hash.
export const preloadedFonts = [
	/^inter-latin-wght-normal-[\w-]+\.woff2$/,
	/^jetbrains-mono-latin-(400|500|600)-normal-[\w-]+\.woff2$/,
];

// A preload href must be the exact URL that the built CSS asks for, or the
// browser downloads the font twice. Only the build knows the hashed name, so
// this plugin writes the <link rel="preload"> tags into index.html at build
// time. The dev server gets no preload.
export function fontPreloads(): Plugin {
	let base = "/";
	return {
		name: "trellis-font-preloads",
		apply: "build",
		configResolved(config) {
			base = config.base;
		},
		transformIndexHtml: {
			order: "post",
			handler(_html, context): HtmlTagDescriptor[] {
				return Object.values(context.bundle!)
					.filter((output) => output.type === "asset")
					.filter((asset) => preloadedFonts.some((pattern) => pattern.test(basename(asset.fileName))))
					.map((asset) => ({
						tag: "link",
						attrs: {
							rel: "preload",
							as: "font",
							type: "font/woff2",
							crossorigin: true,
							href: `${base}${asset.fileName}`,
						},
						injectTo: "head",
					}));
			},
		},
	};
}
