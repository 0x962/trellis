const ResourceSocket = globalThis.WebSocket;

const assertResource = (value: string | URL) => {
	const url = new URL(value, window.location.href);
	if (url.protocol === "data:" || url.protocol === "blob:") return;
	if (url.origin !== window.location.origin || /^\/(api|rpc)(\/|$)/.test(url.pathname)) {
		throw new Error(`Storybook blocks network access: ${url.origin}${url.pathname}`);
	}
};

globalThis.fetch = new Proxy(globalThis.fetch, {
	apply(target, receiver, args: Parameters<typeof fetch>) {
		const [input] = args;
		assertResource(input instanceof Request ? input.url : input);
		return Reflect.apply(target, receiver, args);
	},
});

globalThis.WebSocket = class extends ResourceSocket {
	constructor(url: string | URL, protocols?: string | string[]) {
		const address = new URL(url, window.location.href);
		if (address.host !== window.location.host || protocols !== "vite-hmr") {
			throw new Error("Storybook blocks runtime and provider sockets.");
		}
		super(url, protocols);
	}
};

globalThis.EventSource = new Proxy(globalThis.EventSource, {
	construct() {
		throw new Error("Storybook uses a local connection state.");
	},
});
