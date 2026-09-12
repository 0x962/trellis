import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type UserConfig } from "vite";
import { fontPreloads } from "./scripts/fontPreloads";

// Route files live beside their tests. The pattern keeps a `*.test.tsx`
// out of the route tree, and every route becomes its own chunk.
export const routerPluginOptions = {
	target: "react",
	autoCodeSplitting: true,
	routeFileIgnorePattern: "\\.test\\.|^components$",
} as const;

// The @trellis/ui modules the shell loads before the first route.
const shellUi = /packages\/ui\/src\/(utils\/cx|primitives\/(Button|IconButton|Kbd))\//;

// The API the dev server proxies to. The server listens on 4521.
const defaultApiUrl = "http://127.0.0.1:4521";

// The page and the API share one origin through the proxy, so the actor
// header and the event stream need no CORS.
export const createConfig = (env: Record<string, string | undefined>): UserConfig => {
	const target = env.TRELLIS_API_URL ?? defaultApiUrl;
	return {
		plugins: [tanstackRouter(routerPluginOptions), react(), tailwindcss(), fontPreloads()],
		build: {
			rollupOptions: {
				output: {
					// The shell draws a Button with a key cap and an IconButton
					// before the first route opens, so these four modules always
					// load together. Rollup would give each one its own chunk,
					// because each is reachable from a different set of routes,
					// and a chunk of a few hundred bytes costs more in its own
					// gzip header and its own request than the code in it.
					manualChunks: (id: string) => (shellUi.test(id) ? "ui-core" : undefined),
				},
			},
		},
		resolve: {
			// cmdk pulls a whole second overlay library for a dialog this app
			// never renders. See src/lib/emptyRadixDialog.ts.
			alias: { "@radix-ui/react-dialog": fileURLToPath(new URL("./src/lib/emptyRadixDialog.ts", import.meta.url)) },
		},
		server: {
			// One address for the browser, the proxy, and Playwright.
			host: "127.0.0.1",
			port: 5173,
			strictPort: true,
			proxy: {
				"/api": { target, changeOrigin: false },
				"/rpc": { target, changeOrigin: false },
			},
		},
	};
};

export default defineConfig(createConfig(process.env));
