import { expect, test } from "bun:test";
import { loadConfig } from "./config.ts";

const requiredEnv = {
	TRELLIS_INSTALLATION_HOME: "/tmp/trellis-installation",
	TRELLIS_RELEASE_ID: "release-test",
};

test("requires the installation home and release identity", () => {
	expect(() => loadConfig({ TRELLIS_RELEASE_ID: "release-test" })).toThrow("TRELLIS_INSTALLATION_HOME is required.");
	expect(() => loadConfig({ ...requiredEnv, TRELLIS_INSTALLATION_HOME: " " })).toThrow(
		"TRELLIS_INSTALLATION_HOME is required.",
	);
	expect(() => loadConfig({ TRELLIS_INSTALLATION_HOME: "/tmp/trellis-installation" })).toThrow(
		"TRELLIS_RELEASE_ID is required.",
	);
	expect(() => loadConfig({ ...requiredEnv, TRELLIS_RELEASE_ID: " " })).toThrow("TRELLIS_RELEASE_ID is required.");
});

test("reads an explicit installation home", () => {
	expect(loadConfig(requiredEnv)).toMatchObject({
		installationHome: "/tmp/trellis-installation",
		releaseId: "release-test",
	});
});

test("requires authentication for a non-loopback binding", () => {
	expect(() => loadConfig({ ...requiredEnv, TRELLIS_HOST: "0.0.0.0", TRELLIS_AUTH_TOKEN: " " })).toThrow(
		"TRELLIS_AUTH_TOKEN must not be empty.",
	);
	expect(() => loadConfig({ ...requiredEnv, TRELLIS_HOST: "0.0.0.0" })).toThrow(
		"TRELLIS_AUTH_TOKEN is required when TRELLIS_HOST is not a loopback address.",
	);
	expect(loadConfig({ ...requiredEnv, TRELLIS_HOST: "0.0.0.0", TRELLIS_AUTH_TOKEN: "token" }).authToken).toBe(
		"token",
	);
});

test("formats the IPv6 loopback host in server URLs", () => {
	expect(loadConfig({ ...requiredEnv, TRELLIS_HOST: "::1" }).agentsUrl).toBe("http://[::1]:4521");
});

test("keeps browser access disabled by default", () => {
	expect(loadConfig(requiredEnv).browserOrigin).toBeNull();
});

test("reads one HTTPS browser origin", () => {
	expect(
		loadConfig({
			...requiredEnv,
			TRELLIS_AUTH_TOKEN: "host-token",
			TRELLIS_BROWSER_ORIGIN: "https://trellis.example.com",
		}).browserOrigin,
	).toBe("https://trellis.example.com");
});

test("rejects an unsafe browser origin", () => {
	for (const origin of [
		"not-a-url",
		"http://trellis.example.com",
		"https://user@trellis.example.com",
		"https://trellis.example.com/path",
		"https://trellis.example.com?query=1",
		"https://trellis.example.com#fragment",
	]) {
		expect(() =>
			loadConfig({ ...requiredEnv, TRELLIS_AUTH_TOKEN: "host-token", TRELLIS_BROWSER_ORIGIN: origin }),
		).toThrow("TRELLIS_BROWSER_ORIGIN must be an HTTPS origin.");
	}
});

test("requires a host token for browser access", () => {
	expect(() =>
		loadConfig({ ...requiredEnv, TRELLIS_BROWSER_ORIGIN: "https://trellis.example.com" }),
	).toThrow("TRELLIS_AUTH_TOKEN is required when TRELLIS_BROWSER_ORIGIN is set.");
});
