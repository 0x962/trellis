import type { WaveSummary } from "@trellis/api";

// The name a new wave takes: `Wave <n>`, where n is one more than the
// count of waves, or the next number that no wave name holds.
export const nextWaveName = (waves: readonly WaveSummary[]): string => {
	const names = new Set(waves.map((wave) => wave.name));
	let number = waves.length + 1;
	while (names.has(`Wave ${number}`)) number += 1;
	return `Wave ${number}`;
};
