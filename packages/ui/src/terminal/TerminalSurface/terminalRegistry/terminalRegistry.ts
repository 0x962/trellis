import {
	createTerminalRuntime,
	type TerminalAppearance,
	type TerminalRuntime,
	type TerminalTransport,
} from "../terminalRuntime";

type Entry = {
	identity: string;
	leased: boolean;
	disposed: boolean;
	lastUsed: number;
	timer?: ReturnType<typeof setTimeout>;
	runtime?: TerminalRuntime;
	ready: Promise<TerminalRuntime>;
};

const parkedLimit = 12;
const parkedLifetime = 5 * 60 * 1000;
const entries = new Set<Entry>();
let parking: HTMLDivElement | null = null;
let order = 0;

const remove = (entry: Entry) => {
	entry.disposed = true;
	clearTimeout(entry.timer);
	entries.delete(entry);
	if (!entries.size) {
		parking?.remove();
		parking = null;
		window.removeEventListener("pagehide", teardown);
	}
};

const dispose = (entry: Entry) => {
	remove(entry);
	entry.runtime?.dispose();
};

const teardown = () => {
	for (const entry of entries) dispose(entry);
};

const getParking = () => {
	if (parking) return parking;
	parking = document.createElement("div");
	parking.className = "terminal-parking";
	parking.inert = true;
	parking.setAttribute("aria-hidden", "true");
	document.body.append(parking);
	window.addEventListener("pagehide", teardown);
	return parking;
};

export function acquireTerminal(
	identity: string,
	appearance: TerminalAppearance,
	createTransport: () => TerminalTransport,
) {
	let entry = [...entries].find((candidate) => candidate.identity === identity && !candidate.leased);
	if (!entry) {
		const next = { identity, leased: true, disposed: false, lastUsed: ++order } as Entry;
		entries.add(next);
		next.ready = createTerminalRuntime(appearance, createTransport, getParking(), () => remove(next)).then(
			(runtime) => {
				next.runtime = runtime;
				if (next.disposed) runtime.dispose();
				else if (!next.leased) runtime.detach();
				return runtime;
			},
			(error) => {
				remove(next);
				throw error;
			},
		);
		entry = next;
	}
	const leased = entry;
	leased.leased = true;
	leased.lastUsed = ++order;
	clearTimeout(leased.timer);
	let released = false;
	return {
		ready: leased.ready,
		release() {
			if (released || leased.disposed) return;
			released = true;
			leased.leased = false;
			leased.lastUsed = ++order;
			leased.runtime?.detach();
			if (leased.disposed) return;
			leased.timer = setTimeout(() => dispose(leased), parkedLifetime);
			const parked = [...entries].filter((candidate) => !candidate.leased).sort((a, b) => a.lastUsed - b.lastUsed);
			for (const oldest of parked.slice(0, Math.max(0, parked.length - parkedLimit))) dispose(oldest);
		},
	};
}

export function disposeTerminalIdentity(identity: string) {
	for (const entry of entries) if (entry.identity === identity) dispose(entry);
}
