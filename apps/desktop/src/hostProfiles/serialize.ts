type Serializer = <T>(operation: () => Promise<T>) => Promise<T>;

const serializers = new Map<string, Serializer>();

const createSerializer = (): Serializer => {
	let tail = Promise.resolve();
	return async <T>(operation: () => Promise<T>): Promise<T> => {
		let release = () => {};
		const turn = new Promise<void>((resolve) => {
			release = resolve;
		});
		const prior = tail;
		tail = turn;
		await prior;
		try {
			return await operation();
		} finally {
			release();
		}
	};
};

export const serializerFor = (path: string): Serializer => {
	const existing = serializers.get(path);
	if (existing !== undefined) return existing;
	const created = createSerializer();
	serializers.set(path, created);
	return created;
};
