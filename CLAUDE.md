# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`iobroker.ham` ("Homebridge accessories manager") runs Homebridge plugins inside ioBroker and mirrors every HomeKit accessory / service / characteristic as ioBroker device / channel / state. Writable characteristics can be controlled from ioBroker.

TypeScript (CommonJS output). Backend sources live in `src/`, the published/runnable code is the compiled `build/` (`package.json` `main` is `build/main.js`). `build/` is gitignored — always run the build before starting the adapter or the integration tests. The admin tab is a separate React app in `src-admin/` whose build output **is committed** in `admin/` (`tab_m.html`, `assets/`).

## Commands

```bash
npm run build-backend                     # tsc -p tsconfig.build.json  -> build/
npm run build                             # build-backend + check-admin + React tab (tasks.ts: clean, npm i, vite build, copy, patch)
npm run check-admin                       # type check of the tab (src-admin/tsconfig.json)
npm run lint-admin                        # eslint of the tab
cd src-admin && npm start                 # vite dev server on :3000 against the admin on :8081, open http://localhost:3000/?0
npm run 0-clean / 1-npm / 2-build / 3-copy / 4-patch   # single steps of the tab build
npm run watch                             # backend in watch mode
npm run check                             # type check only (tsconfig.json, noEmit)
npm run lint                              # eslint (@iobroker/eslint-config, flat config)
npx eslint -c eslint.config.mjs --fix src # autofix + prettier formatting

npm run test:package                      # validates package.json / io-package.json / admin JSON (fast)
npm run test:unit                         # mocha unit tests against build/ (fakes for the wrapper and Homebridge installations)
npm run test:integration                  # js-controller + adapter: wrapper, local, global with Homebridge 2 and 1 (long, installs from npm)
npx mocha test/integrationAdapter --exit --grep "Local mode"   # single suite
npm run translate                         # translate admin/i18n/en.json into the other languages
npm run release-patch                     # @alcalzone/release-script, moves README changelog into io-package news
```

There is deliberately **no `prepare` script** — `npm ci`/`npm install` does not build. Because `build/` is neither committed nor built on install, `common.nogit` is `true` in `io-package.json`: the adapter can only be installed from npm, not from GitHub. The integration test requires that **no** js-controller is running on the machine ("JS-Controller is already running!"); on a dev machine with ioBroker, run it in WSL / a container. CI builds only the backend (`build-command: npm run build-backend`) because the tab build is committed. The integration tests use `homebridge-http-webhooks` from npm and the own accessory plugin `test/plugins/homebridge-ham-test`, which is copied into `node_modules` (not listed in `libraries`).

## Architecture

### Layout

| Path | Content |
| --- | --- |
| `src/main.ts` | `HamAdapter extends utils.Adapter`: mode selection, npm installs, object/state creation |
| `src/lib/wrapper-handler.ts` | `WrapperHandler` — wrapper mode via `homebridge-plugin-wrapper` (no bridge published) |
| `src/lib/global-handler.ts` | `GlobalHandler` — global and local mode: starts the Homebridge `Server` of an installation and subclasses its HAP `Bridge` |
| `src/lib/mapper.ts` | `Mapper` — HomeKit UUIDs/names → ioBroker IDs, roles, types, units |
| `src/lib/miniqueue.ts` | `MiniQueue` — serializes accessory processing per UUID |
| `src/lib/types.ts` | minimal shapes of HAP-NodeJS / Homebridge objects, handler interfaces |
| `src/lib/adapter-config.d.ts` | augments `ioBroker.AdapterConfig` |
| `src/types/homebridge-plugin-wrapper.d.ts` | typings for the untyped wrapper package |
| `src-admin/` | React admin tab (Vite, TypeScript, MUI 9, `@iobroker/gui-components` 10, rjsf 6): search/install/configure Homebridge plugins |
| `admin/jsonConfig.json` | the configuration dialog |
| `tasks.ts` | build steps of the React tab (`@iobroker/build-tools`) |

`src/lib/adapter-config.d.ts` is hand-maintained and must be kept in sync with `native` in `io-package.json` **and** with `admin/jsonConfig.json` — nothing generates it.

### Modes

Selected in `onReady()` by `useGlobalHomebridge` (wins) / `useLocalHomebridge`, neither = wrapper mode. The admin shows a select bound to `native.homebridgeMode` (UI only, empty for old instances - then `defaultFunc` derives it from the flags); the two hidden flags follow it via `onChange.calculateFunc`. The backend never reads `homebridgeMode`.

- **Wrapper** — `homebridge-plugin-wrapper` (>= 4: Homebridge 2.4 / HAP-NodeJS 2.2, see its `vendor-versions.json`) bundles its own Homebridge/HAP-NodeJS. Plugins from `native.libraries` are installed into the adapter directory.
- **Local** — installs `homebridge@2.4.0` (`INSTALL_LOCAL_HOMEBRIDGE_VERSION`) plus the plugins into the adapter directory, writes `wrapperConfig` as `config.json` into `<dataDir>/ham_<instance>/` and publishes a real bridge. A changed `bridge.username` deletes that directory (HomeKit pairing cache).
- **Global** — uses an existing installation at `globalHomebridgeBasePath`; `NODE_PATH` is extended so Homebridge's plugin manager finds the global plugins.

`ADAPTER_DIR` is `join(__dirname, '..')` — `__dirname` is `build/`, plugins and Homebridge live in `<adapter>/node_modules`.

`GlobalHandler` loads Homebridge internals by path and supports both major versions: Homebridge 2 is ESM in `dist/` (loaded with `await import()`, therefore `init()` is async), Homebridge 1 is CommonJS in `lib/`. HAP-NodeJS is `@homebridge/hap-nodejs` (Homebridge >= 1.8) or `hap-nodejs`, searched next to / inside the Homebridge package — it must be the same instance Homebridge uses, because `hap.Bridge` is subclassed and replaces `server.bridgeService.bridge`. Values are read with `handleGetRequest()` (`getValue(callback)` is gone since HAP-NodeJS 1.0; it is only the fallback for very old versions). `handlePublishExternalAccessories` is overridden but never called — Homebridge binds the original in the `BridgeService` constructor.

### Objects and states

`<accessory>.<service>.<characteristic>` in the own namespace, names sanitized by `Mapper` (`FORBIDDEN_CHARS` + `[]. *,;'"\`<>\\?` → `-`). Duplicate accessory names get `-<UUID>` appended. Existing devices are registered at start (`native.UUID`/`displayName`) so IDs stay stable. Values that arrive before the state object exists are postponed (`lastRealStateValue`); "empty" values (`null`, `0`, `false`, `''`) are discarded in that phase. Accessories are never deleted automatically.

### wrapperConfig

The JsonConfig `jsonEditor` stores `native.wrapperConfig` as **JSON string**, older versions and the React tab as object. `main.ts` (`parseWrapperConfig`) and `src-admin/src/App.tsx` (`getAdapterConfig`) accept both; the tab writes back in the format it found.

### Admin tab (`src-admin/`)

- `App.tsx` extends `GenericApp` (no bottom buttons, saves itself via `onSave(false)` after every change); the theme, including the modern Admin 8 themes, comes from the admin.
- `Components/PluginsTable.tsx` searches `registry.npmjs.org/-/v1/search` (`keywords:homebridge-plugin`, server side paging) and reads the installed modules from `registry.npmjs.org/<name>/latest`. Installed modules are always on page 1.
- `Components/ConfigDialog.tsx` loads `config.schema.json` of a plugin from jsDelivr (10 s timeout) and renders it with rjsf; without a schema (or with an unsupported one) it falls back to a JSON editor (Ace).
- `TabCache.ts` remembers in `native._tabCache` which `platforms`/`accessories` entry belongs to which npm module.
- `src-admin/package-lock.json` is committed, so the tab build is reproducible.

### Process-global side effects

`console.log` is redirected to the debug log (unless `--logs`/`-l`), `virtualCommandLine` is appended to `process.argv`, `NODE_PATH` is changed, and `uncaughtException` is caught and only logged (plugins throw from their callbacks). That is why the adapter is **not** `compact`.

### Misc conventions

- Timers only via the injected adapter timers (`this.setTimeout`), never the globals.
- `main.ts` exports a factory when required (compact mode loader) and self-starts when run directly.
- `string-argv` declares ESM types and is loaded via `await import()`; keep `module: Node16`.

## Release flow

Changelog lives in `README.md` under the `### **WORK IN PROGRESS**` placeholder; `release-script` (config in `.releaseconfig.json`, runs `npm run build` before commit) moves it into `io-package.json` `common.news`. CI (`.github/workflows/test-and-release.yml`) uses `ioBroker/testing-action-check@v2` (type check, lint, package tests), `ioBroker/testing-action-adapter@v1` (Node 22/24/26 × Linux/Windows/macOS) and `ioBroker/testing-action-deploy@v1` on version tags.
