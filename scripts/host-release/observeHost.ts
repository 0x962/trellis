import { constants } from "node:fs";
import { access, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { release } from "node:os";
import {
	compareHostVersions,
	type HostReleaseArch,
	type HostReleaseObservation,
	type HostReleasePlatform,
} from "@trellis/api";

const command = (args: string[]): string => {
	try {
		const result = Bun.spawnSync(args);
		return result.exitCode === 0 ? result.stdout.toString().trim() : "";
	} catch {
		return "";
	}
};

const linuxLibrary = (name: string, libraries: string): string | null => {
	const line = libraries.split("\n").find((entry) => entry.trimStart().startsWith(`${name} `));
	return line?.split("=>")[1]?.trim() ?? null;
};

const cgroupV2Delegated = async (): Promise<boolean> => {
	const cgroup = (await readFile("/proc/self/cgroup", "utf8"))
		.split("\n")
		.find((line) => line.startsWith("0::"))
		?.slice(3);
	if (!cgroup) return false;
	const path = join("/sys/fs/cgroup", cgroup, "cgroup.subtree_control");
	try {
		await access(path, constants.W_OK);
		return true;
	} catch {
		return false;
	}
};

const linuxObservation = async (arch: HostReleaseArch): Promise<HostReleaseObservation> => {
	const libraries = command(["ldconfig", "-p"]);
	const libcOutput = command(["getconf", "GNU_LIBC_VERSION"]);
	const libstdcxx = linuxLibrary("libstdc++.so.6", libraries);
	const libstdcxxRealPath = libstdcxx ? await realpath(libstdcxx) : null;
	const libstdcxxVersion = libstdcxxRealPath?.match(/libstdc\+\+\.so\.(.+)$/)?.[1] ?? null;
	const kernel = release();
	return {
		platform: "linux",
		arch,
		osVersion: kernel,
		libc: libcOutput.startsWith("glibc ") ? { family: "glibc", version: libcOutput.slice(6) } : null,
		libstdcxxVersion,
		libatomic: linuxLibrary("libatomic.so.1", libraries) !== null,
		pidfd: compareHostVersions(kernel, "5.3") >= 0,
		cgroupV2Delegated: await cgroupV2Delegated(),
	};
};

export const observeHost = async (): Promise<HostReleaseObservation> => {
	if (process.platform !== "darwin" && process.platform !== "linux")
		throw new Error(`The host release does not support ${process.platform}.`);
	if (process.arch !== "x64" && process.arch !== "arm64")
		throw new Error(`The host release does not support ${process.arch}.`);
	const platform: HostReleasePlatform = process.platform;
	const arch: HostReleaseArch = process.arch;
	if (platform === "linux") return linuxObservation(arch);
	return {
		platform,
		arch,
		osVersion: command(["sw_vers", "-productVersion"]),
		libc: null,
		libstdcxxVersion: null,
		libatomic: false,
		pidfd: false,
		cgroupV2Delegated: false,
	};
};
