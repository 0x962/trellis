import { createHash } from "node:crypto";
import { posix, resolve } from "node:path";

const decodeMountPath = (value: string) =>
	value.replace(/\\([0-7]{3})/g, (_match, digits: string) => String.fromCharCode(Number.parseInt(digits, 8)));

// /proc/<pid>/cgroup names the cgroup v2 path of a process on its "0::" line.
// Answers undefined on a host that runs the process in no cgroup v2 hierarchy.
export function cgroupV2Path(cgroup: string): string | undefined {
	const membership = cgroup
		.split("\n")
		.map((line) => line.split(":"))
		.find(([hierarchy, controllers]) => hierarchy === "0" && controllers === "");
	if (membership === undefined || membership[2] === undefined) return undefined;
	return decodeMountPath(membership.slice(2).join(":"));
}

// mountinfo(5) maps the cgroup v2 path to a directory of the cgroup2 mount.
export function linuxCgroupDirectory(cgroup: string, mountInfo: string): string {
	const current = cgroupV2Path(cgroup);
	if (current === undefined) throw new Error("the runtime has no cgroup v2 membership");
	for (const line of mountInfo.split("\n")) {
		const [mount, filesystem] = line.split(" - ");
		if (mount === undefined || filesystem?.split(" ")[0] !== "cgroup2") continue;
		const fields = mount.split(" ");
		const root = decodeMountPath(fields[3]!);
		const mountPoint = decodeMountPath(fields[4]!);
		if (current !== root && !current.startsWith(root === "/" ? "/" : `${root}/`)) continue;
		return posix.join(mountPoint, current.slice(root.length));
	}
	throw new Error(`no cgroup2 mount contains ${current}`);
}

export const populated = (events: string) => {
	const match = /^populated\s+([01])$/m.exec(events);
	if (match === null) throw new Error("The cgroup events file has no populated state");
	return match[1] === "1";
};

// The launches of one runtime home live in trellis-attempts/<home tag>. Two
// runtimes in one cgroup have different homes, because the runtime lock
// admits one runtime for each home, so neither runtime touches the launches
// of the other.
export const homeTag = (home: string) => createHash("sha256").update(resolve(home)).digest("hex").slice(0, 16);
