import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
	type LangflowSidecarManifestV1,
	LangflowSidecarManifestV1Schema,
} from "../../../../../../integrations/langflow/package-probe/sidecarManifest";
import {
	type CandidatePackage,
	loadCandidatePackage,
} from "../../../../../../integrations/langflow/release";
import { type OciCommandResult, runOciCommand } from "../process/process";

const Sha256DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const ImageInspectionSchema = z
	.array(
		z.object({
			Id: Sha256DigestSchema,
			Architecture: z.enum(["arm64", "amd64"]),
			Os: z.literal("linux"),
		}),
	)
	.length(1);

export type QualifiedOciPackage = {
	readonly candidate: CandidatePackage;
	readonly manifest: LangflowSidecarManifestV1;
	readonly qualificationSha256: string;
};

export type ImportedOciImage = {
	readonly reference: string;
	readonly enginePackageDigest: string;
	readonly imageDigest: string;
	readonly imageConfigDigest: string;
	readonly qualificationSha256: string;
};

export type OciImageImportDependencies = {
	run(args: string[]): Promise<OciCommandResult>;
	archive(args: string[]): Promise<OciCommandResult>;
	reload(root: string, expectedPackageId: string): Promise<CandidatePackage>;
};

export type OciImageImportOptions = {
	dockerExecutable?: string;
	tarExecutable?: string;
	dependencies?: Partial<OciImageImportDependencies>;
};

export async function importVerifiedOciImage(
	input: QualifiedOciPackage,
	options: OciImageImportOptions = {},
): Promise<ImportedOciImage> {
	const manifest = LangflowSidecarManifestV1Schema.parse(input.manifest);
	const candidate = input.candidate;
	const qualificationSha256 = Sha256Schema.parse(input.qualificationSha256);
	if (
		manifest.qualification !== "verified" ||
		manifest.target.kind !== "linux-oci" ||
		manifest.target.architecture !== candidate.targetArchitecture ||
		manifest.target.image !== candidate.engine.image ||
		manifest.target.imageDigest !== candidate.engine.imageDigest ||
		manifest.patchSet.sha256 !== candidate.engineOverlayHash ||
		manifest.components.catalog.sha256 !== candidate.componentManifestHash
	) {
		throw new Error("sidecar_qualified_package_conflict");
	}
	Sha256DigestSchema.parse(candidate.engine.imageDigest);
	Sha256DigestSchema.parse(candidate.engine.imageConfigDigest);

	const dockerExecutable = options.dockerExecutable ?? "docker";
	const tarExecutable = options.tarExecutable ?? "tar";
	const run = options.dependencies?.run ?? ((args: string[]) => runOciCommand(dockerExecutable, args));
	const archive =
		options.dependencies?.archive ?? ((args: string[]) => runArchiveCommand(tarExecutable, args));
	const reload = options.dependencies?.reload ?? loadCandidatePackage;
	const current = await reload(dirname(candidate.manifestPath), candidate.enginePackageDigest);
	if (!isDeepStrictEqual(current, candidate)) throw new Error("sidecar_candidate_package_changed");

	const temporaryDirectory = await mkdtemp(join(tmpdir(), "trellis-oci-import-"));
	const archivePath = join(temporaryDirectory, "image.tar");
	try {
		const archived = await archive([
			"--format=ustar",
			"--no-xattrs",
			"-cf",
			archivePath,
			"-C",
			candidate.engine.layoutDirectory,
			"oci-layout",
			"index.json",
			"blobs",
		]);
		if (archived.exitCode !== 0) throw new Error("sidecar_image_archive_failed");
		const loaded = await run(["image", "load", "--input", archivePath]);
		if (loaded.exitCode !== 0) throw new Error("sidecar_image_import_failed");
		const inspected = await run(["image", "inspect", candidate.engine.imageConfigDigest]);
		if (inspected.exitCode !== 0) throw new Error("sidecar_image_import_unknown");
		const image = ImageInspectionSchema.parse(JSON.parse(inspected.stdout))[0]!;
		const architecture = candidate.targetArchitecture === "x86_64" ? "amd64" : "arm64";
		if (image.Id !== candidate.engine.imageConfigDigest || image.Architecture !== architecture) {
			throw new Error("sidecar_image_identity_conflict");
		}
		return Object.freeze({
			reference: image.Id,
			enginePackageDigest: candidate.enginePackageDigest,
			imageDigest: candidate.engine.imageDigest,
			imageConfigDigest: image.Id,
			qualificationSha256,
		});
	} finally {
		await rm(temporaryDirectory, { recursive: true, force: true });
	}
}

async function runArchiveCommand(executable: string, args: string[]): Promise<OciCommandResult> {
	const child = Bun.spawn([executable, ...args], {
		env: { ...process.env, COPYFILE_DISABLE: "1" },
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	return { exitCode, stdout, stderr };
}
