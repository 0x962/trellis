import { expect, test } from "bun:test";
import type { CandidatePackage } from "../../../../../../integrations/langflow/release";
import { manifest } from "../../fixtures/manifest";
import { importVerifiedOciImage } from "./importImage";

const imageDigest = `sha256:${"a".repeat(64)}`;
const imageConfigDigest = `sha256:${"b".repeat(64)}`;
const candidate: CandidatePackage = {
	qualification: "candidate",
	enginePackageDigest: "c".repeat(64),
	componentManifestHash: "a".repeat(64),
	componentManifestPath: "/sealed/package/payload/components.json",
	engineOverlayHash: "a".repeat(64),
	targetArchitecture: "arm64",
	engine: {
		layoutDirectory: "/sealed/package/payload/image",
		image: "fixture",
		imageDigest,
		imageConfigDigest,
	},
	editor: { rootDirectory: "/sealed/package/payload/editor" },
	frontendTemplates: null,
	manifestPath: "/sealed/package/package.json",
};

test("the importer loads the verified layout and returns the exact local identity", async () => {
	const archiveCalls: string[][] = [];
	const dockerCalls: string[][] = [];
	const result = await importVerifiedOciImage(
		{
			candidate,
			manifest: {
				...manifest,
				target: { kind: "linux-oci", architecture: "arm64", image: "fixture", imageDigest },
			},
			qualificationSha256: "d".repeat(64),
		},
		{
			dependencies: {
				archive: async (args) => {
					archiveCalls.push(args);
					return { exitCode: 0, stdout: "", stderr: "" };
				},
				run: async (args) => {
					dockerCalls.push(args);
					return args[1] === "inspect"
						? {
								exitCode: 0,
								stdout: JSON.stringify([{ Id: imageConfigDigest, Architecture: "arm64", Os: "linux" }]),
								stderr: "",
							}
						: { exitCode: 0, stdout: "Loaded image", stderr: "" };
				},
				reload: async () => candidate,
			},
		},
	);

	expect(archiveCalls).toHaveLength(1);
	expect(archiveCalls[0]).toEqual([
		"--format=ustar",
		"--no-xattrs",
		"-cf",
		expect.stringContaining("/trellis-oci-import-"),
		"-C",
		candidate.engine.layoutDirectory,
		"oci-layout",
		"index.json",
		"blobs",
	]);
	expect(dockerCalls).toEqual([
		["image", "load", "--input", expect.stringContaining("/trellis-oci-import-")],
		["image", "inspect", imageConfigDigest],
	]);
	expect(result).toEqual({
		reference: imageConfigDigest,
		enginePackageDigest: candidate.enginePackageDigest,
		imageDigest,
		imageConfigDigest,
		qualificationSha256: "d".repeat(64),
	});
});
