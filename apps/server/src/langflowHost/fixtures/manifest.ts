import { LangflowSidecarManifestV1Schema } from "../../../../../integrations/langflow/package-probe/sidecarManifest";

const digest = "a".repeat(64);

export const manifest = LangflowSidecarManifestV1Schema.parse({
	schemaVersion: 1,
	qualification: "verified",
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
	python: { implementation: "CPython", version: "3.12.12", abi: "cp312-linux-aarch64" },
	target: { kind: "linux-oci", architecture: "arm64", image: "fixture", imageDigest: `sha256:${digest}` },
	editor: {
		root: "editor",
		assets: [{ path: "editor/index.html", sha256: digest, sizeBytes: 1 }],
	},
	license: { spdx: "MIT", file: { path: "LICENSE", sha256: digest, sizeBytes: 1065 } },
	data: {
		dataHomeId: "data-home-a",
		privateRoot: "data",
		directoryMode: "0700",
		fileMode: "0600",
	},
	encryptionSecret: { kind: "file-reference", relativePath: "run/trellis-secrets/engine-secret" },
	health: {
		scheme: "http",
		host: "127.0.0.1",
		path: "/trellis-v1/health",
		expectedStatus: 200,
		startupTimeoutMs: 30_000,
		requestTimeoutMs: 2_000,
	},
	epochOwnership: { dataHomeId: "data-home-a", ownerId: "trellis-host", epoch: 1, leaseId: "lease-a" },
});
