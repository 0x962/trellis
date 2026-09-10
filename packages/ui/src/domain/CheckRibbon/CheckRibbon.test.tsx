import { describe, expect, spyOn, test } from "bun:test";
import { render } from "@testing-library/react";
import { expectClasses } from "../../../test/classes";
import { type Check, CheckRibbon } from "./CheckRibbon";

const check = (name: string, bucket: Check["bucket"]) => ({ name, bucket });
const many = (count: number, failAt = -1): Check[] =>
	Array.from({ length: count }, (_, index) => check(`check ${index + 1}`, index === failAt ? "fail" : "pass"));

// The px width the segments and the gaps of a rendered ribbon occupy.
// happy-dom lays nothing out, so the widths are read from the inline styles
// and the gap from the gap class.
const occupied = (ribbon: Element) => {
	const gap = ribbon.classList.contains("gap-0.5") ? 2 : ribbon.classList.contains("gap-px") ? 1 : 0;
	const segments = Array.from(ribbon.querySelectorAll<HTMLElement>("[data-bucket]"));
	return (
		segments.reduce((sum, segment) => sum + Number.parseFloat(segment.style.width), 0) + (segments.length - 1) * gap
	);
};

describe("CheckRibbon", () => {
	test("one segment per check with the bucket class and shimmer on pending", () => {
		const { container } = render(
			<CheckRibbon
				checks={[
					check("lint", "pass"),
					check("typecheck", "fail"),
					check("test", "pass"),
					check("build", "pending"),
					check("deploy", "skipping"),
					check("release", "cancel"),
				]}
			/>,
		);
		const ribbon = container.firstElementChild!;
		expect(ribbon.getAttribute("title")).toBe("6 checks");
		expectClasses(ribbon, "w-16 h-1.5 gap-0.5 overflow-hidden");
		const segments = Array.from(ribbon.querySelectorAll("[data-bucket]"));
		expect(segments.map((segment) => segment.getAttribute("data-bucket"))).toEqual([
			"pass",
			"fail",
			"pass",
			"pending",
			"skipping",
			"cancel",
		]);
		expect(segments[1]!.getAttribute("title")).toBe("typecheck: failed");
		expectClasses(segments[0]!, "bg-success");
		expectClasses(segments[1]!, "bg-danger");
		expectClasses(segments[3]!, "ribbon-shimmer motion-reduce:animate-none");
		expectClasses(segments[4]!, "bg-warning");
		expectClasses(segments[5]!, "bg-danger");
	});

	test("mini size classes and empty input renders nothing", () => {
		const { container: mini } = render(
			<CheckRibbon size="mini" checks={[check("lint", "pass"), check("test", "pass"), check("build", "fail")]} />,
		);
		expectClasses(mini.firstElementChild!, "w-8 h-1.25 gap-px overflow-hidden");
		expect(mini.querySelectorAll("[data-bucket]")).toHaveLength(3);
		const { container: empty } = render(<CheckRibbon checks={[]} />);
		expect(empty.firstChild).toBeNull();
	});

	// A full ribbon is 64 px and a mini ribbon 32 px. The gaps shrink as the
	// count grows, so the gaps never take the width the segments need.
	test("the gap shrinks with the count and the segments fill the box", () => {
		const gapClass = (count: number, size?: "full" | "mini") => {
			const { container } = render(<CheckRibbon size={size} checks={many(count)} />);
			const ribbon = container.firstElementChild!;
			return ["gap-0.5", "gap-px", "gap-0"].filter((name) => ribbon.classList.contains(name));
		};
		expect(gapClass(16)).toEqual(["gap-0.5"]);
		expect(gapClass(17)).toEqual(["gap-px"]);
		expect(gapClass(32)).toEqual(["gap-px"]);
		expect(gapClass(33)).toEqual(["gap-0"]);
		expect(gapClass(16, "mini")).toEqual(["gap-px"]);
		expect(gapClass(17, "mini")).toEqual(["gap-0"]);
		for (const [size, count, box] of [
			["full", 16, 64],
			["full", 32, 64],
			["full", 40, 64],
			["mini", 16, 32],
			["mini", 32, 32],
		] as const) {
			const { container } = render(<CheckRibbon size={size} checks={many(count, 19)} />);
			expect(container.querySelectorAll("[data-bucket]")).toHaveLength(count);
			expect(occupied(container.firstElementChild!)).toBeCloseTo(box, 6);
		}
	});

	// Above one check per px the ribbon draws runs, so the segments never
	// reach past the box. The failed check keeps its 1 px segment.
	test("mini with 40 checks and full with 80 checks stay inside the box and keep the failed check", () => {
		for (const [size, count, box] of [
			["mini", 40, 32],
			["full", 80, 64],
		] as const) {
			const { container } = render(<CheckRibbon size={size} checks={many(count, 19)} />);
			const ribbon = container.firstElementChild!;
			expectClasses(ribbon, "overflow-hidden");
			expect(occupied(ribbon)).toBeLessThanOrEqual(box);
			expect(occupied(ribbon)).toBeCloseTo(box, 6);
			const failed = ribbon.querySelector<HTMLElement>("[data-bucket='fail']")!;
			expectClasses(failed, "bg-danger shrink-0");
			expect(failed.style.width).toBe("1px");
			expect(failed.getAttribute("title")).toBe("check 20: failed");
			expect(ribbon.querySelectorAll("[data-bucket]")).toHaveLength(3);
			for (const segment of Array.from(ribbon.querySelectorAll("[data-bucket]"))) {
				expect(segment.classList.contains("min-w-px")).toBe(false);
			}
		}
	});

	// GitHub check names repeat: a job named build in two workflows, a matrix
	// re-run. React warns through console.error when two siblings share a key.
	test("two checks with one name are two segments and raise no key warning", () => {
		const error = spyOn(console, "error").mockImplementation(() => {});
		const { container } = render(
			<CheckRibbon checks={[check("build", "pass"), check("build", "fail"), check("lint", "pass")]} />,
		);
		const segments = Array.from(container.querySelectorAll("[data-bucket]"));
		expect(segments.map((segment) => segment.getAttribute("data-bucket"))).toEqual(["pass", "fail", "pass"]);
		expect(error).not.toHaveBeenCalled();
		error.mockRestore();
	});
});
