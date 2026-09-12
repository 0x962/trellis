import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { originDir } from "../../../../../test/originDir.ts";
import { budgets, measure } from "../../../scripts/size-budget";

const web = join(originDir(import.meta.dir), "..");

// The build under test writes to its own directory. The size-budget turbo
// task reads `dist` while this file runs, and a shared directory would hand
// it a half-written build.
const dist = join(process.env.TRELLIS_HOME!, "size-budget-build");

const run = (args: string[], cwd = web) => {
	const result = Bun.spawnSync(["bun", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
	return { exitCode: result.exitCode, output: result.stdout.toString() + result.stderr.toString() };
};

// One string per route that only that route's module carries. The root
// chunk must hold none of them, and some lazy chunk must hold each.
const routeMarkers = ["Enter your name", "Pair a phone", "No personas yet"];

// The Needs you page carries no words of its own: it draws the page title
// that the sidebar also carries, over an empty body. The pair of strings
// names its module, and no other lazy chunk holds both.
const needsYouMarkers = ["Needs you", "min-h-0 flex-1"];

// The bulk bar's copy action is text only the table module carries. The
// editor mounts on focus, so its code is a lazy chunk; ProseMirror's class
// names are the marker every Tiptap build carries.
const tableMarker = "Copy IDs";
const editorMarker = "ProseMirror";

// The entry chunk and every chunk index.html preloads, joined, and the rest.
const splitChunks = async () => {
	const document = parse(await Bun.file(join(dist, "index.html")).text());
	const entry = document.querySelector('script[type="module"][src]')!.getAttribute("src")!.split("/").pop()!;
	const preloads = [...document.querySelectorAll('link[rel="modulepreload"][href]')].map(
		(link) => link.getAttribute("href")!.split("/").pop()!,
	);
	const initial = [entry, ...preloads];
	const chunks = assetFiles().filter((name) => name.endsWith(".js"));
	return {
		initial: (await Promise.all(initial.map(readAsset))).join("\n"),
		lazy: await Promise.all(chunks.filter((name) => !initial.includes(name)).map(readAsset)),
	};
};

// The editor placeholder: a string only the ticket surfaces carry.
const ticketMarker = "Describe the work. Agents read this verbatim.";

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

// The chunk names index.html loads before any route: the entry and its
// module preloads.
const initialChunks = (document: Document) => {
	const entry = document.querySelector('script[type="module"][src]')!.getAttribute("src")!.split("/").pop()!;
	const preloads = [...document.querySelectorAll('link[rel="modulepreload"][href]')].map(
		(link) => link.getAttribute("href")!.split("/").pop()!,
	);
	return [entry, ...preloads];
};

const assetFiles = () => readdirSync(join(dist, "assets"));

const readAsset = (name: string) => Bun.file(join(dist, "assets", name)).text();

// One build serves every describe in this file.
let built: ReturnType<typeof run> | undefined;
const buildOnce = () => {
	built ??= run(["run", "build", "--outDir", dist, "--emptyOutDir"]);
	return built;
};

// The entry chunk and every chunk index.html preloads, as source text.
const initialSource = async () => {
	const document = parse(await Bun.file(join(dist, "index.html")).text());
	const entry = document.querySelector('script[type="module"][src]')!.getAttribute("src")!.split("/").pop()!;
	const preloads = [...document.querySelectorAll('link[rel="modulepreload"][href]')].map(
		(link) => link.getAttribute("href")!.split("/").pop()!,
	);
	const names = [entry, ...preloads];
	return { names, source: (await Promise.all(names.map(readAsset))).join("\n") };
};

// The lazy chunks that hold every one of `markers`. Together the markers
// name the module of one route.
const chunksWith = async (markers: string[], exclude: string[]) => {
	const names = assetFiles().filter((name) => name.endsWith(".js") && !exclude.includes(name));
	const found: string[] = [];
	for (const name of names) {
		const source = await readAsset(name);
		if (markers.every((marker) => source.includes(marker))) found.push(name);
	}
	return found;
};

// The lazy chunk that holds `marker`, which is text only one route carries.
const chunkWith = async (marker: string, exclude: string[]) => await chunksWith([marker], exclude);

describe("bun run build", () => {
	let build: ReturnType<typeof run>;
	beforeAll(() => {
		build = buildOnce();
	}, 180_000);

	// WS-13. Every route is a separate chunk: the initial JS carries the
	// shell only, and a route's code arrives when the route opens.
	test("bun run build exits 0 and splits every route into its own chunk", async () => {
		if (build.exitCode !== 0) console.log(build.output);
		expect(build.exitCode).toBe(0);
		expect(existsSync(join(dist, "index.html"))).toBe(true);
		const document = parse(await Bun.file(join(dist, "index.html")).text());
		const inline = document.head.querySelector("script:not([type]):not([src])");
		expect(inline).not.toBeNull();
		expect(inline!.textContent).toContain("trellis-theme");
		const preloads = [...document.head.querySelectorAll('link[rel="preload"][as="font"]')].map(
			(link) => link.getAttribute("href") ?? "",
		);
		expect(preloads).toHaveLength(2);
		expect(preloads.some((href) => /inter-latin-wght-normal/.test(href))).toBe(true);
		expect(preloads.some((href) => /jetbrains-mono-latin-400/.test(href))).toBe(true);
		// Each preload names a file the build wrote, so the server sends the
		// font and not the page.
		for (const href of preloads) expect(assetFiles()).toContain(href.replace(/^\/assets\//, ""));
		const entry = document.querySelector('script[type="module"][src]')!.getAttribute("src")!;
		const entryName = entry.split("/").pop()!;
		const chunks = assetFiles().filter((name) => name.endsWith(".js"));
		expect(chunks.length).toBeGreaterThanOrEqual(9);
		const entrySource = await readAsset(entryName);
		const modulePreloads = [...document.querySelectorAll('link[rel="modulepreload"][href]')].map(
			(link) => link.getAttribute("href")!.split("/").pop()!,
		);
		const initial = [entrySource, ...(await Promise.all(modulePreloads.map(readAsset)))].join("\n");
		const lazy = await Promise.all(
			chunks.filter((name) => name !== entryName && !modulePreloads.includes(name)).map(readAsset),
		);
		for (const marker of routeMarkers) {
			expect(initial, marker).not.toContain(marker);
			expect(
				lazy.some((source) => source.includes(marker)),
				marker,
			).toBe(true);
		}
	});

	// WS-14. The plan's budget table: initial JS 220 KB gz, fonts 160 KB,
	// total 900 KB. The script prints one line per budget and the total.
	test("the size budget passes on the built shell and reports every budget line", () => {
		expect(build.exitCode).toBe(0);
		const result = run(["run", "size-budget", dist]);
		if (result.exitCode !== 0) console.log(result.output);
		expect(result.exitCode).toBe(0);
		expect(result.output).toMatch(/initial js.*\d+(\.\d+)? kb/i);
		expect(result.output).toMatch(/fonts.*\d+(\.\d+)? kb/i);
		expect(result.output).toMatch(/total.*\d+(\.\d+)? kb/i);
		expect(budgets.initialJs).toBe(220 * 1024);
		expect(budgets.fonts).toBe(160 * 1024);
		expect(budgets.total).toBe(900 * 1024);
	});

	// Outcome 113. Runs on the build above.
	test("keeps the table routes inside the initial JS budget with the editor in a lazy chunk", async () => {
		expect(build.exitCode).toBe(0);
		const report = measure(dist);
		expect(report.initialJs).toBeLessThanOrEqual(budgets.initialJs);
		const { initial, lazy } = await splitChunks();
		expect(initial).not.toContain(editorMarker);
		expect(lazy.some((source) => source.includes(editorMarker))).toBe(true);
		expect(initial).not.toContain(tableMarker);
		expect(lazy.some((source) => source.includes(tableMarker))).toBe(true);
		const editorChunk = lazy.find((source) => source.includes(editorMarker))!;
		expect(editorChunk).not.toContain(tableMarker);
	});

	// WT-112. The ticket surfaces are built and lazy: some lazy chunk
	// carries the editor placeholder, no initial chunk carries it or the
	// editor, and the initial JS stays inside the budget.
	test("the initial chunk excludes Tiptap and stays in budget", async () => {
		expect(build.exitCode).toBe(0);
		const document = parse(await Bun.file(join(dist, "index.html")).text());
		const initial = initialChunks(document);
		for (const name of initial) {
			const source = await readAsset(name);
			expect(source, name).not.toContain(editorMarker);
			expect(source, name).not.toContain(ticketMarker);
		}
		const lazy = assetFiles().filter((name) => name.endsWith(".js") && !initial.includes(name));
		const sources = await Promise.all(lazy.map(readAsset));
		expect(sources.some((source) => source.includes(ticketMarker))).toBe(true);
		const report = measure(dist);
		expect(report.initialJs).toBeLessThanOrEqual(budgets.initialJs);
		expect(report.lines.some((line) => /^ok\s+initial js/.test(line))).toBe(true);
	});

	// WT-113. The plan's budget table: Tiptap 200 KB gzipped, lazy. The
	// script measures the lazy chunks that carry the editor and prints a
	// line for them.
	test("the Tiptap chunk stays in budget", async () => {
		expect(build.exitCode).toBe(0);
		const document = parse(await Bun.file(join(dist, "index.html")).text());
		const initial = initialChunks(document);
		const lazy = assetFiles().filter((name) => name.endsWith(".js") && !initial.includes(name));
		const editorChunks: string[] = [];
		for (const name of lazy) if ((await readAsset(name)).includes(editorMarker)) editorChunks.push(name);
		expect(editorChunks.length).toBeGreaterThan(0);
		expect(budgets.tiptap).toBe(200 * 1024);
		const report = measure(dist);
		expect(report.tiptap).toBeGreaterThan(0);
		expect(report.tiptap).toBeLessThanOrEqual(budgets.tiptap);
		expect(report.lines.some((line) => /tiptap.*\d+(\.\d+)? kb/i.test(line))).toBe(true);
	});
});

// A dist whose entry chunk is 230 KB of random bytes. Random bytes do not
// compress, so the gzip size is about 230 KB, over the 220 KB budget.
const fixtureDist = () => {
	const dir = join(process.env.TRELLIS_HOME!, "size-budget-fixture");
	mkdirSync(join(dir, "assets"), { recursive: true });
	const bytes = new Uint8Array(230 * 1024);
	crypto.getRandomValues(bytes);
	writeFileSync(join(dir, "assets", "index-abc123.js"), bytes);
	writeFileSync(
		join(dir, "index.html"),
		'<!doctype html><html><head><script type="module" src="/assets/index-abc123.js"></script></head><body><div id="root"></div></body></html>',
	);
	return dir;
};

describe("size-budget measure", () => {
	// WS-15
	test("the size budget fails with exit 1 when initial JS exceeds 220 KB gz", () => {
		const dir = fixtureDist();
		const report = measure(dir);
		expect(report.initialJs).toBeGreaterThan(budgets.initialJs);
		expect(report.ok).toBe(false);
		const result = run(["scripts/size-budget.ts", dir]);
		expect(result.exitCode).toBe(1);
		expect(result.output).toMatch(/initial js/i);
	});
});

describe("size-budget", () => {
	beforeAll(buildOnce, 180_000);

	// BUILD-01. Needs you and Settings each arrive as their own chunk, so
	// neither one weighs on the first paint.
	test("needs-you and settings stay inside the initial JS budget", async () => {
		expect(buildOnce().exitCode).toBe(0);
		const initial = await initialSource();
		expect(initial.source).not.toContain("Pair a phone");
		const needsYou = await chunksWith(needsYouMarkers, initial.names);
		const settings = await chunkWith("Pair a phone", initial.names);
		expect(needsYou).toHaveLength(1);
		expect(settings).toHaveLength(1);
		expect(needsYou[0]).not.toBe(settings[0]);
		const report = measure(dist);
		expect(report.initialJs).toBeLessThanOrEqual(budgets.initialJs);
	});
});
