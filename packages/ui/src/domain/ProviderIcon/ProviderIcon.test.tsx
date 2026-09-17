import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { ProviderIcon } from "./ProviderIcon";

describe("ProviderIcon", () => {
	test("names the company for a screen reader and draws in the text color", () => {
		render(<ProviderIcon provider="anthropic" className="size-5" />);
		const icon = screen.getByRole("img", { name: "Anthropic" });
		expect(icon.getAttribute("data-provider")).toBe("anthropic");
		expect(icon.classList.contains("fill-current")).toBe(true);
		expect(icon.classList.contains("size-5")).toBe(true);
		expect(icon.querySelector("path")?.getAttribute("d")?.length).toBeGreaterThan(20);
	});
});
