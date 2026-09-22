import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type ProxyOptions, type UserConfig } from "vite";
import { fontPreloads } from "./scripts/fontPreloads";

// Each route becomes its own chunk. Component folders do not define routes.
export const routerPluginOptions = {
	target: "react",
	autoCodeSplitting: true,
	routeFileIgnorePattern: "^components$",
} as const;

export const phosphorSpecialWeights: Record<string, readonly string[]> = {
	CaretDown: ["bold"],
	Check: ["bold"],
	CheckCircle: ["fill"],
	CircleDashed: ["duotone"],
	CircleNotch: ["bold"],
	ExclamationMark: ["bold"],
	LockSimple: ["fill"],
	Minus: ["bold"],
	Play: ["fill"],
	Robot: ["bold"],
	Star: ["fill"],
	Stop: ["fill"],
	XCircle: ["fill"],
};

const phosphorWeightBlock = /\n {2}\[\n {4}"(bold|duotone|fill|light|regular|thin)",[\s\S]*?\n {2}\],?/g;
const phosphorDefinition = /\/@phosphor-icons\/react\/dist\/defs\/([^/]+)\.es\.js(?:\?|$)/;

export const stripPhosphorWeights = (code: string, id: string) => {
	const icon = phosphorDefinition.exec(id)?.[1];
	if (icon === undefined) return code;
	const retained = new Set(["regular", ...(phosphorSpecialWeights[icon] ?? [])]);
	return code.replace(phosphorWeightBlock, (block, weight: string) => (retained.has(weight) ? block : ""));
};

const phosphorWeights = (): Plugin => ({
	name: "phosphor-weights",
	enforce: "pre",
	transform(code, id) {
		const transformed = stripPhosphorWeights(code, id);
		return transformed === code ? null : transformed;
	},
});

const defaultApiUrl = "http://127.0.0.1:4597";
const liveOverride = "TRELLIS_ALLOW_LIVE_DEV_API";

type LiveLock = { port?: unknown };

const portOf = (value: string) => {
	const url = new URL(value);
	if (url.port !== "") return Number(url.port);
	if (url.protocol === "https:") return 443;
	if (url.protocol === "http:") return 80;
	throw new Error(`TRELLIS_DEV_API must be an HTTP URL. Received ${value}.`);
};

export const readLivePort = (home = join(homedir(), ".trellis")) => {
	const lock = join(home, "trellis.lock");
	if (!existsSync(lock)) return null;
	const parsed = JSON.parse(readFileSync(lock, "utf8")) as LiveLock;
	return typeof parsed.port === "number" ? parsed.port : null;
};

export const resolveApiTarget = (
	env: Record<string, string | undefined>,
	livePort: () => number | null = readLivePort,
) => {
	const target = env.TRELLIS_DEV_API ?? defaultApiUrl;
	const live = livePort();
	if (live !== null && portOf(target) === live && env[liveOverride] !== "1") {
		throw new Error(
			`TRELLIS_DEV_API points at the live Trellis host on port ${live}. Start a scratch server and set TRELLIS_DEV_API to it, or set ${liveOverride}=1 to use live data.`,
		);
	}
	return target;
};

// The page and the API share one origin through the proxy, so the actor
// header and the event stream need no CORS.
const proxyTarget = (target: string, websocket = false): ProxyOptions => ({
	target,
	changeOrigin: false,
	...(websocket ? { ws: true } : {}),
});

export const createConfig = (env: Record<string, string | undefined>): UserConfig => {
	const target = resolveApiTarget(env);
	return {
		plugins: [tanstackRouter(routerPluginOptions), react(), tailwindcss(), fontPreloads(), phosphorWeights()],
		build: {
			minify: "terser",
			terserOptions: {
				compress: { passes: 2 },
				format: { comments: false },
			},
		},
		resolve: {
			dedupe: ["marked"],
			// cmdk pulls a whole second overlay library for a dialog this app
			// never renders. See src/lib/emptyRadixDialog.ts.
			alias: { "@radix-ui/react-dialog": fileURLToPath(new URL("./src/lib/emptyRadixDialog.ts", import.meta.url)) },
		},
		server: {
			// One address for the browser and the proxy.
			host: "127.0.0.1",
			port: 5173,
			strictPort: true,
			proxy: {
				"/api": proxyTarget(target, true),
				"/rpc": proxyTarget(target),
			},
		},
	};
};

export default defineConfig(createConfig(process.env));
