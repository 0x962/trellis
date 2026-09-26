import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PAGE_RENDER_IDLE_MS, PAGE_RENDER_MAX_MS, type PageContentFile } from "@trellis/api";
import { Hono } from "hono";
import { ulid } from "ulid";
import type { Config } from "../../config.ts";
import type { ServiceTransport } from "../../db/transport.ts";
import type { Logger } from "../../log.ts";
import {
	clearPageLeases,
	createRenderLease,
	PAGE_RENDER_PREFIX,
	readRenderLease,
	renewRenderLease,
} from "../../pageLeases.ts";
import { pageObjectPath } from "../../storage/pageObjects.ts";
import { pageContentRoute } from "./pageContent.ts";
import { pageFrameRoute } from "./pageRender.ts";

let home: string;
const pageId = ulid();
const human = { name: "Navid", kind: "human" as const };
const other = { name: "Other", kind: "human" as const };
const at = new Date("2026-09-24T18:00:00.000Z");

const documentSha = "a".repeat(64);
const assetSha = "b".repeat(64);
const otherSha = "c".repeat(64);

// What the database answers for one version of one page.
const files = new Map<string, PageContentFile>([
	["", { state: "ok", sha256: documentSha, size: 21, mime: "text/html; charset=utf-8" }],
	["styles/main.css", { state: "ok", sha256: assetSha, size: 6, mime: "text/css" }],
]);
let deleted = false;
let missing = false;

const transport = {
	call: async (name: string, _ctx: unknown, input: unknown) => {
		expect(name).toBe("pages.versionFile");
		const query = input as { pageId: string; version: number; path: string };
		expect(query.pageId).toBe(pageId);
		if (missing) return { state: "missing" };
		if (deleted) return { state: "deleted" };
		if (query.version !== 3) return { state: "missing" };
		// `pages.versionFile` reads an empty address and `index.html` as the
		// document, so this stand-in reads them the same way.
		return files.get(query.path === "index.html" ? "" : query.path) ?? { state: "missing" };
	},
} as unknown as ServiceTransport;

const writeObject = async (sha256: string, body: string) => {
	const path = pageObjectPath(home, sha256);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, body);
};

const appOf = () => {
	const app = new Hono();
	app.use(async (c, next) => {
		c.set("requestId", ulid());
		await next();
	});
	const config = { home } as Config;
	const log = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } as unknown as Logger;
	app.get(`${PAGE_RENDER_PREFIX}/:leaseId`, pageFrameRoute({ log }));
	app.get(`${PAGE_RENDER_PREFIX}/:leaseId/*`, pageContentRoute({ config, transport, log }));
	return app;
};

// A route reads the clock of the machine, so a lease a route serves starts
// at that clock. The tests of the lease itself pass their own instant.
const lease = (now = new Date()) => createRenderLease({ pageId, version: 3, actor: human, now });

beforeAll(async () => {
	home = await mkdtemp(join(tmpdir(), "trellis-page-content-"));
	await writeObject(documentSha, "<p>Forecast report</p>");
	await writeObject(assetSha, "body{}");
	await writeObject(otherSha, "other");
});

afterAll(async () => {
	await rm(home, { recursive: true, force: true });
});

beforeEach(() => {
	clearPageLeases();
	deleted = false;
	missing = false;
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
});

describe("the page document and its assets", () => {
	test("completes an HTTP response after runtime injection", async () => {
		const open = lease();
		const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: appOf().fetch });
		try {
			const response = await fetch(new URL(`${PAGE_RENDER_PREFIX}/${open.id}/`, server.url), {
				signal: AbortSignal.timeout(2000),
			});
			expect(response.status).toBe(200);
			const body = await response.text();
			expect(body).toStartWith("<p>Forecast report</p>");
			expect(body).toContain("page-ready");
		} finally {
			server.stop(true);
		}
	});

	test("serves the document with its runtime and source hash", async () => {
		const open = lease();
		const response = await appOf().request(`http://trellis.test${PAGE_RENDER_PREFIX}/${open.id}/`);
		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).toStartWith("<p>Forecast report</p>");
		expect(body).toContain("page-ready");
		expect(body).toContain(open.nonce);
		expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
		expect(response.headers.get("etag")).toBe(`"${documentSha}"`);
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
		expect(response.headers.get("referrer-policy")).toBe("no-referrer");
		// The browser keeps the bytes and asks the server on every request, so
		// the tag below can answer 304.
		expect(response.headers.get("cache-control")).toBe("private, no-cache");
	});

	test("names index.html as the document", async () => {
		const open = lease();
		const response = await appOf().request(`http://trellis.test${PAGE_RENDER_PREFIX}/${open.id}/index.html`);
		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).toStartWith("<p>Forecast report</p>");
		expect(body).toContain("page-ready");
		expect(body).toContain(open.nonce);
	});

	test("downloads the exact source bytes under the same lease and sandbox policy", async () => {
		const open = lease();
		const response = await appOf().request(`http://trellis.test${PAGE_RENDER_PREFIX}/${open.id}/index.html?download=1`);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("<p>Forecast report</p>");
		expect(response.headers.get("content-disposition")).toBe("attachment");
		expect(response.headers.get("content-length")).toBe("21");
		expect(response.headers.get("content-security-policy")).toContain("connect-src 'none'");
		clearPageLeases();
		const expired = await appOf().request(`http://trellis.test${PAGE_RENDER_PREFIX}/${open.id}/index.html?download=1`);
		expect(expired.status).toBe(404);
	});

	test("serves an asset with the type the version stored", async () => {
		const open = lease();
		const response = await appOf().request(`http://trellis.test${PAGE_RENDER_PREFIX}/${open.id}/styles/main.css`);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("body{}");
		expect(response.headers.get("content-type")).toBe("text/css");
	});

	test("limits every resource of the page to its own lease path", async () => {
		const open = lease();
		const response = await appOf().request(`http://trellis.test${PAGE_RENDER_PREFIX}/${open.id}/`);
		const policy = response.headers.get("content-security-policy")!;
		const own = `http://trellis.test${PAGE_RENDER_PREFIX}/${open.id}/`;
		expect(policy).toContain(`script-src ${own} 'unsafe-inline'`);
		expect(policy).toContain(`img-src ${own} data: blob:`);
		expect(policy).toContain("connect-src 'none'");
		expect(policy).toContain("form-action 'none'");
		expect(policy).toContain("frame-src 'none'");
		expect(policy).toContain("base-uri 'none'");
		expect(policy).toContain("object-src 'none'");
	});

	test("answers 304 when the browser holds the same hash", async () => {
		const open = lease();
		const response = await appOf().request(`http://trellis.test${PAGE_RENDER_PREFIX}/${open.id}/`, {
			headers: { "if-none-match": `"${documentSha}"` },
		});
		expect(response.status).toBe(304);
		expect(response.headers.get("etag")).toBe(`"${documentSha}"`);
	});

	test("answers 404 for an address the version does not hold", async () => {
		const open = lease();
		const response = await appOf().request(`http://trellis.test${PAGE_RENDER_PREFIX}/${open.id}/nothing.png`);
		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({ code: "NOT_FOUND" });
	});

	test("answers 404 for a malformed address", async () => {
		const open = lease();
		const response = await appOf().request(`http://trellis.test${PAGE_RENDER_PREFIX}/${open.id}/%E0%A4%A`);
		expect(response.status).toBe(404);
	});

	test("answers 410 for a page a person deleted", async () => {
		deleted = true;
		const open = lease();
		const response = await appOf().request(`http://trellis.test${PAGE_RENDER_PREFIX}/${open.id}/`);
		expect(response.status).toBe(410);
		expect(await response.json()).toMatchObject({ code: "PAGE_DELETED" });
	});

	test("answers 404 once the retention task removes the page", async () => {
		missing = true;
		const open = lease();
		const response = await appOf().request(`http://trellis.test${PAGE_RENDER_PREFIX}/${open.id}/`);
		expect(response.status).toBe(404);
	});

	test("reaches no other version of the same page", async () => {
		const open = createRenderLease({ pageId, version: 2, actor: human, now: new Date() });
		const response = await appOf().request(`http://trellis.test${PAGE_RENDER_PREFIX}/${open.id}/styles/main.css`);
		expect(response.status).toBe(404);
	});
});

describe("the life of a render lease", () => {
	test("a content request moves the idle limit ahead", async () => {
		const open = lease(new Date(Date.now() - 25 * 60 * 1000));
		const nearlyIdle = new Date(open.idleExpiresAt.getTime() - 60 * 1000);
		await appOf().request(`http://trellis.test${PAGE_RENDER_PREFIX}/${open.id}/`);
		const held = readRenderLease(open.id, nearlyIdle)!;
		expect(held.idleExpiresAt.getTime()).toBeGreaterThan(nearlyIdle.getTime() + 25 * 60 * 1000);
	});

	test("ends after 30 idle minutes", () => {
		const open = lease(at);
		const idle = new Date(at.getTime() + PAGE_RENDER_IDLE_MS);
		expect(readRenderLease(open.id, idle)).toBeUndefined();
	});

	test("ends eight hours after its creation however often the viewer renews", () => {
		const open = lease(at);
		let held = open;
		for (let minutes = 20; minutes * 60 * 1000 < PAGE_RENDER_MAX_MS; minutes += 20)
			held = renewRenderLease(open.id, human, new Date(at.getTime() + minutes * 60 * 1000))!;
		expect(held.idleExpiresAt).toEqual(open.absoluteExpiresAt);
		expect(readRenderLease(open.id, new Date(at.getTime() + PAGE_RENDER_MAX_MS))).toBeUndefined();
	});

	test("renews for the actor that created it and for no other", () => {
		const open = lease(at);
		const later = new Date(at.getTime() + 20 * 60 * 1000);
		expect(renewRenderLease(open.id, other, later)).toBeUndefined();
		const renewed = renewRenderLease(open.id, human, later)!;
		expect(renewed.idleExpiresAt.getTime()).toBe(later.getTime() + PAGE_RENDER_IDLE_MS);
		expect(renewed.absoluteExpiresAt).toEqual(open.absoluteExpiresAt);
	});

	test("a restart of the server ends every lease", async () => {
		const open = lease();
		clearPageLeases();
		const response = await appOf().request(`http://trellis.test${PAGE_RENDER_PREFIX}/${open.id}/`);
		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({ code: "RENDER_LEASE_EXPIRED" });
	});
});
