export type ExecutionEnvironment = Record<string, string | undefined>;

type ResolveEnvironment = (
	shell: string,
	bundledBin: string,
	env: ExecutionEnvironment,
) => Promise<ExecutionEnvironment>;

export const definedEnvironment = (env: ExecutionEnvironment) =>
	Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined));

const missingTrellisValues = (env: ExecutionEnvironment, shellEnv: Record<string, string>) =>
	Object.fromEntries(
		Object.entries(definedEnvironment(env)).filter(
			([key, value]) => key.startsWith("TRELLIS_") && shellEnv[key] === undefined && value !== undefined,
		),
	);

// `pending` holds one login shell run, so callers that ask at the same time
// share it. A run that ends in an error clears `pending`. The cause can be
// temporary, such as a shell that answers too late while the machine is busy at
// boot, so the next caller starts a new run and can still get a working
// environment without a server restart.
export function createExecutionEnvironment(env: ExecutionEnvironment, resolve: ResolveEnvironment) {
	let pending: Promise<Record<string, string>> | undefined;
	return () => {
		if (!env.TRELLIS_EXECUTION_SHELL) return Promise.resolve(definedEnvironment(env));
		pending ??= resolve(env.TRELLIS_EXECUTION_SHELL, env.TRELLIS_EXECUTION_BIN!, env)
			.then((resolvedEnv) => {
				const shellEnv = definedEnvironment(resolvedEnv);
				return { ...missingTrellisValues(env, shellEnv), ...shellEnv };
			})
			.catch((error: unknown) => {
				pending = undefined;
				throw error;
			});
		return pending;
	};
}
