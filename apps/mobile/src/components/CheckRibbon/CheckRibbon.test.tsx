import { describe, expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { tokens } from "../../theme/tokens";
import { CheckRibbon } from "./CheckRibbon";
import { type Check, ribbonWidths } from "./segments";

// Six checks that cover every bucket.
const checks: Check[] = [
	{ name: "lint", bucket: "pass" },
	{ name: "typecheck", bucket: "fail" },
	{ name: "e2e", bucket: "cancel" },
	{ name: "docs", bucket: "skipping" },
	{ name: "deploy", bucket: "pending" },
	{ name: "test", bucket: "pass" },
];

describe("CheckRibbon", () => {
	// A fresh install is dark, so the segments carry the dark palette.
	test("one segment per check with the bucket color and nothing for no checks", async () => {
		const palette = tokens.dark;
		const expected = {
			pass: palette.success,
			fail: palette.danger,
			cancel: palette.danger,
			skipping: palette.warning,
			pending: palette.borderStrong,
		};
		const { unmount } = await render(<CheckRibbon size="mini" checks={checks} />);
		const segments = screen.getAllByTestId("ribbon-segment");
		expect(segments).toHaveLength(checks.length);
		checks.forEach((check, index) => {
			expect(segments[index]).toHaveStyle({ backgroundColor: expected[check.bucket] });
		});
		expect(screen.getByTestId("check-ribbon")).toHaveStyle({ width: ribbonWidths.mini });
		await unmount();

		await render(<CheckRibbon size="mini" checks={[]} />);
		expect(screen.toJSON()).toBeNull();
	});
});
