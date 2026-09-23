// One piece of paper ribbon thrown out of the check bar.
export type ConfettiPiece = {
	// Where the piece starts, in px from the left end of the 192 px bar.
	x: number;
	// How far the piece drifts sideways over its whole flight, in px.
	dx: number;
	// How far the piece turns over its whole flight, in degrees.
	turn: number;
	// The custom property that holds the piece's colour.
	ink: "--check-ribbon-pass" | "--success" | "--film-gold";
};

// How long one piece flies.
export const confettiPieceMs = 900;

// How long the last piece waits before it starts. Each piece waits 26 ms
// longer than the piece to its left.
export const confettiStepMs = 26;

// The seven pieces, spread across the 192 px bar. The two greens carry five
// of the seven, and the gold is the one accent. The drift and the turn of
// each piece are fixed numbers, so two bars that celebrate side by side
// throw the same shapes.
export const confettiPieces: readonly ConfettiPiece[] = [
	{ x: 14, dx: -24, turn: -286, ink: "--check-ribbon-pass" },
	{ x: 40, dx: -12, turn: 218, ink: "--success" },
	{ x: 66, dx: -19, turn: -140, ink: "--film-gold" },
	{ x: 94, dx: 9, turn: 302, ink: "--check-ribbon-pass" },
	{ x: 122, dx: 18, turn: -244, ink: "--success" },
	{ x: 150, dx: -7, turn: 176, ink: "--film-gold" },
	{ x: 176, dx: 25, turn: -318, ink: "--check-ribbon-pass" },
];

// How long the whole effect takes: the last piece starts after six steps
// and then flies for its full time.
export const confettiMs = confettiPieceMs + (confettiPieces.length - 1) * confettiStepMs;
