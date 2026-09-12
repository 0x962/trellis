import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { expectClasses } from "../../../test/classes";
import { StatusIcon } from "./StatusIcon";

const icon = (container: HTMLElement, selector: string) => container.querySelector<HTMLElement>(selector)!;

// The share of the started disk that is filled, read from its conic gradient.
const share = (element: HTMLElement) =>
	element.querySelector<HTMLElement>("[data-fill]")!.style.backgroundImage.match(/([\d.]+)turn/)![1];

describe("StatusIcon", () => {
	test("renders the six variants with the category colors", () => {
		const { container } = render(
			<>
				<StatusIcon category="todo" />
				<StatusIcon category="started" />
				<StatusIcon category="review" reviewer="human" />
				<StatusIcon category="review" reviewer="agent" />
				<StatusIcon category="done" />
				<StatusIcon category="canceled" />
			</>,
		);
		expectClasses(icon(container, "[data-category=todo]"), "text-fg-faint");
		expectClasses(icon(container, "[data-category=started]"), "text-warning");
		expectClasses(icon(container, "[data-category=review][data-reviewer=human]"), "text-accent");
		expectClasses(icon(container, "[data-category=review][data-reviewer=agent]"), "text-agent");
		expectClasses(icon(container, "[data-category=done]"), "text-success");
		expectClasses(icon(container, "[data-category=canceled]"), "text-fg-faint");
		for (const category of ["todo", "review", "done", "canceled"]) {
			expect(icon(container, `[data-category=${category}]`).tagName.toLowerCase()).toBe("svg");
		}
	});

	test("the agent reviewer draws a different mark from the human reviewer", () => {
		const { container } = render(
			<>
				<StatusIcon category="review" reviewer="human" />
				<StatusIcon category="review" reviewer="agent" />
			</>,
		);
		const agent = icon(container, "[data-reviewer=agent]");
		const human = icon(container, "[data-reviewer=human]");
		expect(agent.innerHTML).not.toBe(human.innerHTML);
	});

	test("started fills by sub-ticket progress", () => {
		render(
			<>
				<StatusIcon category="started" progress={0.6} label="sixty" />
				<StatusIcon category="started" progress={0.25} label="quarter" />
				<StatusIcon category="started" label="plain" />
			</>,
		);
		const sixty = screen.getByRole("img", { name: "sixty" });
		const quarter = screen.getByRole("img", { name: "quarter" });
		const plain = screen.getByRole("img", { name: "plain" });
		expect(sixty.getAttribute("data-progress")).toBe("0.6");
		expect(plain.getAttribute("data-progress")).toBeNull();
		expect(share(sixty)).toBe("0.6");
		expect(share(quarter)).toBe("0.25");
		expect(share(plain)).toBe("0.5");
	});

	test("labeled icons are named, unlabeled icons are hidden", () => {
		const { container } = render(
			<>
				<StatusIcon category="started" label="In Progress" />
				<StatusIcon category="todo" />
			</>,
		);
		const labeled = screen.getByRole("img", { name: "In Progress" });
		expect(labeled.getAttribute("aria-label")).toBe("In Progress");
		const hidden = icon(container, "[data-category=todo]");
		expect(hidden.getAttribute("aria-hidden")).toBe("true");
		expectClasses(labeled, "size-3.5");
		expectClasses(hidden, "size-3.5");
	});
});
