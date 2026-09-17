import { ArrowUp, Paperclip } from "@phosphor-icons/react";
import { cx, IconButton, Textarea, Tooltip } from "@trellis/ui";
import { type ReactNode, type Ref, useRef } from "react";
import { useDropTarget } from "../../attachments/hooks/useDropTarget";
import { UploadProgress } from "../../attachments/UploadProgress";

export function SessionPrompt({
	text,
	files,
	onText,
	onFiles,
	onSubmit,
	disabled = false,
	label = "Message",
	compact = false,
	tools,
	inputRef,
}: {
	text: string;
	files: File[];
	onText: (text: string) => void;
	onFiles: (files: File[]) => void;
	onSubmit: () => void;
	disabled?: boolean;
	label?: string;
	compact?: boolean;
	tools?: ReactNode;
	inputRef?: Ref<HTMLTextAreaElement>;
}) {
	const fileIds = useRef(new WeakMap<File, string>());
	const fileId = (file: File) => {
		const id = fileIds.current.get(file) ?? crypto.randomUUID();
		fileIds.current.set(file, id);
		return id;
	};
	const picker = useRef<HTMLInputElement>(null);
	const add = (added: File[]) => {
		if (!disabled) onFiles([...files, ...added]);
	};
	const drop = useDropTarget(add);
	return (
		<section
			aria-label={label}
			className={cx(
				"relative flex flex-col gap-2 p-3",
				compact && "rounded-lg border border-border bg-elevated focus-within:border-accent",
			)}
			onDragOver={drop.onDragOver}
			onDragLeave={drop.onDragLeave}
			onDrop={drop.onDrop}
		>
			{files.map((file, index) => (
				<UploadProgress
					key={fileId(file)}
					upload={{ id: String(index), file, percent: 0, status: "pending", error: null }}
					onDismiss={() => {
						if (!disabled) onFiles(files.filter((_, i) => i !== index));
					}}
				/>
			))}
			<Textarea
				ref={inputRef}
				variant={compact ? "composer" : "default"}
				className={compact ? "min-h-20 max-h-60" : undefined}
				label={label}
				hideLabel
				value={text}
				rows={3}
				maxLength={20000}
				disabled={disabled}
				placeholder="What do you want to do?"
				onChange={(event) => onText(event.target.value)}
				onPaste={(event) => {
					if (event.clipboardData.files.length) {
						event.preventDefault();
						add([...event.clipboardData.files]);
					}
				}}
				onKeyDown={(event) => {
					if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
						event.preventDefault();
						onSubmit();
					}
				}}
			/>
			<div className="flex flex-wrap items-center justify-between gap-2">
				{tools && <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{tools}</div>}
				<div className={cx("flex items-center gap-2", !tools && "w-full justify-between", !!tools && "ml-auto")}>
					<Tooltip content="Attach files">
						<IconButton
							label="Attach files"
							icon={<Paperclip />}
							disabled={disabled}
							onClick={() => picker.current?.click()}
						/>
					</Tooltip>
					{!compact && <span className="text-xs text-fg-faint">⌘/Ctrl+Enter to send</span>}
					<Tooltip content={compact ? "Start session" : "Send message"}>
						<IconButton
							label={compact ? "Start session" : "Send message"}
							icon={<ArrowUp />}
							variant="primary"
							disabled={disabled || (!text.trim() && files.length === 0)}
							onClick={onSubmit}
						/>
					</Tooltip>
				</div>
			</div>
			<input
				ref={picker}
				type="file"
				multiple
				disabled={disabled}
				className="sr-only"
				tabIndex={-1}
				aria-label="Choose attachments"
				onChange={(event) => {
					add([...(event.target.files ?? [])]);
					event.target.value = "";
				}}
			/>
			{drop.over && (
				<div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md border-2 border-dashed border-accent bg-accent-soft text-accent">
					Drop to attach
				</div>
			)}
		</section>
	);
}
