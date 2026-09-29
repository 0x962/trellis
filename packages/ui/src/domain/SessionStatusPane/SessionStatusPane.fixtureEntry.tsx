import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SessionStatusPaneFixture } from "./SessionStatusPane.fixture";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<SessionStatusPaneFixture />
	</StrictMode>,
);
