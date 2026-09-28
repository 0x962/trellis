import { load } from "koffi";
import { processIdentity } from "../processIdentity";
import { stopProcessTree } from "../stopProcessTree.ts";
import { attemptProcesses } from "./attemptProcesses.ts";

const sessionOf = load(null).func("int getsid(int pid)");

export async function stopAttemptProcesses(home: string, id: string) {
	const deadline = Date.now() + 5000;
	for (;;) {
		const processes = attemptProcesses(home, id);
		if (processes.length === 0) return;
		if (Date.now() >= deadline) throw new Error("Trellis could not stop the previous agent. Try Resume again.");
		for (const saved of processes) {
			const current = processIdentity(saved.pid);
			if (current.kind === "missing") continue;
			if (current.kind === "unknown") throw new Error(current.error);
			if (current.process.identity !== saved.identity) continue;
			const session = sessionOf(saved.pid);
			if (session < 0) continue;
			if (session === sessionOf(process.pid)) throw new Error("An agent shares the runtime process session");
			await stopProcessTree(session);
		}
	}
}
