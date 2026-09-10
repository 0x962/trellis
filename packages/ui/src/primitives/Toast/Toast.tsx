import { type ExternalToast, Toaster as SonnerToaster, toast as sonnerToast } from "sonner";
import { cx } from "../../utils/cx";
import { CommandToast, type CommandToastProps } from "./components/CommandToast";

export type ToasterProps = {
	position?: "bottom-right" | "bottom-left" | "top-right" | "top-center";
	className?: string;
};

// How long each kind of toast stays, in ms. An error stays longer, because
// the reader has to take in a cause.
export const toastDurations = { plain: 3000, success: 3000, error: 6000 } as const;

// The toast outlet. Mount it once, near the root. It is a status region, so
// every toast is announced without stealing focus. The stack sits 44 px
// above the bottom edge, clear of the 28 px list footer.
export function Toaster({ position = "bottom-right", className }: ToasterProps) {
	return (
		<div role="status" className={className}>
			<SonnerToaster
				position={position}
				gap={8}
				offset={{ bottom: 44, right: 16 }}
				mobileOffset={{ bottom: 44, left: 16, right: 16 }}
				toastOptions={{
					unstyled: true,
					duration: toastDurations.plain,
					classNames: {
						toast: cx(
							"flex w-(--width) items-start gap-2 rounded-lg border border-border-strong bg-elevated px-3 py-2.5 text-sm text-fg shadow-md",
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
	sonnerToast.custom(
		() => (
			<div className="w-(--width) rounded-lg border border-border-strong bg-elevated px-3 py-2.5 shadow-md">
				<CommandToast title={title} command={command} />
			</div>
		),
		{ duration: toastDurations.success, ...data },
	);

// `toast("Saved")` shows a plain message. `toast.command` shows a copy
// toast with the copied text in mono. The rest is sonner's API.
export const toast = Object.assign((message: string, data?: ExternalToast) => sonnerToast(message, data), {
	success: (message: string, data?: ExternalToast) =>
		sonnerToast.success(message, { duration: toastDurations.success, ...data }),
	error: (message: string, data?: ExternalToast) =>
		sonnerToast.error(message, { duration: toastDurations.error, ...data }),
	warning: sonnerToast.warning,
	info: sonnerToast.info,
	dismiss: sonnerToast.dismiss,
	command,
});
