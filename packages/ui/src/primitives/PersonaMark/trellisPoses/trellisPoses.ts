const ends = [
	[13, 8, 24, 19],
	[19, 24, 8, 13],
	[8, 19, 19, 8],
	[24, 13, 13, 24],
] as const;
const shifts = [
	[1.8, -1.8],
	[-1.8, 1.8],
	[-1.8, -1.8],
	[1.8, 1.8],
] as const;
const angles = [-90, 90, 180, 0];
const path = (points: number[][]) =>
	`path("${points.map(([x, y], i) => `${i ? "L" : "M"}${x!.toFixed(3)} ${y!.toFixed(3)}`).join(" ")}")`;

export const trellisPoses = ends.map(([x1, y1, x2, y2], i) => {
	const rest = Array.from({ length: 32 }, (_, n) => [x1 + ((x2 - x1) * n) / 31, y1 + ((y2 - y1) * n) / 31]);
	const [dx, dy] = shifts[i]!;
	const open = rest.map(([x, y]) => [x! + dx, y! + dy]);
	const circle = rest.map((_, n) => {
		const angle = ((angles[i]! + 12 + (66 * n) / 31) * Math.PI) / 180;
		return [16 + Math.cos(angle) * 9.5, 16 + Math.sin(angle) * 9.5];
	});
	return [rest, rest, open, circle, circle, open, rest, rest].map(path);
});
