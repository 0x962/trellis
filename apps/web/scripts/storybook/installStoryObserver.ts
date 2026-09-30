type Channel = { on: (event: string, listener: (value: unknown) => void) => void };

export type StoryCheck = {
	finished: boolean;
	playStarted: boolean;
	playFinished: boolean;
	errors: string[];
};

export type StoryWindow = Window & { __trellisStoryCheck: StoryCheck };

export const installStoryObserver = () => {
	if (window.top !== window) return;
	localStorage.clear();
	sessionStorage.clear();
	const state: StoryCheck = { finished: false, playStarted: false, playFinished: false, errors: [] };
	(window as unknown as StoryWindow).__trellisStoryCheck = state;
	window.addEventListener("trellis:story-request", (event) => {
		const { procedure, configured } = (event as CustomEvent<{ procedure: string; configured: boolean }>).detail;
		if (!configured) state.errors.push(`Missing fixture: ${procedure}`);
	});
	let channel: Channel | undefined;
	Object.defineProperty(window, "__STORYBOOK_ADDONS_CHANNEL__", {
		configurable: true,
		get: () => channel,
		set: (value: Channel | undefined) => {
			channel = value;
			if (!value) return;
			value.on("storyRenderPhaseChanged", (event) => {
				const phase = (event as { newPhase: string }).newPhase;
				if (phase === "playing") state.playStarted = true;
				if (phase === "played") state.playFinished = true;
			});
			value.on("playFunctionThrewException", (error) => state.errors.push((error as Error).message));
			value.on("storyFinished", (result) => {
				const { status } = result as { status: string };
				if (status === "error") state.errors.push("Storybook reports a failed story or play action.");
				if (!state.playStarted || state.playFinished || status === "error") state.finished = true;
			});
		},
	});
};
