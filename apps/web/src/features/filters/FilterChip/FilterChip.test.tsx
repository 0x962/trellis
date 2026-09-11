import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../../../../test/renderWithProviders";
import { chip, findGrid, resetUi } from "../../../../test/table";
import { tableViewport } from "../../../../test/viewport";

const installViewport = tableViewport(800);

beforeEach(() => {
	resetUi();
	installViewport();
});

const path = "/p/CDE/table?status=in-progress,agent-review";

const status = () => chip("status")!;

const text = () => status().textContent!.replace(/\s+/g, " ").trim();

const ready = async () => {
	const app = renderApp({ path, actor: "dana" });
	await findGrid();
	await waitFor(() => expect(chip("status")).not.toBeNull());
	expect(text()).toBe("Status is In Progress, Agent Review");
	return app;
};

describe("features/filters/FilterChip", () => {
	// Outcome 77
	test("toggles the chip operator between is and is not", async () => {
		const user = userEvent.setup();
		const { router } = await ready();
		await user.click(within(status()).getByRole("button", { name: "is" }));
		await waitFor(() => expect(router.state.location.searchStr).toBe("?status=!in-progress,agent-review"));
		expect(text()).toBe("Status is not In Progress, Agent Review");
		await user.click(within(status()).getByRole("button", { name: "is not" }));
		await waitFor(() => expect(router.state.location.searchStr).toBe("?status=in-progress,agent-review"));
		expect(text()).toBe("Status is In Progress, Agent Review");
	});

	// Outcome 78
	test("reopens the value picker and removes the chip", async () => {
		const user = userEvent.setup();
		const { router } = await ready();
		await user.click(within(status()).getByRole("button", { name: "In Progress, Agent Review" }));
		const dialog = await screen.findByRole("dialog");
		const checked = within(dialog)
			.getAllByRole("option")
			.filter((option) => option.getAttribute("data-checked") === "true")
			.map((option) => option.textContent?.trim());
		expect(checked).toEqual(["In Progress", "Agent Review"]);
		await user.keyboard("{Escape}");
		await waitFor(() => expect(dialog.isConnected).toBe(false));
		await user.click(within(status()).getByRole("button", { name: "Remove Status filter" }));
		await waitFor(() => expect(router.state.location.searchStr).toBe(""));
		expect(chip("status")).toBeNull();
	});

	// D17. A category chip names the statuses of the category in the scope,
	// so it reads like the cells. After two names it counts the rest.
	test("a category chip names its statuses", async () => {
		renderApp({ path: "/p/CDE/table?category=review", actor: "dana" });
		await findGrid();
		await waitFor(() => expect(chip("category")).not.toBeNull());
		expect(chip("category")!.textContent!.replace(/\s+/g, " ").trim()).toBe("Status is Agent Review, Human Review");
	});

	test("a chip with more than two values names two and counts the rest", async () => {
		renderApp({ path: "/p/CDE/table?category=todo,started,review", actor: "dana" });
		await findGrid();
		await waitFor(() => expect(chip("category")).not.toBeNull());
		expect(chip("category")!.textContent!.replace(/\s+/g, " ").trim()).toBe("Status is Todo, In Progress +2");
	});
});
