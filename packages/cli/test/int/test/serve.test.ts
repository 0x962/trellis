import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { serverHeaders, startCliServer } from "../../process.ts";

// `trellis serve --host <address>` hands the address to the server as
// TRELLIS_HOST. `::1` proves it: that listener refuses 127.0.0.1 on every
// machine.

const tempDir = (name: string) => mkdtempSync(join(process.env.TRELLIS_HOME!, `${name}-`));

const stops: Array<() => Promise<unknown>> = [];
afterEach(async () => {
	for (const stop of stops.splice(0)) await stop();
});

describe("serve", () => {
	test("serve --host binds the server to that address", async () => {
		const server = await startCliServer(tempDir("serve-host"), {}, ["--host", "::1"]);
		stops.push(server.stop);

		const response = await fetch(`http://[::1]:${server.port}/api/health`, { headers: serverHeaders() });
		const body = (await response.json()) as { addresses: string[] };

		expect(response.status).toBe(200);
		expect(body.addresses).toEqual([`http://[::1]:${server.port}`]);
		await expect(fetch(`http://127.0.0.1:${server.port}/api/health`)).rejects.toThrow();
	}, 30_000);

	// A proxy such as Tailscale Serve reaches 127.0.0.1 and keeps its own
	// hostname in the Host header.
	test("serve --allow-host serves that Host name and still refuses another", async () => {
		const server = await startCliServer(tempDir("serve-allow-host"), { TRELLIS_ALLOWED_HOSTS: undefined }, [
			"--allow-host",
			"phone.tail4a5b4c.ts.net",
		]);
		stops.push(server.stop);

		const allowed = await fetch(`${server.url}/api/health`, {
			headers: serverHeaders({ host: "phone.tail4a5b4c.ts.net" }),
		});
		const refused = await fetch(`${server.url}/api/health`, {
			headers: serverHeaders({ host: "other.tail4a5b4c.ts.net" }),
		});

		expect(allowed.status).toBe(200);
		expect(refused.status).toBe(403);
	}, 30_000);

	test("serve without --host binds 127.0.0.1", async () => {
		const server = await startCliServer(tempDir("serve-default"), { TRELLIS_HOST: undefined });
		stops.push(server.stop);

		const response = await fetch(`${server.url}/api/health`, { headers: serverHeaders() });
		const body = (await response.json()) as { addresses: string[] };

		expect(body.addresses).toEqual([`http://127.0.0.1:${server.port}`]);
	}, 30_000);
});
