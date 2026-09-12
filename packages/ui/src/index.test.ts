import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { packageRoot } from "../test/css";
import * as ui from "./index";

const names = [
	"Button",
	"IconButton",
	"Input",
	"Textarea",
	"Select",
	"Popover",
	"Menu",
	"Dialog",
	"ConfirmDialog",
	"Sheet",
	"Tooltip",
	"Toaster",
	"toast",
	"Tabs",
	"Segmented",
	"Checkbox",
	"Switch",
	"Badge",
	"Chip",
	"Avatar",
	"Kbd",
	"Skeleton",
	"Spinner",
	"ScrollArea",
	"Separator",
	"EmptyState",
	"SectionHeader",
	"Command",
	"StatusIcon",
	"PriorityIcon",
	"CheckRibbon",
	"ActorChip",
	"TicketId",
	"TrellisMark",
	"TicketGlyph",
	"AiGlyph",
	"SettingGlyph",
	"TrellisWordmark",
	"useTheme",
	"useReducedMotion",
	"useHotkey",
];

describe("@trellis/ui", () => {
	test("the barrel exports every primitive, domain component, and hook", () => {
		const exported = ui as Record<string, unknown>;
		const missing = names.filter((name) => exported[name] === undefined);
		expect(missing).toEqual([]);
	});

	test("package exports resolve to existing files", async () => {
		const { exports } = await Bun.file(join(packageRoot, "package.json")).json();
		expect(exports["."]).toBe("./src/index.ts");
		expect(exports["./tokens.css"]).toBe("./src/tokens.css");
		expect(exports["./fonts.css"]).toBe("./src/fonts.css");
		expect(exports["./base.css"]).toBe("./src/base.css");
		for (const target of Object.values(exports) as string[]) {
			expect(existsSync(join(packageRoot, target))).toBe(true);
		}
	});
});
