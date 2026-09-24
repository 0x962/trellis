import { errors, type PagePullContent } from "@trellis/api";
import type { Context } from "hono";
import type { Config } from "../config.ts";
import type { RequestContext } from "../context.ts";
import type { ServiceTransport } from "../db/transport.ts";
import { readArchiveGrant } from "../pageLeases.ts";
import { createDbTiming, serverTimingHeader } from "../serverTiming.ts";
import { pageObjectPath } from "../storage/pageObjects.ts";
import { type ArchiveEntry, zipStream } from "../storage/zip.ts";

export const PAGE_ARCHIVE_PREFIX = "/api/page-archive";

export const archiveHref = (grant: string) => `${PAGE_ARCHIVE_PREFIX}/${grant}`;

// The file name a person sees in their download folder.
export const archiveFilename = (slug: string, version: number) => `${slug}-v${version}.zip`;

const gone = () => ({
	defined: true,
	code: "NOT_FOUND" as const,
	status: errors.NOT_FOUND.status,
	message: "The download link ended. Ask for the page again to get a new link.",
	data: { kind: "page archive", ref: "" },
});

// GET /api/page-archive/{grant} sends one page version as a zip file. The
// link carries its own authorization, because a browser download sends no
// Trellis actor header.
export const pageArchiveRoute =
	({ config, transport }: { config: Config; transport: ServiceTransport }) =>
	async (c: Context) => {
		const now = new Date();
		const grant = readArchiveGrant(c.req.param("grant") ?? "", now);
		if (grant === undefined) return c.json(gone(), 404);
		const ctx: RequestContext = { actor: null, session: null, reqId: c.get("requestId"), now };
		const timing = createDbTiming();
		const content = (await transport.call(
			"pages.pull",
			ctx,
			{ page: grant.pageId, version: grant.version },
			timing,
		)) as PagePullContent;
		const entries: ArchiveEntry[] = [
			{
				path: "index.html",
				open: () => Bun.file(pageObjectPath(config.home, content.version.documentSha256)).stream(),
			},
			...content.assets.map((asset) => ({
				path: asset.path,
				open: () => Bun.file(pageObjectPath(config.home, asset.sha256)).stream(),
			})),
		];
		return new Response(zipStream(entries), {
			headers: {
				"content-type": "application/zip",
				"content-disposition": `attachment; filename="${grant.filename}"`,
				"cache-control": "no-store",
				"x-content-type-options": "nosniff",
				"server-timing": serverTimingHeader(timing),
			},
		});
	};
