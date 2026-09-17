import type { TrellisEvent } from "@trellis/api";
import { useChatStore } from "../stores/chatStore";
import { readActor } from "./actor";

type AudioContextLike = {
	state: string;
	currentTime: number;
	destination: AudioNode;
	resume: () => Promise<void>;
	createOscillator: () => OscillatorNode;
	createGain: () => GainNode;
};

let context: AudioContextLike | null = null;

// Two short sine blips, rising, at a low volume. The browser holds an
// AudioContext suspended until the page has seen a user gesture, so the
// first message of a fresh tab can arrive in silence.
export const playChatSound = (create: () => AudioContextLike = () => new AudioContext()) => {
	context ??= create();
	if (context.state === "suspended") void context.resume();
	const start = context.currentTime;
	for (const [index, frequency] of [880, 1320].entries()) {
		const at = start + index * 0.09;
		const oscillator = context.createOscillator();
		const gain = context.createGain();
		oscillator.type = "sine";
		oscillator.frequency.value = frequency;
		gain.gain.setValueAtTime(0.0001, at);
		gain.gain.exponentialRampToValueAtTime(0.08, at + 0.01);
		gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.08);
		oscillator.connect(gain).connect(context.destination);
		oscillator.start(at);
		oscillator.stop(at + 0.09);
	}
};

// True for a new chat message from someone else while the sound is on. A
// message in a channel for agents only stays silent. The event stream
// reaches every open tab, so every open tab plays it.
export const wantsChatSound = (
	event: unknown,
	options: { sound: boolean; actor: { name: string; kind: string } | null },
) => {
	const typed = event as Partial<TrellisEvent>;
	if (typed.type !== "chat.message" || !options.sound) return false;
	const { actor, aiOnly } = typed as Extract<TrellisEvent, { type: "chat.message" }>;
	if (aiOnly) return false;
	return options.actor === null || actor.kind !== options.actor.kind || actor.name !== options.actor.name;
};

export const notifyChat = (event: unknown) => {
	if (wantsChatSound(event, { sound: useChatStore.getState().sound, actor: readActor() })) playChatSound();
};
