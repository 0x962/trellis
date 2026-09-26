import { pickErrors } from "../errors.ts";
import { InternalLinkResolveInputSchema, InternalLinkResolveOutputSchema } from "../schemas/internalLink.ts";
import { base } from "./base.ts";

export const internalLinks = {
	resolve: base
		.errors(pickErrors(["PAGE_DELETED"]))
		.route({ method: "GET", path: "/internal-links/resolve", summary: "Resolve a stable Trellis record link" })
		.input(InternalLinkResolveInputSchema)
		.output(InternalLinkResolveOutputSchema),
};
