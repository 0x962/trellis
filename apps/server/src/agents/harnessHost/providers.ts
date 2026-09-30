import { claudeConversationExport } from "../harnesses/claude/conversationExport";
import { claudeInterruptData, prepareClaude } from "../harnesses/claude/index.ts";
import { codexConversationExport } from "../harnesses/codex/conversationExport";
import { prepareCodex } from "../harnesses/codex/index.ts";
import { museConversationExport } from "../harnesses/muse/conversationExport";
import { prepareMuse } from "../harnesses/muse/index.ts";
import { opencodeConversationExport } from "../harnesses/opencode/conversationExport";
import { prepareOpenCode } from "../harnesses/opencode/opencode.ts";
import { piConversationExport } from "../harnesses/pi/conversationExport";
import { preparePi } from "../harnesses/pi/pi.ts";

export const providers = {
	claude: { prepare: prepareClaude, interrupt: claudeInterruptData, conversationExport: claudeConversationExport },
	codex: { prepare: prepareCodex, interrupt: null, conversationExport: codexConversationExport },
	pi: { prepare: preparePi, interrupt: "\u001b", conversationExport: piConversationExport },
	opencode: { prepare: prepareOpenCode, interrupt: null, conversationExport: opencodeConversationExport },
	muse: { prepare: prepareMuse, interrupt: null, conversationExport: museConversationExport },
};
