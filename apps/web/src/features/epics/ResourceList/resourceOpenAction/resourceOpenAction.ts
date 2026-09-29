import type { Resource } from "@trellis/api";

export type ResourceOpenAction = "doc" | "link" | "image-sheet" | "image-tab" | "download";

export const resourceOpenAction = (resource: Resource, desktop: boolean): ResourceOpenAction => {
	if (resource.kind === "doc") return "doc";
	if (resource.kind === "link") return "link";
	if (resource.kind === "image") return desktop ? "image-sheet" : "image-tab";
	return "download";
};
