import { expect, test } from "bun:test";
import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../config";
import { bootstrapFixture } from "../fixtures";
import { readLangflowBootstrapConfiguration } from "./configuration";

test("server configuration keeps Langflow absent unless explicitly supplied", () => {
	expect(loadConfig({}).langflowConfigFile).toBeUndefined();
	expect(() => loadConfig({ TRELLIS_LANGFLOW_CONFIG_FILE: "relative.json" })).toThrow("absolute path");
	expect(() => loadConfig({ TRELLIS_LANGFLOW_CONFIG_FILE: "" })).toThrow("absolute path");
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
