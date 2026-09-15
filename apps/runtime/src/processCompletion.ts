export function processCompletion(
	cleanup: () => Promise<void>,
	exited: (code: number | null) => void,
	unconfirmed: (error: Error) => void,
) {
	let cleanupStarted = false;
	let cleanupFailed = false;
	let clean = false;
	let streamsClosed = false;
	let leaderExitObserved = false;
	let finished = false;
	let code: number | null = null;
	const finish = () => {
		if (!finished && clean && streamsClosed) {
			finished = true;
			exited(code);
		}
	};
	const startCleanup = (newAttempt = false) => {
		if (newAttempt && cleanupFailed) cleanupStarted = false;
		if (cleanupStarted || finished) return;
		cleanupStarted = true;
		cleanupFailed = false;
		cleanup().then(
			() => {
				clean = true;
				finish();
			},
			(error: Error) => {
				if (finished) return;
				cleanupFailed = true;
				unconfirmed(error);
			},
		);
	};
	return {
		stop: () => startCleanup(true),
		leaderExited: (exitCode: number | null) => {
			code = exitCode;
			const firstExit = !leaderExitObserved;
			leaderExitObserved = true;
			startCleanup(firstExit);
		},
		closed: (exitCode: number | null) => {
			code = exitCode;
			const firstClose = !streamsClosed;
			streamsClosed = true;
			startCleanup(firstClose);
			finish();
		},
		failed: () => {
			finished = true;
		},
	};
}
