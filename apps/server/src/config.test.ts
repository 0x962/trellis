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
