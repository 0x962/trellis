import { z } from "zod";
import { ActorHeaderStringSchema, PageRefStringSchema, ProjectRefStringSchema } from "../refs.ts";
import { ActorRefSchema } from "./actor.ts";
import { booleanString, CountSchema, IsoDateTimeSchema, KeySchema, slugPattern, UlidSchema } from "./primitives.ts";

export const PAGE_TITLE_MAX = 200;
export const PAGE_SUMMARY_MAX = 2000;
export const PAGE_DOCUMENT_MAX_BYTES = 16 * 1024 * 1024;
export const PAGE_ASSET_MAX_BYTES = 100 * 1024 * 1024;
export const PAGE_ASSET_COUNT_MAX = 200;
export const PAGE_ASSET_TOTAL_MAX_BYTES = 250 * 1024 * 1024;
export const PAGE_ASSET_PATH_MAX = 1024;

export const PageTitleSchema = z
	.string()
	.trim()
	.min(1, `Enter a page title of 1 to ${PAGE_TITLE_MAX} characters.`)
	.max(PAGE_TITLE_MAX, `Enter a page title of 1 to ${PAGE_TITLE_MAX} characters.`);

export const PageSummaryTextSchema = z
	.string()
	.trim()
	.max(PAGE_SUMMARY_MAX, `Enter a page summary of ${PAGE_SUMMARY_MAX} characters or less.`);

export const PageSlugSchema = z
	.string()
	.regex(slugPattern, "Expected a slug: lower-case letters, digits, and single dashes.");

export const PageSha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
export const PageVersionNumberSchema = z.number().int().positive();
export const PageVersionQuerySchema = z.coerce.number().int().positive();
export const PageRevisionSchema = z.number().int().positive();
const hasNoControl = (value: string) => !/\p{Cc}/u.test(value);
const utf8Size = (value: string) => new TextEncoder().encode(value).byteLength;

export const PageWatchSchema = z.object({
	pageId: UlidSchema,
	agent: z.object({ id: UlidSchema, name: z.string().min(1) }),
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
});
export type PageWatch = z.infer<typeof PageWatchSchema>;

export const PageSummarySchema = z.object({
	id: UlidSchema,
	projectId: UlidSchema,
	projectKey: KeySchema,
	ref: PageRefStringSchema,
	slug: PageSlugSchema,
	title: z.string().min(1),
	summary: z.string(),
	revision: PageRevisionSchema,
	latestVersion: PageVersionNumberSchema,
	creator: ActorRefSchema,
	actor: ActorRefSchema,
	publishedBy: ActorRefSchema,
	publishedAt: IsoDateTimeSchema,
	watcher: PageWatchSchema.nullable(),
	pinned: z.boolean(),
	openThreadCount: CountSchema,
	deletedAt: IsoDateTimeSchema.nullable(),
	deletedBy: ActorRefSchema.nullable(),
	purgeAt: IsoDateTimeSchema.nullable(),
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
});
export type PageSummary = z.infer<typeof PageSummarySchema>;

const relativePath = (value: string) =>
	!value.startsWith("/") &&
	!/^[a-z]:\//i.test(value) &&
	!value.endsWith("/") &&
	!value.includes("\\") &&
	hasNoControl(value) &&
	value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");

export const PageSourcePathSchema = z
	.string()
	.min(1)
	.max(4096)
	.refine(relativePath, "Enter a relative source path without empty, dot, or parent segments.");

export const PageAssetPathSchema = PageSourcePathSchema.refine(
	(value) => utf8Size(value) <= PAGE_ASSET_PATH_MAX,
	`An asset path cannot exceed ${PAGE_ASSET_PATH_MAX} UTF-8 bytes.`,
).refine(
	(value) => value.toLowerCase() !== "index.html" && value.split("/")[0]?.toLowerCase() !== ".trellis",
	"An asset path cannot be index.html or inside .trellis/.",
);

export const PageMimeSchema = z
	.string()
	.min(1)
	.max(255)
	.refine(hasNoControl, "A MIME type cannot contain control characters.");
export const PageUploadNameSchema = z
	.string()
	.min(1)
	.max(255)
	.refine(
		(value) => hasNoControl(value) && !value.includes("/") && !value.includes("\\"),
		"An upload name cannot contain a slash or a control character.",
	);

export const PageVersionSchema = z.object({
	pageId: UlidSchema,
	number: PageVersionNumberSchema,
	requestId: z.uuid(),
	label: z.string().min(1).max(PAGE_TITLE_MAX).nullable(),
	documentSha256: PageSha256Schema,
	documentSize: z.number().int().min(1).max(PAGE_DOCUMENT_MAX_BYTES),
	sourceAgentId: UlidSchema.nullable(),
	sourcePath: PageSourcePathSchema,
	actor: ActorRefSchema,
	createdAt: IsoDateTimeSchema,
});
export type PageVersion = z.infer<typeof PageVersionSchema>;

export const PageAssetSchema = z.object({
	pageId: UlidSchema,
	version: PageVersionNumberSchema,
	path: PageAssetPathSchema,
	sha256: PageSha256Schema,
	size: z.number().int().min(0).max(PAGE_ASSET_MAX_BYTES),
	mime: PageMimeSchema,
});
export type PageAsset = z.infer<typeof PageAssetSchema>;

export const PageUploadSchema = z.object({
	id: UlidSchema,
	projectId: UlidSchema,
	sha256: PageSha256Schema,
	size: z.number().int().min(0).max(PAGE_ASSET_MAX_BYTES),
	mime: PageMimeSchema,
	originalName: PageUploadNameSchema,
	actor: ActorRefSchema,
	createdAt: IsoDateTimeSchema,
	expiresAt: IsoDateTimeSchema,
});
export type PageUpload = z.infer<typeof PageUploadSchema>;

export const PageDetailSchema = PageSummarySchema.extend({
	requestedVersion: PageVersionSchema,
	assetCount: CountSchema,
	totalThreadCount: CountSchema,
	resolvedThreadCount: CountSchema,
});
export type PageDetail = z.infer<typeof PageDetailSchema>;

export const PageCommentFilterSchema = z.enum(["open", "none"]);

export const PageListInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	q: z.string().max(500).optional(),
	author: ActorHeaderStringSchema.optional(),
	watcher: UlidSchema.optional(),
	comment: PageCommentFilterSchema.optional(),
	pinned: booleanString.optional(),
	cursor: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type PageListInput = z.input<typeof PageListInputSchema>;

export const PageListOutputSchema = z.object({
	items: z.array(PageSummarySchema),
	nextCursor: z.string().nullable(),
});
export type PageListOutput = z.infer<typeof PageListOutputSchema>;

export const PageGetInputSchema = z.strictObject({
	page: PageRefStringSchema,
	version: PageVersionQuerySchema.optional(),
	includeDeleted: booleanString.default(false),
});
export type PageGetInput = z.input<typeof PageGetInputSchema>;

export const PageUpdateInputSchema = z
	.strictObject({
		page: PageRefStringSchema,
		title: PageTitleSchema.optional(),
		summary: PageSummaryTextSchema.optional(),
		expectedVersion: PageRevisionSchema.optional(),
	})
	.refine((input) => input.title !== undefined || input.summary !== undefined, "Change the title or the summary.");
export type PageUpdateInput = z.input<typeof PageUpdateInputSchema>;

export const PageDeleteInputSchema = z.strictObject({
	page: PageRefStringSchema,
	expectedVersion: PageRevisionSchema.optional(),
	force: booleanString.optional(),
});
export type PageDeleteInput = z.input<typeof PageDeleteInputSchema>;

export const PageRestoreInputSchema = PageDeleteInputSchema;
export type PageRestoreInput = z.input<typeof PageRestoreInputSchema>;

export const PageUploadInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	uploadId: UlidSchema.optional(),
	file: z.file().min(0).max(PAGE_ASSET_MAX_BYTES),
});
export type PageUploadInput = z.input<typeof PageUploadInputSchema>;

export const PagePublishAssetInputSchema = z.strictObject({
	uploadId: UlidSchema,
	path: PageAssetPathSchema,
});

const PagePublishAssetsSchema = z
	.array(PagePublishAssetInputSchema)
	.max(PAGE_ASSET_COUNT_MAX)
	.superRefine((assets, ctx) => {
		const paths = new Set<string>();
		for (const [index, asset] of assets.entries()) {
			if (paths.has(asset.path))
				ctx.addIssue({ code: "custom", path: [index, "path"], message: "Use each asset path once." });
			paths.add(asset.path);
		}
	});

const publishFields = {
	requestId: z.uuid(),
	documentUploadId: UlidSchema,
	assets: PagePublishAssetsSchema.default([]),
	label: z.string().trim().min(1).max(PAGE_TITLE_MAX).optional(),
	summary: PageSummaryTextSchema.optional(),
	sourcePath: PageSourcePathSchema,
};

export const PagePublishInputSchema = z.union([
	z.strictObject({ ...publishFields, project: ProjectRefStringSchema, title: PageTitleSchema }),
	z.strictObject({ ...publishFields, page: PageRefStringSchema, expectedVersion: PageRevisionSchema }),
]);
export type PagePublishInput = z.input<typeof PagePublishInputSchema>;

export const PagePublishOutputSchema = z.object({
	page: PageSummarySchema,
	version: PageVersionSchema,
	warnings: z.array(z.string()),
});
export type PagePublishOutput = z.infer<typeof PagePublishOutputSchema>;

export const PageVersionsInputSchema = z.strictObject({
	page: PageRefStringSchema,
	cursor: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const PageVersionsOutputSchema = z.object({
	items: z.array(PageVersionSchema),
	nextCursor: z.string().nullable(),
});
export type PageVersionsOutput = z.infer<typeof PageVersionsOutputSchema>;

export const PagePullInputSchema = z.strictObject({
	page: PageRefStringSchema,
	version: PageVersionQuerySchema.optional(),
});

export const PagePullOutputSchema = z.object({
	page: PageSummarySchema,
	version: PageVersionSchema,
	archiveUrl: z.string().min(1),
	expiresAt: IsoDateTimeSchema,
});
export type PagePullOutput = z.infer<typeof PagePullOutputSchema>;

export const PagePinInputSchema = z.strictObject({
	page: PageRefStringSchema,
	pinned: booleanString,
});

export const PagePinOutputSchema = z.object({ pageId: UlidSchema, pinned: z.boolean() });
export type PagePinOutput = z.infer<typeof PagePinOutputSchema>;

export const PageWatchGetInputSchema = z.strictObject({ page: PageRefStringSchema });
export const PageWatchAssignInputSchema = z.strictObject({ page: PageRefStringSchema, agent: UlidSchema });
export const PageWatchStopInputSchema = z.strictObject({ page: PageRefStringSchema });
export const PageWatchStopOutputSchema = z.object({ pageId: UlidSchema });

export const PageRenderTicketInputSchema = z.strictObject({
	page: PageRefStringSchema,
	version: PageVersionNumberSchema,
});

export const PageRenderLeaseSchema = z.object({
	lease: z.string().min(1),
	contentRoot: z.string().min(1),
	runtimeNonce: z.string().min(1),
	idleExpiresAt: IsoDateTimeSchema,
	absoluteExpiresAt: IsoDateTimeSchema,
});
export type PageRenderLease = z.infer<typeof PageRenderLeaseSchema>;

export const PageRenewRenderLeaseInputSchema = z.strictObject({ lease: z.string().min(1).max(1000) });
