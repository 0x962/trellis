import { describe, expect, test } from "bun:test";
import config from "./playwright.config";

type WebServer = { command: string; url?: string; port?: number; env?: Record<string, string> };

const servers = (): WebServer[] => {
	const value = config.webServer as WebServer | WebServer[] | undefined;
	if (value === undefined) return [];
	return Array.isArray(value) ? value : [value];
};

describe("playwright.config", () => {
	// WS-141. The e2e suite runs the web app over the fake server: one
	// process serves the API on 4522, and vite proxies /api and /rpc to it.
	// Every spec starts with an empty localStorage, so the first-run flow
	// is what a spec sees first.
	test("the Playwright config starts the fake server and points the proxy at it", () => {
		const list = servers();
		const fake = list.find((server) => server.command.includes("dev:fake"));
		expect(fake).toBeDefined();
		expect(fake!.url ?? String(fake!.port)).toContain("4522");
		const vite = list.find((server) => server !== fake);
		expect(vite).toBeDefined();
		expect(vite!.env?.TRELLIS_API_URL).toBe("http://127.0.0.1:4522");
		expect(config.use?.storageState).toBeUndefined();
		const testMatch = config.testMatch as RegExp | string;
		const matches = (file: string) =>
			testMatch instanceof RegExp ? testMatch.test(file) : new Bun.Glob(testMatch).match(file);
		expect(matches("onboarding.spec.ts")).toBe(true);
		expect(matches("config.test.ts")).toBe(false);
	});
});
