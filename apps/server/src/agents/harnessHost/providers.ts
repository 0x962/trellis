import { agyCapabilityGaps, prepareAgy } from "../harnesses/agy/agy.ts";
import { claudeInterruptData, prepareClaude } from "../harnesses/claude/index.ts";
import { codexInterruptData, prepareCodex } from "../harnesses/codex/index.ts";
import { prepareOpenCode } from "../harnesses/opencode/opencode.ts";
import { preparePi } from "../harnesses/pi/pi.ts";

export const providers = {
	claude: { prepare: prepareClaude, interrupt: claudeInterruptData, capabilityGaps: [] as readonly string[] },
	codex: { prepare: prepareCodex, interrupt: codexInterruptData, capabilityGaps: [] as readonly string[] },
	pi: { prepare: preparePi, interrupt: "\u001b", capabilityGaps: [] as readonly string[] },
	opencode: { prepare: prepareOpenCode, interrupt: null, capabilityGaps: [] as readonly string[] },
	agy: { prepare: prepareAgy, interrupt: "\u001b", capabilityGaps: agyCapabilityGaps },
};
