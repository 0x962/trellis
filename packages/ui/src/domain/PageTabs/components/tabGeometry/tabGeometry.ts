export type TabBox = { left: number; width: number };

export function tabBoxes(widths: readonly number[]): TabBox[] {
	let left = 0;
	return widths.map((width) => {
		const box = { left, width };
		left += width + 4;
		return box;
	});
}

export const tabStripWidth = (boxes: readonly TabBox[]) => {
	const last = boxes.at(-1);
	return last ? last.left + last.width : 0;
};

export const tabDropIndex = (boxes: readonly TabBox[], offset: number) => {
	const index = boxes.findIndex((box) => offset < box.left + box.width / 2);
	return index < 0 ? boxes.length : index;
};

export const visibleTabRange = (boxes: readonly TabBox[], left: number, width: number) => {
	const first = boxes.findIndex((box) => box.left + box.width > left);
	const after = boxes.findIndex((box) => box.left >= left + width);
	return {
		start: Math.max(0, (first < 0 ? boxes.length : first) - 2),
		end: Math.min(boxes.length, (after < 0 ? boxes.length : after) + 2),
	};
};
