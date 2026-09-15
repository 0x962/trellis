export function processCompletion(
	cleanup: () => Promise<void>,
	exited: (code: number | null) => void,
	unconfirmed: (error: Error) => void,
) {
	let cleanupStarted = false;
	let cleanupFailed = false;
	let clean = false;
	let streamsClosed = false;
	let finished = false;
	let code: number | null = null;
	const finish = () => {
		if (!finished && clean && streamsClosed) {
			finished = true;
			exited(code);
		}
	};
	const startCleanup = () => {
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
		stop: () => {
			if (cleanupFailed) cleanupStarted = false;
			startCleanup();
		},
		leaderExited: (exitCode: number | null) => {
			code = exitCode;
			startCleanup();
		},
		closed: (exitCode: number | null) => {
			code = exitCode;
			streamsClosed = true;
			startCleanup();
			finish();
		},
		failed: () => {
			finished = true;
		},
	};
}
