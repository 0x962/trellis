import type { RuntimePlatform } from "./runtimePlatform.ts";

// Each implementation binds native functions when its module loads. A macOS
// function such as proc_pidinfo does not exist on Linux, so only the module
// of the current host loads. The Linux module reads native struct layouts of
// x86_64 and arm64 only.
export const platform: RuntimePlatform =
	process.platform === "darwin"
		? (await import("./darwin/index.ts")).darwinPlatform
		: process.platform === "linux" && (process.arch === "x64" || process.arch === "arm64")
			? (await import("./linux/index.ts")).linuxPlatform
			: unsupported();

function unsupported(): never {
	throw new Error(`The runtime does not support ${process.platform} ${process.arch}`);
}
