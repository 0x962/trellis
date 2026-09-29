import { expect, test } from "bun:test";
import { bootstrapFixture } from "../fixtures";
import { composeLangflowBootstrap } from "./compose";

test("absent configuration calls no package or runtime producer", async () => {
	const f = bootstrapFixture();
	delete f.config.langflowConfigFile;
	expect(await composeLangflowBootstrap(f.config, f.dependencies)).toBeUndefined();
	expect(f.calls).toEqual([]);
});

test("verified composition imports before start and retains the editor manifest", async () => {
	const f = bootstrapFixture();
	const runtime = await composeLangflowBootstrap(f.config, f.dependencies);
	expect(runtime).toBeDefined();
	expect(f.candidate.qualification).toBe("candidate");
	expect(f.calls).toEqual(["configuration", "identity", "qualification", "engine-configuration", "manifest", "identity", "import", "driver", "authority", "supervisor", "start"]);
	expect(runtime?.editor.identity).toEqual(f.identity);
	expect((await runtime?.editor.installedManifest())?.publicManifest).toEqual({ blockers: ["fixture"] });
	await runtime?.stop();
	expect(f.calls.at(-1)).toBe("shutdown");
});

test("mismatched data home refuses before package import", async () => {
	const f = bootstrapFixture();
	f.configuration.expectedDataHomeId = "00000000-0000-4000-8000-000000000099";
	await expect(composeLangflowBootstrap(f.config, f.dependencies)).rejects.toThrow("langflow_bootstrap_identity_conflict");
	expect(f.calls).toEqual(["configuration", "identity"]);
});

test("a host replacement during package reads refuses before effects", async () => {
	const f = bootstrapFixture();
	let reads = 0;
	f.dependencies.readIdentity = () => ++reads === 1 ? f.identity : { ...f.identity, hostId: "replacement" };
	await expect(composeLangflowBootstrap(f.config, f.dependencies)).rejects.toThrow("langflow_bootstrap_identity_changed");
	expect(f.calls).not.toContain("import");
});

test("an unverified manifest cannot start the driver", async () => {
	const f = bootstrapFixture();
	f.manifest.qualification = "candidate";
	await expect(composeLangflowBootstrap(f.config, f.dependencies)).rejects.toThrow("langflow_bootstrap_qualification_conflict");
	expect(f.calls).not.toContain("import");
});

test("an image identity mismatch cannot start the driver", async () => {
	const f = bootstrapFixture();
	f.dependencies.importImage = async () => ({ imageConfigDigest: `sha256:${"b".repeat(64)}` });
	await expect(composeLangflowBootstrap(f.config, f.dependencies)).rejects.toThrow("langflow_bootstrap_image_conflict");
	expect(f.calls).not.toContain("driver");
});

test("a configured invalid package propagates refusal without effects", async () => {
	const f = bootstrapFixture();
	f.dependencies.qualify = async () => { throw new Error("qualification_not_accepted"); };
	await expect(composeLangflowBootstrap(f.config, f.dependencies)).rejects.toThrow("qualification_not_accepted");
	expect(f.calls).not.toContain("import");
});

test("an engine configuration mismatch refuses before image import", async () => {
	const f = bootstrapFixture();
	f.dependencies.engineConfiguration = async () => { throw new Error("langflow_engine_configuration_conflict"); };
	await expect(composeLangflowBootstrap(f.config, f.dependencies)).rejects.toThrow("langflow_engine_configuration_conflict");
	expect(f.calls).not.toContain("import");
});
