import { pickErrors } from "../errors.ts";
import {
	PageDeleteInputSchema,
	PageDetailSchema,
	PageGetInputSchema,
	PageListInputSchema,
	PageListOutputSchema,
	PagePinInputSchema,
	PagePinOutputSchema,
	PagePublishInputSchema,
	PagePublishOutputSchema,
	PagePullInputSchema,
	PagePullOutputSchema,
	PageRenderLeaseSchema,
	PageRenderRenewInputSchema,
	PageRenderTicketInputSchema,
	PageRestoreInputSchema,
	PageSummarySchema,
	PageUpdateInputSchema,
	PageUploadInputSchema,
	PageUploadSchema,
	PageVersionListInputSchema,
	PageVersionListOutputSchema,
} from "../schemas/page.ts";
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
	publish: base
		.errors(revisionErrors)
		.errors(pickErrors(["DUPLICATE"]))
		.route({ method: "POST", path: "/pages/publish", successStatus: 200, summary: "Publish an immutable page version" })
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
		.route({ method: "GET", path: "/pages/pull/{+page}", summary: "Read one page version and its archive link" })
		.input(PagePullInputSchema)
		.output(PagePullOutputSchema),
	renderTicket: base
		.route({ method: "POST", path: "/pages/render/{+page}", summary: "Create a render lease for one page version" })
		.input(PageRenderTicketInputSchema)
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
	// follow it, so `versions`, `pull`, `renderTicket`, `restore`, and `pin`
	// put their fixed segment before the Page ref.
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
