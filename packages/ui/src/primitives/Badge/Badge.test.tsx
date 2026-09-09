import { describe, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { expectClasses } from "../../../test/classes";
import { Badge } from "./Badge";

describe("Badge", () => {
	test("tones map to soft background and foreground tokens", () => {
		render(
			<>
				<Badge tone="ok">6</Badge>
				<Badge tone="bad">2</Badge>
				<Badge tone="wait">1</Badge>
				<Badge tone="agent">5</Badge>
				<Badge tone="neutral">14</Badge>
			</>,
		);
		const expected: Record<string, string> = {
			"6": "bg-success-soft text-success",
			"2": "bg-danger-soft text-danger",
			"1": "bg-warning-soft text-warning",
			"5": "bg-agent-soft text-agent",
			"14": "text-fg-faint",
		};
		for (const [text, classes] of Object.entries(expected)) {
			const badge = screen.getByText(text);
			expectClasses(badge, classes);
			expectClasses(badge, "h-5 rounded-xl text-xs font-medium tabular");
		}
	});
});
