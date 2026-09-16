import { describe, expect, test } from "bun:test";
import type { PluginOption } from "vite";
import config, { assetChunk, createConfig, routerPluginOptions } from "./vite.config";

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

	test("the production bundle uses terser and keeps the shell modules together", () => {
		expect(createConfig({}).build?.minify).toBe("terser");
		expect(assetChunk("/repo/packages/ui/src/primitives/Button/Button.tsx")).toBe("ui-core");
		expect(assetChunk("/repo/node_modules/react/index.js")).toBeUndefined();
	});
});
