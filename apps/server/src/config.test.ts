import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { loadConfig } from "./config.ts";

// loadConfig reads the TRELLIS_* variables of the environment it receives
// and returns one typed object. A test passes its own environment, so the
// TRELLIS_HOME the test preload sets never reaches these tests.

const repoWebDist = join(import.meta.dir, "..", "..", "web", "dist");

describe("config", () => {
	// A phone on the network reaches the server only through a non-loopback
	// address, so TRELLIS_HOST opens it and the default keeps it on this machine.
	test("the listen host is 127.0.0.1 unless TRELLIS_HOST names another", () => {
		expect(loadConfig({}).host).toBe("127.0.0.1");
		expect(loadConfig({ TRELLIS_HOST: "0.0.0.0" }).host).toBe("0.0.0.0");
	});

	// A proxy such as Tailscale Serve keeps its own hostname in the Host
	// header, so the Host check needs that name.
	test("TRELLIS_ALLOWED_HOSTS gives lowercase hostnames with no port, and none when unset", () => {
		expect(loadConfig({}).allowedHosts).toEqual([]);
		expect(
			loadConfig({ TRELLIS_ALLOWED_HOSTS: "My-Laptop.tail1a2b3c.ts.net, other.example:8443" }).allowedHosts,
		).toEqual(["my-laptop.tail1a2b3c.ts.net", "other.example"]);
	});

	test("config falls back to the documented defaults", () => {
		const config = loadConfig({});

		expect(config.home).toBe(join(homedir(), ".trellis"));
		expect(config.port).toBe(4521);
		expect(config.maxUploadMb).toBe(50);
		expect(config.ghBin).toBe("gh");
		expect(config.webDist).toBe(repoWebDist);
		expect(config.logLevel).toBe("info");
		expect(config.dbInline).toBe(false);
	});

	test("every environment variable overrides its config field", () => {
		const config = loadConfig({
			TRELLIS_HOME: "/var/data/trellis",
			TRELLIS_PORT: "4600",
			TRELLIS_MAX_UPLOAD_MB: "8",
			TRELLIS_GH_BIN: "/opt/homebrew/bin/gh",
			TRELLIS_WEB_DIST: "/srv/web",
			TRELLIS_LOG_LEVEL: "debug",
			TRELLIS_DB_INLINE: "true",
		});

		expect(config.home).toBe("/var/data/trellis");
		expect(config.port).toBe(4600);
		expect(config.maxUploadMb).toBe(8);
		expect(config.ghBin).toBe("/opt/homebrew/bin/gh");
		expect(config.webDist).toBe("/srv/web");
		expect(config.logLevel).toBe("debug");
		expect(config.dbInline).toBe(true);
		expect(typeof config.port).toBe("number");
		expect(typeof config.maxUploadMb).toBe("number");
	});

	test("config expands a tilde home to an absolute path", () => {
		const config = loadConfig({ TRELLIS_HOME: "~/somewhere" });

		expect(config.home).toBe(join(homedir(), "somewhere"));
		expect(isAbsolute(config.home)).toBe(true);
		expect(config.home).not.toContain("~");
	});

	test("config rejects a port that is not a number and names the variable", () => {
		expect(() => loadConfig({ TRELLIS_PORT: "not-a-port" })).toThrow(/TRELLIS_PORT/);
		expect(() => loadConfig({ TRELLIS_PORT: "not-a-port" })).toThrow(/not-a-port/);
	});

	test("config derives the data home sub-paths", () => {
		const config = loadConfig({ TRELLIS_HOME: "/var/data/trellis" });

		expect(config.dbDir).toBe("/var/data/trellis/db");
		expect(config.attachmentsDir).toBe("/var/data/trellis/attachments");
		expect(config.tmpDir).toBe("/var/data/trellis/attachments/tmp");
		expect(config.backupsDir).toBe("/var/data/trellis/backups");
		expect(config.logFile).toBe("/var/data/trellis/server.log");
	});

	test("the jobs clock runs at the wall clock rate unless TRELLIS_CLOCK_RATE names another", () => {
		expect(loadConfig({}).clockRate).toBe(1);
		expect(loadConfig({ TRELLIS_CLOCK_RATE: "100" }).clockRate).toBe(100);
		expect(() => loadConfig({ TRELLIS_CLOCK_RATE: "fast" })).toThrow(/TRELLIS_CLOCK_RATE/);
	});
});
