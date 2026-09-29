import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { canonicalBytes } from "../canonicalBytes";
import type { PackageRecipe } from "../packageRecipe";

export async function packageFixture(architecture: "arm64" | "x86_64" = "arm64") {
	const root = await mkdtemp(join(tmpdir(), "trellis-package-"));
	const staging = join(root, "staging");
	async function file(path: string, content: string) {
		await mkdir(dirname(join(staging, path)), { recursive: true });
		await writeFile(join(staging, path), content);
		return { path, sha256: createHash("sha256").update(content).digest("hex"), sizeBytes: Buffer.byteLength(content) };
	}
	async function blob(value: unknown, mediaType: string) {
		const content = JSON.stringify(value);
		const digest = createHash("sha256").update(content).digest("hex");
		const saved = await file(`image/blobs/sha256/${digest}`, content);
		return { digest: `sha256:${digest}`, size: saved.sizeBytes, mediaType };
	}
	const config = await blob(
		{ os: "linux", architecture: architecture === "arm64" ? "arm64" : "amd64", config: { User: "10001:10001" } },
		"application/vnd.oci.image.config.v1+json",
	);
	const layer = await blob("synthetic layer", "application/vnd.oci.image.layer.v1.tar+gzip");
	const image = await blob(
		{ schemaVersion: 2, mediaType: "application/vnd.oci.image.manifest.v1+json", config, layers: [layer] },
		"application/vnd.oci.image.manifest.v1+json",
	);
	await file("image/oci-layout", JSON.stringify({ imageLayoutVersion: "1.0.0" }));
	await file("image/index.json", JSON.stringify({ schemaVersion: 2, manifests: [image] }));
	const patch = { ...(await file("patches/backend.patch", "fixture patch")), id: "backend", order: 0, directory: "." };
	const recipe: PackageRecipe = {
		schemaVersion: 1,
		qualification: "candidate",
		source: {
			repository: "https://github.com/langflow-ai/langflow.git",
			tag: "v1.12.3",
			commit: "fec71dca901949c09ed4d63315804337cd2eb13d",
			tree: "e6ac634257b30645b6c35bcc707ed271789877d6",
			archive: await file("source.tar", "fixture source"),
		},
		patchSet: {
			sha256: createHash("sha256")
				.update(canonicalBytes([patch]))
				.digest("hex"),
			patches: [patch],
		},
		lock: { ...(await file("uv.lock", "fixture lock")), pythonRequirement: ">=3.10,<3.15" },
		dependencies: await file("dependencies.txt", "fixture inventory"),
		components: {
			catalog: await file("components.json", "fixture catalog"),
			entries: [{ id: "trellis.native", source: await file("components/native.py", "fixture component") }],
		},
		python: { implementation: "CPython", version: "3.12.12", abi: "cp312" },
		target: { kind: "linux-oci", architecture, image: "trellis-langflow", imageDigest: image.digest, layout: "image" },
		editor: {
			root: "editor",
			assets: [await file("editor/index.html", "fixture editor")],
			lock: await file("package-lock.json", "fixture frontend lock"),
		},
		license: { spdx: "MIT", file: await file("LICENSE", "fixture notice") },
	};
	return { root, staging, recipe, layer, file };
}
