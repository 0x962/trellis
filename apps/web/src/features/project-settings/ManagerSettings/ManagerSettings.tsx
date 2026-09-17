import type { Project } from "@trellis/api";
import type { ProjectManagerConfigController } from "../hooks/useProjectManagerConfig";
import { GeneralSettings } from "./components/GeneralSettings";
import { HarnessSettings } from "./components/HarnessSettings";

export function ManagerSettings({
	project,
	section,
	manager,
}: {
	project: Project;
	section: string;
	manager: ProjectManagerConfigController;
}) {
	const readOnly = project.archivedAt !== null;

	return (
		<>
			<div hidden={section !== "manager"} className="project-settings-page">
				<GeneralSettings readOnly={readOnly} draft={manager.draft} commit={manager.commit} />
			</div>
			<div hidden={section !== "harness"} className="project-settings-page">
				<HarnessSettings
					readOnly={readOnly}
					draft={manager.draft}
					saved={manager.saved}
					commit={manager.commit}
					setDraft={manager.setDraft}
				/>
			</div>
			{(section === "manager" || section === "harness") && (
				<p role={manager.status.role} className="manager-save-status">
					{manager.status.message}
				</p>
			)}
		</>
	);
}
