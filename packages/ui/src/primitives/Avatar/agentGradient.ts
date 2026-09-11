// The picture an agent gets instead of initials: a circle filled with soft
// overlapping color, the way a macro photograph of a flower looks when the
// lens is wide open and nothing is in focus. The palettes are mid-century
// color field: few colors, close in value, none of them pure.
//
// One agent keeps one picture, because the palette and the placement come
// from its name and not from a random number.

// Four colors per palette: the ground, then three blooms over it.
const palettes: readonly (readonly [string, string, string, string])[] = [
	["#C96F4A", "#E8A87C", "#8C3B24", "#F2D8C2"],
	["#3F5E78", "#7FA6C4", "#22384A", "#CFE0EC"],
	["#7C6A9C", "#B9A3D4", "#4A3B66", "#E3D8F0"],
	["#5B7F5A", "#9CBE8C", "#33512F", "#DDE9CE"],
	["#B5563F", "#E2856B", "#6E2A1C", "#F6D3C1"],
	["#C9A227", "#E8CE72", "#8A6B12", "#F7EBC0"],
	["#A64B6B", "#D68CA5", "#6E2540", "#F2CFDC"],
	["#2F6E6B", "#6FA8A2", "#1B4442", "#C9E3DF"],
];

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

export type AgentGradient = { backgroundColor: string; backgroundImage: string };

// Three radial gradients over a flat ground. Each one fades to transparent
// well before its edge, so the colors bleed into each other and no line
// shows. `closest-side` keeps every bloom inside the circle.
export const agentGradient = (seed: string): AgentGradient => {
	const hash = hashOf(seed);
	const [ground, first, second, third] = palettes[pick(hash, 0, palettes.length)]!;
	const at = (slot: number) => `${20 + pick(hash, slot, 60)}% ${20 + pick(hash, slot + 1, 60)}%`;
	return {
		backgroundColor: ground,
		backgroundImage: [
			`radial-gradient(closest-side circle at ${at(1)}, ${first} 0%, ${first}00 70%)`,
			`radial-gradient(closest-side circle at ${at(3)}, ${second} 0%, ${second}00 72%)`,
			`radial-gradient(closest-side circle at ${at(5)}, ${third} 0%, ${third}00 68%)`,
		].join(", "),
	};
};
