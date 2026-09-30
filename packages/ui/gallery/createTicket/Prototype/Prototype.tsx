import { Desktop, DeviceMobile, Moon, Sun } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type { Scenario } from "../model";
import { IconButton, Select, Tooltip, TrellisMark } from "../ui";
import { Preview } from "./components/Preview";

const search = new URLSearchParams(window.location.search);

export function Prototype() {
	const [theme, setTheme] = useState(search.get("theme") === "light" ? "light" : "dark");
	const [mobile, setMobile] = useState(false);
	const [scenario, setScenario] = useState<Scenario>((search.get("scenario") as Scenario) ?? "empty");
	useEffect(() => {
		document.documentElement.classList.add("theme-changing");
		document.documentElement.dataset.theme = theme;
		requestAnimationFrame(() =>
			requestAnimationFrame(() => document.documentElement.classList.remove("theme-changing")),
		);
	}, [theme]);
	if (search.get("view") === "preview") return <Preview scenario={scenario} />;
	return (
		<main className="prototype-gallery">
			<header className="gallery-header">
				<div className="gallery-identity">
					<TrellisMark className="size-5" />
					<h1>Create ticket</h1>
					<span className="prototype-badge">Prototype</span>
				</div>
				<div className="gallery-tools">
					<Select
						label="Preview state"
						items={[
							{ value: "empty", label: "New ticket" },
							{ value: "example", label: "With content" },
							{ value: "failure", label: "Assignment error" },
						]}
						value={scenario}
						onValueChange={setScenario}
					/>
					<Tooltip content={mobile ? "Show desktop width" : "Show phone width"}>
						<IconButton
							label={mobile ? "Show desktop width" : "Show phone width"}
							icon={mobile ? <Desktop /> : <DeviceMobile />}
							pressed={mobile}
							onClick={() => setMobile(!mobile)}
						/>
					</Tooltip>
					<Tooltip content={theme === "dark" ? "Use light theme" : "Use dark theme"}>
						<IconButton
							label={theme === "dark" ? "Use light theme" : "Use dark theme"}
							icon={theme === "dark" ? <Sun /> : <Moon />}
							onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
						/>
					</Tooltip>
				</div>
			</header>
			<div className={`preview-frame ${mobile ? "is-mobile" : ""}`}>
				<Preview key={scenario} scenario={scenario} embedded />
			</div>
			<footer className="gallery-footer">
				<p>Write a ticket. Choose an agent. Create both in one step.</p>
				<p>Interactive preview · No real tickets or agents</p>
			</footer>
		</main>
	);
}
