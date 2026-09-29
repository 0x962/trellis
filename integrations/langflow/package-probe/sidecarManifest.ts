import { z } from "zod";

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const GitShaSchema = z.string().regex(/^[0-9a-f]{40}$/);
const RelativePathSchema = z
	.string()
	.min(1)
	.refine((value) => {
		if (value.startsWith("/") || value.endsWith("/") || value.includes("\\") || value.includes("\0")) {
			return false;
		}
		return value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
	});
const PositiveSafeIntegerSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

const DigestFileSchema = z.strictObject({
	path: RelativePathSchema,
	sha256: Sha256Schema,
	sizeBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});

const PatchSchema = DigestFileSchema.extend({
	id: z.string().min(1),
	order: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});

const DarwinTargetSchema = z.strictObject({
	kind: z.literal("darwin"),
	architecture: z.literal("arm64"),
	minimumVersion: z.string().min(1),
});

const LinuxGlibcTargetSchema = z.strictObject({
	kind: z.literal("linux-glibc"),
	architecture: z.enum(["x86_64", "arm64"]),
	minimumKernel: z.literal("5.14"),
	minimumGlibc: z.literal("2.28"),
	minimumLibstdcxx: z.literal("6.0.25"),
	requiresLibatomic: z.literal(true),
});

const LinuxOciTargetSchema = z.strictObject({
	kind: z.literal("linux-oci"),
	architecture: z.enum(["x86_64", "arm64"]),
	image: z.string().min(1),
	imageDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
});

export const LangflowSidecarManifestV1Schema = z
	.strictObject({
		schemaVersion: z.literal(1),
		qualification: z.enum(["candidate", "verified"]),
		source: z.strictObject({
			repository: z.literal("https://github.com/langflow-ai/langflow.git"),
			tag: z.literal("v1.12.3"),
			commit: z.literal("fec71dca901949c09ed4d63315804337cd2eb13d"),
			tree: GitShaSchema,
			archive: DigestFileSchema,
		}),
		patchSet: z.strictObject({
			sha256: Sha256Schema,
			patches: z.array(PatchSchema),
		}),
		lock: DigestFileSchema.extend({
			pythonRequirement: z.literal(">=3.10,<3.15"),
		}),
		components: z.strictObject({
			catalog: DigestFileSchema,
			entries: z
				.array(
					z.strictObject({
						id: z.string().min(1),
						source: DigestFileSchema,
					}),
				)
				.min(1),
		}),
		python: z.strictObject({
			implementation: z.literal("CPython"),
			version: z.string().regex(/^3\.(10|11|12|13|14)\.\d+$/),
			abi: z.string().min(1),
		}),
		target: z.discriminatedUnion("kind", [DarwinTargetSchema, LinuxGlibcTargetSchema, LinuxOciTargetSchema]),
		editor: z.strictObject({
			root: RelativePathSchema,
			assets: z.array(DigestFileSchema).min(1),
		}),
		license: z.strictObject({
			spdx: z.literal("MIT"),
			file: DigestFileSchema,
		}),
		data: z.strictObject({
			dataHomeId: z.string().min(1),
			privateRoot: RelativePathSchema,
			directoryMode: z.literal("0700"),
			fileMode: z.literal("0600"),
		}),
		encryptionSecret: z.strictObject({
			kind: z.literal("file-reference"),
			relativePath: RelativePathSchema,
		}),
		health: z.strictObject({
			scheme: z.literal("http"),
			host: z.literal("127.0.0.1"),
			path: z.literal("/health_check"),
			expectedStatus: z.literal(200),
			startupTimeoutMs: PositiveSafeIntegerSchema,
			requestTimeoutMs: PositiveSafeIntegerSchema,
		}),
		epochOwnership: z.strictObject({
			dataHomeId: z.string().min(1),
			ownerId: z.string().min(1),
			epoch: PositiveSafeIntegerSchema,
			leaseId: z.string().min(1),
		}),
	})
	.refine((value) => value.data.dataHomeId === value.epochOwnership.dataHomeId, {
		path: ["epochOwnership", "dataHomeId"],
	});

export type LangflowSidecarManifestV1 = z.infer<typeof LangflowSidecarManifestV1Schema>;
