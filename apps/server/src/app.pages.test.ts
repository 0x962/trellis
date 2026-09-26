import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { PageContentFile, PagePullOutput } from "@trellis/api";
import { ulid } from "ulid";
import { createApp } from "./app.ts";
import type { Config } from "./config.ts";
import type { Runtime, ServiceTransport } from "./db/transport.ts";
import type { Bus } from "./events/bus.ts";
import type { Logger } from "./log.ts";
import { clearPageLeases, createArchiveGrant, createRenderLease } from "./pageLeases.ts";
import { pageObjectPath } from "./storage/pageObjects.ts";

const TOKEN = "host-token-of-this-machine";
const ORIGIN = "http://127.0.0.1:4521";
const pageId = ulid();
const actor = { name: "Navid", kind: "human" as const };
const document = "<p>Forecast report</p>";
const documentSha = "a".repeat(64);
let home: string;

const file: PageContentFile = {
	state: "ok",
	sha256: documentSha,
	size: document.length,
	mime: "text/html; charset=utf-8",
};

const content: PagePullOutput = {
	page: { id: pageId, slug: "forecast-report" } as PagePullOutput["page"],
	version: {
		pageId,
		number: 1,
		requestId: crypto.randomUUID(),
		label: null,
		documentSha256: documentSha,
		documentSize: document.length,
		sourceAgentId: null,
		sourcePath: "index.html",
		actor,
		createdAt: "2026-09-24T18:00:00.000Z",
	},
	assets: [],
};

const transport = {
	call: async (name: string) => (name === "pages.pull" ? content : file),
} as unknown as ServiceTransport;

// The app with a host token set, the way the desktop host runs it.
const appOf = () =>
	createApp({
		config: {
			home,
			authToken: TOKEN,
			host: "127.0.0.1",
			allowedHosts: [],
			port: 4521,
			maxUploadMb: 50,
			webDist: join(home, "web"),
		} as unknown as Config,
		log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } as unknown as Logger,
		transport,
		bus: {} as Bus,
		runtime: { version: "0.0.0", bootId: ulid() } as Runtime,
	}).app;

beforeAll(async () => {
	home = await mkdtemp(join(tmpdir(), "trellis-app-pages-"));
	const path = pageObjectPath(home, documentSha);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, document);
});

afterAll(async () => {
	await rm(home, { recursive: true, force: true });
});

beforeEach(() => {
	clearPageLeases();
});

describe("the Page routes of the whole app", () => {
	test("serve a frame, a page, and an archive without the host token", async () => {
		const lease = createRenderLease({ pageId, version: 1, actor, now: new Date() });
		const grant = createArchiveGrant({ pageId, version: 1, filename: "forecast-report-v1.zip", now: new Date() });
		const app = appOf();
		const frame = await app.request(`${ORIGIN}/api/page-render/${lease.id}`);
		expect(frame.status).toBe(200);
		expect(await frame.text()).toContain(`src="/api/page-render/${lease.id}/"`);
		const page = await app.request(`${ORIGIN}/api/page-render/${lease.id}/`);
		expect(page.status).toBe(200);
		const rendered = await page.text();
		expect(rendered).toStartWith(document);
		expect(rendered).toContain("page-ready");
		const source = await app.request(`${ORIGIN}/api/page-render/${lease.id}/index.html?download=1`);
		expect(source.status).toBe(200);
		expect(await source.text()).toBe(document);
		expect(source.headers.get("content-disposition")).toBe("attachment");
		const archive = await app.request(`${ORIGIN}/api/page-archive/${grant.id}`);
		expect(archive.status).toBe(200);
		expect(archive.headers.get("content-type")).toBe("application/zip");
	});

	test("answer the lease code, not the host token code, for an address no lease holds", async () => {
		const response = await appOf().request(`${ORIGIN}/api/page-render/${"f".repeat(32)}/`);
		expect(response.status).toBe(404);
		expect((await response.json()) as { code: string }).toMatchObject({ code: "RENDER_LEASE_EXPIRED" });
	});

	test("leave every other route behind the host token", async () => {
		const app = appOf();
		for (const path of ["/api/pages?project=TRL", "/api/page-render-leases/renew", "/api/attachments/x/file"]) {
			const response = await app.request(`${ORIGIN}${path}`);
			expect((await response.json()) as { code: string }).toMatchObject({ code: "UNAUTHORIZED" });
			expect(response.status).toBe(401);
		}
	});

	test("still refuse a Host header this server does not serve", async () => {
		const lease = createRenderLease({ pageId, version: 1, actor, now: new Date() });
		const response = await appOf().request(`${ORIGIN}/api/page-render/${lease.id}`, {
			headers: { host: "pages.example.com" },
		});
		expect(response.status).toBe(403);
	});
});
