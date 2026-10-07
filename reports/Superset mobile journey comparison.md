# Superset narrows fair mobile comparison sharply

As of October 7, 2026, Apache Superset provides an optional mobile mode for dashboard consumption in a responsive browser. It does not provide a native mobile application. **Superset gives Trellis fair comparison points for navigation, dashboard discovery, list search, dashboard reading, filters, personal display settings, and blocked-route recovery.** A dashboard collection and one dashboard provide partial project and ticket analogues, but they do not support work tracking. Superset provides a desktop database setup reference, but it provides no phone setup or device pairing journey. Reviewers must mark direct comparisons unavailable for project work, ticket actions, global search, administrator settings, phone setup, pairing, and native device behavior. The evidence describes unreleased Next-branch behavior behind a flag that defaults to off, so it does not represent the latest stable release. ([Mobile guide](https://superset.apache.org/user-docs/using-superset/mobile-experience/)) ([Release 6.1.0](https://github.com/apache/superset/releases/tag/6.1.0)) ([Mobile feature commit](https://github.com/apache/superset/commit/6211f9936b39643ca5c411c61b36a52dcfacf251))

## Six supported interactions form the fair baseline

**Fact:** Superset supports Welcome, the dashboard list, dashboards, mobile navigation, and dashboard filters below its mobile breakpoint. It blocks authoring, SQL Lab, query history, non-dashboard lists, database work, administration, and settings pages. A blocked route shows one unsupported view with actions for Dashboards and Welcome. ([Mobile guide](https://superset.apache.org/user-docs/using-superset/mobile-experience/)) ([Route guard](https://github.com/apache/superset/blob/f3da949f61cc1f9e640b36ae14a136be405c4010/superset-frontend/src/components/MobileRouteGuard/index.tsx)) ([Unsupported view](https://github.com/apache/superset/blob/f3da949f61cc1f9e640b36ae14a136be405c4010/superset-frontend/src/pages/MobileUnsupported/index.tsx))

**Fact:** Welcome exposes recent dashboards, dashboard groups, and one saved collapse state. The dashboard list searches titles and slugs. It also offers filters, sort controls, a no-match reset, and one card per row on mobile. A card shows the title, publication state, modification time, favorite state, and selected ownership details. Mobile hides each card's edit, export, and delete menu. ([Welcome source](https://github.com/apache/superset/blob/715dc017df19ba399c5f382b56ac188267ef7bca/superset-frontend/src/pages/Home/index.tsx#L170-L183)) ([Dashboard search](https://github.com/apache/superset/blob/715dc017df19ba399c5f382b56ac188267ef7bca/superset-frontend/src/pages/DashboardList/index.tsx#L654-L796)) ([Dashboard card](https://github.com/apache/superset/blob/715dc017df19ba399c5f382b56ac188267ef7bca/superset-frontend/src/features/dashboards/DashboardCard.tsx#L174-L224))

**Inference:** These routes support six useful comparisons: information hierarchy, touch navigation, search clarity, filter control, personal settings access, and recovery from unsupported work. Trellis can compare the same dimensions on its final rendered version. The panel cannot extend this evidence to work-item changes or native device integration.

| Trellis journey | Closest Superset evidence | Fair comparison | Availability |
| --- | --- | --- | --- |
| Project | Dashboard collection, Welcome, dashboard list | Collection hierarchy, discovery, card density, and navigation | Partial analogue |
| Ticket | One dashboard and its detail view | Identity, state label, detail hierarchy, and reading flow | Partial analogue |
| Search | Dashboard title or slug search, filters, sorting, and no-match reset | Query entry, result clarity, filter access, and empty recovery | Direct within dashboards only |
| Settings | Theme, language, user information, logout, and product information in the mobile drawer | Access, grouping, state clarity, touch targets, and menu hierarchy | Direct for personal choices only |
| Setup | Desktop database connection with staged fields, a connection test, and final connect action | Step order, validation, progressive disclosure, and success feedback | Desktop reference only |
| Pairing | No official equivalent | None | Unavailable |

## Project and ticket analogues end at reading

**Fact:** Superset calls its mobile mode consumption-only. The mode supports dashboard discovery and reading, while it excludes creation, editing, and administration. The dashboard list forces card mode, and a Search action opens a search drawer. A dashboard then presents full-width stacked charts and a separate filter drawer. ([Mobile guide](https://superset.apache.org/user-docs/using-superset/mobile-experience/)) ([Dashboard list source](https://github.com/apache/superset/blob/715dc017df19ba399c5f382b56ac188267ef7bca/superset-frontend/src/pages/DashboardList/index.tsx#L870-L992)) ([Dashboard screenshot](https://superset.apache.org/img/screenshots/mobile/mobile_dashboard.jpg)) ([Filter screenshot](https://superset.apache.org/img/screenshots/mobile/mobile_filter_drawer.jpg))

**Inference:** A dashboard collection resembles a project only because it groups named assets. It has no work plan, owner, wave, dependency, or progress model. One dashboard resembles a ticket only because it has an identity, state, detail view, and favorite action. It has no assignee, discussion, timeline, dependency, or completion action. A direct score for Trellis project or ticket work would compare different tasks.

**Fact:** Superset's mobile search covers dashboard titles and slugs. Filters can include publication state, tags, editors, viewers, favorites, certification, and modification author. The mobile evidence shows no application-wide search entry. ([Dashboard search](https://github.com/apache/superset/blob/715dc017df19ba399c5f382b56ac188267ef7bca/superset-frontend/src/pages/DashboardList/index.tsx#L654-L796)) ([Mobile navigation screenshot](https://superset.apache.org/img/screenshots/mobile/mobile_nav_drawer.jpg))

**Inference:** Trellis can compare its search controls and result presentation with the dashboard list. It cannot compare cross-object search coverage with Superset. Reviewers must state that application-wide search remains unavailable in the competitor evidence.

## Personal settings overlap while administration stays absent

**Fact:** Superset puts Dashboards, theme, language, user information, logout, and product information in a right-side mobile drawer. The menu button has the accessible name Menu, and each row handles navigation across its full width. Theme choices include Light, Dark, and Match system. ([Right menu source](https://github.com/apache/superset/blob/f3da949f61cc1f9e640b36ae14a136be405c4010/superset-frontend/src/features/home/RightMenu.tsx)) ([Theme choices](https://github.com/apache/superset/blob/f3da949f61cc1f9e640b36ae14a136be405c4010/superset-frontend/src/hooks/useThemeMenuItems.tsx)) ([Language picker](https://github.com/apache/superset/blob/f3da949f61cc1f9e640b36ae14a136be405c4010/superset-frontend/src/features/home/LanguagePicker.tsx))

**Inference:** This drawer gives Trellis a fair reference for personal setting access, explicit theme state, text wrapping, touch targets, and menu grouping. It does not support a comparison of host settings, security roles, database settings, or theme creation. Superset routes those administrator tasks to desktop pages. ([Theme configuration guide](https://superset.apache.org/admin-docs/configuration/theming/))

The official screenshot shows section labels, standard icons, and a product version. It shows only the light theme. The sources provide no success notice after a theme or language change. They also do not prove persistence after logout, device restart, or browser data reset. ([Mobile navigation screenshot](https://superset.apache.org/img/screenshots/mobile/mobile_nav_drawer.jpg))

## Desktop setup supplies process lessons, not mobile parity

**Fact:** Superset's documented database setup starts from Data and Connect Database. An administrator selects an engine, enters connection details, runs Test Connection, and selects Connect. The database guide divides the form into engine selection, connection parameters, and advanced settings. A successful test reports Connection looks good! before the final action. ([First dashboard tutorial](https://superset.apache.org/user-docs/using-superset/creating-your-first-dashboard/)) ([Database connection guide](https://superset.apache.org/user-docs/6.0.0/configuration/databases/))

**Fact:** The setup also has an operator prerequisite. The operator installs the required driver and configures the server before the administrator uses the form. The official package path adds command-line work for secrets, migrations, administrator creation, permissions, and server start. ([Database overview](https://superset.apache.org/docs/databases/)) ([PyPI installation guide](https://superset.apache.org/admin-docs/installation/pypi/))

**Inference:** Trellis can use this desktop sequence as a process reference for staged setup, test-before-save behavior, error placement, and progressive disclosure. It cannot use it as a mobile quality benchmark. Superset blocks the database route at phone width, and its official setup screenshots show desktop modals. ([Database selection screenshot](https://superset.apache.org/img/tutorial/tutorial_02_select_database.png)) ([Connection details screenshot](https://superset.apache.org/img/tutorial/tutorial_03b_connection_string_details.png))

**No official evidence provides a pairing analogue.** The reviewed sources show no host discovery, QR scan, camera use, biometric approval, push approval, or offline pairing. A database connection links Superset to a data source. It does not link a phone to a host.

## Current evidence cannot support a native verdict

**Fact:** Superset labels mobile mode as Version: Next and disables its feature flag by default. The latest published release predates the mobile feature commit. When an operator leaves the flag off, a phone receives the scaled desktop interface. ([Mobile guide](https://superset.apache.org/user-docs/using-superset/mobile-experience/)) ([Config source](https://github.com/apache/superset/blob/715dc017df19ba399c5f382b56ac188267ef7bca/superset/config.py#L737-L741)) ([Release 6.1.0](https://github.com/apache/superset/releases/tag/6.1.0))

**Fact:** The official screenshot generator uses a 390 by 844 viewport, a scale factor of two, and touch input. The Playwright suite covers mobile navigation, blocked routes, dashboard opening, one chart, refresh, and filters. The reviewed evidence does not contain a current public official instance or an executed test result. ([Screenshot generator](https://github.com/apache/superset/blob/715dc017df19ba399c5f382b56ac188267ef7bca/superset-frontend/playwright/generators/docs/mobile-screenshots.spec.ts#L20-L60)) ([Navigation test](https://github.com/apache/superset/blob/f3da949f61cc1f9e640b36ae14a136be405c4010/superset-frontend/playwright/tests/mobile/mobile-navigation.spec.ts)) ([Dashboard test](https://github.com/apache/superset/blob/715dc017df19ba399c5f382b56ac188267ef7bca/superset-frontend/playwright/tests/mobile/mobile-dashboard.spec.ts#L36-L248))

The evidence does not cover a 320-pixel viewport, 200 percent zoom, a physical phone, native back behavior, or native text entry. It also lacks reduced-motion results, screen-reader output, contrast measurements, visible focus proof, dense data, long translated labels, and comprehensive state coverage. Reviewers must not infer those results from documentation screenshots.

## Conclusion

Superset sets a useful floor for a small responsive consumption path. Trellis should match its focused navigation, one-column discovery, clear filters, explicit theme choices, and honest blocked states. Trellis must supply its own proof for work tracking, setup, pairing, text entry, retained state, and device behavior.

The final panel can claim superiority only for the overlapping journeys on the same inspected Trellis version. For unavailable journeys, the panel must judge Trellis against the ticket criteria and other approved references. It must not claim that Trellis beats a Superset journey that Superset does not provide.
