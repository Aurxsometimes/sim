# SIM — Seeyuna's Item Manager

**[Open SIM](https://aurxsometimes.github.io/sim/)**

SIM is a personal fork of [Destiny Item Manager (DIM)](https://github.com/DestinyItemManager/DIM) for Destiny 2, with a few extras:

- **Loadout Groups** — save whole sets of in-game loadouts per character and swap them into the game in one go. Open a group to equip it, write any loadout straight into an in-game slot (click a group slot, then a character slot), import/export groups, and import backups from Blade Dancer's Destiny Tools.
- **Custom colors** — pick any background and accent color in Settings.
- **Vault weapons & armor** — one click per class to move unequipped weapons and armor to the vault.

SIM is not affiliated with the DIM team or Bungie. All the hard work is DIM's; see [DIM's original README](docs/DIM-README.md) and [license](LICENSE.md).

## Using it

Open the link above and sign in with Bungie. To install it as an app (taskbar / home screen), click the install icon at the right of Chrome's or Edge's address bar, or use the browser menu → *Install SIM*.

Your tags, loadouts and loadout groups are saved with DIM Sync under your own Bungie account.

## Developing

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for running it locally (`pnpm install`, `pnpm start`, then https://localhost:8080).

Every push to `main` builds and deploys the site to GitHub Pages via [.github/workflows/deploy.yml](.github/workflows/deploy.yml). The build needs these repository secrets: `WEB_API_KEY`, `WEB_OAUTH_CLIENT_ID`, `WEB_OAUTH_CLIENT_SECRET`, `DIM_API_KEY`.
