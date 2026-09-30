import type { ClientRequest, IncomingMessage } from "node:http";
import type { InlineConfig, Plugin, ProxyOptions, UserConfig } from "vite";

export function previewConfig(base: UserConfig, hostOrigin: string, port: number): InlineConfig {
	const origin = `http://127.0.0.1:${port}`;
	const proxyRequest = (request: ClientRequest, source: IncomingMessage) => {
		if (source.headers.origin === origin) request.setHeader("Origin", hostOrigin);
	};
	const proxy: ProxyOptions = {
		target: hostOrigin,
		changeOrigin: true,
		ws: true,
		configure: (server) => {
			server.on("proxyReq", proxyRequest);
			server.on("proxyReqWs", proxyRequest);
		},
	};
	const identity: Plugin = {
		name: "trellis-desktop-preview",
		apply: "serve",
		configureServer(server) {
			server.middlewares.use((request, response, next) => {
				if (request.url !== "/.trellis-preview") return next();
				response.setHeader("Content-Type", "application/json");
				response.setHeader("Cache-Control", "no-store");
				response.end(JSON.stringify({ hostOrigin }));
			});
		},
	};
	return {
		...base,
		configFile: false,
		plugins: [...(base.plugins ?? []), identity],
		server: {
			...base.server,
			host: "127.0.0.1",
			port,
			strictPort: true,
			proxy: { "^/(api|rpc)(/|$)": proxy },
		},
	};
}
