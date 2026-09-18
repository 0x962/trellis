import type { Socket } from "node:net";
import { setImmediate } from "node:timers/promises";
import type { RuntimeListInput } from "@trellis/runtime-protocol";
import type { SessionStore } from "../sessionStore.ts";

const pageBytes = 256 * 1024;
const pageRecords = 32;

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
		if (paged && (scanned >= pageRecords || bytes >= pageBytes)) {
			nextCursor = entry.cursor;
			break;
		}
	}
	if (socket.destroyed) return;
	socket.end(paged ? `],"nextCursor":${JSON.stringify(nextCursor)}}}\n` : "]}\n");
}
