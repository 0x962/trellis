import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { expectClasses } from "../../../test/classes";
import { Skeleton } from "./Skeleton";

describe("Skeleton", () => {
	test("skeleton lines are hidden from assistive tech and stop under reduced motion", () => {
		const { container } = render(<Skeleton width="w-32" lines={2} />);
		const skeleton = container.firstElementChild!;
		expect(skeleton.getAttribute("aria-busy")).toBe("true");
		expect(skeleton.getAttribute("aria-hidden")).toBe("true");
		const lines = Array.from(skeleton.children);
		expect(lines).toHaveLength(2);
		for (const line of lines) {
			expectClasses(line, "w-32 bg-border rounded-sm animate-pulse-live motion-reduce:animate-none");
		}
	});
});
