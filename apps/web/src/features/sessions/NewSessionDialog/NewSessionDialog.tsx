import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, Input, Select, toast } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";
import { LaunchFields } from "../../agents/LaunchFields";
import { SessionPrompt } from "../SessionPrompt";
import { sessionComposerActions, useSessionComposerStore } from "../sessionComposerStore";

export type NewSessionDialogProps = { onClose: () => void };

export function NewSessionDialog({ onClose }: NewSessionDialogProps) {
	const { client, orpc, queryClient } = useApp();
	const navigate = useNavigate();
	const draft = useSessionComposerStore();
	const { change } = sessionComposerActions;
	const projects = useQuery(orpc.projects.list.queryOptions({ input: {} }));
	const accounts = useQuery(orpc.harnessAccounts.list.queryOptions({ input: {} }));
	const create = useMutation({
		mutationFn: () =>
			client.sessions.create({
				prompt: draft.prompt.trim(),
				name: draft.name.trim() || undefined,
				project: draft.project || undefined,
				harness: draft.harness,
				accountId: draft.accountId || undefined,
				files: draft.files,
				requestId: draft.requestId,
			}),
		onSuccess: async (session) => {
			sessionComposerActions.clear();
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: orpc.sessions.key() }),
				queryClient.invalidateQueries({ queryKey: orpc.agentRuns.key() }),
			]);
			if (session.projectId)
				await navigate({
					to: "/sessions/project/$project",
					params: { project: session.projectPath },
					hash: session.runId,
				});
			else await navigate({ to: "/sessions/$id", params: { id: session.id } });
			if (session.run.error) toast.error("The session could not start", { description: session.run.error });
		},
	});
	const submit = () => {
		if (!create.isPending && (draft.prompt.trim() || draft.files.length)) create.mutate();
	};
	return (
		<Dialog
			open
			title="New session"
			size="lg"
			onOpenChange={(next) => {
				if (!next && !create.isPending) onClose();
			}}
		>
			<fieldset disabled={create.isPending} className="flex min-w-0 flex-col gap-4">
				<Select
					label="Project"
					value={draft.project || "none"}
					items={[
						{ value: "none", label: "No project" },
						...(projects.data ?? [])
							.filter((project) => project.archivedAt === null)
							.map((project) => ({ value: project.path, label: project.path })),
					]}
					onValueChange={(project) => change({ project: project === "none" ? "" : project })}
				/>
				<Input
					label="Session name"
					value={draft.name}
					maxLength={60}
					placeholder="Optional"
					onChange={(event) => change({ name: event.target.value })}
				/>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
					<LaunchFields
						harness={draft.harness}
						onChange={(harness) => change({ harness, accountId: "" })}
						disabled={create.isPending}
					/>
				</div>
				<Select
					label="Account"
					value={draft.accountId || "default"}
					items={[
						{ value: "default", label: "Default account" },
						...(accounts.data ?? [])
							.filter((account) => account.enabled && account.harness === draft.harness.preset)
							.map((account) => ({ value: account.id, label: account.name })),
					]}
					onValueChange={(accountId) => change({ accountId: accountId === "default" ? "" : accountId })}
				/>
				<SessionPrompt
					label="Prompt"
					text={draft.prompt}
					files={draft.files}
					onText={(prompt) => change({ prompt })}
					onFiles={(files) => change({ files })}
					onSubmit={submit}
					disabled={create.isPending}
				/>
			</fieldset>
			{create.isPending && (
				<p role="status" className="text-sm text-fg-muted">
					Start the session…
				</p>
			)}
			{create.error && (
				<p role="alert" className="text-sm text-danger">
					{create.error.message}
				</p>
			)}
		</Dialog>
	);
}
