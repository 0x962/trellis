import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { defaultEnv, runCli } from "../../../deps.ts";

// `trellis serve` hands the server the same superset path that `trellis
// install` writes into the plist. Each run gets a free port and a temp data
// home, so a serve that starts a real server never binds 4521 or opens
// ~/.trellis.
const env = (values: Record<string, string> = {}) => ({
	...defaultEnv,
	TRELLIS_HOME: mkdtempSync(join(process.env.TRELLIS_HOME!, "serve-")),
	TRELLIS_PORT: "0",
	...values,
});

describe("serve", () => {
	test("serve hands the server the superset path that which finds on PATH", async () => {
		const asked: string[] = [];
		const which = (name: string) => {
			asked.push(name);
			return "/Users/me/.superset/bin/superset";
		};
		const result = await runCli(["serve"], {}, { env: env(), which });
		expect(result.code, result.stderr).toBe(0);
		expect(asked).toEqual(["superset"]);
		expect(result.spawns).toHaveLength(1);
		expect(result.spawns[0]!.env.TRELLIS_SUPERSET_BIN).toBe("/Users/me/.superset/bin/superset");
	});

	test("serve --superset-bin hands the server that path", async () => {
		const which = (name: string) => `/test/bin/${name}`;
		const args = ["serve", "--superset-bin", "/opt/superset/bin/superset"];
		const result = await runCli(args, {}, { env: env(), which });
		expect(result.code, result.stderr).toBe(0);
		expect(result.spawns[0]!.env.TRELLIS_SUPERSET_BIN).toBe("/opt/superset/bin/superset");
	});

	test("a TRELLIS_SUPERSET_BIN in the environment wins over the lookup", async () => {
		const which = (name: string) => `/test/bin/${name}`;
		const result = await runCli(["serve"], {}, { env: env({ TRELLIS_SUPERSET_BIN: "/stub/superset" }), which });
		expect(result.code, result.stderr).toBe(0);
		expect(result.spawns[0]!.env.TRELLIS_SUPERSET_BIN).toBe("/stub/superset");
	});

	test("without superset on PATH serve sets no TRELLIS_SUPERSET_BIN", async () => {
		const result = await runCli(["serve"], {}, { env: env(), which: () => null });
		expect(result.code, result.stderr).toBe(0);
		expect(result.spawns[0]!.env).not.toHaveProperty("TRELLIS_SUPERSET_BIN");
	});
});
