import { expect, test } from "bun:test";
import { AttachmentSchema, AttachmentUploadInputSchema } from "./attachment.ts";
import {
	PageAssetPathSchema,
	PageListInputSchema,
	PageMimeSchema,
	PageSourcePathSchema,
	PageSummaryTextSchema,
	PageTitleSchema,
	PageUploadInputSchema,
	PageUploadNameSchema,
	PageVersionSchema,
} from "./page.ts";
import { PageContentInputSchema, PageVersionLabelSchema } from "./pageVersion.ts";

const id = "01M3A9BCJ1TQ5V5T76BPTB9CKW";

test("metadata preserves text beyond each former character limit", () => {
	for (const [schema, value] of [
		[AttachmentSchema.shape.filename, "界".repeat(256)],
		[PageTitleSchema, "Title ".repeat(1000).trim()],
		[PageSummaryTextSchema, "Summary ".repeat(1000).trim()],
		[PageVersionLabelSchema, "Label ".repeat(1000).trim()],
		[PageVersionSchema.shape.label, "Version ".repeat(1000)],
		[PageMimeSchema, `application/${"x".repeat(300)}`],
		[PageUploadNameSchema, `${"界".repeat(256)}.html`],
		[PageSourcePathSchema, `${"directory/".repeat(500)}index.html`],
	] as const)
		expect(schema.parse(value)).toBe(value);
});

test("upload requests retain long display names", () => {
	const name = `${"n".repeat(256)}.html`;
	const file = new File(["<p>Page</p>"], name, { type: "text/html" });
	expect(AttachmentUploadInputSchema.parse({ ticket: "TRL-744", file, name }).name).toBe(name);
	expect(PageUploadInputSchema.parse({ project: "TRL", file }).file.name).toBe(name);
});

test("search and content lookup retain complete input", () => {
	const q = "query ".repeat(100);
	const path = `${"directory/".repeat(500)}asset.txt`;
	expect(PageListInputSchema.parse({ project: "TRL", q }).q).toBe(q);
	expect(PageContentInputSchema.parse({ pageId: id, version: 1, path }).path).toBe(path);
});

test("metadata retains required content and path safety", () => {
	for (const schema of [PageTitleSchema, PageVersionLabelSchema]) {
		expect(schema.safeParse("   ").success).toBe(false);
		expect(schema.parse("  Name  ")).toBe("Name");
	}
	for (const schema of [AttachmentSchema.shape.filename, PageMimeSchema, PageUploadNameSchema])
		expect(schema.safeParse("").success).toBe(false);
	for (const path of ["/root", "C:/root", "../root", "a/../b", "a//b", "a/./b", "a/", "a\\b", "a\u0085b"])
		expect(PageSourcePathSchema.safeParse(path).success).toBe(false);
	for (const path of ["index.html", "INDEX.HTML", ".trellis", ".trellis/file", ".TRELLIS/file"])
		expect(PageAssetPathSchema.safeParse(path).success).toBe(false);
	for (const name of ["a/b", "a\\b", "a\nb"]) expect(PageUploadNameSchema.safeParse(name).success).toBe(false);
	expect(PageMimeSchema.safeParse("text/plain\r\nx-header: value").success).toBe(false);
	expect(PageVersionSchema.shape.documentSha256.safeParse("invalid").success).toBe(false);
});

test("asset paths retain the UTF-8 byte boundary", () => {
	expect(PageAssetPathSchema.parse(`${"界".repeat(341)}a`)).toHaveLength(342);
	expect(PageAssetPathSchema.safeParse(`${"界".repeat(341)}ab`).success).toBe(false);
});
