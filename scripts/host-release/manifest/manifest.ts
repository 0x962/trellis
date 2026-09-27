import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, readFile, readlink, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
	HostReleaseManifestSchema,
	type HostReleaseFile,
	type HostReleaseManifest,
	type HostReleaseManifestSource,
} from "@trellis/api";

export const HOST_RELEASE_MANIFEST_FILE = "release.json";

const inside = (root: string, path: string) => {
	const suffix = relative(root, path);
	return suffix !== ".." && !suffix.startsWith("../") && !isAbsolute(suffix);
};

const hashFile = async (path: string): Promise<string> => {
	const hash = createHash("sha256");
	for await (const chunk of createReadStream(path)) hash.update(chunk);
	return hash.digest("hex");
};

export const collectHostReleaseFiles = async (root: string): Promise<HostReleaseFile[]> => {
	const canonical = await realpath(root);
	const files: HostReleaseFile[] = [];
	const visit = async (directory: string) => {
		for (const name of (await readdir(directory)).sort()) {
			const path = join(directory, name);
			if (directory === canonical && name === HOST_RELEASE_MANIFEST_FILE) continue;
			const stat = await lstat(path);
			const releasePath = relative(canonical, path);
			if (stat.isSymbolicLink()) {
				const target = await readlink(path);
				if (isAbsolute(target) || !inside(canonical, resolve(dirname(path), target)))
					throw new Error(`The release link points outside the bundle: ${releasePath}`);
				if (!inside(canonical, await realpath(path)))
					throw new Error(`The release link resolves outside the bundle: ${releasePath}`);
				files.push({
					path: releasePath,
					type: "symlink",
					sha256: createHash("sha256").update(target).digest("hex"),
					size: Buffer.byteLength(target),
					executable: false,
				});
			} else if (stat.isDirectory()) {
				await visit(path);
			} else if (stat.isFile()) {
				files.push({
					path: releasePath,
					type: "file",
					sha256: await hashFile(path),
					size: stat.size,
					executable: Boolean(stat.mode & 0o111),
				});
			} else {
				throw new Error(`The release contains an unsupported file: ${releasePath}`);
			}
		}
	};
	await visit(canonical);
	return files.sort((left, right) => left.path.localeCompare(right.path));
};

export const hostReleaseId = (source: HostReleaseManifestSource): string =>
	createHash("sha256").update(JSON.stringify(source)).digest("hex");

export const writeHostReleaseManifest = async (
	root: string,
	source: Omit<HostReleaseManifestSource, "files">,
): Promise<HostReleaseManifest> => {
	const manifestSource = { ...source, files: await collectHostReleaseFiles(root) };
	const manifest = HostReleaseManifestSchema.parse({ ...manifestSource, releaseId: hostReleaseId(manifestSource) });
	await writeFile(join(root, HOST_RELEASE_MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
	return manifest;
};

export type HostReleaseVerificationIssue = {
	path: string;
	kind: "missing" | "unexpected" | "altered";
};

export type HostReleaseVerification = {
	ok: boolean;
	releaseId: string;
	issues: HostReleaseVerificationIssue[];
};

export const readHostReleaseManifest = async (root: string): Promise<HostReleaseManifest> =>
	HostReleaseManifestSchema.parse(JSON.parse(await readFile(join(root, HOST_RELEASE_MANIFEST_FILE), "utf8")));

export const verifyHostRelease = async (root: string): Promise<HostReleaseVerification> => {
	const manifest = await readHostReleaseManifest(root);
	const actualFiles = await collectHostReleaseFiles(root);
	const expected = new Map(manifest.files.map((file) => [file.path, file]));
	const actual = new Map(actualFiles.map((file) => [file.path, file]));
	const issues: HostReleaseVerificationIssue[] = [];
	for (const file of manifest.files) {
		const observed = actual.get(file.path);
		if (!observed) issues.push({ path: file.path, kind: "missing" });
		else if (
			observed.type !== file.type ||
			observed.sha256 !== file.sha256 ||
			observed.size !== file.size ||
			observed.executable !== file.executable
		)
			issues.push({ path: file.path, kind: "altered" });
	}
	for (const file of actualFiles) {
		if (!expected.has(file.path)) issues.push({ path: file.path, kind: "unexpected" });
	}
	for (const path of Object.values(manifest.entrypoints)) {
		const file = expected.get(path);
		if (!file) issues.push({ path, kind: "missing" });
		else if (file.type !== "file" || !file.executable) issues.push({ path, kind: "altered" });
	}
	const { releaseId, ...source } = manifest;
	if (hostReleaseId(source) !== releaseId)
		issues.push({ path: HOST_RELEASE_MANIFEST_FILE, kind: "altered" });
	return { ok: issues.length === 0, releaseId, issues };
};
