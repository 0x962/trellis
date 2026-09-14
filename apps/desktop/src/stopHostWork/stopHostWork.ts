import type { HostConnection } from "../host/host.ts";

export const stopHostWork = async (host: HostConnection, stopService: () => Promise<unknown>) => {
	const result = await fetch(`${host.origin}/api/native-work/stop`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${host.token}`,
			"content-type": "application/json",
			"x-trellis-actor": "human:desktop",
		},
		body: "{}",
	});
	if (!result.ok) throw new Error(await result.text());
	await stopService();
};
