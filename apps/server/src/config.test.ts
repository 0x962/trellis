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
