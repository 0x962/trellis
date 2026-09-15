import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../deps.ts";
import { ticket } from "../../fixtures.ts";

const homes: string[] = [];
afterEach(async () => {
	for (const home of homes.splice(0)) await rm(home, { recursive: true, force: true });
});
const fixture = async () => {
	const home = await mkdtemp(join(tmpdir(), "trellis-default-cli-"));
	homes.push(home);
	await writeFile(join(home, "trellis.lock"), JSON.stringify({ role: "server", port: 49121 }));
	await writeFile(join(home, "desktop-token"), "selected-home-token");
	return home;
};

test("the default desktop connection reads its current port and token on each invocation", async () => {
	const home = await fixture();
	for (const port of [49121, 49122]) {
		await writeFile(join(home, "trellis.lock"), JSON.stringify({ role: "server", port }));
		const result = await runCli(
			["show", "CDE-1"],
			{ "tickets.get": ticket() },
			{ env: { TRELLIS_DESKTOP_HOME: home } },
		);
		expect(result.code).toBe(0);
		expect(result.requests[0]!.url).toBe(`http://127.0.0.1:${port}/rpc/tickets/get`);
		expect(result.requests[0]!.headers.get("authorization")).toBe("Bearer selected-home-token");
	}
});

test("explicit URLs never read the desktop token, including the same local origin", async () => {
	const home = await fixture();
	for (const url of ["https://example.com", "http://127.0.0.1:49121"]) {
		for (const flag of [true, false]) {
			const result = await runCli(
				["show", "CDE-1", ...(flag ? ["--url", url] : [])],
				{ "tickets.get": ticket() },
				{
					env: { TRELLIS_DESKTOP_HOME: home, ...(flag ? {} : { TRELLIS_URL: url }) },
				},
			);
			expect(result.code).toBe(0);
			expect(result.requests[0]!.headers.get("authorization")).toBeNull();
		}
	}
});

test("an explicit remote connection needs no desktop files and accepts only its explicit token", async () => {
	const home = await fixture();
	await rm(home, { recursive: true });
	const result = await runCli(
		["show", "CDE-1", "--url", "https://example.com"],
		{ "tickets.get": ticket() },
		{
			env: { TRELLIS_DESKTOP_HOME: home, TRELLIS_AUTH_TOKEN: "explicit-remote-token" },
		},
	);
	expect(result.code).toBe(0);
	expect(result.requests[0]!.headers.get("authorization")).toBe("Bearer explicit-remote-token");
	const anonymous = await runCli(
		["show", "CDE-1"],
		{ "tickets.get": ticket() },
		{
			env: { TRELLIS_DESKTOP_HOME: home, TRELLIS_URL: "https://example.com" },
		},
	);
	expect(anonymous.code).toBe(0);
	expect(anonymous.requests[0]!.headers.get("authorization")).toBeNull();
});
