import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import type { DurableAuthorityFixture } from "./durableAuthorityFixture.ts";
import type { AuthorityProcessInput } from "./takeoverAuthorityProcess.ts";

type Marker = {
	pid: number;
	nonce: string;
	state: string;
	reason?: string;
	sequence?: number;
	trace?: Awaited<ReturnType<DurableAuthorityFixture["trace"]>>;
};

export class TakeoverProcessFixture {
	readonly records: Record<string, unknown>[] = [];
	private readonly children: ReturnType<typeof Bun.spawn>[] = [];
	private readonly exits = new Map<ReturnType<typeof Bun.spawn>, number>();
	constructor(private readonly home: string) {}

	async start(input: Omit<AuthorityProcessInput, "marker" | "nonce">) {
		const nonce = crypto.randomUUID();
		const invocation = join(this.home, `${nonce}.invocation.json`);
		const marker = join(this.home, `${nonce}.marker.json`);
		await writeFile(invocation, JSON.stringify({ ...input, nonce, marker }), { mode: 0o600 });
		const child = Bun.spawn([process.execPath, join(import.meta.dir, "takeoverAuthorityProcess.ts"), invocation], {
			cwd: this.home,
			stdout: "ignore",
			stderr: "pipe",
		});
		this.children.push(child);
		void child.exited.then((exitCode) => this.exits.set(child, exitCode));
		return { child, nonce, marker, ownerId: input.ownerId, capabilityId: input.capabilityId };
	}

	async wait(worker: Awaited<ReturnType<TakeoverProcessFixture["start"]>>, states: string[]) {
		const deadline = Date.now() + 15_000;
		while (Date.now() < deadline) {
			if (await Bun.file(worker.marker).exists()) {
				const marker = JSON.parse(await readFile(worker.marker, "utf8")) as Marker;
				if (marker.pid !== worker.child.pid || marker.nonce !== worker.nonce)
					throw new Error("wrong_authority_process");
				if (states.includes(marker.state)) {
					this.records.push({ ownerId: worker.ownerId, ...marker });
					return marker;
				}
			}
			if (this.exits.has(worker.child))
				throw new Error(
					`authority exited ${this.exits.get(worker.child)}: ${await new Response(worker.child.stderr).text()}`,
				);
			await Bun.sleep(5);
		}
		throw new Error("authority_boundary_timeout");
	}

	async kill(worker: Awaited<ReturnType<TakeoverProcessFixture["start"]>>) {
		process.kill(worker.child.pid, "SIGKILL");
		const exitCode = await worker.child.exited;
		this.records.push({
			pid: worker.child.pid,
			nonce: worker.nonce,
			ownerId: worker.ownerId,
			signal: "SIGKILL",
			exitCode,
		});
		return exitCode;
	}

	async revoke(
		authority: DurableAuthorityFixture,
		worker: Awaited<ReturnType<TakeoverProcessFixture["start"]>>,
		native: RuntimeProcessStatus,
		at: string,
	) {
		if (!this.exits.has(worker.child)) throw new Error("owner_exit_unknown");
		const exitCode = await worker.child.exited;
		const current = await authority.current();
		if (current.ownerId !== worker.ownerId || current.capabilityId !== worker.capabilityId)
			throw new Error("stale_owner");
		const provenance = await authority.provenance();
		const observationId = crypto.randomUUID();
		const revocationId = crypto.randomUUID();
		await authority.observe({
			id: observationId,
			executionId: current.executionId,
			ownerId: current.ownerId,
			engineEpoch: current.engineEpoch,
			ownershipRevision: current.ownershipRevision,
			agentRunId: provenance.agentRunId,
			attemptId: provenance.attemptId,
			process: native,
			observedAt: at,
		});
		const receipt = {
			observationId,
			revocationId,
			ownerId: worker.ownerId,
			pid: worker.child.pid,
			nonce: worker.nonce,
			exitCode,
		};
		await writeFile(join(this.home, `${revocationId}.exit.json`), JSON.stringify(receipt), { mode: 0o600 });
		await authority.revoke({
			id: revocationId,
			executionId: current.executionId,
			ownerId: current.ownerId,
			capabilityId: current.capabilityId,
			observationId,
			revokedAt: at,
		});
		this.records.push(receipt);
		return { observationId, revocationId };
	}

	async close() {
		for (const child of this.children) if (!this.exits.has(child)) child.kill("SIGKILL");
		const exits = await Promise.all(
			this.children.map(async (child) => ({ pid: child.pid, exitCode: await child.exited })),
		);
		this.records.push({ cleanup: exits });
		return exits;
	}
}
