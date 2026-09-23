import { Plus } from "@phosphor-icons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Tooltip } from "@trellis/ui";
import { useEffect, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { Topbar, TopbarActionButton } from "../../shell/Topbar";
import { SessionConversation } from "../SessionConversation";
import { SessionName } from "../SessionName";
import { sessionComposerActions } from "../sessionComposerStore";

export function SessionPage({ id }: { id: string }) {
	const { orpc } = useApp();
	const navigate = useNavigate();
	const [renamingTitle, setRenamingTitle] = useState(false);
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
							onClick={() => sessionComposerActions.open(session.projectKey)}
						/>
					</Tooltip>
				}
			>
				<SessionName
					session={session}
					editing={renamingTitle}
					onEditingChange={setRenamingTitle}
					inputClassName="h-9 text-lg font-semibold max-md:text-md"
				>
					<h1
						title={session.name}
						className="truncate text-lg font-semibold text-fg"
						onDoubleClick={() => setRenamingTitle(true)}
					>
						{session.name}
					</h1>
				</SessionName>
			</Topbar>
			<div className="page-card flex min-h-0 flex-1 overflow-hidden">
				<SessionConversation
					key={session.runId}
					session={session}
					run={session.run}
					autoFocusTerminal
					onDeleted={() => void navigate({ to: "/needs-you" })}
				/>
			</div>
		</>
	);
}
