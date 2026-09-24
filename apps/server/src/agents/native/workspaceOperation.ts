import { resolve } from "node:path";

const operations = new Map<string, Promise<unknown>>();

// A launch and a sweep of one workspace must finish in order. Different workspaces can launch together.
export async function workspaceOperation<T>(directory: string, action: () => Promise<T>): Promise<T> {
	const key = resolve(directory);
	const previous = operations.get(key) ?? Promise.resolve();
	const current = previous.then(action, action);
	operations.set(key, current);
	try {
		return await current;
	} finally {
		if (operations.get(key) === current) operations.delete(key);
	}
}
