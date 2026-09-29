import { expect, test } from "bun:test";
import {
	PageAssetPathSchema,
	PageAssetSchema,
	PageSourcePathSchema,
	PageUploadSchema,
	PageVersionSchema,
} from "./page.ts";
import { PageCommentAnchorSchema, PageCommentBodySchema, PageCommentThreadSchema } from "./pageComment.ts";
import { PagePublishInputSchema } from "./pageVersion.ts";
import { SlugSchema } from "./primitives.ts";

const emptySha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const at = "2026-09-24T18:00:00.000Z";
const actor = { kind: "agent" as const, name: "test-agent" };

test("an empty Page asset and staged upload keep their zero-byte size", () => {
	const asset = PageAssetSchema.parse({
		pageId: "01M3A9BCJ1TQ5V5T76BPTB9CKW",
		version: 1,
		path: "empty.txt",
		sha256: emptySha256,
		size: 0,
		mime: "text/plain",
	});
	const upload = PageUploadSchema.parse({
		id: "01M3A9CAWQNFQG4H7BJC0MMA3V",
		projectId: "01M24SPHTX36AJ3VKTNZ263E7V",
		sha256: emptySha256,
		size: 0,
		mime: "text/plain",
		originalName: "empty.txt",
		actor,
		createdAt: at,
		expiresAt: "2026-09-25T18:00:00.000Z",
	});

	expect(asset.size).toBe(0);
	expect(upload.size).toBe(0);
});

test("a Page HTML document must contain at least one byte", () => {
	expect(PageVersionSchema.shape.documentSize.safeParse(0).success).toBe(false);
});

test("Page records accept sizes above the former document and asset limits", () => {
	expect(PageVersionSchema.shape.documentSize.safeParse(16 * 1024 * 1024 + 1).success).toBe(true);
	expect(PageAssetSchema.shape.size.safeParse(100 * 1024 * 1024 + 1).success).toBe(true);
	expect(PageUploadSchema.shape.size.safeParse(100 * 1024 * 1024 + 1).success).toBe(true);
});

test("a Page publication accepts more than 200 assets", () => {
	const parsed = PagePublishInputSchema.safeParse({
		requestId: "123e4567-e89b-42d3-a456-426614174000",
		project: "TRL",
		title: "Large site",
		document: "01M3A9CAWQNFQG4H7BJC0MMA3V",
		assets: Array.from({ length: 201 }, (_, index) => ({
			uploadId: "01M3A9CB1QKQ4KGNAYRPT644N5",
			path: `asset-${index}.txt`,
		})),
		sourcePath: "site",
	});

	expect(parsed.success).toBe(true);
});

test("a Page path rejects a Windows drive-letter root", () => {
	expect(PageSourcePathSchema.safeParse("C:/file.js").success).toBe(false);
	expect(PageAssetPathSchema.safeParse("C:/file.js").success).toBe(false);
});

test("Page text fields reject C0 and C1 control characters", () => {
	for (const control of ["\u001f", "\u0085", "\u009f"]) {
		expect(PageSourcePathSchema.safeParse(`source${control}.html`).success).toBe(false);
		expect(PageAssetPathSchema.safeParse(`asset${control}.js`).success).toBe(false);
		expect(PageUploadSchema.shape.mime.safeParse(`text${control}/plain`).success).toBe(false);
		expect(PageUploadSchema.shape.originalName.safeParse(`file${control}.txt`).success).toBe(false);
	}
});

test("a Page asset path limits its UTF-8 size", () => {
	expect(PageAssetPathSchema.safeParse("a".repeat(1024)).success).toBe(true);
	expect(PageAssetPathSchema.safeParse("界".repeat(400)).success).toBe(false);
});

test("the Pages project route is not a project slug", () => {
	expect(SlugSchema.safeParse("pages").success).toBe(false);
});

test("Page comments preserve large bodies and anchors", () => {
	const body = "Comment 界\n".repeat(2000);
	const anchor = {
		kind: "text" as const,
		path: `html>${"div:nth-of-type(1)>".repeat(300)}p`,
		quote: "Selected 界\n".repeat(3000),
		prefix: "Before",
		suffix: "After",
	};
	expect(new TextEncoder().encode(JSON.stringify(anchor)).byteLength).toBeGreaterThan(16 * 1024);
	expect(PageCommentBodySchema.parse(body)).toBe(body.trim());
	expect(PageCommentAnchorSchema.parse(anchor)).toEqual(anchor);
	expect(PageCommentAnchorSchema.parse({ kind: "element", path: anchor.path })).toEqual({
		kind: "element",
		path: anchor.path,
	});
	expect(PageCommentBodySchema.safeParse(" \n ").success).toBe(false);
	for (const invalid of [
		{ ...anchor, quote: "" },
		{ ...anchor, quote: 123 },
		{ ...anchor, action: "delete" },
		{ ...anchor, prefix: "x".repeat(33) },
		{ ...anchor, suffix: "x".repeat(33) },
		{ ...anchor, kind: "unknown" },
	])
		expect(PageCommentAnchorSchema.safeParse(invalid).success).toBe(false);
});

test("a Page comment anchor accepts only generated element paths", () => {
	for (const path of ["main", "html>body:nth-of-type(1)>custom-chart:nth-of-type(2)"])
		expect(PageCommentAnchorSchema.safeParse({ kind: "element", path }).success).toBe(true);
	for (const path of ["#report", "main .chart", "main>p:nth-of-type(0)", "main>p:first-child", "main[data-id=x]"])
		expect(PageCommentAnchorSchema.safeParse({ kind: "element", path }).success).toBe(false);
});

test("a Page comment thread pairs selected text with a text anchor", () => {
	const thread = {
		id: "01M3A9BCJ1TQ5V5T76BPTB9CKW",
		pageId: "01M3A9CAWQNFQG4H7BJC0MMA3V",
		version: 1,
		creator: actor,
		resolved: null,
		comments: [
			{
				id: "01M3A9CB1QKQ4KGNAYRPT644N5",
				threadId: "01M3A9BCJ1TQ5V5T76BPTB9CKW",
				body: "Review this section.",
				actor,
				createdAt: at,
				updatedAt: at,
				deletedAt: null,
			},
		],
		createdAt: at,
		updatedAt: at,
	};

	expect(
		PageCommentThreadSchema.safeParse({
			...thread,
			anchor: { kind: "text", path: "main", quote: "section", prefix: "", suffix: "" },
			selectedText: null,
		}).success,
	).toBe(false);
	expect(
		PageCommentThreadSchema.safeParse({
			...thread,
			anchor: { kind: "element", path: "main" },
			selectedText: "section",
		}).success,
	).toBe(false);
});
