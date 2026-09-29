import { readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { RuntimeClient } from "../../../../../packages/runtime-protocol/src/client.ts";

export async function cleanupNativeExecutable(input: {
	root: string;
	runtimeSocket: string;
	attemptDirectory: string;
	attemptIds: string[];
	requestTimeoutMs: number;
}) {
	const setup = JSON.parse(await readFile(join(input.root, "setup.json"), "utf8"));
	if (setup.root !== input.root) throw new Error("The cleanup root does not match the saved setup");
	const runtime = new RuntimeClient(input.runtimeSocket, input.requestTimeoutMs);
	const listed = await runtime.list({ ids: input.attemptIds });
	if (!listed.complete) throw new Error("Runtime ownership is incomplete; cleanup stopped");
	const owned = await Promise.all(
		listed.sessions.map(async (session) => {
			const descriptor = JSON.parse(await readFile(join(input.attemptDirectory, session.id, "launch.json"), "utf8"));
			if (
				descriptor.spec.env.TRELLIS_NATIVE_FIXTURE_ROOT !== input.root ||
				descriptor.spec.command !== setup.environment.TRELLIS_RUNTIME_NODE ||
				descriptor.spec.args[0] !== setup.environment.TRELLIS_CODEX_BRIDGE ||
				session.launch === null ||
				session.launch.command !== descriptor.spec.command ||
				JSON.stringify(session.launch.args) !== JSON.stringify(descriptor.spec.args)
			)
				throw new Error(`Attempt ${session.id} does not belong to this fixture`);
			return { session, socket: descriptor.spec.env.TRELLIS_CODEX_CONTROL_SOCKET as string };
		}),
	);
	const receipts = [];
	for (const { session, socket } of owned) {
		const stopped = await runtime.stop(session.id);
		if (stopped.status !== "exited") throw new Error(`Attempt ${session.id} has no confirmed exit`);
		let pidAbsent = session.pid === null;
		if (session.pid !== null) {
			try {
				process.kill(session.pid, 0);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
				pidAbsent = true;
			}
		}
		if (!pidAbsent) throw new Error(`PID ${session.pid} still exists; retain the fixture files`);
		try {
			await unlink(socket);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
		try {
			await rmdir(dirname(socket));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
		receipts.push({
			attemptId: session.id,
			pid: session.pid,
			status: stopped.status,
			exitCode: stopped.exitCode,
			pidAbsent,
			controlDirectoryRemoved: true,
		});
	}
	const unobservedAttemptIds = input.attemptIds.filter((id) => !listed.sessions.some((session) => session.id === id));
	const receipt = {
		schemaVersion: 1,
		scope: "native fixture attempts only",
		receipts,
		unobservedAttemptIds,
		retainedRoot: input.root,
		hostAndEngineCleanup: "not checked",
	};
	await writeFile(join(input.root, "evidence/cleanup.json"), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
	return receipt;
}
