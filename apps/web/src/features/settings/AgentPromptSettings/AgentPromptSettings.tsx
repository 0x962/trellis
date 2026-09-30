import { useQuery } from "@tanstack/react-query";
import { Button, FailureState, Skeleton } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";
import { AgentPromptForm } from "./components/AgentPromptForm";

export function AgentPromptSettings() {
	const { orpc } = useApp();
	const query = useQuery({
		...orpc.settings.agentPrompt.queryOptions({}),
		gcTime: 0,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
	});
	if (query.isPending) return <Skeleton className="prompt-template-loading" />;
	if (query.isError)
		return (
			<FailureState
				title="The startup prompt cannot load."
				detail={query.error.message}
				action={<Button onClick={() => void query.refetch()}>Try again</Button>}
			/>
		);
	return <AgentPromptForm saved={query.data} />;
}
