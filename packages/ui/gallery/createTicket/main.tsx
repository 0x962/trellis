import { createRoot } from "react-dom/client";
import { Prototype } from "./Prototype";
import "./prototype.css";
import "./composer.css";
import "./agent.css";
import "./workspace.css";
import "./responsive.css";
import "./container.css";
import "./frame.css";

const root = document.getElementById("root") as HTMLElement;
createRoot(root).render(<Prototype />);
