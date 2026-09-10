// The git branch a ticket's work lives on: the identifier in lower case,
// then the title as a slug. The auto-link scan reads the identifier back
// from such a branch.
export const branchName = (identifier: string, title: string) => {
	const slug = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48)
		.replace(/-+$/, "");
	return slug === "" ? identifier.toLowerCase() : `${identifier.toLowerCase()}-${slug}`;
};
