import { FormStatus } from "@trellis/ui";
import type { SettingsSaveStatus as SaveStatus } from "../useSettingsSave";

export function SettingsSaveStatus({ status: { pending, dirty, error } }: { status: SaveStatus }) {
	if (pending) return <FormStatus status="saving" message="Save in progress" />;
	if (error) return <FormStatus status="error" message={error} />;
	if (dirty) return <FormStatus status="idle" message="Unsaved changes" />;
	return <FormStatus status="saved" message="Saved" />;
}
