// A stand-in for react-native-sse. `instances` lists every stream the module
// under test opened, oldest first. `emit` on one delivers a server event to
// the listeners registered for that event name, `succeed` reports that the
// socket is up, and `fail` reports the socket error the library sends when
// the network drops.
export type StreamEvent = {
	type: string;
	data: string | null;
	lastEventId: string | null;
	url: string;
};

// The library reports the XMLHttpRequest state with the socket error.
// XMLHttpRequest.DONE is 4, the state of a request the network cut off.
export type StreamErrorEvent = {
	type: "error";
	message: string;
	xhrStatus: number;
	xhrState: number;
};

export type StreamOpenEvent = { type: "open" };

type Listener = (event: StreamEvent | StreamErrorEvent | StreamOpenEvent) => void;

export type EventSourceOptions = {
	method?: string;
	timeout?: number;
	timeoutBeforeConnection?: number;
	withCredentials?: boolean;
	headers?: Record<string, string>;
	body?: unknown;
	debug?: boolean;
	pollingInterval?: number;
	lineEndingCharacter?: string;
};

export const instances: MockEventSource[] = [];

export const resetEventSources = () => {
	instances.length = 0;
};

export class MockEventSource {
	readonly url: string;
	readonly options: EventSourceOptions;
	readonly listeners = new Map<string, Listener[]>();
	closeCalls = 0;

	constructor(url: string | URL, options: EventSourceOptions = {}) {
		this.url = String(url);
		this.options = options;
		instances.push(this);
	}

	open() {}

	close() {
		this.closeCalls += 1;
	}

	addEventListener(type: string, listener: Listener) {
		this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
	}

	removeEventListener(type: string, listener: Listener) {
		this.listeners.set(
			type,
			(this.listeners.get(type) ?? []).filter((item) => item !== listener),
		);
	}

	removeAllEventListeners(type?: string) {
		if (type === undefined) this.listeners.clear();
		else this.listeners.delete(type);
	}

	dispatch(type: string, event: StreamEvent | StreamErrorEvent | StreamOpenEvent) {
		for (const listener of this.listeners.get(type) ?? []) listener(event);
	}

	emit(type: string, data: string | null, lastEventId: string | null = null) {
		this.dispatch(type, { type, data, lastEventId, url: this.url });
	}

	succeed() {
		this.dispatch("open", { type: "open" });
	}

	fail(xhrState: number) {
		this.dispatch("error", { type: "error", message: "", xhrStatus: 0, xhrState });
	}
}

export default MockEventSource;
