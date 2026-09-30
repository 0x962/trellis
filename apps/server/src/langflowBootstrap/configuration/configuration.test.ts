import { expect, test } from "bun:test";
import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../config";
import { bootstrapFixture } from "../fixtures";
import { LangflowBootstrapConfigurationSchema, readLangflowBootstrapConfiguration } from "./configuration";

test("server configuration keeps Langflow absent unless explicitly supplied", () => {
	expect(loadConfig({}).langflowConfigFile).toBeUndefined();
	expect(() => loadConfig({ TRELLIS_LANGFLOW_CONFIG_FILE: "relative.json" })).toThrow("absolute path");
	expect(() => loadConfig({ TRELLIS_LANGFLOW_CONFIG_FILE: "" })).toThrow("absolute path");
});

test("bootstrap refuses a static callback credential in host configuration", () => {
	const { configuration } = bootstrapFixture();
	expect(LangflowBootstrapConfigurationSchema.parse(configuration)).toEqual(configuration);
	expect(() =>
		LangflowBootstrapConfigurationSchema.parse({
			...configuration,
			nativeReservationAuthenticationFile: "/private/static-native.token",
		}),
	).toThrow();
});

test("configuration requires a private regular file and distinct origins", async () => {
	const directory = await mkdtemp(join(tmpdir(), "trellis-langflow-bootstrap-"));
	try {
		const { configuration } = bootstrapFixture();
		const path = join(directory, "configuration.json");
		await writeFile(path, JSON.stringify(configuration), { mode: 0o600 });
		expect(await readLangflowBootstrapConfiguration(path)).toEqual(configuration);
		await chmod(path, 0o644);
		await expect(readLangflowBootstrapConfiguration(path)).rejects.toThrow("langflow_configuration_not_private");
		await chmod(path, 0o600);
		const link = join(directory, "linked.json");
		await symlink(path, link);
		await expect(readLangflowBootstrapConfiguration(link)).rejects.toThrow();
		await writeFile(path, JSON.stringify({ ...configuration, editorOrigin: configuration.parentOrigin }));
		await expect(readLangflowBootstrapConfiguration(path)).rejects.toThrow("separate origin");
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("authority duration and permissions require explicit configuration", () => {
	const { configuration } = bootstrapFixture();
	const { authorityPolicy: _policy, ...withoutPolicy } = configuration;
	const { authorityPermissions: _permissions, ...withoutPermissions } = configuration;
	expect(() => LangflowBootstrapConfigurationSchema.parse(withoutPolicy)).toThrow();
	expect(() => LangflowBootstrapConfigurationSchema.parse(withoutPermissions)).toThrow();
	expect(() =>
		LangflowBootstrapConfigurationSchema.parse({
			...configuration,
			authorityPolicy: { durationMs: 1000, renewBeforeMs: 1000 },
		}),
	).toThrow();
});

test("native policy configuration requires a path and an independent exact digest", () => {
	const { configuration } = bootstrapFixture();
	const nativePolicy = { path: "/private/native-policy.json", sha256: "a".repeat(64) };
	expect(LangflowBootstrapConfigurationSchema.parse({ ...configuration, nativePolicy }).nativePolicy).toEqual(
		nativePolicy,
	);
	for (const invalid of [
		{ path: nativePolicy.path },
		{ sha256: nativePolicy.sha256 },
		{ ...nativePolicy, path: "relative.json" },
		{ ...nativePolicy, sha256: `${nativePolicy.sha256}\n` },
	])
		expect(() => LangflowBootstrapConfigurationSchema.parse({ ...configuration, nativePolicy: invalid })).toThrow();
});
