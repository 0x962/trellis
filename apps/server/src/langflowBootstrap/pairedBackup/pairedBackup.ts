import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { BackupOutput } from "@trellis/api";
import type { ServiceTransport } from "../../db/transport";
import { CaptureAuthority, LangflowHostControl, type LangflowSupervisor, withHeldEngine } from "../../langflowHost";
import { archivePairedSnapshot, capturePairedSnapshot } from "../../services/langflowBackup";
import { captureTransport } from "../captureTransport";

export function pairedBackup(options: {
	home: string;
	transport: ServiceTransport;
	supervisor: Pick<LangflowSupervisor, "withHealthyEngine">;
}) {
	const ports = captureTransport(options.transport);
	const active = new Set<Promise<BackupOutput>>();
	let stopped = false;
	let stopping: Promise<void> | null = null;
	return {
		backup: () => {
			if (stopped) return Promise.reject(new Error("langflow_backup_stopping"));
			const work = withHeldEngine(options.supervisor, async ({ observation, supervisor }) => {
				const control = LangflowHostControl.openCapture({ home: options.home });
				const authenticationFile = join(
					options.home,
					"langflow",
					"secrets",
					`${observation.identity.instanceId}.token`,
				);
				const authority = new CaptureAuthority(control, supervisor, { authenticationFile });
				const snapshotId = randomUUID();
				const root = join(options.home, "backups");
				await mkdir(root, { recursive: true, mode: 0o700 });
				const captured = await capturePairedSnapshot(
					{ control, supervisor, authority, authenticationFile, ...ports },
					{
						snapshotId,
						requestId: randomUUID(),
						directory: join(root, `langflow-${snapshotId}`),
						signal: new AbortController().signal,
					},
				);
				return archivePairedSnapshot({
					directory: captured.directory,
					manifestDigest: captured.manifestDigest,
					path: join(root, `langflow-${snapshotId}.tar.gz`),
				});
			});
			active.add(work);
			void work.then(
				() => active.delete(work),
				() => active.delete(work),
			);
			return work;
		},
		stop: () => {
			stopped = true;
			stopping ??= Promise.allSettled([...active]).then(() => undefined);
			return stopping;
		},
	};
}
