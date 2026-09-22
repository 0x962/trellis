import { expect, test } from "bun:test";
import { createConfig } from "../../vite.config";

type ProxyConfig = {
	bypass?: (request: { headers: { origin?: string } }, response: unknown, options: unknown) => void;
	changeOrigin?: boolean;
	ws?: boolean;
};

const forwardedOrigin = (proxyConfig: ProxyConfig) => {
	const request = { headers: { origin: "http://127.0.0.1:5173" } };
	proxyConfig.bypass!(request, undefined, proxyConfig);
	return request.headers.origin;
};

test("the dev proxy sends the host origin to the host", () => {
	const config = createConfig({ TRELLIS_API_URL: "http://127.0.0.1:4521" });
	const proxy = config.server!.proxy as Record<string, ProxyConfig>;

	expect(forwardedOrigin(proxy["/rpc"]!)).toBe("http://127.0.0.1:4521");
	expect(forwardedOrigin(proxy["/api"]!)).toBe("http://127.0.0.1:4521");
	expect(proxy["/rpc"]!.changeOrigin).toBe(true);
	expect(proxy["/api"]!.changeOrigin).toBe(true);
	expect(proxy["/api"]!.ws).toBe(true);
});
