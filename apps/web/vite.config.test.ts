import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { PluginOption } from "vite";
import config, {
	chunkGroups,
	createConfig,
	phosphorSpecialWeights,
	routerPluginOptions,
	stripPhosphorWeights,
} from "./vite.config";

type Named = { name: string };

// Vite accepts nested arrays of plugins. The router and the tailwind
// plugins each return an array, so the list is flattened before a lookup.
const pluginNames = (plugins: PluginOption[] | undefined): string[] =>
	(plugins ?? []).flatMap((plugin) => {
		if (Array.isArray(plugin)) return pluginNames(plugin as PluginOption[]);
		if (plugin && typeof plugin === "object" && "name" in plugin) return [(plugin as Named).name];
		return [];
	});

type Proxy = Record<string, { target: string; changeOrigin?: boolean }>;

const proxyOf = (value: { server?: { proxy?: unknown } }) => value.server!.proxy as Proxy;

describe("vite.config", () => {
	// WS-10. The dev server proxies the API so the page and the server share
	// one origin. Test files sit beside the routes, so the router plugin
	// must skip them or each becomes a route.
	test("vite proxies /api and /rpc to 4521 by default and enables auto code splitting", () => {
		expect(process.env.TRELLIS_API_URL).toBeUndefined();
		for (const value of [config, createConfig({})]) {
			const proxy = proxyOf(value);
			expect(proxy["/api"]!.target).toBe("http://127.0.0.1:4521");
			expect(proxy["/rpc"]!.target).toBe("http://127.0.0.1:4521");
			expect(proxy["/api"]!.changeOrigin).toBe(false);
			expect(proxy["/rpc"]!.changeOrigin).toBe(false);
			const names = pluginNames(value.plugins);
			expect(names.some((name) => name.startsWith("tanstack-router"))).toBe(true);
			expect(names.some((name) => name.startsWith("@tailwindcss/vite"))).toBe(true);
			expect(names).toContain("trellis-font-preloads");
		}
		expect(routerPluginOptions.autoCodeSplitting).toBe(true);
		const ignore = new RegExp(routerPluginOptions.routeFileIgnorePattern);
		expect(ignore.test("route.test.tsx")).toBe(true);
		expect(ignore.test("__root.test.tsx")).toBe(true);
		expect(ignore.test("route.tsx")).toBe(false);
		expect(ignore.test("setup.tsx")).toBe(false);
	});

	// WS-11. A server on another port sets this variable.
	test("TRELLIS_API_URL overrides both proxy targets", () => {
		const proxy = proxyOf(createConfig({ TRELLIS_API_URL: "http://127.0.0.1:4599" }));
		expect(proxy["/api"]!.target).toBe("http://127.0.0.1:4599");
		expect(proxy["/rpc"]!.target).toBe("http://127.0.0.1:4599");
	});

	test("the production bundle uses terser and entry-aware chunk groups", () => {
		const production = createConfig({});
		const build = production.build;
		expect(build?.minify).toBe("terser");
		expect(production.resolve?.dedupe).toContain("marked");
		expect(chunkGroups).toEqual([
			{
				name: "initial",
				test: expect.any(Function),
				tags: ["$initial"],
			},
			{
				name: "app",
				test: expect.any(Function),
				entriesAware: true,
				entriesAwareMergeThreshold: 32 * 1024,
			},
		]);
		const output = Array.isArray(build?.rollupOptions?.output)
			? build.rollupOptions.output[0]
			: build?.rollupOptions?.output;
		expect(output?.codeSplitting).toEqual({ groups: chunkGroups });
	});

	test("the production bundle keeps only icon weights that the app uses", () => {
		const source = `const weights = new Map([
  [
    "bold",
    bold
  ],
  [
    "light",
    light
  ],
  [
    "regular",
    regular
  ],
  [
    "thin",
    thin
  ]
]);`;
		const check = stripPhosphorWeights(source, "/node_modules/@phosphor-icons/react/dist/defs/Check.es.js");
		expect(check).toContain('"bold"');
		expect(check).toContain('"regular"');
		expect(check).not.toContain('"light"');
		expect(check).not.toContain('"thin"');
		expect(stripPhosphorWeights(source, "/src/Check.tsx")).toBe(source);
	});

	test("the production bundle keeps every non-regular icon weight used by the web and UI source", async () => {
		const roots = [join(import.meta.dir, "src"), join(import.meta.dir, "../../packages/ui/src")];
		const used = new Map<string, Set<string>>();
		for (const root of roots) {
			for await (const path of new Bun.Glob("**/*.tsx").scan({ cwd: root, absolute: true })) {
				const source = await Bun.file(path).text();
				const imported = new Set(
					[...source.matchAll(/import\s*{([^}]+)}\s*from\s*["']@phosphor-icons\/react["']/g)].flatMap((match) =>
						match[1]!.split(",").map((name) => name.trim().split(/\s+as\s+/).at(-1)!),
					),
				);
				for (const match of source.matchAll(/<([A-Z]\w*)\b[^>]*\bweight="(bold|duotone|fill|light|thin)"/g)) {
					if (!imported.has(match[1]!)) continue;
					const weights = used.get(match[1]!) ?? new Set<string>();
					weights.add(match[2]!);
					used.set(match[1]!, weights);
				}
			}
		}
		for (const [icon, weights] of used) {
			for (const weight of weights) expect(phosphorSpecialWeights[icon]).toContain(weight);
		}
		expect(phosphorSpecialWeights.LockSimple).toContain("fill");
	});
});
