type ResolveEnvironment = (shell: string, bundledBin: string, env: NodeJS.ProcessEnv) => Promise<NodeJS.ProcessEnv>;

const values = (env: NodeJS.ProcessEnv) =>
	Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined));

// resolve runs the login shell. pending holds its promise, and every spawn
// awaits that promise. A successful promise stays cached for the life of the
// process. When the promise rejects, pending is cleared, so the next spawn
// runs resolve again. The gh poller is one such caller. While gh is not ok,
// the poller runs gh auth status once per minute. Each run starts a new login
// shell.
export function createExecutionEnvironment(env: NodeJS.ProcessEnv, resolve: ResolveEnvironment) {
	let pending: Promise<Record<string, string>> | undefined;
	return () => {
		if (!env.TRELLIS_EXECUTION_SHELL) return Promise.resolve(values(env));
		pending ??= resolve(env.TRELLIS_EXECUTION_SHELL, env.TRELLIS_EXECUTION_BIN!, env).then(
			(shellEnv) => ({
				...values(shellEnv),
				...Object.fromEntries(Object.entries(values(env)).filter(([key]) => key.startsWith("TRELLIS_"))),
			}),
			(error: unknown) => {
				pending = undefined;
				throw error;
			},
		);
		return pending;
	};
}
