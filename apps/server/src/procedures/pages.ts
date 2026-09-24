import type { PageDetail, PagePullContent, PagePullOutput, PageRenderLease } from "@trellis/api";
import { fail } from "../errors.ts";
import { createArchiveGrant, createRenderLease, type RenderLease, renewRenderLease } from "../pageLeases.ts";
import { archiveFilename, archiveHref } from "../routes/pageArchive.ts";
import { renderContentRoot, renderFrameHref } from "../routes/pageContent.ts";
import { call, os, withIfMatch } from "./base.ts";

const leaseReply = (lease: RenderLease): PageRenderLease => ({
	lease: lease.id,
	frameUrl: renderFrameHref(lease.id),
	contentRoot: renderContentRoot(lease.id),
	nonce: lease.nonce,
	pageId: lease.pageId,
	version: lease.version,
	idleExpiresAt: lease.idleExpiresAt.toISOString(),
	absoluteExpiresAt: lease.absoluteExpiresAt.toISOString(),
});

export const pages = os.pages.router({
	upload: os.pages.upload.handler(({ context, input }) => call(context, "pages.upload", input)),
	list: os.pages.list.handler(({ context, input }) => call(context, "pages.list", input)),
	publish: os.pages.publish.handler(({ context, input }) => call(context, "pages.publish", input)),
	versions: os.pages.versions.handler(({ context, input }) => call(context, "pages.versions", input)),
	pull: os.pages.pull.handler(async ({ context, input }): Promise<PagePullOutput> => {
		const content = await call<PagePullContent>(context, "pages.pull", input);
		const grant = createArchiveGrant({
			pageId: content.page.id,
			version: content.version.number,
			filename: archiveFilename(content.page.slug, content.version.number),
			now: new Date(),
		});
		return { ...content, archiveUrl: archiveHref(grant.id), archiveExpiresAt: grant.expiresAt.toISOString() };
	}),
	// The lease authorizes the content route alone. It reaches no archive and
	// changes nothing, so a person who holds the address of a render frame
	// reads one version of one page and nothing else of Trellis.
	renderTicket: os.pages.renderTicket.handler(async ({ context, input }): Promise<PageRenderLease> => {
		const page = await call<PageDetail>(context, "pages.get", { page: input.page, version: input.version });
		return leaseReply(
			createRenderLease({
				pageId: page.id,
				version: page.requestedVersion.number,
				actor: context.actor!,
				now: new Date(),
			}),
		);
	}),
	// The actor middleware refuses a call without an actor header before this
	// handler runs, so `context.actor` holds the caller.
	renewRenderLease: os.pages.renewRenderLease.handler(({ context, input }): PageRenderLease => {
		const lease = renewRenderLease(input.lease, context.actor!, new Date());
		if (lease === undefined) throw fail("RENDER_LEASE_EXPIRED");
		return leaseReply(lease);
	}),
	get: os.pages.get.handler(async ({ context, input }) => {
		const page = await call<PageDetail>(context, "pages.get", input);
		context.resHeaders?.set("etag", `"${page.revision}"`);
		return page;
	}),
	update: os.pages.update.handler(({ context, input }) => call(context, "pages.update", withIfMatch(context, input))),
	pin: os.pages.pin.handler(({ context, input }) => call(context, "pages.pin", input)),
	delete: os.pages.delete.handler(({ context, input }) => call(context, "pages.delete", withIfMatch(context, input))),
	restore: os.pages.restore.handler(({ context, input }) =>
		call(context, "pages.restore", withIfMatch(context, input)),
	),
});
