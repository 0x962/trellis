import { expect, test } from "bun:test";
import { createConfig, resolveApiTarget } from "../../vite.config";

type ProxyConfig = {
	changeOrigin?: boolean;
	target?: string;
	ws?: boolean;
};

test("the dev proxy targets a scratch server by default", () => {
	const config = createConfig({});
	const proxy = config.server!.proxy as Record<string, ProxyConfig>;

	expect(proxy["/rpc"]!.target).toBe("http://127.0.0.1:4597");
	expect(proxy["/api"]!.target).toBe("http://127.0.0.1:4597");
	expect(proxy["/rpc"]!.changeOrigin).toBe(false);
	expect(proxy["/api"]!.changeOrigin).toBe(false);
	expect(proxy["/api"]!.ws).toBe(true);
});

test("TRELLIS_DEV_API selects the dev proxy target", () => {
	expect(resolveApiTarget({ TRELLIS_DEV_API: "http://127.0.0.1:5678" }, () => 4521)).toBe("http://127.0.0.1:5678");
});

test("the dev proxy refuses the live host port without an override", () => {
	expect(() => resolveApiTarget({ TRELLIS_DEV_API: "http://127.0.0.1:4521" }, () => 4521)).toThrow(
		"TRELLIS_DEV_API points at the live Trellis host on port 4521.",
	);
});

test("an explicit override allows the live host port", () => {
	expect(
		resolveApiTarget({ TRELLIS_DEV_API: "http://127.0.0.1:4521", TRELLIS_ALLOW_LIVE_DEV_API: "1" }, () => 4521),
	).toBe("http://127.0.0.1:4521");
});
