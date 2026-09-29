import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { payloadFiles } from "../../payloadFiles";

const commit = "fec71dca901949c09ed4d63315804337cd2eb13d";
const tree = "e6ac634257b30645b6c35bcc707ed271789877d6";
const lockSha256 = "05a1b07666e3342047587c8bf0badb42ac46ec2680b56da9ca9a65da03b941f8";
const assetManifestSha256 = "0fac70e2c411ad288be1161a03b7062bcf78633c93b7ad8d4381f95cac880748";
const oci = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repository = resolve(oci, "../../../..");
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const RelativePathSchema = z
	.string()
	.refine(
		(path) =>
			!path.startsWith("/") &&
			!path.includes("\\") &&
			!path.includes("\0") &&
			path.split("/").every((part) => part !== "" && part !== "." && part !== ".."),
	);
const PatchSeriesSchema = z.object({
	upstream: z.object({ commit: z.literal(commit), tree: z.literal(tree) }),
	patches: z.array(
		z.object({
			name: z.string(),
			path: RelativePathSchema,
			sha256: z.string().regex(/^[0-9a-f]{64}$/),
			directory: z.union([z.literal("."), RelativePathSchema]),
		}),
	),
});

const [sourceArg, editorArg, assetManifestArg] = process.argv.slice(2);
if (!sourceArg || !editorArg || !assetManifestArg || process.argv.length !== 5) {
	throw new Error("Usage: prepareCandidate.ts SOURCE EDITOR_ASSETS EDITOR_HASH_MANIFEST");
}
const source = resolve(sourceArg);
const editor = resolve(editorArg);
const git = (...args: string[]) => execFileSync("git", ["-C", source, ...args], { encoding: "utf8" }).trim();
async function verifySource() {
	if (git("rev-parse", "HEAD") !== commit || git("rev-parse", "HEAD^{tree}") !== tree)
		throw new Error("upstream_identity");
	if (git("status", "--porcelain", "--untracked-files=all") !== "") throw new Error("upstream_dirty");
	if (sha256(await readFile(join(source, "uv.lock"))) !== lockSha256) throw new Error("upstream_lock");
}
await verifySource();
const seriesBytes = await readFile(join(repository, "integrations/langflow/patches/series.json"));
const series = PatchSeriesSchema.parse(JSON.parse(seriesBytes.toString("utf8")));
if (
	series.patches.find((patch) => patch.name === "editor")?.sha256 !==
	"ec23fcc90f8e9799c323716a453ca52f5b4438cf3d0734b3908e1291c179d5d1"
)
	throw new Error("editor_patch_identity");
const manifestBytes = await readFile(assetManifestArg);
if (sha256(manifestBytes) !== assetManifestSha256) throw new Error("editor_manifest_identity");
const expectedAssets = new Map<string, string>();
for (const line of manifestBytes.toString("utf8").trim().split("\n")) {
	const match = /^([0-9a-f]{64}) {2}build\/(.+)$/.exec(line);
	if (!match) throw new Error("editor_manifest_format");
	const path = RelativePathSchema.parse(match[2]);
	if (expectedAssets.has(path)) throw new Error("editor_manifest_duplicate");
	expectedAssets.set(path, match[1]!);
}
const assets = await payloadFiles(editor);
if (assets.length !== expectedAssets.size || !expectedAssets.has("index.html")) throw new Error("editor_inventory");
for (const asset of assets) {
	if (expectedAssets.get(asset.path) !== asset.sha256) throw new Error(`editor_asset: ${asset.path}`);
}
const patches = await Promise.all(
	series.patches.map(async (patch) => {
		const bytes = await readFile(join(repository, patch.path));
		if (sha256(bytes) !== patch.sha256) throw new Error(`patch_digest: ${patch.name}`);
		return { ...patch, bytes };
	}),
);
const root = await mkdtemp(join(tmpdir(), "trellis-langflow-oci-"));
console.error(`Candidate files and cleanup owner: ${root}`);
const context = join(root, "context");
const preparedSource = join(context, "source");
const inputs = join(context, "inputs");
await mkdir(preparedSource, { recursive: true, mode: 0o700 });
await mkdir(inputs, { mode: 0o700 });
const archive = join(inputs, "upstream.tar");
execFileSync("git", ["-C", source, "archive", "--format=tar", `--output=${archive}`, commit]);
execFileSync("tar", ["-xf", archive, "-C", preparedSource]);
const patchRecords = [];
for (const [order, patch] of patches.entries()) {
	const file = `patch-${order}.patch`;
	await writeFile(join(inputs, file), patch.bytes, { mode: 0o600 });
	const directory = patch.directory === "." ? [] : [`--directory=${patch.directory}`];
	execFileSync("git", ["apply", ...directory, join(inputs, file)], { cwd: preparedSource });
	patchRecords.push({ name: patch.name, directory: patch.directory, sha256: patch.sha256, file });
}
if (sha256(await readFile(join(preparedSource, "uv.lock"))) !== lockSha256) throw new Error("patched_lock_changed");
for (const asset of assets) {
	const output = join(context, "editor", asset.path);
	await mkdir(dirname(output), { recursive: true, mode: 0o700 });
	await copyFile(join(editor, asset.path), output);
	if (sha256(await readFile(output)) !== asset.sha256) throw new Error(`editor_copy: ${asset.path}`);
}
await copyFile(join(preparedSource, "LICENSE"), join(inputs, "LICENSE"));
await copyFile(join(preparedSource, "uv.lock"), join(inputs, "uv.lock"));
await copyFile(join(preparedSource, "src/frontend/package-lock.json"), join(inputs, "editor-package-lock.json"));
await writeFile(join(inputs, "series.json"), seriesBytes, { mode: 0o600 });
await writeFile(join(inputs, "editor-build-files.sha256"), manifestBytes, { mode: 0o600 });
const builderSources = [];
for (const file of ["Dockerfile", "entrypoint.sh"]) {
	await copyFile(join(oci, file), join(context, file));
	builderSources.push({ path: file, sha256: sha256(await readFile(join(context, file))) });
}
await verifySource();
await writeFile(
	join(inputs, "build-input.json"),
	`${JSON.stringify(
		{
			schemaVersion: 1,
			qualification: "candidate",
			source: { commit, tree, archiveSha256: sha256(await readFile(archive)) },
			lockSha256,
			seriesSha256: sha256(seriesBytes),
			patches: patchRecords,
			builderSources,
			editor: { qualification: "fixture", manifestSha256: assetManifestSha256, assets },
		},
		null,
		2,
	)}\n`,
	{ mode: 0o600 },
);
console.log(root);
