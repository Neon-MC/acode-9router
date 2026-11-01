# Acode 9Router

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Platform](https://img.shields.io/badge/platform-mobile-lightgrey.svg)
![Acode](https://img.shields.io/badge/Acode-plugin-orange.svg)

**Run 9Router inside Acode and keep your AI coding sessions going when a provider hits its limit.**

[Features](#features) · [Requirements](#requirements) · [Installation](#installation) · [Getting started](#getting-started) · [Troubleshooting](#troubleshooting)

---

Acode 9Router installs, starts and manages a local [9Router](https://9router.com/) server from Acode's sidebar.

9Router is a router for AI providers. You connect your accounts and API keys once, group models into a combo, and it automatically moves to the next model when a provider runs out of quota or returns a rate-limit error. Point Acode AI Agent (or any OpenAI-compatible client) at it, and you no longer have to switch models by hand in the middle of a task.

The plugin doesn't change how 9Router works. You set up providers and combos in the official 9Router dashboard, exactly like you would on a desktop.

## Features

- **One-tap setup.** Open the 9Router icon in the sidebar and the plugin checks your environment, installs whatever is missing (Node.js, npm and the `9router` package) and shows live progress. You never have to type a command.
- **Start and stop from the sidebar.** The status shows *Off*, *Starting* or *Online*. The server only runs when you start it, so it doesn't use battery or memory while it's off.
- **A Stop button that actually stops.** The plugin tracks the server's process ID, so no background process is left behind.
- **Dashboard in one tap.** The gear icon opens the official 9Router dashboard in your browser.
- **Made for touch screens.** It works on mobile, and the panel looks and feels like the Acode AI Agent.

## Requirements

- Acode on mobile, with Terminal support (Alpine Linux).
- An internet connection the first time you open the plugin, so it can download Node.js and 9Router.
- Optional: [Acode AI Agent](https://github.com/Acode-Foundation/acode-ai-agent), which needs Acode version code 1002 or newer.

## Installation

1. Go to the [Releases](https://github.com/Neon-MC/acode-9router/releases) page and download `acode-9router.zip`.
2. In Acode, go to **Settings → Plugins → + → LOCAL** and pick the downloaded zip.
3. Enable the plugin.

## Getting started

1. Tap the **9Router** icon in the sidebar. On the first launch, the plugin sets everything up. Wait for it to finish.
2. Tap **Start 9Router**. The first start can take 10 to 30 seconds on a phone.
3. Tap the gear icon to open the dashboard, add your providers and create a combo (for example, one called `auto-fallback`).
4. Connect your AI client to the local server. In Acode AI Agent, open **Provider access → Local endpoint** and use:

   ```text
   http://127.0.0.1:20128/v1
   ```

   Fetch the model list and pick your combo.

Any other OpenAI-compatible client works the same way: use the same base URL and your combo name as the model.

## How it works

| Part | What it does |
| --- | --- |
| Setup | Checks for Node.js, npm and the `9router` package, and installs what's missing with `apk` and `npm`. |
| Server | Runs 9Router's standalone server directly on `127.0.0.1:20128`. The plugin skips the desktop CLI wrapper because it isn't reliable inside Acode's terminal environment. |
| Shutdown | The server writes its process ID to a file, and Stop uses it to end the process cleanly. |
| Data | 9Router keeps its settings and database in `/public/.9router`. |

The server only listens on `127.0.0.1`, so it isn't reachable from other devices. To avoid a login screen on a phone, the plugin turns off the dashboard login during setup.

## Troubleshooting

**The port doesn't respond right after tapping Start.**
A cold start can take 10 to 20 seconds on a phone. The plugin waits up to 30 seconds. If it still times out, tap Start again.

**Setup fails.**
Check your internet connection and tap **Try again**.

**Acode AI Agent rejects the endpoint.**
Make sure the status says *Online*, then try `http://localhost:20128/v1` instead of `127.0.0.1`. This is the URL the 9Router dashboard shows on its Endpoint page.

## Project structure

```text
acode-9router/
├── dist/            Compiled plugin bundle
├── scripts/         install, setup-env, start, status and stop scripts
├── src/
│   ├── bridge/      Server lifecycle, command executor, HTTP client
│   ├── installer/   Environment check and installation
│   ├── ui/          Sidebar panel, spinner, icons and styles
│   ├── utils/       Logger
│   └── main.js      Plugin entry point
├── plugin.json      Acode plugin manifest
├── readme.md
└── changelogs.md
```

## Contributing

Bug reports and pull requests are welcome. If something breaks, please open an issue and include your device, your Acode version and the log lines from the plugin panel.

## License

Released under the [MIT license](LICENSE).

## Credits

- [Neon-MC](https://github.com/Neon-MC) — Creator & Lead Developer.
- [9Router](https://github.com/decolua/9router) for the AI provider router.
- [Acode](https://acode.app/) for the editor.
- [Acode AI Agent](https://github.com/Acode-Foundation/acode-ai-agent) for the panel design.
- [acode-opencode](https://github.com/Victozee26/acode-opencode) for the onboarding and terminal streaming approach.
