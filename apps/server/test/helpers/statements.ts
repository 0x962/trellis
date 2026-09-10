import type { PGlite } from "@electric-sql/pglite";

// Every statement PGlite runs passes through `execProtocolStream` on the
// instance, as one Parse message (extended protocol, first byte `P`) or one
// Query message (simple protocol, first byte `Q`). Other messages (Bind,
// Describe, Execute, Sync) belong to the same statement. The count covers
// the statements `fn` issues; a BEGIN or COMMIT outside `fn` is not counted.
export const countStatements = async (client: PGlite, fn: () => Promise<unknown>) => {
	const original = client.execProtocolStream.bind(client);
	let count = 0;
	const spy: typeof client.execProtocolStream = async (message, options) => {
		if (message[0] === 0x50 || message[0] === 0x51) count += 1;
		return original(message, options);
	};
	Object.defineProperty(client, "execProtocolStream", { value: spy, configurable: true, writable: true });
	try {
		await fn();
	} finally {
		Reflect.deleteProperty(client, "execProtocolStream");
	}
	return count;
};

// Records the text of every statement PGlite runs, in order. A test reads
// the list to prove that one statement ran before another action started.
// The Parse and Query messages carry the SQL text, so a search over the
// decoded message finds it.
export const captureStatements = (client: PGlite) => {
	const original = client.execProtocolStream.bind(client);
	const texts: string[] = [];
	const spy: typeof client.execProtocolStream = async (message, options) => {
		if (message[0] === 0x50 || message[0] === 0x51) texts.push(new TextDecoder().decode(message));
		return original(message, options);
	};
	Object.defineProperty(client, "execProtocolStream", { value: spy, configurable: true, writable: true });
	return {
		texts,
		restore: () => {
			Reflect.deleteProperty(client, "execProtocolStream");
		},
	};
};
