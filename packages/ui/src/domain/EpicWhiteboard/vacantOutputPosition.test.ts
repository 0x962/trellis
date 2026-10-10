import { expect, test } from "bun:test";
import { vacantOutputPosition } from "./vacantOutputPosition";

test("places a new output below neighboring tickets without moving them", () => {
	const tickets = [
		{ x: 432, y: 392, w: 320, h: 216 },
		{ x: 432, y: 88, w: 320, h: 216 },
	];
	const before = structuredClone(tickets);
	expect(vacantOutputPosition({ x: 424, y: 88, w: 280, h: 144 }, tickets)).toEqual({ x: 424, y: 632 });
	expect(tickets).toEqual(before);
});

test("keeps a vacant position near the source", () => {
	expect(vacantOutputPosition({ x: 424, y: 88, w: 280, h: 144 }, [{ x: 24, y: 88, w: 320, h: 216 }])).toEqual({
		x: 424,
		y: 88,
	});
});
