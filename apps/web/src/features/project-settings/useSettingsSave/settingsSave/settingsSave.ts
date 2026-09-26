export type SettingsSaveStatus = { pending: boolean; dirty: boolean; error: string | null };

export function settingsSave<T extends object>(initialValue: T, save: (patch: Partial<T>) => Promise<void>) {
	let value = initialValue;
	let saved = initialValue;
	let pending = 0;
	let queue = Promise.resolve();
	const queued = new Map<keyof T, { value: T[keyof T]; promise: Promise<void> }>();
	const errors = new Map<keyof T, string>();
	const listeners = new Set<() => void>();
	const status = (): SettingsSaveStatus => ({
		pending: pending > 0,
		dirty: (Object.keys(value) as (keyof T)[]).some((key) => !Object.is(value[key], saved[key])),
		error: errors.values().next().value ?? null,
	});
	let snapshot = { value, status: status() };
	const publish = () => {
		snapshot = { value, status: status() };
		for (const listener of listeners) listener();
	};
	return {
		getSnapshot: () => snapshot,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		setField: <K extends keyof T>(key: K, next: T[K]) => {
			value = { ...value, [key]: next };
			errors.delete(key);
			publish();
		},
		saveField: <K extends keyof T>(key: K) => {
			const next = value[key];
			const previous = queued.get(key);
			if (previous && Object.is(previous.value, next)) return previous.promise;
			pending += 1;
			publish();
			queue = queue.then(async () => {
				if (!Object.is(next, saved[key])) {
					try {
						const patch: Partial<T> = {};
						patch[key] = next;
						await save(patch);
						saved = { ...saved, [key]: next };
						errors.delete(key);
					} catch (error) {
						errors.set(key, (error as Error).message);
					}
				}
				pending -= 1;
				if (queued.get(key) === request) queued.delete(key);
				publish();
			});
			const request = { value: next, promise: queue };
			queued.set(key, request);
			return queue;
		},
	};
}
