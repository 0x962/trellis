import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
	HostTransferObjectSchema,
	type HostTransferClassification,
	type HostTransferDestination,
	type HostTransferObject,
} from "@trellis/api";
import { checksum } from "../checksum/index.ts";
import { destinationForPath, type PathMapping } from "../destinationForPath/index.ts";
import { scanPath } from "./components/scanPath/index.ts";

export type ObjectDraft = Record<string, unknown> & {
	sourcePath: string;
	classification: HostTransferClassification;
	secret: boolean;
	destination: HostTransferDestination;
};

const childDestination = (
	destination: HostTransferDestination,
	relativePath: string,
): HostTransferDestination =>
	destination.state === "excluded"
		? destination
		: { state: "mapped", path: relativePath === "" ? destination.path : join(destination.path, relativePath) };

const contains = (root: string, path: string) => {
	const child = relative(root, path);
	return child === "" || (!child.startsWith("..") && !isAbsolute(child));
};

const sourceRootForPath = (path: string, mappings: PathMapping[]) =>
	mappings
		.filter((mapping) => contains(mapping.source, path))
		.sort((left, right) => right.source.length - left.source.length)[0]?.source;

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
	const base = {
		id: `symlink:${checksum(sourcePath).slice(0, 24)}`,
		kind: "symlink" as const,
		sourcePath,
		bytes,
		sha256,
		secret,
		target,
	};
	if (destination.state === "excluded")
		return HostTransferObjectSchema.parse({
			...base,
			classification,
			destination,
			destinationTarget: null,
		});

	const targetPath = resolve(dirname(sourcePath), target);
	const sourceRoot = sourceRootForPath(sourcePath, mappings);
	if (!isAbsolute(target) && (sourceRoot === undefined || !contains(sourceRoot, targetPath)))
		return HostTransferObjectSchema.parse({
			...base,
			classification: "unsupported",
			destination: {
				state: "excluded",
				reason: `The relative symlink target leaves its mapped source: ${target}`,
			},
			destinationTarget: null,
		});

	const targetDestination = destinationForPath(targetPath, mappings);
	if (targetDestination?.state !== "mapped")
		return HostTransferObjectSchema.parse({
			...base,
			classification: "unsupported",
			destination:
				targetDestination ?? {
					state: "excluded",
					reason: `The symlink target has no destination mapping: ${target}`,
				},
			destinationTarget: null,
		});

	const destinationTarget = isAbsolute(target)
		? targetDestination.path
		: relative(dirname(destination.path), targetDestination.path) || ".";
	return HostTransferObjectSchema.parse({
		...base,
		classification: destinationTarget === target ? "portable" : "remappable",
		destination,
		destinationTarget,
	});
};

export const appendScannedObjects = async (
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
