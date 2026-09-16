import { expect, test } from "bun:test";
import { act, render, screen, waitFor } from "@testing-library/react";
import { expectClasses } from "../../../test/classes";
import { mockMatchMedia } from "../../../test/media";
import { AgentCapacityBadge } from "./AgentCapacityBadge";

test("shows readable usage and changes color with load", () => {
	mockMatchMedia(false);
	const view = render(<AgentCapacityBadge used={5} limit={22} />);
	const badge = screen.getByRole("status", { name: "5 of 22 concurrency slots in use" });
	expect(badge.textContent).toContain("5/22");
	expectClasses(badge, "bg-success-soft text-success tabular");

	view.rerender(<AgentCapacityBadge used={11} limit={22} />);
	expectClasses(screen.getByRole("status"), "bg-warning-soft text-warning");

	view.rerender(<AgentCapacityBadge used={18} limit={22} />);
	expectClasses(screen.getByRole("status"), "bg-danger-soft text-danger");
});

test("shows a brief fire effect only after usage increases", async () => {
	mockMatchMedia(false);
	const view = render(<AgentCapacityBadge used={5} limit={22} />);
	expect(view.container.querySelector("[data-capacity-fire]")).toBeNull();

	view.rerender(<AgentCapacityBadge used={6} limit={22} />);
	expect(view.container.querySelector("[data-capacity-fire]")).not.toBeNull();
	view.rerender(<AgentCapacityBadge used={4} limit={22} />);
	expect(view.container.querySelector("[data-capacity-fire]")).toBeNull();

	view.rerender(<AgentCapacityBadge used={5} limit={22} />);
	expect(view.container.querySelector("[data-capacity-fire]")).not.toBeNull();
	await waitFor(() => expect(view.container.querySelector("[data-capacity-fire]")).toBeNull(), { timeout: 5000 });
});

test("does not show the fire effect under reduced motion", () => {
	const media = mockMatchMedia(false);
	const view = render(<AgentCapacityBadge used={5} limit={22} />);
	view.rerender(<AgentCapacityBadge used={6} limit={22} />);
	expect(view.container.querySelector("[data-capacity-fire]")).not.toBeNull();
	expect(media.matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
	act(() => media.fire(true));
	expect(view.container.querySelector("[data-capacity-fire]")).toBeNull();
	view.rerender(<AgentCapacityBadge used={7} limit={22} />);
	expect(view.container.querySelector("[data-capacity-fire]")).toBeNull();
});
