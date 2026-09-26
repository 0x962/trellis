import { FolderOpen } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { IconButton, Input, Tooltip } from "@trellis/ui";
import { useRef } from "react";
import { useApp } from "../../../lib/appContext";

export type ProjectDirectorySettingsProps = {
	value: string;
	error: string | null;
	disabled: boolean;
	onChange: (value: string) => void;
	onBlur: () => void;
	onError: (error: string | null) => void;
};

export function ProjectDirectorySettings({
	value,
	error,
	disabled,
	onChange,
	onBlur,
	onError,
}: ProjectDirectorySettingsProps) {
	const { client } = useApp();
	const input = useRef<HTMLInputElement>(null);
	const folder = useMutation({
		mutationFn: () => {
			onError(null);
			const desktop = (window as Window & { trellisDesktop?: { chooseDirectory: () => Promise<string | null> } })
				.trellisDesktop;
			return desktop ? desktop.chooseDirectory() : client.system.chooseDirectory();
		},
		onSuccess: (directory) => {
			if (directory !== null) onChange(directory);
			input.current?.focus();
		},
		onError: (error) => onError(error.message),
	});
	return (
		<Input
			ref={input}
			label="Local path"
			placeholder="Choose a local repository"
			value={value}
			hint="Agents use this directory for project work."
			error={error ?? undefined}
			invalid={error !== null}
			disabled={disabled}
			onChange={(event) => onChange(event.target.value)}
			onBlur={onBlur}
			trailingAction={
				<Tooltip content="Choose a directory on this machine">
					<IconButton
						label="Choose project directory"
						icon={<FolderOpen />}
						disabled={disabled || folder.isPending}
						onClick={() => folder.mutate()}
					/>
				</Tooltip>
			}
		/>
	);
}
