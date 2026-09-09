import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { expectClasses } from "../../../test/classes";
import { Separator } from "./Separator";

describe("Separator", () => {
	test("separator by orientation", () => {
		render(
			<>
				<Separator />
				<Separator orientation="vertical" />
			</>,
		);
		const [horizontal, vertical] = screen.getAllByRole("separator");
		expectClasses(horizontal!, "h-px w-full bg-border");
		expect(vertical!.getAttribute("aria-orientation")).toBe("vertical");
		expectClasses(vertical!, "w-px h-full bg-border");
	});
});
