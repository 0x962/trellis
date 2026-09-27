type EnqueueOperation = <T>(operation: () => Promise<T>) => Promise<T>;

const operationQueues = new Map<string, EnqueueOperation>();

const createOperationQueue = (): EnqueueOperation => {
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

export const operationQueueFor = (path: string): EnqueueOperation => {
	const existing = operationQueues.get(path);
	if (existing !== undefined) return existing;
	const created = createOperationQueue();
	operationQueues.set(path, created);
	return created;
};
