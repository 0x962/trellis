import { createConnection } from "node:net";
import type { NativeFixturePlan } from "../plan/plan.ts";

export async function assertProviderDenial(plan: NativeFixturePlan) {
	const results: { address: string; port: number; code: string }[] = [];
	for (const [address, port] of [
		["127.0.0.1", plan.denialPorts.ipv4],
		["::1", plan.denialPorts.ipv6],
	] as const) {
		const code = await new Promise<string>((resolve, reject) => {
			const socket = createConnection({ host: address, port });
			const timer = setTimeout(
				() => socket.destroy(new Error("Network denial is unconfirmed: connection timed out")),
				plan.requestTimeoutMs,
			);
			socket.once("close", () => clearTimeout(timer));
			socket.once("connect", () => socket.destroy(new Error("The fixture can open an IP connection")));
			socket.once("error", (error: NodeJS.ErrnoException) => {
				if (error.code === "EPERM" || error.code === "EACCES") resolve(error.code);
				else reject(error);
			});
		});
		results.push({ address, port, code });
	}
	return { mechanism: "macOS sandbox-exec", scope: "IP network denial for this native fixture process", results };
}
