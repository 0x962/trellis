import type { Scheduler } from "@trellis/api";
import { useEffect, useMemo, useState } from "react";
import { ageRefreshDelay } from "./metricPresentation";

export const useLiveAge = (serverAgeMs: number | null, scheduler: Scheduler) => {
	const serverAgeSample = useMemo(
		() => ({ ageMs: serverAgeMs, receivedAt: scheduler.now() }),
		[scheduler, serverAgeMs],
	);
	const [refreshTimeMs, setRefreshTimeMs] = useState(serverAgeSample.receivedAt);

	useEffect(() => {
		const baseAgeMs = serverAgeSample.ageMs;
		if (baseAgeMs === null) return;
		let timer: unknown;
		const update = () => {
			const currentTimeMs = scheduler.now();
			const currentAgeMs = baseAgeMs + currentTimeMs - serverAgeSample.receivedAt;
			setRefreshTimeMs(currentTimeMs);
			timer = scheduler.setTimeout(update, ageRefreshDelay(currentAgeMs));
		};
		timer = scheduler.setTimeout(update, ageRefreshDelay(baseAgeMs));
		return () => scheduler.clearTimeout(timer);
	}, [serverAgeSample, scheduler]);

	if (serverAgeSample.ageMs === null) return null;
	return serverAgeSample.ageMs + Math.max(0, refreshTimeMs - serverAgeSample.receivedAt);
};
