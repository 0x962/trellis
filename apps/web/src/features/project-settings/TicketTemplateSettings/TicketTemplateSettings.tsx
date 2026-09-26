import type { Project } from "@trellis/api";
import { Textarea } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";
import { SettingsSaveStatus } from "../SettingsSaveStatus";
import { SettingsSection } from "../SettingsSection";
import { useSettingsSave } from "../useSettingsSave";

export function TicketTemplateSettings({ project }: { project: Project }) {
	const { client, orpc, queryClient } = useApp();
	const { value, setField, saveField, status } = useSettingsSave({
		initialValue: { ticketTemplate: project.ticketTemplate },
		save: async (patch) => {
			await client.projects.update({ project: project.id, ...patch });
			await queryClient.invalidateQueries({ queryKey: orpc.projects.get.key() });
		},
	});
	return (
		<SettingsSection title="Tickets">
			<Textarea
				label="Ticket template"
				rows={14}
				value={value.ticketTemplate}
				onChange={(event) => setField("ticketTemplate", event.target.value)}
				onBlur={() => void saveField("ticketTemplate")}
				hint="Use Markdown for headings, checklists, and instructions."
			/>
			<SettingsSaveStatus status={status} />
		</SettingsSection>
	);
}
