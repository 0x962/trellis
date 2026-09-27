import { beforeEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { ulid } from "ulid";
import type { Logger } from "../../log.ts";
import { clearPageLeases, createRenderLease, PAGE_RENDER_PREFIX } from "../../pageLeases.ts";
import { pageFrameRoute } from "./pageRender.ts";

const pageId = ulid();
const actor = { name: "Navid", kind: "human" as const };

const appOf = (browserOrigin: string | null = null) => {
	const app = new Hono();
	app.use(async (c, next) => {
		c.set("requestId", ulid());
		await next();
	});
	const log = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } as unknown as Logger;
	app.get(`${PAGE_RENDER_PREFIX}/:leaseId`, pageFrameRoute({ log, browserOrigin }));
	return app;
};

const lease = () => createRenderLease({ pageId, version: 3, actor, now: new Date() });

beforeEach(() => {
	clearPageLeases();
});

describe("the frame document", () => {
	test("holds the page in a frame its policy limits to the lease path", async () => {
		const open = lease();
		const response = await appOf().request(`http://trellis.test${PAGE_RENDER_PREFIX}/${open.id}`);
		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).toContain(`src="${PAGE_RENDER_PREFIX}/${open.id}/"`);
		expect(body).toContain('sandbox="allow-scripts"');
		expect(body).toContain('referrerpolicy="no-referrer"');
		expect(body).toContain("background:transparent");
		expect(body).not.toContain("#fff");
		const policy = response.headers.get("content-security-policy")!;
		expect(policy).toContain(`frame-src http://trellis.test${PAGE_RENDER_PREFIX}/${open.id}/`);
		expect(policy).toContain("default-src 'none'");
		expect(policy).toContain(`script-src 'nonce-${open.nonce}'`);
		expect(policy).not.toContain("script-src 'unsafe-inline'");
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
		expect(response.headers.get("cache-control")).toBe("no-store");
	});

	test("refuses an address no lease holds", async () => {
		const response = await appOf().request(`http://trellis.test${PAGE_RENDER_PREFIX}/${"f".repeat(32)}`);
		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({ code: "RENDER_LEASE_EXPIRED" });
	});

	test("uses the configured HTTPS origin behind a proxy", async () => {
		const open = lease();
		const response = await appOf("https://trellis.example.com").request(
			`http://127.0.0.1${PAGE_RENDER_PREFIX}/${open.id}`,
		);
		expect(response.headers.get("content-security-policy")).toContain(
			`frame-src https://trellis.example.com${PAGE_RENDER_PREFIX}/${open.id}/`,
		);
	});
});
