import type { ContainerLogger } from "../logger/index.ts";
import type { ContainerPaths } from "../state/index.ts";
import { writePrivateJson } from "../state/index.ts";

export type ManagedProcess = {
	pid: number;
	exited: Promise<number>;
	kill: (signal: NodeJS.Signals) => void;
};

type ContainerLifecycleDependencies = {
	spawn: (service: "runtime" | "host") => ManagedProcess;
	waitForRuntime: () => Promise<void>;
	writeState: (state: unknown) => Promise<void>;
	markReplacementReady: () => Promise<void>;
	log: ContainerLogger;
	exit: (code: number) => void;
};

export class ContainerLifecycle {
	private runtime: ManagedProcess | null = null;
	private host: ManagedProcess | null = null;
	private queue = Promise.resolve();

	constructor(private readonly dependencies: ContainerLifecycleDependencies) {}

	private processState() {
		return {
			schemaVersion: 1,
			runtime: this.runtime === null ? { state: "stopped", pid: null } : { state: "running", pid: this.runtime.pid },
			host: this.host === null ? { state: "stopped", pid: null } : { state: "running", pid: this.host.pid },
		};
	}

	private observe(service: "runtime" | "host", child: ManagedProcess) {
		void child.exited.then((code) => this.enqueue(() => this.unexpectedExit(service, child, code)));
	}

	private startService(service: "runtime" | "host") {
		const child = this.dependencies.spawn(service);
		this.dependencies.log({ event: "service_started", service, pid: child.pid });
		this.observe(service, child);
		return child;
	}

	private async stopService(service: "runtime" | "host", child: ManagedProcess) {
		child.kill("SIGTERM");
		const exitCode = await child.exited;
		this.dependencies.log({ event: "service_stopped", service, pid: child.pid, exitCode });
		if (exitCode !== 0) throw new Error(`${service} stopped with exit code ${exitCode}.`);
	}

	private async unexpectedExit(service: "runtime" | "host", child: ManagedProcess, exitCode: number) {
		if (service === "host") {
			if (this.host !== child) return;
			this.host = null;
			this.dependencies.log({ event: "service_exited", service, pid: child.pid, exitCode });
			await this.dependencies.writeState(this.processState());
			return;
		}
		if (this.runtime !== child) return;
		this.runtime = null;
		this.dependencies.log({ event: "service_exited", service, pid: child.pid, exitCode });
		const host = this.host;
		this.host = null;
		if (host !== null) await this.stopService("host", host);
		await this.dependencies.writeState(this.processState());
		this.dependencies.exit(exitCode === 0 ? 1 : exitCode);
	}

	private enqueue(task: () => Promise<void>) {
		this.queue = this.queue.then(task);
		return this.queue;
	}

	async start() {
		this.runtime = this.startService("runtime");
		await this.dependencies.waitForRuntime();
		this.host = this.startService("host");
		await this.dependencies.writeState(this.processState());
		this.dependencies.log({ event: "lifecycle_started" });
	}

	restartHost() {
		return this.enqueue(async () => {
			if (this.runtime === null) throw new Error("The runtime does not run.");
			const prior = this.host;
			this.dependencies.log({ event: "host_restart_started", service: "host", pid: prior?.pid });
			this.host = null;
			if (prior !== null) await this.stopService("host", prior);
			this.host = this.startService("host");
			await this.dependencies.writeState(this.processState());
			this.dependencies.log({ event: "host_restart_completed", service: "host", pid: this.host.pid });
		});
	}

	stopForReplacement() {
		return this.enqueue(async () => {
			this.dependencies.log({ event: "replacement_stop_started" });
			const host = this.host;
			this.host = null;
			if (host !== null) await this.stopService("host", host);
			const runtime = this.runtime;
			this.runtime = null;
			if (runtime !== null) await this.stopService("runtime", runtime);
			await this.dependencies.markReplacementReady();
			await this.dependencies.writeState(this.processState());
			this.dependencies.log({ event: "replacement_stop_completed" });
			this.dependencies.exit(0);
		});
	}
}

export const createLifecycleStateWriter = (paths: ContainerPaths) => (state: unknown) =>
	writePrivateJson(paths.state, state);
