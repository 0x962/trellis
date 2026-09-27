import { expect, test } from "bun:test";
import { currentCgroupPath, filesystemForPath } from "./index.ts";

test("resolves the current cgroup path and the most specific data filesystem", () => {
	const mountInfo = [
		"20 18 0:19 / / rw - ext4 /dev/vda rw",
		"21 20 0:20 /delegated /sys/fs/cgroup rw - cgroup2 cgroup rw",
		"22 20 0:21 /data /var/lib/trellis rw - xfs /dev/vdb rw",
	].join("\n");
	expect(currentCgroupPath("0::/delegated/trellis", mountInfo)).toBe("/sys/fs/cgroup/trellis");
	expect(filesystemForPath("/var/lib/trellis/runtime", mountInfo)).toBe("xfs");
});
