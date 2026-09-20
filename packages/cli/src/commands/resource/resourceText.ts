import type { Resource } from "@trellis/api";
import { cell, type ListSpec, type RecordSpec } from "../../output.ts";

const sourceOf = (resource: Resource): string => {
	switch (resource.kind) {
		case "doc":
			return cell(resource.body);
		case "link":
			return cell(resource.url);
		case "image":
		case "file":
			return cell(resource.blob?.url);
	}
};

const pullRequestOf = (resource: Resource): string =>
	resource.pullRequestNumber === null ? "-" : `#${resource.pullRequestNumber}`;

const resourceColumns = [
	{ name: "kind", value: (resource: Resource) => resource.kind },
	{ name: "name", value: (resource: Resource) => cell(resource.name) },
	{ name: "source", value: sourceOf },
	{ name: "pullRequest", value: pullRequestOf },
];

export const resourceList: ListSpec<Resource> = {
	columns: resourceColumns,
	identifier: (resource) => resource.id,
};

export const resourceRecord: RecordSpec<Resource> = {
	fields: [{ name: "id", value: (resource) => resource.id }, ...resourceColumns],
	identifier: (resource) => resource.id,
};
