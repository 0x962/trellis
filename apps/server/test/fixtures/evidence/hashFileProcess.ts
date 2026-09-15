import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { hashFile } from "../../../src/services/evidence/hashFile.ts";

const descriptors = () =>
	process.platform === "darwin"
		? execFileSync("/usr/sbin/lsof", ["-a", "-p", String(process.pid), "-Ff"], { encoding: "utf8" })
				.split("\n")
				.filter((line) => /^f\d/.test(line)).length
		: readdirSync("/proc/self/fd").length;
const path = process.argv[2]!;
await hashFile(path);
const before = descriptors();
const hashes = [];
for (let index = 0; index < 128; index++) hashes.push(await hashFile(path));
const after = descriptors();
process.stdout.write(JSON.stringify({ bun: process.versions.bun, before, after, hashes }));
