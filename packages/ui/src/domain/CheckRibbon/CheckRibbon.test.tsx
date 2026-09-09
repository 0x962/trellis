import { describe, expect, spyOn, test } from "bun:test";
import { render } from "@testing-library/react";
import { expectClasses } from "../../../test/classes";
import { CheckRibbon, segmentWidth } from "./CheckRibbon";

const check = (name: string, bucket: "pass" | "fail" | "pending" | "skipping") => ({ name, bucket });

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
				]}
			/>,
		);
		const ribbon = container.firstElementChild!;
		expect(ribbon.getAttribute("title")).toBe("5 checks");
		expectClasses(ribbon, "w-16 h-1.5 gap-0.5");
		const segments = Array.from(ribbon.querySelectorAll("[data-bucket]"));
		expect(segments.map((segment) => segment.getAttribute("data-bucket"))).toEqual([
			"pass",
			"fail",
			"pass",
			"pending",
			"skipping",
		]);
		expectClasses(segments[0]!, "bg-success");
		expectClasses(segments[1]!, "bg-danger");
		expectClasses(segments[3]!, "ribbon-shimmer motion-reduce:animate-none");
		expectClasses(segments[4]!, "bg-warning");
	});

	test("mini size classes and empty input renders nothing", () => {
		const { container: mini } = render(
			<CheckRibbon size="mini" checks={[check("lint", "pass"), check("test", "pass"), check("build", "fail")]} />,
		);
		expectClasses(mini.firstElementChild!, "w-8 h-1.25 gap-px");
		expect(mini.querySelectorAll("[data-bucket]")).toHaveLength(3);
		const { container: empty } = render(<CheckRibbon checks={[]} />);
		expect(empty.firstChild).toBeNull();
	});

	// A full ribbon is 64 px and a mini ribbon 32 px. The gaps shrink as the
	// count grows, so the gaps never take the width the segments need, and a
	// segment is at least 1 px, so a failed check stays visible at 40 checks.
	// happy-dom lays nothing out, so the widths are computed from the ribbon
	// width, the gap for the count, and the segment count.
	test("the gap shrinks with the count and a failed check stays at least 1 px wide at 40 checks", () => {
		const many = (count: number) =>
			Array.from({ length: count }, (_, index) => check(`check ${index + 1}`, index === 19 ? "fail" : "pass"));
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

		expect(segmentWidth("full", 16)).toBe((64 - 15 * 2) / 16);
		expect(segmentWidth("full", 32)).toBe((64 - 31) / 32);
		expect(segmentWidth("full", 40)).toBe(64 / 40);
		expect(segmentWidth("mini", 40)).toBe(1);
		for (const size of ["full", "mini"] as const) {
			for (let count = 1; count <= 40; count += 1) {
				expect(`${size} ${count} ${segmentWidth(size, count)}`).toMatch(/ ([1-9]\d*(\.\d+)?)$/);
			}
			const { container } = render(<CheckRibbon size={size} checks={many(40)} />);
			const failed = container.querySelector("[data-bucket='fail']")!;
			expectClasses(failed, "min-w-px flex-1 bg-danger");
			expect(container.querySelectorAll("[data-bucket]")).toHaveLength(40);
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
