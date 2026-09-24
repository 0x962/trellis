import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PAGE_ARCHIVE_TTL_MS, type PagePullContent } from "@trellis/api";
import { Hono } from "hono";
import { ulid } from "ulid";
import type { Config } from "../config.ts";
import type { ServiceTransport } from "../db/transport.ts";
import { clearPageLeases, createArchiveGrant, readArchiveGrant } from "../pageLeases.ts";
import { pageObjectPath } from "../storage/pageObjects.ts";
import { archiveFilename, PAGE_ARCHIVE_PREFIX, pageArchiveRoute } from "./pageArchive.ts";

let home: string;
const pageId = ulid();
const at = new Date("2026-09-24T18:00:00.000Z");
const actor = { name: "Navid", kind: "human" as const };
const documentSha = "a".repeat(64);
const assetSha = "b".repeat(64);
const document = "<p>Forecast report</p>";
const asset = "body{color:red}";

const content: PagePullContent = {
	page: { id: pageId, slug: "forecast-report" } as PagePullContent["page"],
	version: {
		pageId,
		number: 3,
		requestId: crypto.randomUUID(),
		label: null,
		documentSha256: documentSha,
		documentSize: document.length,
		sourceAgentId: null,
		sourcePath: "reports/index.html",
		actor,
		createdAt: at.toISOString(),
	},
	assets: [{ pageId, version: 3, path: "styles/main.css", sha256: assetSha, size: asset.length, mime: "text/css" }],
};

const transport = {
	call: async (name: string, _ctx: unknown, input: unknown) => {
		expect(name).toBe("pages.pull");
		expect(input).toEqual({ page: pageId, version: 3 });
		return content;
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
	app.get(`${PAGE_ARCHIVE_PREFIX}/:grant`, pageArchiveRoute({ config: { home } as Config, transport }));
	return app;
};

const grantOf = (now = new Date()) =>
	createArchiveGrant({ pageId, version: 3, filename: archiveFilename("forecast-report", 3), now });

// Reads the entries of a zip the way a caller does: from the central
// directory at the end, which names every entry, its size, and where its
// bytes start.
const readZip = (bytes: Uint8Array) => {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let end = bytes.length - 22;
	while (view.getUint32(end, true) !== 0x06054b50) end -= 1;
	const count = view.getUint16(end + 10, true);
	let at = view.getUint32(end + 16, true);
	const entries: { path: string; body: string; crc: number }[] = [];
	for (let index = 0; index < count; index += 1) {
		const nameLength = view.getUint16(at + 28, true);
		const extraLength = view.getUint16(at + 30, true);
		const commentLength = view.getUint16(at + 32, true);
		const crc = view.getUint32(at + 16, true);
		const size = view.getUint32(at + 24, true);
		const path = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
		const localAt = view.getUint32(at + 42, true);
		const localName = view.getUint16(localAt + 26, true);
		const localExtra = view.getUint16(localAt + 28, true);
		const start = localAt + 30 + localName + localExtra;
		entries.push({ path, crc, body: new TextDecoder().decode(bytes.subarray(start, start + size)) });
		at += 46 + nameLength + extraLength + commentLength;
	}
	return entries;
};

beforeAll(async () => {
	home = await mkdtemp(join(tmpdir(), "trellis-page-archive-"));
	await writeObject(documentSha, document);
	await writeObject(assetSha, asset);
});

afterAll(async () => {
	await rm(home, { recursive: true, force: true });
});

beforeEach(() => {
	clearPageLeases();
});

describe("the archive of one page version", () => {
	test("holds the document as index.html and each asset at its own path", async () => {
		const grant = grantOf();
		const response = await appOf().request(`http://trellis.test${PAGE_ARCHIVE_PREFIX}/${grant.id}`);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("application/zip");
		expect(response.headers.get("content-disposition")).toBe('attachment; filename="forecast-report-v3.zip"');
		const entries = readZip(new Uint8Array(await response.arrayBuffer()));
		expect(entries.map((entry) => entry.path)).toEqual(["index.html", "styles/main.css"]);
		expect(entries[0]!.body).toBe(document);
		expect(entries[1]!.body).toBe(asset);
	});

	test("records a check value the unpacking tool can compare", async () => {
		const grant = grantOf();
		const response = await appOf().request(`http://trellis.test${PAGE_ARCHIVE_PREFIX}/${grant.id}`);
		const entries = readZip(new Uint8Array(await response.arrayBuffer()));
		// The check value of "<p>Forecast report</p>" under the zip rule.
		expect(entries[0]!.crc).toBe(Bun.hash.crc32(document));
		expect(entries[1]!.crc).toBe(Bun.hash.crc32(asset));
	});

	test("unpacks with the tool of the machine", async () => {
		const grant = grantOf();
		const response = await appOf().request(`http://trellis.test${PAGE_ARCHIVE_PREFIX}/${grant.id}`);
		const file = join(home, "archive.zip");
		await writeFile(file, new Uint8Array(await response.arrayBuffer()));
		const out = join(home, "out");
		const unzip = Bun.spawnSync(["unzip", "-o", "-q", file, "-d", out]);
		expect(unzip.exitCode).toBe(0);
		expect(await Bun.file(join(out, "index.html")).text()).toBe(document);
		expect(await Bun.file(join(out, "styles", "main.css")).text()).toBe(asset);
	});
});

describe("the link of an archive", () => {
	test("ends five minutes after the page asked for it", () => {
		const grant = grantOf(at);
		expect(grant.expiresAt.getTime()).toBe(at.getTime() + PAGE_ARCHIVE_TTL_MS);
		expect(readArchiveGrant(grant.id, new Date(at.getTime() + PAGE_ARCHIVE_TTL_MS))).toBeUndefined();
	});

	test("answers 404 for a link no grant holds", async () => {
		const response = await appOf().request(`http://trellis.test${PAGE_ARCHIVE_PREFIX}/${"f".repeat(32)}`);
		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({ code: "NOT_FOUND" });
	});

	test("answers 404 once the link ends", async () => {
		const grant = grantOf(new Date(Date.now() - PAGE_ARCHIVE_TTL_MS - 1000));
		const response = await appOf().request(`http://trellis.test${PAGE_ARCHIVE_PREFIX}/${grant.id}`);
		expect(response.status).toBe(404);
	});
});
