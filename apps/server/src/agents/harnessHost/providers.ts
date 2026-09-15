import { claudeInterruptData, prepareClaude } from "../harnesses/claude/index.ts";
import { prepareCodex } from "../harnesses/codex/index.ts";
import { prepareOpenCode } from "../harnesses/opencode/opencode.ts";
import { preparePi } from "../harnesses/pi/pi.ts";

export const providers = {
	claude: { prepare: prepareClaude, interrupt: claudeInterruptData },
	codex: { prepare: prepareCodex, interrupt: null },
	pi: { prepare: preparePi, interrupt: "\u001b" },
	opencode: { prepare: prepareOpenCode, interrupt: null },
};
