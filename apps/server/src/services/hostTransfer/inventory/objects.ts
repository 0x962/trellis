import { createHash } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
	HostTransferObjectSchema,
	type HostTransferClassification,
	type HostTransferDestination,
	type HostTransferObject,
} from "../../../../../../packages/api/src/hostTransfer/index.ts";
import { scanPath } from "./scanPath.ts";

export type PathMapping = { source: string; destination: HostTransferDestination };

export type ObjectDraft = Record<string, unknown> & {
	sourcePath: string;
	classification: HostTransferClassification;
	secret: boolean;
	destination: HostTransferDestination;
};

export const checksum = (value: string) => createHash("sha256").update(value).digest("hex");

const destinationOrder = (destination: HostTransferDestination) => (destination.state === "excluded" ? 0 : 1);

export const destinationForPath = (path: string, mappings: PathMapping[]): HostTransferDestination | null => {
	const match = mappings
		.filter((mapping) => {
			const child = relative(mapping.source, path);
			return child === "" || (!child.startsWith("..") && !isAbsolute(child));
		})
		.sort(
			(left, right) =>
				right.source.length - left.source.length || destinationOrder(left.destination) - destinationOrder(right.destination),
		)[0];
	if (!match) return null;
	if (match.destination.state === "excluded") return match.destination;
	const child = relative(match.source, path);
	return {
		state: "mapped",
		path: child === "" ? match.destination.path : join(match.destination.path, child),
	};
};

const childDestination = (
	destination: HostTransferDestination,
	relativePath: string,
): HostTransferDestination =>
	destination.state === "excluded"
		? destination
		: { state: "mapped", path: relativePath === "" ? destination.path : join(destination.path, relativePath) };

const symlinkObject = (
	sourcePath: string,
	target: string,
	bytes: number,
	sha256: string,
	destination: HostTransferDestination,
	classification: HostTransferClassification,
	secret: boolean,
	mappings: PathMapping[],
): HostTransferObject => {
	if (destination.state === "excluded")
		return HostTransferObjectSchema.parse({
			id: `symlink:${checksum(sourcePath).slice(0, 24)}`,
			kind: "symlink",
			sourcePath,
			classification,
			bytes,
			sha256,
			secret,
			destination,
			target,
			destinationTarget: null,
		});
	if (!isAbsolute(target))
		return HostTransferObjectSchema.parse({
			id: `symlink:${checksum(sourcePath).slice(0, 24)}`,
			kind: "symlink",
			sourcePath,
			classification: "portable",
			bytes,
			sha256,
			secret,
			destination,
			target,
			destinationTarget: target,
		});
	const targetDestination = destinationForPath(resolve(dirname(sourcePath), target), mappings);
	const destinationTarget = targetDestination?.state === "mapped" ? targetDestination.path : null;
	return HostTransferObjectSchema.parse({
		id: `symlink:${checksum(sourcePath).slice(0, 24)}`,
		kind: "symlink",
		sourcePath,
		classification: destinationTarget === null ? "unsupported" : "remappable",
		bytes,
		sha256,
		secret,
		destination:
			destinationTarget === null
				? targetDestination?.state === "excluded"
					? targetDestination
					: { state: "excluded", reason: `The absolute symlink target has no destination mapping: ${target}` }
				: destination,
		target,
		destinationTarget,
	});
};

export const appendScannedObject = async (
	objects: HostTransferObject[],
	draft: ObjectDraft,
	mappings: PathMapping[],
	symlinkSources: Set<string>,
	excludedPaths: ReadonlySet<string> = new Set(),
) => {
	const scanned = await scanPath(draft.sourcePath, excludedPaths);
	objects.push(HostTransferObjectSchema.parse({ ...draft, bytes: scanned.bytes, sha256: scanned.sha256 }));
	for (const symlink of scanned.symlinks) {
		const sourcePath = symlink.relativePath === "" ? draft.sourcePath : join(draft.sourcePath, symlink.relativePath);
		if (symlinkSources.has(sourcePath)) continue;
		symlinkSources.add(sourcePath);
		objects.push(
			symlinkObject(
				sourcePath,
				symlink.target,
				symlink.bytes,
				symlink.sha256,
				childDestination(draft.destination, symlink.relativePath),
				draft.classification,
				draft.secret,
				mappings,
			),
		);
	}
};
