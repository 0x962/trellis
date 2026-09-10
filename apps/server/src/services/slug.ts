import { invalidInput } from "../errors.ts";

// The slug of a name: lower case, every run of other characters becomes one
// dash, no dash at either end. "Web Auth" gives "web-auth"; "Done!" gives
// "done". A name with no letter or digit gives no slug at all, which the
// slug CHECK refuses, so the caller gets a validation error instead.
export const deriveSlug = (name: string) => {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	if (slug === "")
		throw invalidInput(
			"slug",
			"trellis cannot create a slug from the name. Use at least one letter or digit in the name.",
		);
	return slug;
};
