import { readdirSync, readFileSync, readlinkSync } from "node:fs";
import { load } from "koffi";
import { createLinuxProcessInspector } from "./linux.ts";

const library = load(null);
const sysconf = library.func("long sysconf(int name)");
const sysconfClockTicks = 2;

export const { inspectProcess, inspectProcessSession } = createLinuxProcessInspector({
	readFile: (path) => readFileSync(path, "utf8"),
	readLink: (path) => readlinkSync(path, "utf8"),
	readDirectory: (path) => readdirSync(path),
	clockTicks: Number(sysconf(sysconfClockTicks)),
});
