import { ArrowUp, FolderOpen } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, IconButton, Kbd, Select, Tooltip, toast, useHotkey } from "@trellis/ui";
import { useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { ModelPicker } from "../../agents/ModelPicker";
import { type SessionHarness, sessionHarnesses } from "../harnessLabel";

export type NewSessionDialogProps = {
	onClose: () => void;
};

// The value of the model pill for the default model of the harness.
const DEFAULT_MODEL = "default";

// The composer behind the New session button, in the shape of the Superset
// one: an optional name on top, the prompt box with the harness and model
// pills and the round submit under the text, and the No project and
// Cmd+Enter hints at the bottom. The root shell mounts it while it is open,
// so the Cmd+Enter hotkey lives only while it shows. A created session
// opens at once.
export function NewSessionDialog({ onClose }: NewSessionDialogProps) {
	const { client, orpc, queryClient } = useApp();
	const navigate = useNavigate();
	const promptRef = useRef<HTMLTextAreaElement>(null);
	const [prompt, setPrompt] = useState("");
	const [name, setName] = useState("");
	const [harness, setHarness] = useState<SessionHarness>("claude");
	const [model, setModel] = useState(DEFAULT_MODEL);
	const create = useMutation({
		mutationFn: () =>
			client.sessions.create({
				prompt: prompt.trim(),
				...(name.trim() === "" ? {} : { name: name.trim() }),
				harness: { preset: harness, ...(model === DEFAULT_MODEL ? {} : { model }) },
			}),
		onSuccess: async (session) => {
			onClose();
			await queryClient.invalidateQueries({ queryKey: orpc.sessions.key() });
			await navigate({ to: "/sessions/$id", params: { id: session.id } });
			if (session.run.state === "failed" || session.run.state === "interrupted")
				toast.error(`${session.name} could not start`, { description: session.run.error ?? undefined });
		},
	});
	const ready = prompt.trim() !== "" && !create.isPending;
	const submit = () => {
		if (ready) create.mutate();
	};
	useHotkey("mod+enter", submit);
	return (
		<Dialog
			open
			onOpenChange={(next) => {
				if (!next && !create.isPending) onClose();
			}}
			title="New session"
			size="lg"
			bare
			initialFocus={promptRef}
			className="gap-0! bg-surface p-0!"
		>
			<form
				className="flex flex-col gap-2 p-3"
				onSubmit={(event) => {
					event.preventDefault();
					submit();
				}}
			>
				<input
					aria-label="Session name"
					autoComplete="off"
					maxLength={60}
					placeholder="Session name (optional)"
					disabled={create.isPending}
					value={name}
					onChange={(event) => setName(event.target.value)}
					className="h-7 w-full bg-transparent px-1 text-base font-medium text-fg outline-none placeholder:text-fg-faint"
				/>
				<div className="flex flex-col rounded-lg border border-border bg-elevated">
					<textarea
						ref={promptRef}
						aria-label="Prompt"
						maxLength={20000}
						placeholder="What do you want to do?"
						disabled={create.isPending}
						value={prompt}
						onChange={(event) => setPrompt(event.target.value)}
						className="max-h-60 min-h-16 w-full resize-none bg-transparent px-3 pt-2.5 text-base leading-5 text-fg outline-none placeholder:text-fg-faint [field-sizing:content]"
					/>
					<div className="flex items-center justify-between gap-2 px-2 pb-2">
						<div className="flex min-w-0 items-center gap-1.5">
							<Select
								label="Harness"
								items={sessionHarnesses}
								value={harness}
								onValueChange={(next) => {
									setHarness(next);
									setModel(DEFAULT_MODEL);
								}}
								disabled={create.isPending}
							/>
							<ModelPicker
								harness={harness}
								value={model === DEFAULT_MODEL ? undefined : model}
								onValueChange={(next) => setModel(next ?? DEFAULT_MODEL)}
								disabled={create.isPending}
								className="max-w-56"
							/>
						</div>
						<Tooltip content="Create session">
							<IconButton
								variant="primary"
								size="xs"
								label="Create session"
								icon={<ArrowUp weight="bold" />}
								disabled={!ready}
								onClick={submit}
							/>
						</Tooltip>
					</div>
				</div>
				{create.isError && (
					<p role="alert" className="text-sm text-danger">
						{create.error.message}
					</p>
				)}
				<div className="flex items-center justify-between gap-2 px-1 text-xs text-fg-muted">
					<span className="inline-flex items-center gap-1.5">
						<FolderOpen aria-hidden="true" className="size-3.5" />
						No project
					</span>
					<span className="inline-flex items-center gap-1">
						<Kbd>⌘↩</Kbd> to create
					</span>
				</div>
			</form>
		</Dialog>
	);
}
