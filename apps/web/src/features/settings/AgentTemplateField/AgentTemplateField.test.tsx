import { beforeEach, describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { mockMatchMedia } from "../../../../test/media";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { createTestServer } from "../../../../test/server";
import { AgentTemplateField } from "./AgentTemplateField";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

describe("AgentTemplateField", () => {
	// ST-07. The placeholder is the whole grammar of the field, so the hint
	// names it.
	test("names the brief placeholder in its hint", async () => {
		renderWithProviders(<AgentTemplateField />, { path: "/settings", actor: "navid", server: createTestServer() });
		const field = await screen.findByRole("textbox", { name: /start with agent/i });
		const hint = document.getElementById(field.getAttribute("aria-describedby") ?? "");
		expect(hint?.textContent).toContain("{brief}");
		expect(hint?.textContent).toContain("brief");
	});
});
