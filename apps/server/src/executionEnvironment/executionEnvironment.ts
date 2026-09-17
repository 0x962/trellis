export type ExecutionEnvironment = Record<string, string | undefined>;

type ResolveEnvironment = (
	shell: string,
	bundledBin: string,
	env: ExecutionEnvironment,
) => Promise<ExecutionEnvironment>;

const values = (env: ExecutionEnvironment) =>
	Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined));

// `pending` holds one login shell run, so callers that ask at the same time
// share it. A run that ends in an error clears `pending`. The cause can be
// temporary, such as a shell that answers too late while the machine is busy at
// boot, so the next caller starts a new run and can still get a working
// environment without a server restart.
export function createExecutionEnvironment(env: ExecutionEnvironment, resolve: ResolveEnvironment) {
	let pending: Promise<Record<string, string>> | undefined;
	return () => {
		if (!env.TRELLIS_EXECUTION_SHELL) return Promise.resolve(values(env));
		pending ??= resolve(env.TRELLIS_EXECUTION_SHELL, env.TRELLIS_EXECUTION_BIN!, env)
			.then((shellEnv) => ({
				...values(shellEnv),
				...Object.fromEntries(Object.entries(values(env)).filter(([key]) => key.startsWith("TRELLIS_"))),
			}))
			.catch((error: unknown) => {
				pending = undefined;
				throw error;
			});
		return pending;
	};
}
