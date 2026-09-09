import { type ExternalToast, Toaster as SonnerToaster, toast as sonnerToast } from "sonner";
import { cx } from "../../utils/cx";
import { CommandToast, type CommandToastProps } from "./components/CommandToast";

export type ToasterProps = {
	position?: "bottom-right" | "bottom-left" | "top-right" | "top-center";
	className?: string;
};

// The toast outlet. Mount it once, near the root. It is a status region, so
// every toast is announced without stealing focus.
export function Toaster({ position = "bottom-right", className }: ToasterProps) {
	return (
		<div role="status" className={className}>
			<SonnerToaster
				position={position}
				gap={8}
				offset={16}
				toastOptions={{
					unstyled: true,
					duration: 5000,
					classNames: {
						toast: cx(
							"flex w-(--width) items-start gap-2 rounded-lg border border-border bg-elevated px-3 py-2.5 text-sm text-fg shadow-md",
						),
						content: "flex min-w-0 flex-1 flex-col gap-0.5",
						title: "font-medium",
						description: "text-fg-muted",
						icon: "mt-0.5 inline-flex size-3.5 shrink-0 *:size-full",
						actionButton:
							"ml-auto inline-flex h-6 shrink-0 items-center rounded-md border border-border bg-surface px-2 text-xs font-medium text-fg hover:bg-bg",
						cancelButton:
							"ml-auto inline-flex h-6 shrink-0 items-center rounded-md px-2 text-xs text-fg-muted hover:text-fg",
					},
				}}
			/>
		</div>
	);
}

const command = ({ title, command }: CommandToastProps, data?: ExternalToast) =>
	sonnerToast.custom(() => <CommandToast title={title} command={command} />, data);

// `toast("Saved")` shows a plain message. `toast.command` shows the
// Start-with-agent toast with the command in mono. The rest is sonner's API.
export const toast = Object.assign((message: string, data?: ExternalToast) => sonnerToast(message, data), {
	success: sonnerToast.success,
	error: sonnerToast.error,
	warning: sonnerToast.warning,
	info: sonnerToast.info,
	dismiss: sonnerToast.dismiss,
	command,
});
