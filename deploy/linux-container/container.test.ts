import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

test("pins both glibc 2.28 image inputs and forbids privileged container access", async () => {
	const root = import.meta.dir;
	const build = await readFile(join(root, "build-image.sh"), "utf8");
	const manager = await readFile(join(root, "trellis-container.sh"), "utf8");
	const dockerfile = await readFile(join(root, "Dockerfile"), "utf8");
	for (const digest of [
		"sha256:af5fbd460188a87059557422b2c00978f488ac6bc6b78d63a02e2fad040d7733",
		"sha256:55ddcbe11a7bf1696f67ce3b2ffcc6d58b3d33007be03bc372d61fc147a92015",
		"sha256:2b9bf75c2d49d9e774b4301cc72103bf6474f9d0f917ad3dd5e15c40859a451c",
		"sha256:ab6c9311540baa3b6a0986533aff625a25d10976534efed25f066ae14cff3c25",
	])
		expect(build).toContain(digest);
	expect(build).toContain("registry.access.redhat.com/ubi8/nodejs-24-minimal");
	expect(dockerfile).toContain('LABEL io.trellis.glibc.version="2.28"');
	expect(manager).toContain("--publish \"127.0.0.1:$port:4521\"");
	expect(manager).toContain("--cap-drop ALL");
	expect(manager).toContain("--security-opt no-new-privileges");
	expect(manager).not.toContain("--privileged");
	expect(manager).not.toContain("docker.sock");
});
