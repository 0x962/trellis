import { expect, test } from "bun:test";
import { HostTransferEndpointSchema, HostTransferObjectSchema } from "./hostTransfer.ts";

const gitObject = (kind: "repository" | "worktree") => ({
	id: `${kind}:one`,
	kind,
	sourcePath: `/source/${kind}`,
	classification: "remappable" as const,
	bytes: 1,
	sha256: "a".repeat(64),
	secret: true,
	destination: { state: "mapped" as const, path: `/destination/${kind}` },
	gitCommonDirectoryId: "git-common:one",
	...(kind === "worktree" ? { repositoryId: "repository:one" } : {}),
});

test("requires a dirty-path inventory for each Git object", () => {
	expect(HostTransferObjectSchema.safeParse(gitObject("repository")).success).toBeFalse();
	expect(HostTransferObjectSchema.safeParse(gitObject("worktree")).success).toBeFalse();
});

test("accepts supported host endpoints with POSIX paths", () => {
	expect(
		HostTransferEndpointSchema.safeParse({
			hostId: "linux-host",
			dataHome: "/home/navid/.trellis",
			homeDirectory: "/home/navid",
			platform: "linux",
			arch: "x64",
		}).success,
	).toBeTrue();
});

test("rejects unsupported hosts and non-POSIX paths", () => {
	for (const endpoint of [
		{
			hostId: "windows-host",
			dataHome: "C:\\Users\\navid\\.trellis",
			homeDirectory: "C:\\Users\\navid",
			platform: "linux",
			arch: "x64",
		},
		{
			hostId: "windows-host",
			dataHome: "C:\\Users\\navid\\.trellis",
			homeDirectory: "C:\\Users\\navid",
			platform: "win32",
			arch: "x64",
		},
		{
			hostId: "linux-host",
			dataHome: "/home/navid/.trellis",
			homeDirectory: "/home/navid",
			platform: "linux",
			arch: "riscv64",
		},
	])
		expect(HostTransferEndpointSchema.safeParse(endpoint).success).toBeFalse();
});
