import { execFileSync } from "node:child_process";
import { lstat, open, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ensureLocalSigningIdentity } from "../src/localSigning/localSigning.ts";
import { readBundleManifest, writeBundleManifest } from "../src/resourceBundle/resourceBundle.ts";

const application = resolve(process.argv[2] ?? join(import.meta.dir, "../release/mac-arm64/Trellis.app"));
const resources = join(application, "Contents/Resources/host");
const entitlements = resolve(import.meta.dir, "../entitlements.mac.plist");
const identity = ensureLocalSigningIdentity();
const binaries: string[] = [];
const magicNumbers = new Set([0xfeedface, 0xfeedfacf, 0xcafebabe, 0xcefaedfe, 0xcffaedfe, 0xbebafeca]);
const scan = async (directory: string) => {
	for (const name of await readdir(directory)) {
		const path = join(directory, name);
		const stat = await lstat(path);
		if (stat.isDirectory()) await scan(path);
		else if (stat.isFile() && stat.size >= 4) {
			const file = await open(path, "r");
			const bytes = Buffer.alloc(4);
			try {
				await file.read(bytes, 0, 4, 0);
			} finally {
				await file.close();
			}
			if (magicNumbers.has(bytes.readUInt32BE())) binaries.push(path);
		}
	}
};
const codesign = (...args: string[]) => execFileSync("/usr/bin/codesign", args, { stdio: "inherit" });
await scan(resources);
for (const binary of binaries)
	codesign("--force", "--sign", identity, "--options", "0", "--entitlements", entitlements, binary);
codesign("--force", "--deep", "--sign", identity, "--options", "0", "--entitlements", entitlements, application);
const previous = await readBundleManifest(resources);
await writeBundleManifest(resources, previous.version, previous.protocol);
codesign("--force", "--sign", identity, "--options", "0", "--entitlements", entitlements, application);
for (const binary of binaries) codesign("--verify", "--strict", binary);
codesign("--verify", "--deep", "--strict", application);
console.log(
	JSON.stringify({ application, binaries: binaries.length, release: await readBundleManifest(resources) }, null, 2),
);
