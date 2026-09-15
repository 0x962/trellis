export function stopAttempt() {
	const { promise, resolve } = Promise.withResolvers<Error | undefined>();
	return { stopped: promise, resolveStop: resolve };
}
