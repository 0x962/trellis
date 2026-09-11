// The picture an agent gets instead of initials: a circle filled with soft
// overlapping color, the way a macro photograph of a flower looks when the
// lens is wide open and nothing is in focus. The colors are mid-century
// color field: few colors, close in value, none of them pure.
//
// One agent keeps one picture, because the hue and the placement come from
// its name and not from a random number.

// FNV-1a. Any change in the name gives a different picture, and the same
// name always gives the same one.
const hashOf = (seed: string) => {
	let hash = 2166136261;
	for (let index = 0; index < seed.length; index += 1) {
		hash ^= seed.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
};

// A number from `hash` in [0, span), stable for one seed and one slot.
const pick = (hash: number, slot: number, span: number) => Math.floor((hash / 7 ** slot) % span);

// The name picks one angle on the color wheel, and the four colors sit at
// fixed distances from it. Saturation never passes 48 percent, so no color
// comes out pure, and the four lightness steps hold the picture together.
const color = (hue: number, saturation: number, lightness: number, alpha = 1) =>
	`hsl(${((hue % 360) + 360) % 360} ${saturation}% ${lightness}% / ${alpha})`;

export type AgentGradient = { backgroundColor: string; backgroundImage: string };

// Three radial gradients over a flat ground. Each one fades to nothing well
// before its edge, so the colors bleed into each other and no line shows.
// `closest-side` keeps every bloom inside the circle.
export const agentGradient = (seed: string): AgentGradient => {
	const hash = hashOf(seed);
	// 72 angles, 5 degrees apart. Two names that land side by side still read
	// as two hues, and a run of agents covers the whole wheel.
	const hue = pick(hash, 0, 72) * 5;
	const blooms: readonly [number, number, number][] = [
		[hue + 28, 46, 66],
		[hue - 36, 42, 30],
		[hue + 74, 30, 82],
	];
	const at = (slot: number) => `${20 + pick(hash, slot, 60)}% ${20 + pick(hash, slot + 1, 60)}%`;
	return {
		backgroundColor: color(hue, 34, 44),
		backgroundImage: blooms
			.map(
				([bloomHue, saturation, lightness], index) =>
					`radial-gradient(closest-side circle at ${at(index * 2 + 1)}, ${color(bloomHue, saturation, lightness)} 0%, ${color(bloomHue, saturation, lightness, 0)} ${70 + index * 2}%)`,
			)
			.join(", "),
	};
};
