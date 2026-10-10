import { type UseQueryResult, useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { HarnessAccountQuota } from "@trellis/api";
import { Button, ComposerTitle, FailureState, Textarea, TicketComposer, toast } from "@trellis/ui";
import { useEffect, useMemo, useRef } from "react";
import { useApp } from "../../../lib/appContext";
import { AddAttachmentButton } from "../../attachments/AddAttachmentButton";
import { DropTarget } from "../../attachments/DropTarget";
import { UploadProgress } from "../../attachments/UploadProgress";
import { ComposerHeader } from "../../composer/ComposerHeader";
import { sessionComposerActions, useSessionComposerStore } from "../sessionComposerStore";
import { SessionAgentPicker } from "./components/SessionAgentPicker";
import { selectSessionAccount } from "./components/selectSessionAccount";

const combineQuotas = (results: UseQueryResult<HarnessAccountQuota>[]) =>
	results.flatMap((result) => (result.data && !result.isError ? [result.data] : []));

export type NewSessionDialogProps = { onClose: () => void };

export function NewSessionDialog({ onClose }: NewSessionDialogProps) {
	const { client, orpc, queryClient } = useApp();
	const navigate = useNavigate();
	const promptRef = useRef<HTMLTextAreaElement>(null);
	const draft = useSessionComposerStore();
	const { change } = sessionComposerActions;
	const accounts = useQuery(orpc.harnessAccounts.list.queryOptions({ input: {} }));
	const choices = useMemo(
		() =>
			(accounts.data ?? []).filter(
				(account) => account.harness === draft.harness.preset && account.capabilities.launch,
			),
		[accounts.data, draft.harness.preset],
	);
	const quotaQueries = useMemo(
		() =>
			choices.map(({ id }) => ({
				...orpc.harnessAccounts.quota.queryOptions({ input: { id } }),
				staleTime: 0,
				refetchInterval: 30_000,
			})),
		[choices, orpc],
	);
	const quotas = useQueries({ queries: quotaQueries, combine: combineQuotas });
	const automaticAccountId = useMemo(
		() =>
			selectSessionAccount({
				harness: draft.harness,
				accountId: draft.accountId,
				accounts: choices,
				quotas,
			}),
		[draft.harness, draft.accountId, choices, quotas],
	);
	const create = useMutation({
		mutationFn: (_openingId: number) =>
			client.sessions.create({
				prompt: draft.prompt.trim(),
				name: draft.name.trim() || undefined,
				project: draft.project || undefined,
				harness: draft.harness,
				accountId: draft.accountId || undefined,
				files: draft.files,
				requestId: draft.requestId,
			}),
		onSuccess: async (session, openingId) => {
			const navigateToSession = sessionComposerActions.created(openingId, session);
			const { run, ...record } = session;
			queryClient.setQueryData(orpc.sessions.get.queryOptions({ input: { id: session.id } }).queryKey, session);
			queryClient.setQueryData(orpc.sessions.list.queryOptions({ input: {} }).queryKey, (current) => [
				record,
				...(current ?? []).filter((item) => item.id !== session.id),
			]);
			if (session.projectId)
				queryClient.setQueryData(
					orpc.agentRuns.list.queryOptions({ input: { project: session.projectId } }).queryKey,
					(current) => ({
						items: [run, ...(current?.items ?? []).filter((item) => item.id !== run.id)],
						nextCursor: current?.nextCursor ?? null,
					}),
				);
			void Promise.all([
				queryClient.invalidateQueries({ queryKey: orpc.sessions.key() }),
				queryClient.invalidateQueries({ queryKey: orpc.agentRuns.key() }),
			]);
			if (navigateToSession && session.projectId)
				await navigate({
					to: "/sessions/project/$project",
					params: { project: session.projectKey },
					hash: session.runId,
				});
			else if (navigateToSession) await navigate({ to: "/sessions/$id", params: { id: session.id } });
			if (session.run.error) toast.error("The session could not start", { description: session.run.error });
		},
	});
	useEffect(() => {
		if (accounts.data && !create.isPending) sessionComposerActions.automaticAccount(automaticAccountId);
	}, [accounts.data, automaticAccountId, create.isPending]);
	const submit = () => {
		if (!create.isPending && (draft.prompt.trim() || draft.files.length)) create.mutate(draft.openingId);
	};
	const close = () => {
		if (!create.isPending) onClose();
	};
	const addFiles = (files: File[]) => {
		if (!create.isPending) change({ files: [...useSessionComposerStore.getState().files, ...files] });
	};
	const fileIds = useRef(new WeakMap<File, string>());
	const fileId = (file: File) => {
		const id = fileIds.current.get(file) ?? crypto.randomUUID();
		fileIds.current.set(file, id);
		return id;
	};
	return (
		<TicketComposer
			open
			title="New session"
			initialFocus={promptRef}
			onOpenChange={(next) => {
				if (!next) close();
			}}
			onSubmit={submit}
			header={
				<ComposerHeader
					title="New session"
					project={draft.project}
					allowNoProject
					disabled={create.isPending}
					locked={create.isPending}
					onProject={(project) => change({ project })}
					onClose={close}
				/>
			}
			footer={
				<>
					<fieldset disabled={create.isPending}>
						<AddAttachmentButton uploads={{ addFiles }} />
					</fieldset>
					<span className="ml-auto text-xs text-fg-faint">⌘/Ctrl+Enter to start</span>
					<Button
						type="submit"
						variant="primary"
						size="md"
						className="composer-create"
						processing={create.isPending}
						disabled={create.isPending || (!draft.prompt.trim() && draft.files.length === 0)}
					>
						Start session
					</Button>
				</>
			}
		>
			<DropTarget identifier="new session" onFiles={addFiles}>
				<fieldset disabled={create.isPending} className="min-w-0">
					<ComposerTitle
						aria-label="Session name"
						value={draft.name}
						placeholder="Session name (optional)"
						onChange={(event) => change({ name: event.target.value })}
					/>
					<Textarea
						ref={promptRef}
						label="Prompt"
						hideLabel
						variant="composer"
						className="ticket-composer-description"
						value={draft.prompt}
						rows={4}
						placeholder="What do you want to do?"
						onChange={(event) => change({ prompt: event.target.value })}
						onPaste={(event) => {
							if (event.clipboardData.files.length) {
								event.preventDefault();
								addFiles([...event.clipboardData.files]);
							}
						}}
					/>
					<div className="ticket-composer-properties">
						<SessionAgentPicker
							harness={draft.harness}
							accountId={draft.accountId}
							accounts={accounts.data}
							disabled={create.isPending}
						/>
					</div>
					{draft.files.length > 0 && (
						<div className="mt-3 flex flex-col gap-2">
							{draft.files.map((file, index) => (
								<UploadProgress
									key={fileId(file)}
									upload={{ id: String(index), file, percent: 0, status: "pending", error: null }}
									onDismiss={() => {
										if (!create.isPending) change({ files: draft.files.filter((_, i) => i !== index) });
									}}
								/>
							))}
						</div>
					)}
				</fieldset>
			</DropTarget>
			{create.isPending && (
				<p role="status" className="sr-only">
					Start the session…
				</p>
			)}
			{create.error && (
				<FailureState
					title="The session could not be created."
					description="Your draft stays here. Try Start session again."
					detail={create.error.message}
					className="mt-3"
				/>
			)}
		</TicketComposer>
	);
}
