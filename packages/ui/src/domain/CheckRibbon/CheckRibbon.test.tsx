import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { expectClasses } from "../../../test/classes";
import { CheckRibbon } from "./CheckRibbon";

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
});
