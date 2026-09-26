import { FormStatus } from "@trellis/ui";
import type { SettingsSaveStatus as SaveStatus } from "../useSettingsSave";

export function SettingsSaveStatus({ status: { pending, dirty, error } }: { status: SaveStatus }) {
	const state = pending ? "saving" : error ? "error" : dirty ? "idle" : "saved";
	const message = pending ? "Save in progress" : (error ?? (dirty ? "Unsaved changes" : "Saved"));
	return <FormStatus status={state} message={message} />;
}
