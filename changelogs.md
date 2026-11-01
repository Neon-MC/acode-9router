# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-11-01

First release.

### Added

- Sidebar panel for Acode on mobile, with a start/stop button, a live status indicator (*Off*, *Starting*, *Online*) and a compact log view.
- Automatic first-run setup. The plugin checks for Node.js, npm and the `9router` package, and installs anything that's missing with `apk` and `npm`.
- Setup progress screen with live output and a **Try again** button if something goes wrong.
- Gear button that opens the 9Router dashboard in the browser.
- Local server on `127.0.0.1:20128`, started from 9Router's standalone server instead of the desktop CLI wrapper.
- Process ID tracking, so the server can be stopped cleanly without touching your own terminal session.
- Default 9Router settings that skip the dashboard login on first setup, so the local API works right away.
- Official 9Router icon for the sidebar and the plugin cover.
- Panel styling that matches Acode AI Agent.

### Fixed

- Setup no longer fails with `Command exited with code: 1`. Binary checks now use simple commands, and the setup script is passed as Base64 to avoid quoting problems.
- Starting the server no longer times out too early. The start-up timeout is now 30 seconds, and the health check runs from inside the terminal environment.
- Stopping the server no longer ends your own shell session, and no orphaned processes are left behind.
