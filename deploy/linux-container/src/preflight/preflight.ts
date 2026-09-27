import { constants } from "node:fs";
import { access, mkdir, readFile, realpath, rmdir, stat } from "node:fs/promises";
import { join, posix } from "node:path";
import type { HostReleaseManifest } from "@trellis/api";
import { readHostReleaseManifest } from "../../../../scripts/host-release/manifest/index.ts";
import { hostReleasePreflightResult } from "../../../../scripts/host-release/preflightResult/index.ts";

type ReleaseManifest = HostReleaseManifest;

const decodeMountPath = (value: string) =>
	value.replace(/\\([0-7]{3})/g, (_match, digits: string) => String.fromCharCode(Number.parseInt(digits, 8)));

export const readAndVerifyRelease = async (root: string): Promise<ReleaseManifest> => {
	const result = await hostReleasePreflightResult(root);
	if (!result.ok) throw new Error(`The host release preflight failed: ${JSON.stringify(result)}`);
	return readHostReleaseManifest(root);
};

export const currentCgroupPath = (membership: string, mountInfo: string): string => {
	const cgroup = membership
		.split("\n")
		.map((line) => line.split(":"))
		.find(([hierarchy, controllers]) => hierarchy === "0" && controllers === "")?.[2];
	if (cgroup === undefined) throw new Error("The process has no cgroup v2 membership.");
	const current = decodeMountPath(cgroup);
	for (const line of mountInfo.split("\n")) {
		const [mount, filesystem] = line.split(" - ");
		if (mount === undefined || filesystem?.split(" ")[0] !== "cgroup2") continue;
		const fields = mount.split(" ");
		const root = decodeMountPath(fields[3]!);
		const mountPoint = decodeMountPath(fields[4]!);
		if (current !== root && !(root === "/" ? current.startsWith("/") : current.startsWith(`${root}/`))) continue;
		const suffix = current.slice(root.length).replace(/^\/+/, "");
		return suffix === "" ? mountPoint : posix.join(mountPoint, suffix);
	}
	throw new Error(`The cgroup v2 mount does not contain ${current}.`);
};

export const filesystemForPath = (path: string, mountInfo: string): string => {
	const matches = mountInfo
		.split("\n")
		.map((line) => {
			const [mount, filesystem] = line.split(" - ");
			if (mount === undefined || filesystem === undefined) return null;
			const mountPoint = decodeMountPath(mount.split(" ")[4]!);
			return path === mountPoint || path.startsWith(`${mountPoint.replace(/\/$/, "")}/`)
				? { mountPoint, filesystem: filesystem.split(" ")[0]! }
				: null;
		})
		.filter((entry): entry is { mountPoint: string; filesystem: string } => entry !== null)
		.sort((left, right) => right.mountPoint.length - left.mountPoint.length);
	if (matches[0] === undefined) throw new Error(`No filesystem contains ${path}.`);
	return matches[0].filesystem;
};

const verifyDelegation = async (): Promise<string> => {
	const cgroupPath = currentCgroupPath(
		await readFile("/proc/self/cgroup", "utf8"),
		await readFile("/proc/self/mountinfo", "utf8"),
	);
	await access(join(cgroupPath, "cgroup.subtree_control"), constants.W_OK);
	const probe = join(cgroupPath, `trellis-preflight-${process.pid}`);
	await mkdir(probe);
	try {
		for (const name of ["cgroup.procs", "cgroup.freeze", "cgroup.kill"]) await access(join(probe, name), constants.W_OK);
	} finally {
		await rmdir(probe);
	}
	return cgroupPath;
};

export const runContainerPreflight = async (dataHome: string, manifest: ReleaseManifest) => {
	if (process.platform !== "linux") throw new Error(`The Linux container cannot run on ${process.platform}.`);
	if (process.arch !== "x64" && process.arch !== "arm64")
		throw new Error(`The Linux container cannot run on ${process.arch}.`);
	if (process.getuid?.() === 0) throw new Error("The Trellis container refuses to run as root.");
	const data = await realpath(dataHome);
	const dataStat = await stat(data);
	if (dataStat.uid !== process.getuid?.()) throw new Error("The data home owner does not match the container user.");
	const mountInfo = await readFile("/proc/self/mountinfo", "utf8");
	const filesystem = filesystemForPath(data, mountInfo);
	if (["9p", "cifs", "nfs", "nfs4", "smb3", "fuse.sshfs"].includes(filesystem))
		throw new Error(`The data home uses the unsupported network filesystem ${filesystem}.`);
	const cgroupPath = await verifyDelegation();
	return { schemaVersion: 1, ok: true, releaseId: manifest.releaseId, filesystem, cgroupPath };
};
