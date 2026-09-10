import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { packageRoot } from "../../test/css";
import config from "../../vite.config";

type Plugin = { name: string } | Plugin[];

const pluginNames = (plugins: Plugin[]): string[] =>
	plugins.flatMap((plugin) => (Array.isArray(plugin) ? pluginNames(plugin) : [plugin.name]));

describe("gallery", () => {
	test("the gallery dev server is pinned to port 5180", () => {
		const resolved = config as { server: { port: number; strictPort: boolean }; plugins: Plugin[] };
		expect(resolved.server.port).toBe(5180);
		expect(resolved.server.strictPort).toBe(true);
		const names = pluginNames(resolved.plugins);
		expect(names.some((name) => name.startsWith("@tailwindcss/vite"))).toBe(true);
		expect(names.some((name) => name.startsWith("vite:react"))).toBe(true);
	});

	test("vite build succeeds and the output carries the tokens", async () => {
		const result = Bun.spawnSync(["bun", "run", "gallery:build"], { cwd: packageRoot, stdout: "pipe", stderr: "pipe" });
		expect(`${result.exitCode}\n${result.stderr.toString()}`).toStartWith("0");
		const dist = join(packageRoot, "gallery", "dist");
		expect(existsSync(join(dist, "index.html"))).toBe(true);
		const html = await Bun.file(join(dist, "index.html")).text();
		const links = Array.from(html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g), (match) => match[1]!);
		expect(links).toHaveLength(1);
		const css = await Bun.file(join(dist, links[0]!)).text();
		expect(css).toMatch(/--bg:\s*#ffffff/i);
		expect(css).toContain("--color-bg");
		expect(css).toContain("jetbrains-mono-latin-400-normal");
		expect(css).toContain("jetbrains-mono-latin-600-normal");
		expect(css).not.toContain("jetbrains-mono-cyrillic");
		expect(css).not.toContain("jetbrains-mono-latin-ext");
	}, 120_000);
});
