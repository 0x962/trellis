import { FieldHint } from "../FieldHint";

export type FormStatusProps = {
	status: "idle" | "saving" | "saved" | "error";
	message?: string;
	className?: string;
};

const messages = { idle: "", saving: "Save in progress", saved: "Saved", error: "The save failed." };

export function FormStatus({ status, message, className }: FormStatusProps) {
	return (
		<FieldHint
			className={className}
			role={status === "error" ? "alert" : "status"}
			tone={status === "error" ? "danger" : "default"}
		>
			{message ?? messages[status]}
		</FieldHint>
	);
}
