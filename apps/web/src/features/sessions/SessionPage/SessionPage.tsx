import { Plus } from "@phosphor-icons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Tooltip } from "@trellis/ui";
import { useEffect } from "react";
import { useApp } from "../../../lib/appContext";
import { PageTitle } from "../../shell/PageTitle";
import { Topbar, TopbarActionButton } from "../../shell/Topbar";
import { SessionConversation } from "../SessionConversation";
import { sessionComposerActions } from "../sessionComposerStore";

export function SessionPage({ id }: { id: string }) {
	const { orpc } = useApp();
	const navigate = useNavigate();
	const session = useSuspenseQuery({
		...orpc.sessions.get.queryOptions({ input: { id } }),
		refetchInterval: 2000,
	}).data;
	useEffect(() => {
		document.title = `${session.name} · trellis`;
	}, [session.name]);
	return (
		<>
			<Topbar
				actions={
					<Tooltip content="New session">
						<TopbarActionButton
							label="New session"
							icon={<Plus />}
							onClick={() => sessionComposerActions.open(session.projectPath)}
						/>
					</Tooltip>
				}
			>
				<PageTitle title={session.name} />
			</Topbar>
			<div className="page-card flex min-h-0 flex-1 overflow-hidden">
				<SessionConversation
					key={session.runId}
					session={session}
					run={session.run}
					onDeleted={() => void navigate({ to: "/needs-you" })}
				/>
			</div>
		</>
	);
}
