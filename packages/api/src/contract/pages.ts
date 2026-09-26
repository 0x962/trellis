import { z } from "zod";
import { pickErrors } from "../errors.ts";
import {
	PageDeleteInputSchema,
	PageDetailSchema,
	PageGetInputSchema,
	PageListInputSchema,
	PageListOutputSchema,
	PagePinInputSchema,
	PagePinOutputSchema,
	PageRestoreInputSchema,
	PageSummarySchema,
	PageUpdateInputSchema,
	PageUploadInputSchema,
	PageUploadSchema,
} from "../schemas/page.ts";
import {
	PageCommentCreateInputSchema,
	PageCommentDeleteOutputSchema,
	PageCommentEditInputSchema,
	PageCommentIdInputSchema,
	PageCommentListInputSchema,
	PageCommentReplyInputSchema,
	PageCommentResolveInputSchema,
	PageCommentThreadSchema,
} from "../schemas/pageComment.ts";
import {
	PageArchiveInputSchema,
	PageArchiveLinkSchema,
	PagePublishInputSchema,
	PagePublishOutputSchema,
	PagePullInputSchema,
	PagePullOutputSchema,
	PageRenderCreateInputSchema,
	PageRenderLeaseSchema,
	PageRenderRenewInputSchema,
	PageVersionListInputSchema,
	PageVersionListOutputSchema,
} from "../schemas/pageVersion.ts";
import { base } from "./base.ts";

const revisionErrors = pickErrors(["PROJECT_ARCHIVED", "PAGE_VERSION_CONFLICT"]);

export const pages = {
	upload: base
		.errors(pickErrors(["DUPLICATE", "PAYLOAD_TOO_LARGE", "PROJECT_ARCHIVED"]))
		.route({
			method: "POST",
			path: "/page-uploads",
			successStatus: 200,
			summary: "Stage a Page file as multipart form data",
		})
		.input(PageUploadInputSchema)
		.output(PageUploadSchema),
	list: base
		.errors(pickErrors(["INVALID_CURSOR"]))
		.route({ method: "GET", path: "/pages", summary: "List the pages of a project" })
		.input(PageListInputSchema)
		.output(PageListOutputSchema),
	comments: base
		.errors(pickErrors(["PAGE_DELETED"]))
		.route({ method: "GET", path: "/page-comment-threads/{+page}", summary: "List every comment thread of a page" })
		.input(PageCommentListInputSchema)
		.output(z.array(PageCommentThreadSchema)),
	comment: base
		.errors(pickErrors(["PROJECT_ARCHIVED", "PAGE_DELETED"]))
		.route({
			method: "POST",
			path: "/page-comment-threads/{+page}",
			successStatus: 201,
			summary: "Comment on one version of a page",
		})
		.input(PageCommentCreateInputSchema)
		.output(PageCommentThreadSchema),
	commentReply: base
		.errors(pickErrors(["PROJECT_ARCHIVED", "PAGE_DELETED"]))
		.route({
			method: "POST",
			path: "/page-comment-threads/{thread}/replies",
			successStatus: 201,
			summary: "Reply to a page comment",
		})
		.input(PageCommentReplyInputSchema)
		.output(PageCommentThreadSchema),
	commentResolve: base
		.errors(pickErrors(["PROJECT_ARCHIVED", "PAGE_DELETED"]))
		.route({
			method: "PATCH",
			path: "/page-comment-threads/{thread}",
			summary: "Resolve or reopen a page comment thread",
		})
		.input(PageCommentResolveInputSchema)
		.output(PageCommentThreadSchema),
	commentEdit: base
		.errors(pickErrors(["PROJECT_ARCHIVED", "PAGE_DELETED"]))
		.route({ method: "PATCH", path: "/page-comments/{id}", summary: "Edit your own page comment" })
		.input(PageCommentEditInputSchema)
		.output(PageCommentThreadSchema),
	commentDelete: base
		.errors(pickErrors(["PROJECT_ARCHIVED", "PAGE_DELETED"]))
		.route({ method: "DELETE", path: "/page-comments/{id}", summary: "Delete your own page comment" })
		.input(PageCommentIdInputSchema)
		.output(PageCommentDeleteOutputSchema),
	publish: base
		.errors(revisionErrors)
		.errors(pickErrors(["DUPLICATE"]))
		.route({ method: "POST", path: "/pages/publish", successStatus: 201, summary: "Publish an immutable page version" })
		.input(PagePublishInputSchema)
		.output(PagePublishOutputSchema),
	renewRenderLease: base
		.errors(pickErrors(["RENDER_LEASE_EXPIRED"]))
		.route({ method: "POST", path: "/page-render-leases/renew", summary: "Extend the idle limit of a render lease" })
		.input(PageRenderRenewInputSchema)
		.output(PageRenderLeaseSchema),
	versions: base
		.errors(pickErrors(["INVALID_CURSOR"]))
		.route({ method: "GET", path: "/pages/versions/{+page}", summary: "List the versions of a page" })
		.input(PageVersionListInputSchema)
		.output(PageVersionListOutputSchema),
	pull: base
		.route({ method: "GET", path: "/pages/pull/{+page}", summary: "Read one page version and its assets" })
		.input(PagePullInputSchema)
		.output(PagePullOutputSchema),
	// `archive` and `createRenderLease` each mint an address that carries its
	// own authorization, so both change the server and neither answers a GET.
	archive: base
		.route({
			method: "POST",
			path: "/pages/archive/{+page}",
			successStatus: 201,
			summary: "Create a download link for one page version",
		})
		.input(PageArchiveInputSchema)
		.output(PageArchiveLinkSchema),
	createRenderLease: base
		.route({
			method: "POST",
			path: "/pages/render/{+page}",
			successStatus: 201,
			summary: "Create a render lease for one page version",
		})
		.input(PageRenderCreateInputSchema)
		.output(PageRenderLeaseSchema),
	restore: base
		.errors(revisionErrors)
		.errors(pickErrors(["AGENT_CANNOT_DELETE"]))
		.route({ method: "POST", path: "/pages/restore/{+page}", summary: "Restore a retained page" })
		.input(PageRestoreInputSchema)
		.output(PageSummarySchema),
	pin: base
		.errors(pickErrors(["PROJECT_ARCHIVED"]))
		.route({ method: "PUT", path: "/pages/pin/{+page}", summary: "Set the current actor's page pin" })
		.input(PagePinInputSchema)
		.output(PagePinOutputSchema),
	// `{+page}` matches the slashes of `KEY/pages/slug`. No path segment can
	// follow it, so `versions`, `pull`, `archive`, `createRenderLease`,
	// `restore`, `pin`, and the comment routes put their fixed segment before
	// the Page ref.
	get: base
		.route({ method: "GET", path: "/pages/{+page}", summary: "Read a page and one version" })
		.input(PageGetInputSchema)
		.output(PageDetailSchema),
	update: base
		.errors(revisionErrors)
		.route({ method: "PATCH", path: "/pages/{+page}", summary: "Change the title or summary of a page" })
		.input(PageUpdateInputSchema)
		.output(PageSummarySchema),
	delete: base
		.errors(revisionErrors)
		.errors(pickErrors(["AGENT_CANNOT_DELETE"]))
		.route({ method: "DELETE", path: "/pages/{+page}", summary: "Soft-delete a page for 30 days" })
		.input(PageDeleteInputSchema)
		.output(PageSummarySchema),
};
