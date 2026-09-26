export type SettingsSaveStatus = { pending: boolean; dirty: boolean; error: string | null };

export function settingsSave<T extends object>(initialValue: T, save: (patch: Partial<T>) => Promise<void>) {
	let value = initialValue;
	let saved = initialValue;
	let pending = 0;
	let queue = Promise.resolve();
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
			pending += 1;
			publish();
			queue = queue.then(async () => {
				if (!Object.is(next, saved[key])) {
					try {
						await save({ [key]: next } as Partial<T>);
						saved = { ...saved, [key]: next };
						errors.delete(key);
					} catch (error) {
						errors.set(key, (error as Error).message);
					}
				}
				pending -= 1;
				publish();
			});
			return queue;
		},
	};
}
