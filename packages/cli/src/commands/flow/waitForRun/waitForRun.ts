import type { Deps } from "../../../index.ts";
import { type FlowRun, runProgress } from "../runProgress/runProgress.ts";

export const waitForRun = async <T extends FlowRun>(
	run: T,
	read: (id: string) => Promise<T>,
	clock: Pick<Deps, "now" | "sleep">,
	deadline: number,
): Promise<T> => {
	let latest = run;
	while (runProgress(latest).poll) {
		const remaining = deadline - clock.now().getTime();
		if (remaining <= 0) break;
		await clock.sleep(Math.min(5000, remaining));
		if (clock.now().getTime() >= deadline) break;
		latest = await read(latest.id);
	}
	return latest;
};
