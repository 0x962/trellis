import { expect, test } from "bun:test";
import {
	PageAssetPathSchema,
	PageAssetSchema,
	PageSourcePathSchema,
	PageUploadSchema,
	PageVersionSchema,
} from "./page.ts";
import { PAGE_COMMENT_ANCHOR_MAX_BYTES, PageCommentAnchorSchema, PageCommentThreadSchema } from "./pageComment.ts";
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

test("a Page comment anchor limits the serialized UTF-8 size", () => {
	const withinLimit = {
		kind: "text" as const,
		path: "界".repeat(3000),
		quote: "界".repeat(1000),
		prefix: "",
		suffix: "",
	};
	const overLimit = { ...withinLimit, path: "界".repeat(4000), quote: "界".repeat(2000) };

	expect(PageCommentAnchorSchema.safeParse(withinLimit).success).toBe(true);
	expect(PageCommentAnchorSchema.safeParse(overLimit).success).toBe(false);
});

test("a Page comment anchor uses the stored JSONB byte limit", () => {
	const atLimit = {
		kind: "text" as const,
		path: "界".repeat(4000),
		quote: "界".repeat(1438),
		prefix: "a",
		suffix: "",
	};
	const overLimit = { ...atLimit, prefix: "aa" };
	const separatorBytes = Object.keys(atLimit).length * 2 - 1;
	const compactAtLimitBytes = new TextEncoder().encode(JSON.stringify(atLimit)).byteLength;
	const compactOverLimitBytes = new TextEncoder().encode(JSON.stringify(overLimit)).byteLength;

	expect(compactAtLimitBytes + separatorBytes).toBe(PAGE_COMMENT_ANCHOR_MAX_BYTES);
	expect(compactOverLimitBytes).toBeLessThanOrEqual(PAGE_COMMENT_ANCHOR_MAX_BYTES);
	expect(compactOverLimitBytes + separatorBytes).toBe(PAGE_COMMENT_ANCHOR_MAX_BYTES + 1);
	expect(PageCommentAnchorSchema.safeParse(atLimit).success).toBe(true);
	expect(PageCommentAnchorSchema.safeParse(overLimit).success).toBe(false);
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
