import { describe, expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { paintedColors } from "../../../test/paint";
import { tokens } from "../../theme/tokens";
import { StatusIcon } from "./StatusIcon";

describe("StatusIcon", () => {
	// A fresh install is dark, so every icon paints the dark palette.
	test("draws every category in its token color with the label as accessibility text", async () => {
		const palette = tokens.dark;
		const cases = [
			["todo", palette.fgFaint],
			["canceled", palette.fgFaint],
			["started", palette.warning],
			["review", palette.accent],
			["done", palette.success],
		] as const;
		for (const [category, color] of cases) {
			const label = `Status: ${category}`;
			const { unmount } = await render(<StatusIcon category={category} label={label} />);
			expect(screen.getByLabelText(label)).toBeOnTheScreen();
			expect(paintedColors(screen.toJSON())).toContain(color);
			await unmount();
		}

		const agent = await render(<StatusIcon category="review" reviewer="agent" label="Status: agent review" />);
		const agentColors = paintedColors(screen.toJSON());
		expect(agentColors).toContain(palette.agent);
		expect(agentColors).not.toContain(palette.accent);
		await agent.unmount();

		await render(<StatusIcon category="started" progress={0.75} label="Status: started" />);
		expect(paintedColors(screen.toJSON())).toContain(palette.warning);
		expect(screen.getByLabelText("Status: started")).toBeOnTheScreen();
	});
});
