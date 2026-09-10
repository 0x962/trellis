import { toast } from "@trellis/ui";
import { useApp } from "../../../../lib/appContext";
import { buildAgentCommand } from "../../../agent/StartWithAgent/utils/buildAgentCommand";
import { failedChecksNote } from "../../utils/failedChecksNote";

// Copies the Start-with-agent command for a ticket. Failed check names go
// inside the quoted brief, so the agent reads what to fix. The browser owns
// the clipboard and can block the write, so a blocked write shows the
// command for the person to copy by hand.
export const useCopyAgentCommand = () => {
	const { orpc, queryClient } = useApp();
	return async (identifier: string, failing: string[] = []) => {
		const settings = await queryClient.ensureQueryData(orpc.settings.get.queryOptions({}));
		const command = buildAgentCommand(settings.startWithAgentTemplate, identifier, {
			append: failedChecksNote(failing),
		});
		try {
			await navigator.clipboard.writeText(command);
			toast.command({ title: "Copied the command. Paste it in a terminal.", command });
		} catch {
			toast.error("The browser blocked the copy. Copy the command below.", {
				description: (
					<pre className="m-0 font-mono text-xs break-all whitespace-pre-wrap text-fg-muted select-all">{command}</pre>
				),
			});
		}
	};
};
