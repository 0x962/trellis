import { afterEach, expect, test } from "bun:test";
import { readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadCandidatePackage } from "../loadCandidatePackage";
import { sealPackage } from "../sealPackage";
import { qualificationFixture } from "./components/qualificationFixture";
import { loadQualifiedPackage } from "./loadQualifiedPackage";

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture() {
	const input = await qualificationFixture();
	roots.push(input.root);
	return input;
}

test("derives a frozen manifest from exact synthetic evidence and preserves candidate identity", async () => {
	const input = await fixture();
	const before = await readFile(join(input.options.packageRoot, "package.json"), "utf8");
	const loaded = await loadQualifiedPackage(input.options);
	expect(loaded.candidate).toEqual(await loadCandidatePackage(input.options.packageRoot, input.options.packageId));
	expect(loaded.candidate.qualification).toBe("candidate");
	expect(loaded.manifest.qualification).toBe("verified");
	expect(Object.isFrozen(loaded.manifest.target)).toBe(true);
	expect(loaded.manifest.data.dataHomeId).toBe(input.options.dataHomeId);
	expect(loaded.qualificationSha256).toBe(input.options.qualificationSha256);
	expect(await readFile(join(input.options.packageRoot, "package.json"), "utf8")).toBe(before);
	input.options.runtime.epochOwnership.ownerId = "another-owner";
	expect((await loadQualifiedPackage(input.options)).candidate.enginePackageDigest).toBe(loaded.candidate.enginePackageDigest);
});

test.each(["missing", "changed", "untrusted"])("rejects %s qualification bytes", async (kind) => {
	const input = await fixture();
	if (kind === "missing") await rm(input.options.qualificationFile);
	if (kind === "changed") await writeFile(input.options.qualificationFile, "{}");
	if (kind === "untrusted") input.options.qualificationSha256 = "f".repeat(64);
	await expect(loadQualifiedPackage(input.options)).rejects.toThrow();
});

test.each(["isolation", "offlineImport", "restartRetention", "lifecycle", "nativeSessionRetention"] as const)(
	"requires the %s probe",
	async (name) => {
		const input = await fixture();
		const probes = { ...input.proof.probes, [name]: undefined };
		await input.saveProof({ ...input.proof, probes });
		await expect(loadQualifiedPackage(input.options)).rejects.toThrow();
	},
);

test.each(["failed", "skipped"])("rejects a %s result even with a trusted digest", async (result) => {
	const input = await fixture();
	await input.saveProof({
		...input.proof,
		probes: { ...input.proof.probes, isolation: { ...input.proof.probes.isolation, result } },
	});
	await expect(loadQualifiedPackage(input.options)).rejects.toThrow();
});

test.each(["package", "source", "patch", "image", "config", "catalog", "templates", "target", "editor", "lock"])(
	"rejects a changed %s identity in trusted proof",
	async (kind) => {
		const input = await fixture();
		const subject = input.proof.subject;
		const recipe = subject.recipe;
		const hash = "f".repeat(64);
		if (kind === "package") subject.packageId = hash;
		if (kind === "source") recipe.source.archive.sha256 = hash;
		if (kind === "patch") recipe.patchSet.sha256 = hash;
		if (kind === "image") recipe.target.imageDigest = `sha256:${hash}`;
		if (kind === "config") subject.imageConfigDigest = `sha256:${hash}`;
		if (kind === "catalog") recipe.components.catalog.sha256 = hash;
		if (kind === "templates") recipe.frontendTemplates!.sha256 = hash;
		if (kind === "target") recipe.target.architecture = "x86_64";
		if (kind === "editor") recipe.editor.assets[0]!.sha256 = hash;
		if (kind === "lock") recipe.lock.sha256 = hash;
		await input.saveProof();
		await expect(loadQualifiedPackage(input.options)).rejects.toThrow("qualification_subject_mismatch");
	},
);

test.each(["changed", "missing", "symlink"])("rejects %s evidence", async (kind) => {
	const input = await fixture();
	const path = join(input.root, "evidence.txt");
	if (kind === "changed") await writeFile(path, "changed");
	if (kind !== "changed") await rm(path);
	if (kind === "symlink") await symlink(input.options.qualificationFile, path);
	await expect(loadQualifiedPackage(input.options)).rejects.toThrow();
});

test.each(["data", "epochOwnership"] as const)("rejects a different %s home", async (field) => {
	const input = await fixture();
	input.options.runtime[field].dataHomeId = "another-home";
	await expect(loadQualifiedPackage(input.options)).rejects.toThrow("qualification_data_home_mismatch");
});

test("rejects changed sealed bytes even with an unchanged qualification receipt", async () => {
	const input = await fixture();
	await writeFile(join(input.options.packageRoot, "payload", input.recipe.components.catalog.path), "changed");
	await expect(loadQualifiedPackage(input.options)).rejects.toThrow("package_input_mismatch");
});

test("rejects a symlink to the qualification file", async () => {
	const input = await fixture();
	const link = join(input.root, "qualification-link.json");
	await symlink(input.options.qualificationFile, link);
	input.options.qualificationFile = link;
	await expect(loadQualifiedPackage(input.options)).rejects.toThrow("qualification_file_not_regular");
});

test("rejects qualification when the sealed package has no frontend template export", async () => {
	const input = await fixture();
	await rm(join(input.staging, input.recipe.frontendTemplates!.path));
	delete input.recipe.frontendTemplates;
	const output = join(input.root, "without-templates");
	const sealed = await sealPackage({ ...input, output });
	input.options.packageRoot = output;
	input.options.packageId = sealed.packageId;
	input.proof.subject.packageId = sealed.packageId;
	await input.saveProof();
	await expect(loadQualifiedPackage(input.options)).rejects.toThrow("qualification_templates_required");
});
