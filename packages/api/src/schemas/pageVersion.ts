import { z } from "zod";
import { PageRefStringSchema, ProjectRefStringSchema } from "../refs.ts";
import {
	PAGE_TITLE_MAX,
	PageAssetPathSchema,
	PageAssetSchema,
	PageRevisionSchema,
	PageSourcePathSchema,
	PageSummarySchema,
	PageSummaryTextSchema,
	PageTitleSchema,
	PageVersionNumberSchema,
	PageVersionQuerySchema,
	PageVersionSchema,
} from "./page.ts";
import { IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

export const PAGE_VERSION_ASSET_COUNT_MAX = 200;
export const PAGE_VERSION_ASSET_MAX_BYTES = 250 * 1024 * 1024;

// The render lease of one page version in one viewer. `PAGE_RENDER_IDLE_MS`
// is the time the lease survives without a content request. Every content
// request restarts it. `PAGE_RENDER_MAX_MS` is the age at which the lease
// ends whatever the viewer does.
export const PAGE_RENDER_IDLE_MS = 30 * 60 * 1000;
export const PAGE_RENDER_MAX_MS = 8 * 60 * 60 * 1000;
export const PAGE_RENDER_RENEW_MS = 20 * 60 * 1000;

// The time a download link from `pages.archive` works for.
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
		assets: z.array(PagePublishAssetSchema).max(PAGE_VERSION_ASSET_COUNT_MAX).default([]),
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

// The document and the assets of one version. A caller writes the document at
// `PAGE_DOCUMENT_PATH` and each asset at its own path.
export const PagePullOutputSchema = z.object({
	page: PageSummarySchema,
	version: PageVersionSchema,
	assets: z.array(PageAssetSchema),
});
export type PagePullOutput = z.infer<typeof PagePullOutputSchema>;

export const PageArchiveInputSchema = PagePullInputSchema;
export type PageArchiveInput = z.input<typeof PageArchiveInputSchema>;

// A zip of the document and every asset, at the path each one holds in that
// version. The link carries its own authorization and works until `expiresAt`.
export const PageArchiveLinkSchema = z.object({
	pageId: UlidSchema,
	version: PageVersionNumberSchema,
	url: z.string().min(1),
	expiresAt: IsoDateTimeSchema,
});
export type PageArchiveLink = z.infer<typeof PageArchiveLinkSchema>;

export const PageRenderCreateInputSchema = z.strictObject({
	page: PageRefStringSchema,
	version: PageVersionQuerySchema.optional(),
});
export type PageRenderCreateInput = z.input<typeof PageRenderCreateInputSchema>;

// What a viewer needs to draw one page version.
// `frameUrl` is the address of the frame the viewer mounts. That frame is a
// fixed Trellis document. It holds the page document in a frame of its own
// and its response names `contentRoot` as the only address that inner frame
// may hold, so the page document cannot send the viewer anywhere else.
// `contentRoot` is the address of the page document itself. Each relative
// address in the page document resolves under it.
export const PageRenderLeaseSchema = z.object({
	id: z.string().min(1),
	nonce: z.string().min(1),
	frameUrl: z.string().min(1),
	contentRoot: z.string().min(1),
	pageId: UlidSchema,
	version: PageVersionNumberSchema,
	idleExpiresAt: IsoDateTimeSchema,
	absoluteExpiresAt: IsoDateTimeSchema,
});
export type PageRenderLease = z.infer<typeof PageRenderLeaseSchema>;

export const PageRenderRenewInputSchema = z.strictObject({ leaseId: z.string().min(1).max(200) });
export type PageRenderRenewInput = z.input<typeof PageRenderRenewInputSchema>;

// What the content route asks the database for. `path` is the address the
// browser asked for under the render lease, so the schema accepts any text
// and the lookup answers `missing` for an address no row holds. An empty
// address and `PAGE_DOCUMENT_PATH` both name the document.
export const PageContentInputSchema = z.strictObject({
	pageId: UlidSchema,
	version: PageVersionNumberSchema,
	path: z.string().max(4096).default(""),
});
export type PageContentInput = z.input<typeof PageContentInputSchema>;

// What the content route serves for one address under a render lease.
// `deleted` is a page a person deleted and the retention task still keeps.
// `missing` is a page, a version, or an asset path that no row holds.
export type PageContentFile =
	| { state: "ok"; sha256: string; size: number; mime: string }
	| { state: "deleted" }
	| { state: "missing" };
