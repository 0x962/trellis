import type { JobsLog } from "../../../jobs";
import type { LangflowConnection, LangflowDomain } from "../../types";

export function domainQueue(domain: LangflowDomain, connection: LangflowConnection, log: JobsLog) {
	const pending = new Map<string, () => Promise<void>>();
	let running: Promise<void> | null = null;
	let stopped = false;
	let paused = false;

	const drain = (): Promise<void> => {
		if (running !== null) return running;
		if (stopped || paused || pending.size === 0) return Promise.resolve();
		running = Promise.resolve()
			.then(async () => {
				while (!stopped && !paused && pending.size > 0) {
					const [key, work] = pending.entries().next().value!;
					pending.delete(key);
					await work().catch((error: unknown) => {
						log("Langflow domain work failed", {
							domain,
							work: key,
							error: error instanceof Error ? error.message : String(error),
						});
					});
				}
			})
			.finally(() => {
				running = null;
			});
		return running;
	};
	const enqueue = (key: string, work: () => Promise<void>) => {
		if (stopped) return Promise.resolve();
		pending.set(key, work);
		return drain();
	};

	return {
		committed: (executionId: string) =>
			enqueue(`execution:${executionId}`, () => connection.committed({ executionId })),
		recover: () => enqueue("recover", () => connection.recover()),
		pause: async () => {
			paused = true;
			await running;
		},
		resume: () => {
			paused = false;
			void drain();
		},
		stop: async () => {
			stopped = true;
			pending.clear();
			await running;
		},
	};
}
