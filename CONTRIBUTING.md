# Contributing to LiquidProgress

Thanks for taking the time to contribute. Whether it's a bug report, a feature idea, or a pull request — it's appreciated.

## Quick links

- 🐛 **Found a bug?** [Open an issue](../../issues/new) with a screenshot of what the control looks like vs what you expected, and the bound field types.
- 💡 **Have an idea?** Open an issue with the use case — I'd rather understand the problem than the proposed feature.
- 🔧 **Want to send a PR?** Read the build setup below.

## Build prerequisites

You'll need:

- **Node.js** LTS (tested on v22)
- **.NET SDK** 8.x or 10.x (for the solution wrapper)
- **Power Platform CLI** (`pac`) — install via the VS Code extension *Power Platform Tools* or:
  ```bash
  dotnet tool install --global Microsoft.PowerApps.CLI.Tool
  ```

## Build and run

```powershell
# Install npm deps (only needed once)
npm install

# Run the test harness — opens a browser with the control on a fake form
npm start watch

# Build the PCF bundle (without packaging into a solution)
npm run build

# Produce a versioned managed-solution release zip
.\scripts\build-release.ps1 -Version "1.4.0"
# → release/LiquidProgress_1.4.0_managed.zip
```

## Project structure

Refer to the *Repo layout* section in the [README](README.md). The two files you'll touch most:

- `LiquidProgress/ControlManifest.Input.xml` — property definitions
- `LiquidProgress/index.ts` — the actual control logic and rendering

The CSS lives in `LiquidProgress/css/LiquidProgress.css`. The resx in `strings/` is the display-name source for the form designer.

## Pull request flow

1. Fork the repo and create a branch from `main`.
2. Make your change. Try to keep it focused — one feature or fix per PR.
3. Run `npm run build` to confirm there are no TypeScript or lint errors.
4. Test in the harness (`npm start watch`) with a few values: `0`, `0.5`, `1`, and edge cases.
5. If you change the public surface (manifest, README), update the README too.
6. Open a PR with a short description of what you changed and why.

I aim to respond to issues and PRs within a week, but please be patient — this is a side project.

## Style notes

- TypeScript only, no inline JS.
- Keep the bundle dependency-free where possible. If you must add a library, justify it in the PR.
- Use the existing CSS variable naming (`--lp-*`).
- Match the existing code style — small functions, plain DOM, no framework.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
