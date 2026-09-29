import { createRoot } from "react-dom/client";
import { SessionStatusEmbedFixture } from "./SessionStatusEmbed.fixture";

createRoot(document.getElementById("root")!).render(<SessionStatusEmbedFixture leakOrigin={location.origin} />);
