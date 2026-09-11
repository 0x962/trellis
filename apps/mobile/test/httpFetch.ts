import { Agent, request as nodeRequest } from "node:http";
import type { FetchFn } from "./record";

// Every request closes its socket. A kept socket is an open handle, and Jest
// waits on it after the last test.
const agent = new Agent({ keepAlive: false });

// A fetch over node:http. The Jest environment installs the React Native
// fetch, which needs a native module and reaches no socket, so every request
// to the spawned server goes through this one. Request, Response, Headers,
// and FormData are the platform classes, so a body serializes itself.

const headersOf = (request: Request) => {
	const headers: Record<string, string> = {};
	request.headers.forEach((value, name) => {
		headers[name] = value;
	});
	return headers;
};

export const httpFetch: FetchFn = async (input, init) => {
	const request = input instanceof Request ? input : new Request(input, init);
	const body = Buffer.from(await request.arrayBuffer());
	const url = new URL(request.url);
	return new Promise<Response>((resolve, reject) => {
		const outgoing = nodeRequest(
			{
				agent,
				protocol: url.protocol,
				hostname: url.hostname,
				port: url.port,
				path: `${url.pathname}${url.search}`,
				method: request.method,
				headers: { ...headersOf(request), "content-length": String(body.byteLength) },
			},
			(incoming) => {
				const chunks: Buffer[] = [];
				incoming.on("data", (chunk: Buffer) => void chunks.push(chunk));
				incoming.on("end", () => {
					const headers = new Headers();
					for (const [name, value] of Object.entries(incoming.headers)) {
						if (typeof value === "string") headers.set(name, value);
					}
					const status = incoming.statusCode!;
					// A 204 and a 304 carry no body, and the Response constructor
					// refuses one.
					const payload = status === 204 || status === 304 ? null : Buffer.concat(chunks);
					resolve(new Response(payload, { status, headers }));
				});
			},
		);
		outgoing.on("error", reject);
		outgoing.end(body);
	});
};
