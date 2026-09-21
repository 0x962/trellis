import { useEffect, useState } from "react";
import { useApp } from "../../../../lib/appContext";

// The current time, refreshed at each second boundary while `live` is true.
// A live run reads elapsed time and time left from it. A finished run reads
// its times from the record, so it needs no clock.
export function useClock(live: boolean) {
	const { scheduler } = useApp();
	const [now, setNow] = useState(() => scheduler.now());
	useEffect(() => {
		if (!live) return;
		let timer: unknown;
		const tick = () => {
			setNow(scheduler.now());
			timer = scheduler.setTimeout(tick, 1000 - (scheduler.now() % 1000));
		};
		timer = scheduler.setTimeout(tick, 1000 - (scheduler.now() % 1000));
		return () => scheduler.clearTimeout(timer);
	}, [live, scheduler]);
	return now;
}
