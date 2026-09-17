import type { Route } from "@playwright/test";

export const mapRpcResponse = async (route: Route, revive: NonNullable<Parameters<typeof JSON.parse>[1]>) => {
	const response = await route.fetch();
	const source = await response.text();
	const transform = (value: string) => JSON.stringify(JSON.parse(value, revive));
	const body = response.headers()["content-type"]?.includes("text/event-stream")
		? source.replace(/^data: (.+)$/gm, (_, data: string) => `data: ${transform(data)}`)
		: transform(source);
	await route.fulfill({ response, body });
};
