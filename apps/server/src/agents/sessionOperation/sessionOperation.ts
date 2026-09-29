import { join } from "node:path";
import { invalidInput } from "../../errors.ts";

const operations = new Set<string>();

// One server owns each data home. A session start must finish before deletion
// can remove its worktree, including the time before the runtime has a
// process. `holdSession` marks the session busy and answers the function that
// marks it free again. The start hands that function to the background task
// that launches the harness, so the mark stays on for the whole launch.
export function holdSession(home: string, id: string): () => void {
	const key = join(home, id);
	if (operations.has(key)) throw invalidInput("id", "Another operation is in progress for this session.");
	operations.add(key);
	return () => operations.delete(key);
}

export async function sessionOperation<T>(home: string, id: string, action: () => Promise<T>): Promise<T> {
	const release = holdSession(home, id);
	try {
		return await action();
	} finally {
		release();
	}
}
