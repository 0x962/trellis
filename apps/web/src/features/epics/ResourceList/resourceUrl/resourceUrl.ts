import type { Resource } from "@trellis/api";

export const resourceUrl = (resource: Resource): string =>
	resource.kind === "link" ? resource.url! : resource.blob!.url;
