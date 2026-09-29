import { type AddressInfo, createConnection, createServer } from "node:net";

export async function openNetworkControls(timeoutMs: number) {
	const servers = [] as ReturnType<typeof createServer>[];
	const receipts: { address: string; port: number; positiveConnections: number }[] = [];
	try {
		for (const address of ["127.0.0.1", "::1"]) {
			const receipt = { address, port: 0, positiveConnections: 0 };
			const server = createServer((socket) => {
				receipt.positiveConnections++;
				socket.end();
			});
			servers.push(server);
			await new Promise<void>((resolve, reject) => {
				server.once("error", reject);
				server.listen({ host: address, port: 0, ipv6Only: address === "::1" }, resolve);
			});
			receipt.port = (server.address() as AddressInfo).port;
			await new Promise<void>((resolve, reject) => {
				const socket = createConnection({ host: address, port: receipt.port });
				const timer = setTimeout(() => socket.destroy(new Error("The network positive control timed out")), timeoutMs);
				socket.once("error", reject);
				socket.once("end", () => resolve());
				socket.once("close", () => clearTimeout(timer));
				socket.resume();
			});
			receipts.push(receipt);
		}
	} catch (error) {
		for (const server of servers) server.close();
		throw error;
	}
	return {
		ports: { ipv4: receipts[0]!.port, ipv6: receipts[1]!.port },
		receipts,
		async close() {
			await Promise.all(
				servers.map(
					(server) =>
						new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
				),
			);
		},
	};
}
