import { describe, expect, test } from "bun:test";
import { LangflowSidecarManifestV1Schema } from "./sidecarManifest";

const digest = "a".repeat(64);

const manifest = LangflowSidecarManifestV1Schema.parse({
	schemaVersion: 1,
	qualification: "candidate",
	source: {
		repository: "https://github.com/langflow-ai/langflow.git",
		tag: "v1.12.3",
		commit: "fec71dca901949c09ed4d63315804337cd2eb13d",
		tree: "e6ac634257b30645b6c35bcc707ed271789877d6",
		archive: { path: "source.tar.zst", sha256: digest, sizeBytes: 1 },
	},
	patchSet: { sha256: digest, patches: [] },
	lock: { path: "uv.lock", sha256: digest, sizeBytes: 1, pythonRequirement: ">=3.10,<3.15" },
	components: {
		catalog: { path: "components.json", sha256: digest, sizeBytes: 1 },
		entries: [
			{
				id: "trellis.native-agent",
				source: { path: "components/native_agent.py", sha256: digest, sizeBytes: 1 },
			},
		],
	},
	python: { implementation: "CPython", version: "3.12.12", abi: "cp312-macosx_15_0_arm64" },
	target: { kind: "darwin", architecture: "arm64", minimumVersion: "26.6.2" },
	editor: {
		root: "editor",
		assets: [{ path: "editor/index.html", sha256: digest, sizeBytes: 1 }],
	},
	license: { spdx: "MIT", file: { path: "LICENSE", sha256: digest, sizeBytes: 1065 } },
	data: {
		dataHomeId: "data-home-a",
		privateRoot: "private/data-home-a",
		directoryMode: "0700",
		fileMode: "0600",
	},
	encryptionSecret: { kind: "file-reference", relativePath: "secrets/encryption-key" },
	health: {
		scheme: "http",
		host: "127.0.0.1",
		path: "/health_check",
		expectedStatus: 200,
		startupTimeoutMs: 30_000,
		requestTimeoutMs: 2_000,
	},
	epochOwnership: { dataHomeId: "data-home-a", ownerId: "trellis-host", epoch: 1, leaseId: "lease-a" },
});

describe("LangflowSidecarManifestV1Schema", () => {
	test("accepts the complete candidate boundary", () => {
		expect(LangflowSidecarManifestV1Schema.parse(manifest)).toEqual(manifest);
	});

	test("rejects a public listener", () => {
		expect(() =>
			LangflowSidecarManifestV1Schema.parse({
				...manifest,
				health: { ...manifest.health, host: "0.0.0.0" },
			}),
		).toThrow();
	});

	test("rejects a secret value in the manifest", () => {
		expect(() =>
			LangflowSidecarManifestV1Schema.parse({
				...manifest,
				encryptionSecret: { ...manifest.encryptionSecret, value: "secret" },
			}),
		).toThrow();
	});

	test("rejects a second data home", () => {
		expect(() => LangflowSidecarManifestV1Schema.parse({ ...manifest, dataHomes: [manifest.data] })).toThrow();
	});

	test("rejects an epoch for a different data home", () => {
		expect(() =>
			LangflowSidecarManifestV1Schema.parse({
				...manifest,
				epochOwnership: { ...manifest.epochOwnership, dataHomeId: "data-home-b" },
			}),
		).toThrow();
	});

	test.each([
		"/editor/index.html",
		"editor//index.html",
		"editor/./index.html",
		"editor/../index.html",
		"editor\\index.html",
		"editor/",
		"editor/\0index.html",
	])("rejects the non-normalized relative path %s", (path) => {
		expect(() =>
			LangflowSidecarManifestV1Schema.parse({
				...manifest,
				editor: {
					...manifest.editor,
					assets: [{ ...manifest.editor.assets[0], path }],
				},
			}),
		).toThrow();
	});
});

const ociManifest = {
	...manifest,
	target: { kind: "linux-oci", architecture: "arm64", image: "fixture", imageDigest: `sha256:${digest}` },
	data: { ...manifest.data, privateRoot: "data" },
	encryptionSecret: { ...manifest.encryptionSecret, relativePath: "run/trellis-secrets/engine-secret" },
	health: { ...manifest.health, path: "/trellis-v1/health" },
};

test.each(["candidate", "verified"])("accepts exact OCI paths for the synthetic %s manifest", (qualification) => {
	const result = LangflowSidecarManifestV1Schema.parse({ ...ociManifest, qualification });
	expect(result.data.privateRoot).toBe("data");
	expect(result.encryptionSecret.relativePath).toBe("run/trellis-secrets/engine-secret");
	expect(result.health.path).toBe("/trellis-v1/health");
	expect(result.qualification).toBe(qualification);
});

test.each([
	["data", "privateRoot", "private/data-home-a"],
	["data", "privateRoot", "/data"],
	["encryptionSecret", "relativePath", "secrets/encryption-key"],
	["encryptionSecret", "relativePath", "/run/trellis-secrets/engine-secret"],
	["health", "path", "/health_check"],
	["health", "scheme", "https"],
	["health", "host", "0.0.0.0"],
] as const)("rejects conflicting OCI %s.%s=%s", (section, key, value) => {
	expect(() =>
		LangflowSidecarManifestV1Schema.parse({
			...ociManifest,
			[section]: { ...ociManifest[section], [key]: value },
		}),
	).toThrow();
});

test("retains historical non-OCI candidate paths without qualification", () => {
	expect(LangflowSidecarManifestV1Schema.parse(manifest)).toEqual(manifest);
	expect(LangflowSidecarManifestV1Schema.parse(manifest).qualification).toBe("candidate");
});
