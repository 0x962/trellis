export const attempt = async <T>(call: () => Promise<T>) => {
	try {
		return { ok: true as const, value: await call() };
	} catch (error) {
		return { ok: false as const, error: String(error) };
	}
};
