import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { expectClasses } from "../../../test/classes";
import { StatusIcon } from "./StatusIcon";

const icon = (container: HTMLElement, selector: string) => container.querySelector<SVGSVGElement>(`svg${selector}`)!;

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
		const human = icon(container, "[data-category=review][data-reviewer=human]");
		expectClasses(human, "text-accent");
		const agent = icon(container, "[data-category=review][data-reviewer=agent]");
		expectClasses(agent, "text-agent");
		const done = icon(container, "[data-category=done]");
		expectClasses(done, "text-success");
		const canceled = icon(container, "[data-category=canceled]");
		expectClasses(canceled, "text-fg-faint");

		for (const review of [human, agent]) {
			expect(review.querySelector("circle[stroke-dasharray]")).not.toBeNull();
		}
		expect(done.querySelector("circle[fill=currentColor]")).not.toBeNull();
		expect(done.querySelector("path")).not.toBeNull();
		expect(canceled.querySelectorAll("path, line").length).toBeGreaterThan(0);
	});

	test("the agent reviewer variant carries the glyph", () => {
		const { container } = render(
			<>
				<StatusIcon category="review" reviewer="human" />
				<StatusIcon category="review" reviewer="agent" />
			</>,
		);
		const agent = icon(container, "[data-reviewer=agent]");
		expect(agent.querySelector("path[fill=currentColor]")).not.toBeNull();
		expect(icon(container, "[data-reviewer=human]").querySelector("path[fill=currentColor]")).toBeNull();
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
		// An SVG arc command carries the large-arc flag as its fourth number.
		// 60 percent needs the large arc; 25 percent does not.
		const arc = /[Aa]\s*[\d.]+[\s,]+[\d.]+[\s,]+[\d.-]+[\s,]+([01])[\s,]+([01])/;
		const fill = (element: HTMLElement) => element.querySelector("path[fill=currentColor]")!.getAttribute("d")!;
		expect(fill(sixty).match(arc)![1]).toBe("1");
		expect(fill(quarter).match(arc)![1]).toBe("0");
		expect(fill(sixty)).not.toBe(fill(quarter));
		expect(fill(plain)).toMatch(arc);
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
