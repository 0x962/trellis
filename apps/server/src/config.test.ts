import { expect, test } from "bun:test";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { loadConfig } from "./config.ts";

test("keeps the default installation home stable across data homes", () => {
	const first = loadConfig({ TRELLIS_HOME: "/tmp/trellis-data-a" });
	const second = loadConfig({ TRELLIS_HOME: "/tmp/trellis-data-b" });

	expect(first.installationHome).toBe(resolve(homedir(), ".config/trellis"));
	expect(second.installationHome).toBe(first.installationHome);
});

test("reads an explicit installation home", () => {
	expect(loadConfig({ TRELLIS_INSTALLATION_HOME: "/tmp/trellis-installation" }).installationHome).toBe(
		"/tmp/trellis-installation",
	);
});

test("requires authentication for a non-loopback binding", () => {
	expect(() => loadConfig({ TRELLIS_HOST: "0.0.0.0", TRELLIS_AUTH_TOKEN: " " })).toThrow(
		"TRELLIS_AUTH_TOKEN must not be empty.",
	);
	expect(() => loadConfig({ TRELLIS_HOST: "0.0.0.0" })).toThrow(
		"TRELLIS_AUTH_TOKEN is required when TRELLIS_HOST is not a loopback address.",
	);
	expect(loadConfig({ TRELLIS_HOST: "0.0.0.0", TRELLIS_AUTH_TOKEN: "token" }).authToken).toBe("token");
});

test("formats the IPv6 loopback host in server URLs", () => {
	expect(loadConfig({ TRELLIS_HOST: "::1" }).agentsUrl).toBe("http://[::1]:4521");
});
