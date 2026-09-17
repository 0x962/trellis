import { join } from "node:path";
import { invalidInput } from "../../errors.ts";

const operations = new Set<string>();

// One server owns each data home. A session start must finish before deletion
// can remove its worktree, including the time before the runtime has a process.
export async function sessionOperation<T>(home: string, id: string, action: () => Promise<T>): Promise<T> {
	const key = join(home, id);
	if (operations.has(key)) throw invalidInput("id", "Another operation is in progress for this session.");
	operations.add(key);
	try {
		return await action();
	} finally {
		operations.delete(key);
	}
}
