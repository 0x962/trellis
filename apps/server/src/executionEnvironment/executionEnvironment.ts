type ResolveEnvironment = (shell: string, bundledBin: string, env: NodeJS.ProcessEnv) => Promise<NodeJS.ProcessEnv>;

const values = (env: NodeJS.ProcessEnv) =>
	Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined));

// The login shell runs once per server process on success, and every spawn
// shares the cached result. A failed or slow login shell fails only the spawns
// that wait on it. The next spawn starts a new login shell.
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
