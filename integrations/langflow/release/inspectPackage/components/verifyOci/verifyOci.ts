import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { PackageRecipe } from "../../../packageRecipe";
import type { PayloadFile } from "../../../payloadFiles";

const OciDescriptorSchema = z.object({
	mediaType: z.string(),
	digest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
	size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
const manifestType = "application/vnd.oci.image.manifest.v1+json";
const OciIndexSchema = z.object({ schemaVersion: z.literal(2), manifests: z.array(OciDescriptorSchema).length(1) });
const OciManifestSchema = z.object({
	schemaVersion: z.literal(2),
	mediaType: z.literal(manifestType),
	config: OciDescriptorSchema,
	layers: z.array(OciDescriptorSchema),
});

export async function verifyOci(root: string, target: PackageRecipe["target"], files: Map<string, PayloadFile>) {
	const required = new Set([`${target.layout}/oci-layout`, `${target.layout}/index.json`]);
	const json = async (path: string) => JSON.parse(await readFile(join(root, path), "utf8"));
	z.object({ imageLayoutVersion: z.literal("1.0.0") }).parse(await json(`${target.layout}/oci-layout`));
	const index = OciIndexSchema.parse(await json(`${target.layout}/index.json`));
	const image = index.manifests[0]!;
	if (image.digest !== target.imageDigest || image.mediaType !== manifestType) throw new Error("oci_image_mismatch");
	function blob(value: z.infer<typeof OciDescriptorSchema>) {
		const path = `${target.layout}/blobs/sha256/${value.digest.slice(7)}`;
		const saved = files.get(path);
		if (!saved || saved.sha256 !== value.digest.slice(7) || saved.sizeBytes !== value.size) {
			throw new Error(`oci_blob_mismatch: ${path}`);
		}
		required.add(path);
		return path;
	}
	const manifest = OciManifestSchema.parse(await json(blob(image)));
	if (manifest.config.mediaType !== "application/vnd.oci.image.config.v1+json") throw new Error("oci_config_type");
	const config = z
		.object({
			os: z.literal("linux"),
			architecture: z.enum(["arm64", "amd64"]),
			config: z.object({ User: z.string().regex(/^[1-9][0-9]*(?::[1-9][0-9]*)?$/) }),
		})
		.parse(await json(blob(manifest.config)));
	if (config.architecture !== (target.architecture === "x86_64" ? "amd64" : "arm64")) {
		throw new Error("oci_platform_mismatch");
	}
	for (const layer of manifest.layers) {
		if (!/^application\/vnd\.oci\.image\.layer\.v1\.tar(\+gzip|\+zstd)?$/.test(layer.mediaType)) {
			throw new Error("oci_layer_type");
		}
		blob(layer);
	}
	return required;
}
