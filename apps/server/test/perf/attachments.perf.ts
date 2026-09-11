import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTrellisClient } from "@trellis/api";
import { budget, report } from "./measure.ts";
import { type PerfServer, startPerfServer } from "./perfServer.ts";
import { PERF_ROWS } from "./seed.ts";

// ARCHITECTURE.md, Performance budgets: a 50 MB upload finishes within 1 s, the
// HTTP thread never stalls for more than 50 ms while it runs, and the same
// file serves back within 300 ms. 50 000 000 bytes leave room for the
// multipart framing under the 50 MiB body limit.

const FILE_BYTES = 50_000_000;
const PROBE_GAP_MS = 5;

// Sends a request that the HTTP thread answers alone, again and again, and
// keeps the longest wait. A 404 under /api never reaches the database worker,
// so a slow answer means the HTTP thread was busy with something else.
const probeStalls = (url: string) => {
	let running = true;
	let worst = 0;
	const loop = (async () => {
		while (running) {
			const started = performance.now();
			await (await fetch(`${url}/api/perf-probe`)).arrayBuffer();
			worst = Math.max(worst, performance.now() - started);
			await Bun.sleep(PROBE_GAP_MS);
		}
	})();
	return {
		stop: async () => {
			running = false;
			await loop;
			return worst;
		},
	};
};

describe.skipIf(PERF_ROWS === 0)(`perf attachments at ${PERF_ROWS} rows`, () => {
	let server: PerfServer;
	let uploadMs = 0;
	let stallMs = 0;
	let attachmentId = "";
	beforeAll(async () => {
		server = await startPerfServer();
		const client = createTrellisClient(server.url, "agent:perf");
		const bytes = new Uint8Array(FILE_BYTES);
		for (let index = 0; index < bytes.length; index++) bytes[index] = index % 251;
		const file = new File([bytes], "big.bin", { type: "application/octet-stream" });

		const stalls = probeStalls(server.url);
		await Bun.sleep(50);
		const started = performance.now();
		const uploaded = await client.attachments.upload({ ticket: "AAA-1", file });
		uploadMs = performance.now() - started;
		stallMs = await stalls.stop();
		attachmentId = uploaded.attachment.id;
	}, 600_000);
	afterAll(() => server.stop());

	test("a 50 MB upload finishes within 1 s", () => {
		expect(report("upload 50 MB", uploadMs, budget(1000))).toBeLessThanOrEqual(budget(1000));
	});

	test("the HTTP thread never stalls for more than 50 ms during the upload", () => {
		expect(report("stall during upload", stallMs, budget(50))).toBeLessThanOrEqual(budget(50));
	});

	test("the 50 MB file serves within 300 ms", async () => {
		const started = performance.now();
		const response = await fetch(`${server.url}/api/attachments/${attachmentId}/file`);
		const body = await response.arrayBuffer();
		const ms = performance.now() - started;

		expect(body.byteLength).toBe(FILE_BYTES);
		expect(report("serve 50 MB", ms, budget(300))).toBeLessThanOrEqual(budget(300));
	});
});
