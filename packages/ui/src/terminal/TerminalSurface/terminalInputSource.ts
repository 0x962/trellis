export function terminalInputSource(host: HTMLElement) {
	let current: Event | null = null;
	let deferredText: string | null = null;
	const events = ["keydown", "keypress", "paste", "beforeinput", "input", "compositionend"];
	const capture = (event: Event) => {
		current = event;
		if (event.type === "compositionend" || event.type === "input") deferredText = (event as InputEvent).data || null;
	};
	for (const name of events) host.addEventListener(name, capture, true);
	return {
		isUserInput: (text?: string) => {
			const deferred = text !== undefined && text === deferredText;
			if (deferred) deferredText = null;
			return deferred || (current !== null && current.eventPhase !== Event.NONE);
		},
		dispose: () => {
			for (const name of events) host.removeEventListener(name, capture, true);
			current = null;
			deferredText = null;
		},
	};
}
