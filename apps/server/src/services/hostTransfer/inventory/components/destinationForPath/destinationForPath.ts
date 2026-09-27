import { isAbsolute, join, relative } from "node:path";
import type { HostTransferDestination } from "@trellis/api";

export type PathMapping = { source: string; destination: HostTransferDestination };

const destinationOrder = (destination: HostTransferDestination) => (destination.state === "excluded" ? 0 : 1);

export const destinationForPath = (path: string, mappings: PathMapping[]): HostTransferDestination | null => {
	const match = mappings
		.filter((mapping) => {
			const child = relative(mapping.source, path);
			return child === "" || (!child.startsWith("..") && !isAbsolute(child));
		})
		.sort(
			(left, right) =>
				right.source.length - left.source.length ||
				destinationOrder(left.destination) - destinationOrder(right.destination),
		)[0];
	if (!match) return null;
	if (match.destination.state === "excluded") return match.destination;
	const child = relative(match.source, path);
	return {
		state: "mapped",
		path: child === "" ? match.destination.path : join(match.destination.path, child),
	};
};
