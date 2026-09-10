import { describe, expect, test } from "bun:test";
import { runCli } from "../../test/deps.ts";
import { bootId, health } from "../../test/fixtures.ts";

describe("status", () => {
	// CLI-117
	test("status prints server health", async () => {
		const tty = await runCli(
			["status"],
			{ "system.health": health(), "system.gh": health().gh },
			{ tty: true },
		);
		expect(tty.code).toBe(0);
		expect(tty.calls.map((call) => call.path)).toEqual(["system.health", "system.gh"]);
		for (const key of ["ok", "version", "apiVersion", "bootId", "rss", "db", "gh"]) {
			expect(tty.stdout, key).toMatch(new RegExp(`^${key}\\b`, "m"));
		}
		expect(tty.stdout).toContain(bootId);
		expect(tty.stdout).toContain("0x962");

		const json = await runCli(["status", "--json"], { "system.health": health(), "system.gh": health().gh });
		expect(JSON.parse(json.stdout)).toEqual(health());
	});

	// CLI-118: the same banner the web shows, so a person knows what to run.
	test("status prints the gh banner line", async () => {
		const unauthenticated = await runCli(
			["status"],
			{
				"system.health": health({
					gh: { ok: false, user: null, reason: "unauthenticated", message: null, checkedAt: null },
				}),
				"system.gh": { ok: false, user: null, reason: "unauthenticated", message: null, checkedAt: null },
			},
			{ tty: true },
		);
		expect(unauthenticated.code).toBe(0);
		expect(unauthenticated.stdout).toContain("GitHub CLI not authenticated: run gh auth login in a terminal");

		const missing = await runCli(
			["status"],
			{
				"system.health": health({ gh: { ok: false, user: null, reason: "missing", message: null, checkedAt: null } }),
				"system.gh": { ok: false, user: null, reason: "missing", message: null, checkedAt: null },
			},
			{ tty: true },
		);
		expect(missing.code).toBe(0);
		expect(missing.stdout).toContain("gh not found: brew install gh");
	});
});
