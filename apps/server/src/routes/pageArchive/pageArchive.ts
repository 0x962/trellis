import { errors, PAGE_DOCUMENT_PATH, type PagePullOutput } from "@trellis/api";
import type { Context } from "hono";
import type { Config } from "../../config.ts";
import type { RequestContext } from "../../context.ts";
import type { ServiceTransport } from "../../db/transport.ts";
import type { Logger } from "../../log.ts";
import { type PAGE_ARCHIVE_PREFIX, readArchiveGrant } from "../../pageLeases.ts";
import { createDbTiming, serverTimingHeader } from "../../serverTiming.ts";
import { pageObjectPath } from "../../storage/pageObjects.ts";
import { type ArchiveEntry, zipStream } from "./zip.ts";

const linkEnded = () => ({
	defined: true,
	code: "NOT_FOUND" as const,
	status: errors.NOT_FOUND.status,
	message: "The download link ended. Ask for the page again to get a new link.",
	data: { kind: "page archive", ref: "" },
});

// GET /api/page-archive/{grantId} sends one page version as a zip file. The
// link carries its own authorization, because a browser download sends no
// Trellis actor header.
export const pageArchiveRoute =
	({ config, transport, log }: { config: Config; transport: ServiceTransport; log: Logger }) =>
	async (c: Context<Record<string, never>, `${typeof PAGE_ARCHIVE_PREFIX}/:grantId`>) => {
		const now = new Date();
		const reqId = c.get("requestId");
		const grant = readArchiveGrant(c.req.param("grantId"), now);
		if (grant === undefined) {
			log.warn("page archive refused", { reqId, reason: "no download link" });
			return c.json(linkEnded(), 404);
		}
		const ctx: RequestContext = { actor: null, session: null, reqId, now };
		const timing = createDbTiming();
		const pulled = (await transport.call(
			"pages.pull",
			ctx,
			{ page: grant.pageId, version: grant.version },
			timing,
		)) as PagePullOutput;
		const entries: ArchiveEntry[] = [
			{
				path: PAGE_DOCUMENT_PATH,
				open: () => Bun.file(pageObjectPath(config.home, pulled.version.documentSha256)).stream(),
			},
			...pulled.assets.map((asset) => ({
				path: asset.path,
				open: () => Bun.file(pageObjectPath(config.home, asset.sha256)).stream(),
			})),
		];
		// The response line of this request is written when these headers go
		// out. A read of a stored file can fail after that, so a failure of the
		// body writes its own line.
		const onError = (error: unknown, path: string) =>
			log.error("page archive failed", {
				reqId,
				pageId: grant.pageId,
				version: grant.version,
				path,
				message: error instanceof Error ? error.message : String(error),
			});
		return new Response(zipStream(entries, onError), {
			headers: {
				"content-type": "application/zip",
				"content-disposition": `attachment; filename="${grant.filename}"`,
				"cache-control": "no-store",
				"x-content-type-options": "nosniff",
				"server-timing": serverTimingHeader(timing),
			},
		});
	};
