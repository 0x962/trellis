import { closeSync, constants } from "node:fs";
import { access, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { release } from "node:os";
import {
	type HostReleaseArch,
	type HostReleaseObservation,
	type HostReleasePlatform,
} from "@trellis/api";
import { errno, load } from "koffi";

const command = (args: string[]): string => {
	const result = Bun.spawnSync(args);
	if (result.exitCode !== 0)
		throw new Error(
			`${args.join(" ")} failed with exit code ${result.exitCode}: ${result.stderr.toString().trim()}`,
		);
	return result.stdout.toString().trim();
};

const PIDFD_OPEN_SYSCALL = 434;

const pidfdObservation = (): Pick<HostReleaseObservation, "pidfd" | "pidfdError"> => {
	const library = load(null);
	const syscall = library.func("long syscall(long number, int pid, unsigned int flags)");
	const descriptor: number = syscall(PIDFD_OPEN_SYSCALL, process.pid, 0);
	if (descriptor < 0) return { pidfd: false, pidfdError: `pidfd_open failed with errno ${errno()}` };
	closeSync(descriptor);
	return { pidfd: true };
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
	return {
		platform: "linux",
		arch,
		osVersion: release(),
		libc: libcOutput.startsWith("glibc ") ? { family: "glibc", version: libcOutput.slice(6) } : null,
		libstdcxxVersion,
		libatomic: linuxLibrary("libatomic.so.1", libraries) !== null,
		...pidfdObservation(),
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
