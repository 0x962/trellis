import { describe, expect, test } from "bun:test";
import { dragPreviewFrame, dragPreviewPosition, dragPreviewRotation } from "./dragPreview";

describe("features/board/dragPreview", () => {
	test("keeps the grabbed point under the pointer", () => {
		const frame = dragPreviewFrame({ left: 100, top: 200, width: 240, height: 90 }, { clientX: 160, clientY: 225 });
		expect(dragPreviewPosition(frame, { clientX: 420, clientY: 510 })).toEqual({ left: 360, top: 485 });
	});

	test("gravity lowers the side opposite the grabbed point", () => {
		const leftGrip = dragPreviewFrame({ left: 0, top: 0, width: 200, height: 80 }, { clientX: 50, clientY: 20 });
		const rightGrip = dragPreviewFrame({ left: 0, top: 0, width: 200, height: 80 }, { clientX: 150, clientY: 20 });
		const pointer = { clientX: 50, clientY: 20 };

		expect(dragPreviewRotation(leftGrip, pointer, pointer)).toBe(1);
		expect(dragPreviewRotation(rightGrip, pointer, pointer)).toBe(-1);
	});

	test("horizontal momentum stays within eight degrees", () => {
		const frame = dragPreviewFrame({ left: 0, top: 0, width: 200, height: 80 }, { clientX: 100, clientY: 20 });
		expect(dragPreviewRotation(frame, { clientX: 200, clientY: 20 }, { clientX: 100, clientY: 20 })).toBe(8);
		expect(dragPreviewRotation(frame, { clientX: 0, clientY: 20 }, { clientX: 100, clientY: 20 })).toBe(-8);
	});
});
