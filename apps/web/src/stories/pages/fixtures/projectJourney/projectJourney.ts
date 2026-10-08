import type { Project } from "@trellis/api";
import { project } from "../project";

export function projectJourney(failures = 0) {
	let stored = structuredClone(project);
	let remainingFailures = failures;
	const writes: Partial<Project>[] = [];
	const requests: unknown[] = [];
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
			stored = structuredClone(project);
			remainingFailures = failures;
			writes.length = 0;
			requests.length = 0;
			pending = undefined;
		},
		responses: {
			"projects.get": () => stored,
			"projects.list": () => [stored],
			"projects.update": async (input: unknown) => {
				requests.push(structuredClone(input));
				const held = pending;
				pending = undefined;
				await held;
				if (remainingFailures > 0) {
					remainingFailures -= 1;
					throw new Error("The fixture rejects this save.");
				}
				const { project: _project, ...patch } = input as Partial<Project> & { project: string };
				stored = { ...stored, ...patch };
				writes.push(patch);
				return stored;
			},
		},
	};
}
