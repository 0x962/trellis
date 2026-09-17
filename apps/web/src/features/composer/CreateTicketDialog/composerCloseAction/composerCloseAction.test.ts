import { describe, expect, test } from "bun:test";
import { composerCloseAction } from "./composerCloseAction";

describe("composerCloseAction", () => {
	test("blocks close and discard while the create request is pending", () => {
		expect(composerCloseAction({ createPending: true, dirty: true })).toBe("block");
		expect(composerCloseAction({ createPending: true, dirty: false })).toBe("block");
	});

	test("asks before it closes a dirty idle composer", () => {
		expect(composerCloseAction({ createPending: false, dirty: true })).toBe("confirm");
	});

	test("closes a clean idle composer at once", () => {
		expect(composerCloseAction({ createPending: false, dirty: false })).toBe("close");
	});
});
