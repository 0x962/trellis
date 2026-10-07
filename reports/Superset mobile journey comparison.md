# Superset offers five comparable mobile journeys

Superset gives Trellis a fair native comparison for project selection, workspace search, settings, setup, and host connection. Its strongest complete journey starts an agent from a project and ends with mobile diff review. **Superset provides no verified native task record that matches a Trellis ticket.** Its official evidence also does not prove native accessibility, retained local state, or complete error coverage.

This report uses only official Superset sources and the Apple App Store. The evidence was reviewed on October 7, 2026. Superset means the coding-agent workspace at [superset.sh](https://superset.sh/), not Apache Superset.

## Current evidence defines the product

The [Superset for iPhone page](https://superset.sh/mobile) shows three static product views. They show a live agent terminal, a file diff, and project sections with workspace rows. The page says that users can start agents, follow them, and review diffs from an iPhone. It also says that code stays on the connected machines.

The [Apple App Store listing](https://apps.apple.com/us/app/superset-100-coding-agents/id6788926383) was on version 1.1.2 on October 7, 2026. The listing describes project and branch selection, agent and model selection, live session output, line comments, review feedback, pull request status, and merge. It requires iOS 26 or later. The app is free to download, but Superset says that mobile access requires Superset Pro.

Two dated Superset posts describe the released mobile journey. The [September 21 launch post](https://superset.sh/blog/superset-mobile), updated September 22, covers prompt entry, terminal follow-up, attachments, voice input, diff review, and host setup. The [September 22 iPhone walkthrough](https://superset.sh/blog/claude-code-codex-iphone) gives the connection steps and offline checks.

Current documentation adds the product contract. The [remote access guide](https://docs.superset.sh/remote-access#connect-from-an-iphone) defines how an iPhone reaches a host. The [workspace guide](https://docs.superset.sh/workspaces) defines projects, workspaces, sessions, branches, and the phone composer. The [tasks guide](https://docs.superset.sh/tasks) describes persistent tasks as a desktop dashboard feature.

Superset also publishes the current mobile source. This report inspected main at commit [`9a50076c`](https://github.com/superset-sh/superset/tree/9a50076c324b3d2575762e5bdcba6838061c8be5/apps/mobile) from October 7, 2026. The source supports route and control inventory. It does not prove that the App Store binary contains the same code.

## One complete journey supports direct comparison

Superset documents this end-to-end iPhone journey:

1. Install the desktop app and the iPhone app.
2. Sign in to the same account and organization on both devices.
3. Enable relay access in desktop Settings under Remote Access.
4. Select an online computer, a project, a branch, an agent, and a model.
5. Send a prompt and follow the session in the terminal.
6. Answer a question or send a revision from the phone.
7. Review changed files and leave line comments.
8. Send the review to the agent, check the pull request, and merge when ready.

The [App Store listing](https://apps.apple.com/us/app/superset-100-coding-agents/id6788926383) supports project selection, prompts, session follow-up, diff review, and pull request actions. The [iPhone walkthrough](https://superset.sh/blog/claude-code-codex-iphone) supports installation, account, relay, host, continuation, and diff-review steps. The walkthrough tells users to finish larger checks on desktop. This boundary makes the journey a fair mobile comparison, but not a complete release comparison.

Superset says that the phone continues the same workspace and terminal session. Users do not start a new chat or paste prior context. This claim supports a comparison of cross-device continuity. It does not prove retained draft text after app termination, an offline interval, or a phone restart.

## Five journeys overlap with exact limits

| Trellis journey | Current Superset mobile evidence | Fair comparison | Availability |
| --- | --- | --- | --- |
| Project | Home groups workspaces under projects. The new-session flow includes a project picker and a No project choice. The App Store flow starts with project and branch selection. | Project recognition, project switching, project grouping, no-project work, and project-to-session launch. | Direct |
| Ticket | The App Store uses “task” for the prompt sent to an agent. Superset documentation defines persistent tasks in the desktop dashboard. The current native route inventory has no task list or task detail route. | Prompt-to-agent launch only. Do not compare ticket identity, status, priority, assignee, activity, comments, or dependencies. | Unavailable as a ticket journey |
| Search | The native search screen searches workspace name, branch, project name, and terminal session title. It returns workspace rows and separate empty text. | Search entry, query response, workspace result clarity, project context, and no-match recovery. | Direct, but limited to workspaces |
| Settings | Native settings include organization, Pages, hosts, plan, help, community, support, rating, sign-out, and account deletion. Host settings show online and offline state. | Account identity, organization selection, host status, support routes, sign-out, and destructive action grouping. | Direct, but narrower than desktop settings |
| Setup | Native sign-in supports Apple, GitHub, Google, and email. A no-host screen gives three steps, Check again, and Read the setup guide. | Sign-in clarity, prerequisites, setup sequence, host-check feedback, and recovery from no devices. | Direct |
| Pairing | Superset connects through the same account, organization, and relay-enabled host. The desktop Mobile QR code opens the App Store and does not authenticate the phone. | Host discovery, online state, organization match, missing-host guidance, and reconnect checks. | Partial connection analogue |

The project evidence comes from the [mobile product page](https://superset.sh/mobile), the [workspace guide](https://docs.superset.sh/workspaces), and the current [project picker source](https://github.com/superset-sh/superset/blob/9a50076c324b3d2575762e5bdcba6838061c8be5/apps/mobile/screens/%28authenticated%29/%28home%29/new-session/project/ProjectPickerScreen.tsx). The source shows a flat project list with a selected state and an empty state.

The search evidence comes from the current [native search source](https://github.com/superset-sh/superset/blob/9a50076c324b3d2575762e5bdcba6838061c8be5/apps/mobile/screens/%28authenticated%29/%28home%29/search/SearchScreen.tsx). It matches four fields and opens one workspace from each result. It does not search task records, settings, source files, or pull requests.

The settings evidence comes from the current [native settings source](https://github.com/superset-sh/superset/blob/9a50076c324b3d2575762e5bdcba6838061c8be5/apps/mobile/screens/%28authenticated%29/settings/SettingsScreen.tsx). The public documentation describes broader desktop settings. Reviewers must not treat desktop appearance, agent, editor, or terminal settings as native mobile features.

The setup evidence comes from the [install guide](https://docs.superset.sh/install#iphone), the [remote access guide](https://docs.superset.sh/remote-access#connect-from-an-iphone), the current [native sign-in source](https://github.com/superset-sh/superset/blob/9a50076c324b3d2575762e5bdcba6838061c8be5/apps/mobile/screens/%28auth%29/sign-in/SignInScreen.tsx), and the current [no-host source](https://github.com/superset-sh/superset/blob/9a50076c324b3d2575762e5bdcba6838061c8be5/apps/mobile/screens/%28authenticated%29/%28home%29/home-connect-host/HomeConnectHostScreen.tsx). Superset states that relay activation restarts the host service and interrupts current terminals. A setup comparison must include that consequence.

## Ticket and pairing need precise labels

Superset uses “task” in two different ways. The App Store description calls an agent prompt a task. The [Tasks documentation](https://docs.superset.sh/tasks) defines stored work items with title, description, status, priority, assignee, activity, filters, and semantic search. That page places Tasks in the dashboard sidebar and calls the creation form a desktop modal.

The current [mobile route tree](https://github.com/superset-sh/superset/tree/9a50076c324b3d2575762e5bdcba6838061c8be5/apps/mobile/app) contains home, workspace, search, settings, Pages, voice, and review routes. It contains no native Tasks route. Therefore, Superset supports a native agent-session comparison. It does not support a native ticket-record comparison.

Superset also uses “pairs” in its App Store description. The documented mechanism does not pair devices through a QR credential exchange. The user enables the relay, signs in to the same account, selects the same organization, and selects the computer. The [remote access guide](https://docs.superset.sh/remote-access#connect-from-an-iphone) states that the QR code only opens the App Store.

Trellis can compare host visibility, organization selection, online status, empty guidance, and retry behavior. It cannot compare QR capture, camera permission, scan errors, one-time codes, or pairing confirmation with Superset.

## Public evidence leaves interaction gaps

The public [Superset application](https://app.superset.sh/) redirected an unauthenticated request to sign-in on October 7, 2026. The public page offered GitHub and Google sign-in. This research used no account and no Superset organization.

Boxd did not provide an iOS 26 device or the App Store binary. Therefore, this research did not execute the native app. The marketing views, App Store description, documentation, and public source are vendor evidence. They are not independent runtime proof.

The reviewed sources do not establish these results:

- behavior at a 320-pixel width;
- Dynamic Type or a 200 percent text size;
- VoiceOver names, order, and announcements;
- keyboard access or visible focus;
- measured contrast in both themes;
- reduced-motion behavior;
- retained draft text after force quit;
- offline edits and later reconciliation;
- complete loading, error, disabled, hover, active, and success states;
- Android behavior, because Android remains unavailable;
- the equality of current GitHub main and App Store version 1.1.2.

Official source shows named empty states for no projects, no workspaces, no matching workspaces, and no devices. It also shows host online and offline labels. These facts support state-inventory comparison. They do not prove the rendered quality or accessibility of those states.

## Conclusion

Superset provides a fair native benchmark for the project-to-agent-to-diff journey. It also provides direct, limited comparisons for workspace search, mobile settings, setup, and host connection.

A native ticket journey remains unavailable. QR pairing, Android, native accessibility, small-width behavior, and retained local state also remain unverified. The Trellis panel can compare only the overlapping journeys. It must keep the unavailable comparisons outside any superiority verdict.
