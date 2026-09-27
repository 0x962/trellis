import type { Resource } from "@trellis/api";

export const linkedResourceOpener = () => {
	let opened: string | undefined;
	return (id: string | undefined, resources: readonly Resource[], open: (id: string) => void) => {
		if (id === undefined || id === "") {
			opened = undefined;
			return;
		}
		const resource = resources.find((item) => item.id === id);
		if (resource === undefined || opened === id) return;
		opened = id;
		if (resource.kind !== "doc") open(id);
	};
};
