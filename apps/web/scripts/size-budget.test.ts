import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { budgets, measure } from "./size-budget";

const web = join(import.meta.dir, "..");

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
const routeMarkers = ["What should we call you?", "Settings saved", "Nothing needs you"];

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

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

// The lazy chunk that holds `marker`, which is text only one route carries.
const chunkWith = async (marker: string, exclude: string[]) => {
	const names = assetFiles().filter((name) => name.endsWith(".js") && !exclude.includes(name));
	const found: string[] = [];
	for (const name of names) if ((await readAsset(name)).includes(marker)) found.push(name);
	return found;
};

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
		expect(preloads).toHaveLength(3);
		expect(preloads.some((href) => /inter-latin-wght-normal/.test(href))).toBe(true);
		expect(preloads.some((href) => /jetbrains-mono-latin-400/.test(href))).toBe(true);
		expect(preloads.some((href) => /jetbrains-mono-latin-500/.test(href))).toBe(true);
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
		expect(initial.source).not.toContain("Done by agents today");
		expect(initial.source).not.toContain("Settings saved");
		const needsYou = await chunkWith("Done by agents today", initial.names);
		const settings = await chunkWith("Settings saved", initial.names);
		expect(needsYou).toHaveLength(1);
		expect(settings).toHaveLength(1);
		expect(needsYou[0]).not.toBe(settings[0]);
		const report = measure(dist);
		expect(report.initialJs).toBeLessThanOrEqual(budgets.initialJs);
	});
});
