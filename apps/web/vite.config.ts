import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type UserConfig } from "vite";
import { fontPreloads } from "./scripts/fontPreloads";

// Each route becomes its own chunk. Component folders do not define routes.
export const routerPluginOptions = {
	target: "react",
	autoCodeSplitting: true,
	routeFileIgnorePattern: "^components$",
} as const;

// Every icon that a `weight` prop asks for in a weight other than regular.
// The build keeps the regular weight of every icon and drops the rest, and an
// icon asked for a weight it does not carry draws nothing. Add the icon here
// when you write `weight="bold"` or `weight="fill"` on it.
export const phosphorSpecialWeights: Record<string, readonly string[]> = {
	CaretDown: ["bold"],
	ChatCircle: ["fill"],
	Check: ["bold"],
	CheckCircle: ["fill"],
	CircleDashed: ["duotone"],
	CircleNotch: ["bold"],
	ClockCounterClockwise: ["fill"],
	DotsSixVertical: ["bold"],
	ExclamationMark: ["bold"],
	LockSimple: ["fill"],
	Minus: ["bold"],
	Play: ["fill"],
	Robot: ["bold"],
	Star: ["fill"],
	Stop: ["fill"],
	WarningCircle: ["fill"],
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

// The API the dev server proxies to. The server listens on 4521.
const defaultApiUrl = "http://127.0.0.1:4521";

// The page and the API share one origin through the proxy, so the actor
// header and the event stream need no CORS.
export const createConfig = (env: Record<string, string | undefined>): UserConfig => {
	const target = env.TRELLIS_API_URL ?? defaultApiUrl;
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
				"/api": { target, changeOrigin: false, ws: true },
				"/rpc": { target, changeOrigin: false },
			},
		},
	};
};

export default defineConfig(createConfig(process.env));
