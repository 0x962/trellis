import type { Socket } from "node:net";
import { setImmediate } from "node:timers/promises";
import { listLimit, type RuntimeListInput } from "@trellis/runtime-protocol";
import type { SessionStore } from "../sessionStore.ts";

const pageBytes = 256 * 1024;
const pageRecords = 32;
// The longest a page spends on the scan before it answers with the cursor it
// reached. The reader of a page waits ten seconds for the answer, and a
// record can cost a file read, so the count and the byte size of a page do
// not on their own say how long the page takes. This bound does, and it
// leaves the reader its whole deadline for the connection and the reply.
const pageMs = 2000;

export async function writeSessionList(
	socket: Socket,
	store: SessionStore,
	id: string,
	input: RuntimeListInput & { cursor?: string },
	paged: boolean,
) {
	const write = (data: string) =>
		new Promise<void>((resolve, reject) => {
			socket.write(data, (error) => (error ? reject(error) : resolve()));
		});
	await write(`{"id":${JSON.stringify(id)},"result":${paged ? '{"sessions":[' : "["}`);
	const limit = listLimit(input);
	const deadline = Date.now() + pageMs;
	let count = 0;
	let scanned = 0;
	let bytes = 0;
	let nextCursor: string | null = null;
	const entries = store.entries(input, input.cursor);
	while (!socket.destroyed) {
		const next = entries.next();
		if (next.done) break;
		const entry = next.value;
		if (entry.session !== null) {
			const serialized = JSON.stringify(entry.session);
			await write(`${count === 0 ? "" : ","}${serialized}`);
			count++;
			bytes += Buffer.byteLength(serialized);
		}
		scanned++;
		// Terminal input shares this thread. Each record gives socket events a turn before the next disk read or serialization.
		await setImmediate();
		if (count >= limit) break;
		if (paged && (scanned >= pageRecords || bytes >= pageBytes || Date.now() >= deadline)) {
			nextCursor = entry.cursor;
			break;
		}
	}
	if (socket.destroyed) return;
	socket.end(paged ? `],"nextCursor":${JSON.stringify(nextCursor)}}}\n` : "]}\n");
}
