import { type Resource, shortDay } from "@trellis/api";
import { formatBytes } from "../../../attachments/utils/formatBytes";

// `resources.add` stores a url for every link and a blob for every image and
// file, so those two fields are read without a check.
export const resourceDetail = (resource: Resource): string => {
	if (resource.kind === "doc") {
		return `Edited ${shortDay(resource.updatedAt)} by ${resource.actor.displayName ?? resource.actor.name}`;
	}
	if (resource.kind === "link") {
		return new URL(resource.url!).hostname;
	}
	return formatBytes(resource.blob!.size);
};
