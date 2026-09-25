import type { PageArchiveLink, PageDetail, PagePullOutput, PageRenderLease } from "@trellis/api";
import { fail } from "../errors.ts";
import {
	archiveFilename,
	archiveHref,
	createArchiveGrant,
	createRenderLease,
	type RenderLease,
	renderContentRoot,
	renderFrameHref,
	renewRenderLease,
} from "../pageLeases.ts";
import { call, os, withIfMatch } from "./base.ts";

const leaseReply = (lease: RenderLease): PageRenderLease => ({
	id: lease.id,
	nonce: lease.nonce,
	frameUrl: renderFrameHref(lease.id),
	contentRoot: renderContentRoot(lease.id),
	pageId: lease.pageId,
	version: lease.version,
	idleExpiresAt: lease.idleExpiresAt.toISOString(),
	absoluteExpiresAt: lease.absoluteExpiresAt.toISOString(),
});

export const pages = os.pages.router({
	upload: os.pages.upload.handler(({ context, input }) => call(context, "pages.upload", input)),
	list: os.pages.list.handler(({ context, input }) => call(context, "pages.list", input)),
	comments: os.pages.comments.handler(({ context, input }) => call(context, "pages.comments", input)),
	comment: os.pages.comment.handler(({ context, input }) => call(context, "pages.comment", input)),
	commentReply: os.pages.commentReply.handler(({ context, input }) => call(context, "pages.commentReply", input)),
	commentResolve: os.pages.commentResolve.handler(({ context, input }) => call(context, "pages.commentResolve", input)),
	commentEdit: os.pages.commentEdit.handler(({ context, input }) => call(context, "pages.commentEdit", input)),
	commentDelete: os.pages.commentDelete.handler(({ context, input }) => call(context, "pages.commentDelete", input)),
	publish: os.pages.publish.handler(({ context, input }) => call(context, "pages.publish", input)),
	versions: os.pages.versions.handler(({ context, input }) => call(context, "pages.versions", input)),
	pull: os.pages.pull.handler(({ context, input }) => call(context, "pages.pull", input)),
	archive: os.pages.archive.handler(async ({ context, input }): Promise<PageArchiveLink> => {
		const pulled = await call<PagePullOutput>(context, "pages.pull", input);
		const grant = createArchiveGrant({
			pageId: pulled.page.id,
			version: pulled.version.number,
			filename: archiveFilename(pulled.page.slug, pulled.version.number),
			now: new Date(),
		});
		return {
			pageId: pulled.page.id,
			version: pulled.version.number,
			url: archiveHref(grant.id),
			expiresAt: grant.expiresAt.toISOString(),
		};
	}),
	// The lease authorizes the content route alone. It reaches no archive and
	// changes nothing, so a person who holds the address of a render frame
	// reads one version of one page and nothing else of Trellis.
	// The actor middleware refuses a call without an actor header before this
	// handler runs, so `context.actor` holds the caller here and below.
	createRenderLease: os.pages.createRenderLease.handler(async ({ context, input }): Promise<PageRenderLease> => {
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
	renewRenderLease: os.pages.renewRenderLease.handler(({ context, input }): PageRenderLease => {
		const lease = renewRenderLease(input.leaseId, context.actor!, new Date());
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
