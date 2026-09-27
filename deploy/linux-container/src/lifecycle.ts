import type { ContainerPaths } from "./state.ts";
import { writePrivateJson } from "./state.ts";

export type ManagedProcess = {
	pid: number;
	exited: Promise<number>;
	kill: (signal: NodeJS.Signals) => void;
};

export type ContainerLifecycleDependencies = {
	spawn: (service: "runtime" | "host") => ManagedProcess;
	waitForRuntime: () => Promise<void>;
	writeState: (state: unknown) => Promise<void>;
	markReplacementReady: () => Promise<void>;
	exit: (code: number) => void;
};

export class ContainerLifecycle {
	private runtime: ManagedProcess | null = null;
	private host: ManagedProcess | null = null;
	private queue = Promise.resolve();

	constructor(private readonly dependencies: ContainerLifecycleDependencies) {}

	private state() {
		return {
			schemaVersion: 1,
			runtime: this.runtime === null ? { state: "stopped", pid: null } : { state: "running", pid: this.runtime.pid },
			host: this.host === null ? { state: "stopped", pid: null } : { state: "running", pid: this.host.pid },
		};
	}

	private observe(service: "runtime" | "host", child: ManagedProcess) {
		void child.exited.then((code) => this.enqueue(() => this.unexpectedExit(service, child, code)));
	}

	private async stop(child: ManagedProcess) {
		child.kill("SIGTERM");
		await child.exited;
	}

	private async unexpectedExit(service: "runtime" | "host", child: ManagedProcess, code: number) {
		if (service === "host") {
			if (this.host !== child) return;
			this.host = null;
			await this.dependencies.writeState(this.state());
			process.stderr.write(`The host exited with code ${code}. Send SIGUSR1 to restart it.\n`);
			return;
		}
		if (this.runtime !== child) return;
		this.runtime = null;
		const host = this.host;
		this.host = null;
		if (host !== null) await this.stop(host);
		await this.dependencies.writeState(this.state());
		this.dependencies.exit(code === 0 ? 1 : code);
	}

	private enqueue(task: () => Promise<void>) {
		this.queue = this.queue.then(task);
		return this.queue;
	}

	async start() {
		this.runtime = this.dependencies.spawn("runtime");
		this.observe("runtime", this.runtime);
		await this.dependencies.waitForRuntime();
		this.host = this.dependencies.spawn("host");
		this.observe("host", this.host);
		await this.dependencies.writeState(this.state());
	}

	restartHost() {
		return this.enqueue(async () => {
			if (this.runtime === null) throw new Error("The runtime does not run.");
			const prior = this.host;
			this.host = null;
			if (prior !== null) await this.stop(prior);
			this.host = this.dependencies.spawn("host");
			this.observe("host", this.host);
			await this.dependencies.writeState(this.state());
		});
	}

	stopForReplacement() {
		return this.enqueue(async () => {
			const host = this.host;
			this.host = null;
			if (host !== null) await this.stop(host);
			const runtime = this.runtime;
			this.runtime = null;
			if (runtime !== null) await this.stop(runtime);
			await this.dependencies.markReplacementReady();
			await this.dependencies.writeState(this.state());
			this.dependencies.exit(0);
		});
	}
}

export const stateWriter = (paths: ContainerPaths) => (state: unknown) => writePrivateJson(paths.state, state);
