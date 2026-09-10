import { toast } from "@trellis/ui";
import { useApp } from "../../../../lib/appContext";
import { agentCommand } from "../../utils/agentCommand";

// Copies the Start-with-agent command for a ticket and names the failing
// checks the agent has to fix. The browser owns the clipboard and may refuse
// it, so a refused write shows the command for the person to copy by hand.
export const useCopyAgentCommand = () => {
	const { orpc, queryClient } = useApp();
	return async (identifier: string, failing: string[] = []) => {
		const settings = await queryClient.ensureQueryData(orpc.settings.get.queryOptions({}));
		const command = agentCommand(settings.startWithAgentTemplate, identifier, failing);
		try {
			await navigator.clipboard.writeText(command);
			toast.command({ title: "Copied — paste in your terminal", command });
		} catch {
			toast.error("The clipboard refused", {
				description: (
					<pre className="m-0 font-mono text-xs break-all whitespace-pre-wrap text-fg-muted select-all">{command}</pre>
				),
			});
		}
	};
};
