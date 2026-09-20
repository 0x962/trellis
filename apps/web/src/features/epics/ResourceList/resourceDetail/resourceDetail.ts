import { type Resource, shortDay } from "@trellis/api";
import { formatBytes } from "../../../attachments/utils/formatBytes";

// The words a row prints after the name of a resource. A doc names the day
// of its last edit and the actor who made it. A link names the host it
// opens and where it opens. An image and a file name their size.
//
// `resources.add` stores a url for every link and a blob for every image
// and file, so those two fields are read without a check.
export const resourceDetail = (resource: Resource): string => {
	if (resource.kind === "doc") {
		return `edited ${shortDay(resource.updatedAt)} by ${resource.actor.displayName ?? resource.actor.name}`;
	}
	if (resource.kind === "link") {
		return `${new URL(resource.url!).hostname} · opens in the in-app browser`;
	}
	return formatBytes(resource.blob!.size);
};
