import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { z } from "zod";
import { payloadFiles } from "../../payloadFiles";

const [rootArg, architectureArg] = process.argv.slice(2);
if (!rootArg || !architectureArg || process.argv.length !== 4) {
	throw new Error("Usage: buildCandidate.ts PREPARED_ROOT arm64|x86_64");
}
const architecture = z.enum(["arm64", "x86_64"]).parse(architectureArg);
const root = resolve(rootArg);
if (!basename(root).startsWith("trellis-langflow-oci-")) throw new Error("candidate_root");
const context = join(root, "context");
const inputs = JSON.parse(await readFile(join(context, "inputs/build-input.json"), "utf8"));
const output = join(root, architecture);
await mkdir(output, { mode: 0o700 });
const platform = architecture === "arm64" ? "linux/arm64" : "linux/amd64";
const image = `trellis-langflow-candidate:${architecture}`;
const common = ["buildx", "build", "--platform", platform, "--provenance=false", "--sbom=false"];
function docker(args: string[]) {
	const result = spawnSync("docker", [...common, ...args, context], { stdio: "inherit" });
	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error(`docker_build_failed: ${result.status}`);
}
docker([
	"--target",
	"candidate",
	"--tag",
	image,
	"--metadata-file",
	join(output, "buildkit.json"),
	"--output",
	`type=oci,dest=${join(output, "oci-layout")},tar=false`,
]);
docker(["--target", "evidence", "--output", `type=local,dest=${join(output, "build-evidence")}`]);
const index = z
	.object({
		manifests: z
			.array(
				z.object({
					digest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
					mediaType: z.literal("application/vnd.oci.image.manifest.v1+json"),
				}),
			)
			.length(1),
	})
	.parse(JSON.parse(await readFile(join(output, "oci-layout/index.json"), "utf8")));
const layoutFiles = await payloadFiles(join(output, "oci-layout"));
const buildEvidence = await payloadFiles(join(output, "build-evidence"));
await writeFile(
	join(output, "candidate-build.json"),
	`${JSON.stringify(
		{
			schemaVersion: 1,
			qualification: "candidate",
			inputs,
			target: { kind: "linux-oci", architecture, image, imageDigest: index.manifests[0]!.digest, layout: "oci-layout" },
			layoutFiles,
			buildEvidence,
		},
		null,
		2,
	)}\n`,
	{ mode: 0o600 },
);
console.log(join(output, "candidate-build.json"));
