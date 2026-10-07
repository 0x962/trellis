type Channel = { on: (event: string, listener: (value: unknown) => void) => void };

export type StoryCheck = {
	finished: boolean;
	playStarted: boolean;
	playFinished: boolean;
	errors: string[];
	phase: string | null;
	stacks: string[];
	inputs: {
		type: string;
		target: string | null;
		label: string | null;
		button: number;
		buttons: number;
		key: string;
		time: number;
	}[];
};

export type StoryWindow = Window & { __trellisStoryCheck: StoryCheck };

export const installStoryObserver = () => {
	if (window.top !== window) return;
	localStorage.clear();
	sessionStorage.clear();
	const state: StoryCheck = {
		finished: false,
		playStarted: false,
		playFinished: false,
		errors: [],
		phase: null,
		stacks: [],
		inputs: [],
	};
	(window as unknown as StoryWindow).__trellisStoryCheck = state;
	for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "contextmenu", "click", "keydown"]) {
		window.addEventListener(
			type,
			(event) => {
				const input = event as MouseEvent & KeyboardEvent;
				const target = input.target instanceof Element ? input.target : null;
				state.inputs.push({
					type,
					target: target?.tagName ?? null,
					label: target?.getAttribute("aria-label") ?? null,
					button: input.button,
					buttons: input.buttons,
					key: input.key,
					time: input.timeStamp,
				});
			},
			true,
		);
	}
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
				state.phase = phase;
				if (phase === "playing") state.playStarted = true;
				if (phase === "played") state.playFinished = true;
			});
			value.on("playFunctionThrewException", (error) => {
				state.errors.push((error as Error).message);
				if ((error as Error).stack) state.stacks.push((error as Error).stack!);
			});
			value.on("storyFinished", (result) => {
				const { status } = result as { status: string };
				if (status === "error") state.errors.push("Storybook reports a failed story or play action.");
				if (!state.playStarted || state.playFinished || status === "error") state.finished = true;
			});
		},
	});
};
