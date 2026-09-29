import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import type { HarnessStartInput } from "../../../../apps/server/src/agents/harnessHost/types.ts";

const status = (attemptId: string, pid: number, startedAt: string): RuntimeProcessStatus => ({
	id: attemptId,
	daemonId: "langflow-native-lifecycle-fixture",
	pid,
	mode: "pty",
	status: "running",
	startedAt,
	endedAt: null,
	exitCode: null,
	error: null,
	checkedAt: startedAt,
	elapsedMs: 0,
	controllable: true,
	process: {
		pid,
		parentPid: process.pid,
		groupId: pid,
		identity: `fixture:${attemptId}`,
		startedAt,
		executable: process.execPath,
	},
	launch: {
		command: process.execPath,
		args: ["-e", "setInterval(() => {}, 1000)", "trellis-trl671", attemptId],
		cwd: "/fixture",
	},
	agent: {
		sessionId: `session-${attemptId}`,
		model: "fixture/model",
		turnId: `turn-${attemptId}`,
		tool: null,
		lastTool: null,
		lastMessage: null,
		error: null,
		outcome: null,
	},
	activity: { state: "working", updatedAt: startedAt },
	acknowledgedMessageIds: [],
	result: null,
});

export class DeterministicProcessHost {
	readonly launches: string[] = [];
	readonly stops: string[] = [];
	private readonly children = new Map<string, ReturnType<typeof Bun.spawn>>();
	private loseLaunchResponse = false;
	private stopError: string | null = null;

	private constructor(
		private readonly directory: string,
		private readonly now: () => string,
	) {}

	static async create(directory: string, now: () => string) {
		await mkdir(directory, { recursive: true, mode: 0o700 });
		return new DeterministicProcessHost(directory, now);
	}

	static open(directory: string, now: () => string) {
		return new DeterministicProcessHost(directory, now);
	}

	loseNextLaunchResponse() {
		this.loseLaunchResponse = true;
	}

	failStops(message: string | null) {
		this.stopError = message;
	}

	async launch(input: HarnessStartInput) {
		const existing = await this.maybeRead(input.id);
		if (existing !== null) return { process: await this.inspect(input.id) };
		const child = Bun.spawn([process.execPath, "-e", "setInterval(() => {}, 1000)", "trellis-trl671", input.id], {
			cwd: this.directory,
			stdout: "ignore",
			stderr: "ignore",
		});
		this.children.set(input.id, child);
		const processStatus = status(input.id, child.pid, this.now());
		await this.write(processStatus);
		this.launches.push(input.id);
		if (this.loseLaunchResponse) {
			this.loseLaunchResponse = false;
			throw new Error("The process launched, but its response was lost.");
		}
		return { process: processStatus };
	}

	async acknowledge(attemptId: string) {
		const processStatus = await this.inspect(attemptId);
		await this.write({
			...processStatus,
			acknowledgedMessageIds: [attemptId],
			activity: { state: "working", updatedAt: this.now() },
		});
	}

	async complete(attemptId: string, resultId: string, text: string) {
		const processStatus = await this.inspect(attemptId);
		await this.write({
			...processStatus,
			acknowledgedMessageIds: [attemptId],
			activity: { state: "idle", updatedAt: this.now() },
			result: { id: resultId, text },
			agent: { ...processStatus.agent!, outcome: "completed" },
		});
	}

	async inspect(attemptId: string) {
		const processStatus = await this.read(attemptId);
		if (processStatus.status === "running" && processStatus.pid !== null && !this.alive(processStatus.pid)) {
			const exited = {
				...processStatus,
				status: "exited" as const,
				endedAt: this.now(),
				checkedAt: this.now(),
				controllable: false,
				activity: null,
			};
			await this.write(exited);
			return exited;
		}
		return { ...processStatus, checkedAt: this.now() };
	}

	async stop(attemptId: string) {
		this.stops.push(attemptId);
		if (this.stopError !== null) throw new Error(this.stopError);
		const processStatus = await this.inspect(attemptId);
		if (processStatus.pid !== null && this.alive(processStatus.pid)) process.kill(processStatus.pid, "SIGTERM");
		const child = this.children.get(attemptId);
		let exitCode = processStatus.exitCode;
		if (child !== undefined) exitCode = await child.exited;
		else while (processStatus.pid !== null && this.alive(processStatus.pid)) await Bun.sleep(5);
		const stopped = {
			...processStatus,
			status: "exited" as const,
			endedAt: this.now(),
			exitCode,
			checkedAt: this.now(),
			controllable: false,
			activity: null,
		};
		await this.write(stopped);
		return stopped;
	}

	client() {
		return {
			inspect: (attemptId: string) => this.inspect(attemptId),
			start: async () => {},
			stop: (attemptId: string) => this.stop(attemptId),
		};
	}

	async records() {
		const records: RuntimeProcessStatus[] = [];
		for (const name of await readdir(this.directory)) {
			if (name.endsWith(".json")) records.push(await this.read(name.slice(0, -5)));
		}
		return records;
	}

	async close() {
		const pids: number[] = [];
		for (const processStatus of await this.records()) {
			if (processStatus.pid !== null && this.alive(processStatus.pid)) {
				pids.push(processStatus.pid);
				process.kill(processStatus.pid, "SIGTERM");
			}
		}
		await Promise.all([...this.children.values()].map((child) => child.exited));
		for (const pid of pids) while (this.alive(pid)) await Bun.sleep(5);
		return { pids, survivingPids: pids.filter((pid) => this.alive(pid)) };
	}

	private alive(pid: number) {
		try {
			process.kill(pid, 0);
			return true;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
			throw error;
		}
	}

	private path(attemptId: string) {
		return join(this.directory, `${attemptId}.json`);
	}

	private async maybeRead(attemptId: string) {
		return (await Bun.file(this.path(attemptId)).exists()) ? this.read(attemptId) : null;
	}

	private async read(attemptId: string) {
		return JSON.parse(await readFile(this.path(attemptId), "utf8")) as RuntimeProcessStatus;
	}

	private async write(processStatus: RuntimeProcessStatus) {
		await writeFile(this.path(processStatus.id), JSON.stringify(processStatus), { mode: 0o600 });
	}
}
