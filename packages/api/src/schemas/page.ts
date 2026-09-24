import { z } from "zod";
import { ActorHeaderStringSchema, PageRefStringSchema, ProjectRefStringSchema } from "../refs.ts";
import { ActorRefSchema } from "./actor.ts";
import { booleanString, CountSchema, IsoDateTimeSchema, KeySchema, slugPattern, UlidSchema } from "./primitives.ts";

export const PAGE_TITLE_MAX = 200;
export const PAGE_SUMMARY_MAX = 2000;
export const PAGE_DOCUMENT_MAX_BYTES = 16 * 1024 * 1024;
export const PAGE_ASSET_MAX_BYTES = 100 * 1024 * 1024;
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

const PageUploadFileSchema = z
	.file()
	.refine(
		(file) => PageUploadNameSchema.safeParse(file.name).success,
		"Use a file name of 1 to 255 characters without a slash, a backslash, or a control character.",
	);

export const PageUploadInputSchema = z.strictObject({
	id: UlidSchema.optional(),
	project: ProjectRefStringSchema,
	file: PageUploadFileSchema,
});
export type PageUploadInput = z.input<typeof PageUploadInputSchema>;

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
		expectedVersion: PageRevisionSchema,
	})
	.refine((input) => input.title !== undefined || input.summary !== undefined, "Change the title or the summary.");
export type PageUpdateInput = z.input<typeof PageUpdateInputSchema>;

export const PageDeleteInputSchema = z.strictObject({
	page: PageRefStringSchema,
	expectedVersion: PageRevisionSchema,
	force: booleanString.optional(),
});
export type PageDeleteInput = z.input<typeof PageDeleteInputSchema>;

export const PageRestoreInputSchema = PageDeleteInputSchema;
export type PageRestoreInput = z.input<typeof PageRestoreInputSchema>;

export const PagePinInputSchema = z.strictObject({
	page: PageRefStringSchema,
	pinned: booleanString,
});

export const PagePinOutputSchema = z.object({ pageId: UlidSchema, pinned: z.boolean() });
export type PagePinOutput = z.infer<typeof PagePinOutputSchema>;

export const PAGE_VERSION_ASSET_MAX = 200;
export const PAGE_VERSION_ASSET_BYTES_MAX = 250 * 1024 * 1024;

// The render lease of one Page version in one viewer. `PAGE_RENDER_IDLE_MS`
// is the time the lease survives without a content request. Every content
// request restarts it. `PAGE_RENDER_MAX_MS` is the age at which the lease
// ends whatever the viewer does. `PAGE_RENDER_RENEW_MS` is the interval the
// viewer calls `pages.renewRenderLease` on while a person looks at the page,
// and it is under the idle limit so a page that nobody scrolls stays open.
export const PAGE_RENDER_IDLE_MS = 30 * 60 * 1000;
export const PAGE_RENDER_MAX_MS = 8 * 60 * 60 * 1000;
export const PAGE_RENDER_RENEW_MS = 20 * 60 * 1000;

// The time a download link from `pages.pull` works for.
export const PAGE_ARCHIVE_TTL_MS = 5 * 60 * 1000;

export const PageVersionLabelSchema = z
	.string()
	.trim()
	.min(1, `Enter a version label of 1 to ${PAGE_TITLE_MAX} characters.`)
	.max(PAGE_TITLE_MAX, `Enter a version label of 1 to ${PAGE_TITLE_MAX} characters.`);

export const PagePublishAssetSchema = z.strictObject({
	uploadId: UlidSchema,
	path: PageAssetPathSchema,
});

// One publication. `project` and `title` create a page; `page` and
// `expectedVersion` add a version to the page that ref names. `document` and
// each `uploadId` name a staged upload of the same project and the same
// actor. `requestId` is unique over every version of every page, so a caller
// that sends the same request twice reads the first result both times.
export const PagePublishInputSchema = z
	.strictObject({
		requestId: z.uuid(),
		project: ProjectRefStringSchema.optional(),
		page: PageRefStringSchema.optional(),
		expectedVersion: PageRevisionSchema.optional(),
		title: PageTitleSchema.optional(),
		summary: PageSummaryTextSchema.optional(),
		label: PageVersionLabelSchema.optional(),
		document: UlidSchema,
		assets: z.array(PagePublishAssetSchema).max(PAGE_VERSION_ASSET_MAX).default([]),
		sourcePath: PageSourcePathSchema,
	})
	.refine(
		(input) => (input.project === undefined) !== (input.page === undefined),
		"Name a project to create a page, or a page to publish a new version of it.",
	)
	.refine(
		(input) => input.page === undefined || input.expectedVersion !== undefined,
		"A new version of a page needs the revision the caller last read in expectedVersion.",
	)
	.refine(
		(input) => input.project === undefined || (input.title !== undefined && input.expectedVersion === undefined),
		"A new page needs a title and no expectedVersion.",
	)
	.refine(
		(input) => input.page === undefined || input.title === undefined,
		"The title of a page changes through pages.update, not through a publication.",
	)
	.refine(
		(input) => new Set(input.assets.map((asset) => asset.path)).size === input.assets.length,
		"Each asset path appears once in one version.",
	);
export type PagePublishInput = z.input<typeof PagePublishInputSchema>;

export const PagePublishOutputSchema = z.object({
	page: PageSummarySchema,
	version: PageVersionSchema,
});
export type PagePublishOutput = z.infer<typeof PagePublishOutputSchema>;

export const PageVersionListInputSchema = z.strictObject({
	page: PageRefStringSchema,
	cursor: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type PageVersionListInput = z.input<typeof PageVersionListInputSchema>;

export const PageVersionListOutputSchema = z.object({
	items: z.array(PageVersionSchema),
	nextCursor: z.string().nullable(),
});
export type PageVersionListOutput = z.infer<typeof PageVersionListOutputSchema>;

export const PagePullInputSchema = z.strictObject({
	page: PageRefStringSchema,
	version: PageVersionQuerySchema.optional(),
});
export type PagePullInput = z.input<typeof PagePullInputSchema>;

// The document and the assets of one version. A caller writes `index.html`
// from the document and each asset at its own path.
export const PagePullContentSchema = z.object({
	page: PageSummarySchema,
	version: PageVersionSchema,
	assets: z.array(PageAssetSchema),
});
export type PagePullContent = z.infer<typeof PagePullContentSchema>;

// `archiveUrl` is a zip of `index.html` and every asset, at the path each
// asset holds in that version. The link carries its own authorization and
// works until `archiveExpiresAt`.
export const PagePullOutputSchema = PagePullContentSchema.extend({
	archiveUrl: z.string().min(1),
	archiveExpiresAt: IsoDateTimeSchema,
});
export type PagePullOutput = z.infer<typeof PagePullOutputSchema>;

export const PageRenderTicketInputSchema = z.strictObject({
	page: PageRefStringSchema,
	version: PageVersionQuerySchema.optional(),
});
export type PageRenderTicketInput = z.input<typeof PageRenderTicketInputSchema>;

// What a viewer needs to draw one Page version.
// `frameUrl` is the address of the frame the viewer mounts. That frame is a
// fixed Trellis document. It holds the page document in a frame of its own
// and its response names `contentRoot` as the only address that inner frame
// may hold, so the page document cannot send the viewer anywhere else.
// `contentRoot` is the address of the page document itself. Each relative
// address in the page document resolves under it.
// `nonce` names this viewer. A message from the frame carries it.
export const PageRenderLeaseSchema = z.object({
	lease: z.string().min(1),
	frameUrl: z.string().min(1),
	contentRoot: z.string().min(1),
	nonce: z.string().min(1),
	pageId: UlidSchema,
	version: PageVersionNumberSchema,
	idleExpiresAt: IsoDateTimeSchema,
	absoluteExpiresAt: IsoDateTimeSchema,
});
export type PageRenderLease = z.infer<typeof PageRenderLeaseSchema>;

export const PageRenderRenewInputSchema = z.strictObject({ lease: z.string().min(1).max(200) });
export type PageRenderRenewInput = z.input<typeof PageRenderRenewInputSchema>;

// What the content route asks the database for. `path` is the address the
// browser asked for under the render lease, so the schema accepts any text
// and the lookup answers `missing` for an address no asset row holds.
export const PageContentInputSchema = z.strictObject({
	pageId: UlidSchema,
	version: PageVersionNumberSchema,
	path: z.string().max(4096).optional(),
});
export type PageContentInput = z.input<typeof PageContentInputSchema>;

// What the content route serves for one address under a render lease.
// `deleted` is a page a person deleted and the retention task still keeps.
// `missing` is a page, a version, or an asset path that no row holds.
export type PageContentFile =
	| { state: "ok"; sha256: string; size: number; mime: string }
	| { state: "deleted" }
	| { state: "missing" };
