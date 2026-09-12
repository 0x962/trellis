import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Window } from "happy-dom";

const html = () => Bun.file(join(import.meta.dir, "index.html")).text();

const parse = async () => new DOMParser().parseFromString(await html(), "text/html");

// The inline theme script: the first <script> in <head> without a type.
const headScript = async () => {
	const document = await parse();
	const script = document.head.querySelector("script:not([type])");
	if (script === null) throw new Error("index.html has no inline script in <head>");
	return script.textContent;
};

// Runs the head script against a fresh document with `stored` as the value
// of localStorage trellis-theme. The script sees only `document` and
// `localStorage`, the two globals the page has before any module loads.
const runHeadScript = async (stored: string | null) => {
	const window = new Window();
	if (stored !== null) window.localStorage.setItem("trellis-theme", stored);
	const run = new Function("document", "localStorage", await headScript());
	run(window.document, window.localStorage);
	return {
		theme: window.document.documentElement.getAttribute("data-theme"),
		stored: window.localStorage.getItem("trellis-theme"),
		keys: window.localStorage.length,
	};
};

describe("index.html", () => {
	// WS-04. The ui hook reads trellis-theme and treats a missing key as
	// system. The script writes dark on a fresh profile, so the hook and the
	// first paint agree.
	test("the head script stamps data-theme=dark and stores dark on a fresh profile", async () => {
		const result = await runHeadScript(null);
		expect(result.theme).toBe("dark");
		expect(result.stored).toBe("dark");
	});

	// WS-05
	test("the head script honors a stored light choice", async () => {
		const result = await runHeadScript("light");
		expect(result.theme).toBe("light");
		expect(result.stored).toBe("light");
		expect(result.keys).toBe(1);
	});

	// WS-06. In system mode the prefers-color-scheme media query in tokens.css
	// decides, so no attribute is stamped.
	test("the head script leaves data-theme unset for a stored system choice", async () => {
		const result = await runHeadScript("system");
		expect(result.theme).toBeNull();
		expect(result.stored).toBe("system");
		expect(result.keys).toBe(1);
	});

	// WS-07. The stylesheet paints with the stamped theme, and the module
	// entry mounts React after it. Both come after the script in source
	// order, and the script imports nothing, so it runs before any fetch.
	test("the theme script is the first script in head and precedes the stylesheet and the module entry", async () => {
		const document = await parse();
		const children = [...document.head.children];
		const scriptIndex = children.findIndex((child) => child.tagName === "SCRIPT");
		expect(scriptIndex).toBeGreaterThanOrEqual(0);
		const first = children[scriptIndex]!;
		expect(first.getAttribute("type")).toBeNull();
		expect(first.textContent).not.toMatch(/\bimport\b/);
		const earlier = children.slice(0, scriptIndex);
		for (const element of earlier) {
			expect(element.matches('link[rel="stylesheet"], script[type="module"]')).toBe(false);
		}
		const modules = [...document.querySelectorAll('script[type="module"]')];
		for (const module of modules) {
			expect(first.compareDocumentPosition(module) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		}
	});

	// WS-08. fonts.css declares the latin subset of the Inter variable file
	// and of three JetBrains Mono weights, so the page preloads exactly those
	// four files.
	test("the head preloads only the latin Inter and JetBrains Mono woff2 files", async () => {
		const document = await parse();
		const preloads = [...document.head.querySelectorAll('link[rel="preload"][as="font"]')];
		expect(preloads).toHaveLength(4);
		const hrefs = preloads.map((link) => link.getAttribute("href") ?? "");
		expect(hrefs.filter((href) => href.includes("inter-latin-wght-normal.woff2"))).toHaveLength(1);
		expect(hrefs.filter((href) => href.includes("jetbrains-mono-latin-400-normal.woff2"))).toHaveLength(1);
		expect(hrefs.filter((href) => href.includes("jetbrains-mono-latin-500-normal.woff2"))).toHaveLength(1);
		expect(hrefs.filter((href) => href.includes("jetbrains-mono-latin-600-normal.woff2"))).toHaveLength(1);
		for (const link of preloads) {
			expect(link.getAttribute("type")).toBe("font/woff2");
			expect(link.hasAttribute("crossorigin")).toBe(true);
		}
	});

	// SH-1. The tab shows the trellis mark. A browser that reads SVG icons
	// takes the SVG; the others take the 32 px PNG; a phone home screen takes
	// the 180 px PNG and the manifest. Vite copies public/ to the root of
	// dist, so every href must name a file in public/.
	test("the head links the favicon, the PNG fallbacks, and the manifest, and each file exists", async () => {
		const document = await parse();
		const href = (selector: string) => document.head.querySelector(selector)?.getAttribute("href");
		expect(href('link[rel="icon"][type="image/svg+xml"]')).toBe("/favicon.svg");
		expect(href('link[rel="icon"][type="image/png"][sizes="32x32"]')).toBe("/favicon-32.png");
		expect(href('link[rel="apple-touch-icon"][sizes="180x180"]')).toBe("/apple-touch-icon.png");
		expect(href('link[rel="manifest"]')).toBe("/site.webmanifest");
		expect(document.head.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe("#0A0A0A");
		for (const name of ["favicon.svg", "favicon-32.png", "apple-touch-icon.png", "site.webmanifest"]) {
			expect(await Bun.file(join(import.meta.dir, "public", name)).exists()).toBe(true);
		}
		const png = (name: string) => Bun.file(join(import.meta.dir, "public", name)).bytes();
		const width = (bytes: Uint8Array) => new DataView(bytes.buffer).getUint32(16);
		expect(width(await png("favicon-32.png"))).toBe(32);
		expect(width(await png("apple-touch-icon.png"))).toBe(180);
		const manifest = await Bun.file(join(import.meta.dir, "public", "site.webmanifest")).json();
		expect(manifest.name).toBe("trellis");
		expect(manifest.theme_color).toBe("#0A0A0A");
		expect(manifest.background_color).toBe("#0A0A0A");
		const svg = await Bun.file(join(import.meta.dir, "public", "favicon.svg")).text();
		expect(svg).toContain('viewBox="0 0 32 32"');
		expect(svg).toContain('rx="7"');
	});

	// WS-09
	test("index.html mounts src/main.tsx into #root", async () => {
		const document = await parse();
		expect(document.title).toBe("trellis");
		expect(document.body.querySelectorAll("#root")).toHaveLength(1);
		const modules = [...document.body.querySelectorAll('script[type="module"]')];
		expect(modules).toHaveLength(1);
		expect(modules[0]!.getAttribute("src")).toBe("/src/main.tsx");
	});
});
