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
} from "../schemas/page.ts";
import { base } from "./base.ts";

const revisionErrors = pickErrors(["PROJECT_ARCHIVED", "PAGE_VERSION_CONFLICT"]);

export const pages = {
	list: base
		.errors(pickErrors(["INVALID_CURSOR"]))
		.route({ method: "GET", path: "/pages", summary: "List the pages of a project" })
		.input(PageListInputSchema)
		.output(PageListOutputSchema),
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
	// follow it, so `restore` and `pin` put fixed segments before their Page refs.
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
