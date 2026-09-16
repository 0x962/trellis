import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { once } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import { inspectProcess } from "../src/inspectProcess.ts";
import { stopProcessTree } from "../src/stopProcessTree.ts";

const killGroup = (pid) => {
	try {
		process.kill(-pid, "SIGKILL");
	} catch (error) {
		if (error.code !== "ESRCH") throw error;
	}
};

const leader = childProcess.spawn(
	process.execPath,
	[
		"-e",
		"const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'}); console.log(child.pid); setInterval(()=>{},1000);",
	],
	{ detached: true, stdio: ["ignore", "pipe", "inherit"] },
);
const leaderExit = once(leader, "exit");
let descendant;
try {
	const [output] = await once(leader.stdout, "data");
	descendant = Number(output.toString().trim());
	assert.equal(inspectProcess(leader.pid).kind, "live");
	const before = inspectProcess(descendant);
	assert.equal(before.kind, "live");
	assert.equal(before.process.parentPid, leader.pid);
	assert.equal(before.process.groupId, descendant);
	for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) {
		childProcess[name] = () => {
			throw new Error(`Process termination must not call ${name}`);
		};
	}
	syncBuiltinESMExports();
	await stopProcessTree(leader.pid);
	await leaderExit;
	assert.equal(inspectProcess(leader.pid).kind, "missing");
	assert.equal(inspectProcess(descendant).kind, "missing");
	console.log("The leader and its detached descendant exited without a subprocess for inspection.");
} finally {
	for (const pid of [leader.pid, descendant]) {
		if (pid) killGroup(pid);
	}
	await leaderExit;
}
