const maxTimerDelayMs = 2_147_483_647;

type LaunchDeadlineDependencies = {
	now: () => number;
	schedule: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
	setCurrentTimer: (timer: ReturnType<typeof setTimeout>) => void;
};

export const scheduleLaunchDeadline = (
	timeoutMs: number,
	onDeadline: () => void,
	dependencies: LaunchDeadlineDependencies,
) => {
	const deadline = BigInt(dependencies.now()) + BigInt(timeoutMs);
	const scheduleRemaining = () => {
		const remaining = deadline - BigInt(dependencies.now());
		if (remaining <= 0n) {
			onDeadline();
			return;
		}
		const delayMs = Number(remaining > BigInt(maxTimerDelayMs) ? maxTimerDelayMs : remaining);
		dependencies.setCurrentTimer(dependencies.schedule(scheduleRemaining, delayMs));
	};
	scheduleRemaining();
};
