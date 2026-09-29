import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LoadQualifiedPackageInput } from "../../../loadQualifiedPackageInput";
import type { PackageQualification } from "../../../packageQualification";
import { sealPackage } from "../../../sealPackage";
import { packageFixture } from "../../../sealPackage/components/packageFixture";

export async function qualificationFixture() {
	const input = await packageFixture();
	input.recipe.frontendTemplates = await input.file(
		"templates.json",
		JSON.stringify({
			schemaVersion: 1,
			kind: "trellis-frontend-templates",
			componentManifestHash: input.recipe.components.catalog.sha256,
			engineOverlayHash: input.recipe.patchSet.sha256,
			engine: { commit: input.recipe.source.commit },
			allowedForPublication: false,
		}),
	);
	const output = join(input.root, "sealed");
	const sealed = await sealPackage({ ...input, output });
	const evidence = "Synthetic fixture evidence. No real probe ran.\n";
	await writeFile(join(input.root, "evidence.txt"), evidence);
	const probe = {
		command: "synthetic-fixture",
		result: "passed" as const,
		scope: "Synthetic files only",
		evidence: {
			path: "evidence.txt",
			sha256: createHash("sha256").update(evidence).digest("hex"),
			sizeBytes: Buffer.byteLength(evidence),
		},
	};
	const proof: PackageQualification = {
		schemaVersion: 1,
		kind: "trellis-package-qualification",
		subject: { packageId: sealed.packageId, recipe: input.recipe, imageConfigDigest: input.config.digest },
		probes: {
			isolation: structuredClone(probe),
			offlineImport: structuredClone(probe),
			restartRetention: structuredClone(probe),
			lifecycle: structuredClone(probe),
			nativeSessionRetention: structuredClone(probe),
		},
	};
	const options: LoadQualifiedPackageInput = {
		packageRoot: output,
		packageId: sealed.packageId,
		qualificationFile: join(input.root, "qualification.json"),
		qualificationSha256: "0".repeat(64),
		dataHomeId: "fixture-home",
		runtime: {
			data: { dataHomeId: "fixture-home", privateRoot: "data", directoryMode: "0700", fileMode: "0600" },
			encryptionSecret: { kind: "file-reference", relativePath: "run/trellis-secrets/engine-secret" },
			health: {
				scheme: "http",
				host: "127.0.0.1",
				path: "/trellis-v1/health",
				expectedStatus: 200,
				startupTimeoutMs: 30000,
				requestTimeoutMs: 5000,
			},
			epochOwnership: { dataHomeId: "fixture-home", ownerId: "fixture-owner", epoch: 1, leaseId: "fixture-lease" },
		},
	};
	async function saveProof(value: unknown = proof) {
		const bytes = JSON.stringify(value);
		await writeFile(options.qualificationFile, bytes);
		options.qualificationSha256 = createHash("sha256").update(bytes).digest("hex");
	}
	await saveProof();
	return { ...input, options, proof, saveProof };
}
