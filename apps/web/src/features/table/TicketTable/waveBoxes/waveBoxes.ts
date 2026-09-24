import type { VirtualItem } from "@tanstack/react-virtual";

// The box that one group owns in the virtual body: the offset of its header
// line, and the distance from that line to the header line of the next
// group. The header of the group stays at the top of the scroll container
// while its box passes, so the header of the next group pushes it out. The
// last group runs to the end of the body.
export type WaveBox = { top: number; height: number };

// The box of each group header, by the index of that header line in the
// list.
//
// `lines` is the measured offset and height of every line, so a wave whose
// agent lines wrap owns a taller box than the estimate reserved for it. A
// line the virtualizer has not measured yet carries its estimate, and the
// box grows when the measurement arrives.
export const waveBoxes = (
	headerIndexes: readonly number[],
	lines: readonly VirtualItem[],
	totalSize: number,
): Map<number, WaveBox> => {
	const boxes = new Map<number, WaveBox>();
	headerIndexes.forEach((lineIndex, headerOrder) => {
		const top = lines[lineIndex]?.start;
		if (top === undefined) return;
		const nextIndex = headerIndexes[headerOrder + 1];
		const end = (nextIndex === undefined ? undefined : lines[nextIndex]?.start) ?? totalSize;
		boxes.set(lineIndex, { top, height: Math.max(end - top, 0) });
	});
	return boxes;
};
