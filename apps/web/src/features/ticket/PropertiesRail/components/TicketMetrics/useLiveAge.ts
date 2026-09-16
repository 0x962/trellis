import type { Scheduler } from "@trellis/api";
import { useEffect, useMemo, useState } from "react";
import { ageRefreshDelay } from "./metricPresentation";

export const useLiveAge = (serverAgeMs: number | null, scheduler: Scheduler) => {
	const sample = useMemo(() => ({ ageMs: serverAgeMs, receivedAt: scheduler.now() }), [scheduler, serverAgeMs]);
	const [now, setNow] = useState(sample.receivedAt);

	useEffect(() => {
		const baseAgeMs = sample.ageMs;
		if (baseAgeMs === null) return;
		let timer: unknown;
		const update = () => {
			const currentNow = scheduler.now();
			const currentAgeMs = baseAgeMs + currentNow - sample.receivedAt;
			setNow(currentNow);
			timer = scheduler.setTimeout(update, ageRefreshDelay(currentAgeMs));
		};
		timer = scheduler.setTimeout(update, ageRefreshDelay(baseAgeMs));
		return () => scheduler.clearTimeout(timer);
	}, [sample, scheduler]);

	if (sample.ageMs === null) return null;
	return sample.ageMs + Math.max(0, now - sample.receivedAt);
};
