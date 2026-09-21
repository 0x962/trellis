import type { Resource } from "@trellis/api";

export type ResourceOpenAction = "doc-sheet" | "link-sheet" | "image-sheet" | "new-tab" | "download";

export const resourceOpenAction = (resource: Resource, desktop: boolean): ResourceOpenAction => {
	if (resource.kind === "doc") return "doc-sheet";
	if (resource.kind === "link") return desktop ? "link-sheet" : "new-tab";
	if (resource.kind === "image") return desktop ? "image-sheet" : "new-tab";
	return "download";
};
