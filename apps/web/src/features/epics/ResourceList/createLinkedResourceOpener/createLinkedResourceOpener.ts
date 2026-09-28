import type { Resource } from "@trellis/api";

export const createLinkedResourceOpener = () => {
	let opened: string | undefined;
	return (id: string | undefined, resource: Resource | undefined, open: (resource: Resource) => void) => {
		if (id === undefined || id === "") {
			opened = undefined;
			return;
		}
		if (resource?.id !== id || opened === id) return;
		opened = id;
		if (resource.kind !== "doc") open(resource);
	};
};
