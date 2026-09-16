import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

// The plan's budget table, in bytes. Initial JS is the entry chunk plus
// every chunk index.html preloads: what runs before the first route opens.
export const budgets = {
	initialJs: 240 * 1024,
	tiptap: 200 * 1024,
	fonts: 160 * 1024,
	// The total includes every lazy syntax grammar available on the review page.
	total: 3600 * 1024,
};

export type Report = {
	initialJs: number;
	tiptap: number;
	fonts: number;
	total: number;
	ok: boolean;
	// One line per budget, as the script prints them.
	lines: string[];
};

const kb = (bytes: number) => (bytes / 1024).toFixed(1);

const gzipSize = (file: string) => gzipSync(readFileSync(file)).length;

// A woff2 file is already compressed, so it counts at its stored size.
const size = (file: string) => (file.endsWith(".woff2") ? statSync(file).size : gzipSize(file));

const line = (name: string, bytes: number, budget: number) =>
	`${bytes <= budget ? "ok  " : "FAIL"} ${name} ${kb(bytes)} KB (budget ${kb(budget)} KB)`;

// Measures a Vite `dist` directory against the budgets.
export const measure = (dist: string): Report => {
	const html = readFileSync(join(dist, "index.html"), "utf8");
	const entry = /<script[^>]*type="module"[^>]*src="([^"]+)"/.exec(html)![1]!;
	const preloads = [...html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)].map((match) => match[1]!);
	const asset = (url: string) => join(dist, url.replace(/^\//, ""));
	const initialJs = [entry, ...preloads].reduce((sum, url) => sum + gzipSize(asset(url)), 0);
	const assets = readdirSync(join(dist, "assets")).map((name) => join(dist, "assets", name));
	const tiptap = assets
		.filter((file) => file.endsWith(".js") && readFileSync(file).includes("ProseMirror"))
		.reduce((sum, file) => sum + gzipSize(file), 0);
	const fonts = assets.filter((file) => file.endsWith(".woff2")).reduce((sum, file) => sum + size(file), 0);
	const total = assets.reduce((sum, file) => sum + size(file), 0) + gzipSize(join(dist, "index.html"));
	const lines = [
		line("initial js (gzip)", initialJs, budgets.initialJs),
		line("tiptap (gzip)", tiptap, budgets.tiptap),
		line("fonts", fonts, budgets.fonts),
		line("total", total, budgets.total),
	];
	const ok =
		initialJs <= budgets.initialJs && tiptap <= budgets.tiptap && fonts <= budgets.fonts && total <= budgets.total;
	return { initialJs, tiptap, fonts, total, ok, lines };
};

if (import.meta.main) {
	const report = measure(process.argv[2] ?? join(import.meta.dir, "..", "dist"));
	console.log(report.lines.join("\n"));
	process.exit(report.ok ? 0 : 1);
}
