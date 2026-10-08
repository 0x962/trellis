import type { Settings } from "@trellis/api";
import { agentPrompt, settings } from "../settings";

export function settingsJourney(failures = 0) {
	let stored = structuredClone(settings);
	let prompt = structuredClone(agentPrompt);
	let remainingFailures = failures;
	const writes: Settings[] = [];
	const requests: Settings[] = [];
	let pending: Promise<void> | undefined;
	return {
		writes,
		requests,
		holdNextSave() {
			let release!: () => void;
			pending = new Promise<void>((resolve) => {
				release = resolve;
			});
			return release;
		},
		reset() {
			stored = structuredClone(settings);
			prompt = structuredClone(agentPrompt);
			remainingFailures = failures;
			writes.length = 0;
			requests.length = 0;
			pending = undefined;
		},
		responses: {
			"settings.agentPrompt": () => prompt,
			"settings.setAgentPrompt": (input: unknown) => {
				const { template } = input as { template: string | null };
				prompt = { ...prompt, template: template ?? prompt.defaultTemplate, isCustom: template !== null };
				return prompt;
			},
			"settings.get": () => stored,
			"settings.set": async (input: unknown) => {
				requests.push(structuredClone(input as Settings));
				const held = pending;
				pending = undefined;
				await held;
				if (remainingFailures > 0) {
					remainingFailures -= 1;
					throw new Error("The fixture rejects this save.");
				}
				stored = structuredClone(input as Settings);
				writes.push(stored);
				return stored;
			},
		},
	};
}
