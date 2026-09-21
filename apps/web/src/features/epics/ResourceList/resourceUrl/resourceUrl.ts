import type { Resource } from "@trellis/api";

// `resources.add` stores a url for a link, and a blob for an image and a file.
// A doc keeps its text in the record and has no address, so a doc row opens
// nothing.
export const resourceUrl = (resource: Resource): string | null => {
	if (resource.kind === "doc") return null;
	if (resource.kind === "link") return resource.url;
	return resource.blob!.url;
};
