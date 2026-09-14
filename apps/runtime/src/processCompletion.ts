export function processCompletion(
	cleanup: () => Promise<void>,
	exited: (code: number | null) => void,
	unconfirmed: (error: Error) => void,
) {
	let cleanupStarted = false;
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
	const stop = () => {
		if (cleanupStarted || finished) return;
		cleanupStarted = true;
		cleanup().then(
			() => {
				clean = true;
				finish();
			},
			(error: Error) => {
				if (finished) return;
				finished = true;
				unconfirmed(error);
			},
		);
	};
	return {
		stop,
		leaderExited: (exitCode: number | null) => {
			code = exitCode;
			stop();
		},
		closed: (exitCode: number | null) => {
			code = exitCode;
			streamsClosed = true;
			stop();
			finish();
		},
		failed: () => {
			finished = true;
		},
	};
}
