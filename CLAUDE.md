# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`iobroker.ham` ("Homebridge accessories manager") runs Homebridge plugins inside ioBroker and mirrors every HomeKit accessory / service / characteristic as ioBroker device / channel / state. Writable characteristics can be controlled from ioBroker.

TypeScript (CommonJS output). Backend sources live in `src/`, the published/runnable code is the compiled `build/` (`package.json` `main` is `build/main.js`). `build/` is gitignored — always run the build before starting the adapter or the integration tests. The admin tab is a separate React app in `src-admin/` whose build output **is committed** in `admin/` (`tab_m.html`, `static/`).

## Commands

```bash
npm run build-backend                     # tsc -p tsconfig.build.json  -> build/
npm run build                             # build-backend + React tab (tasks.ts: clean, npm i, craco build, copy, patch)
npm run 0-clean / 1-npm / 2-build / 3-copy / 4-patch   # single steps of the tab build
npm run watch                             # backend in watch mode
npm run check                             # type check only (tsconfig.json, noEmit)
npm run lint                              # eslint (@iobroker/eslint-config, flat config)
npx eslint -c eslint.config.mjs --fix src # autofix + prettier formatting

npm run test:package                      # validates package.json / io-package.json / admin JSON (fast)
npm run test:integration                  # js-controller + adapter: wrapper, local and global mode (long, installs plugins from npm)
npx mocha test/integrationAdapter --exit --grep "Local mode"   # single suite
npm run translate                         # translate admin/i18n/en.json into the other languages
npm run release-patch                     # @alcalzone/release-script, moves README changelog into io-package news
```

There is deliberately **no `prepare` script** — `npm ci`/`npm install` does not build. Because `build/` is neither committed nor built on install, `common.nogit` is `true` in `io-package.json`: the adapter can only be installed from npm, not from GitHub. The integration test requires that **no** js-controller is running on the machine ("JS-Controller is already running!"); on a dev machine with ioBroker, run it in WSL / a container. CI builds only the backend (`build-command: npm run build-backend`) because the tab build is committed.

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
| `src-admin/` | React admin tab (CRA + craco): search/install/configure Homebridge plugins |
| `admin/jsonConfig.json` | the configuration dialog |
| `tasks.ts` | build steps of the React tab (`@iobroker/build-tools`) |

`src/lib/adapter-config.d.ts` is hand-maintained and must be kept in sync with `native` in `io-package.json` **and** with `admin/jsonConfig.json` — nothing generates it.

### Modes

Selected in `onReady()` by `useGlobalHomebridge` (wins) / `useLocalHomebridge`, neither = wrapper mode. The admin shows them as two checkboxes that deselect each other (`onChange.calculateFunc`).

- **Wrapper** — `homebridge-plugin-wrapper` bundles its own Homebridge/HAP-NodeJS. Plugins from `native.libraries` are installed into the adapter directory.
- **Local** — installs `homebridge@1.5.0` (`INSTALL_LOCAL_HOMEBRIDGE_VERSION`) plus the plugins into the adapter directory, writes `wrapperConfig` as `config.json` into `<dataDir>/ham_<instance>/` and publishes a real bridge. A changed `bridge.username` deletes that directory (HomeKit pairing cache).
- **Global** — uses an existing installation at `globalHomebridgeBasePath`; `NODE_PATH` is extended so Homebridge's plugin manager finds the global plugins.

`ADAPTER_DIR` is `join(__dirname, '..')` — `__dirname` is `build/`, plugins and Homebridge live in `<adapter>/node_modules`.

`GlobalHandler` loads Homebridge internals by path (`lib/user`, `lib/server`, `lib/logger`, `hap-nodejs/dist`) and subclasses `hap.Bridge`. With homebridge 1.5 / HAP-NodeJS 0.10 the base is an ES5 function. `handlePublishExternalAccessories` is overridden but never called — Homebridge binds the original in the `BridgeService` constructor.

### Objects and states

`<accessory>.<service>.<characteristic>` in the own namespace, names sanitized by `Mapper` (`FORBIDDEN_CHARS` + `[]. *,;'"\`<>\\?` → `-`). Duplicate accessory names get `-<UUID>` appended. Existing devices are registered at start (`native.UUID`/`displayName`) so IDs stay stable. Values that arrive before the state object exists are postponed (`lastRealStateValue`); "empty" values (`null`, `0`, `false`, `''`) are discarded in that phase. Accessories are never deleted automatically.

### wrapperConfig

The JsonConfig `jsonEditor` stores `native.wrapperConfig` as **JSON string**, older versions and the React tab as object. `main.ts` (`parseWrapperConfig`) and `src-admin/src/app.jsx` (`getAdapterConfig`) accept both; the tab writes back in the format it found.

### Process-global side effects

`console.log` is redirected to the debug log (unless `--logs`/`-l`), `virtualCommandLine` is appended to `process.argv`, `NODE_PATH` is changed, and `uncaughtException` is caught and only logged (plugins throw from their callbacks). That is why the adapter is **not** `compact`.

### Known legacy behaviour (kept on purpose)

- `GlobalHandler.start()` ignores the configured `insecureAccess`.

### Misc conventions

- Timers only via the injected adapter timers (`this.setTimeout`), never the globals.
- `main.ts` exports a factory when required (compact mode loader) and self-starts when run directly.
- `string-argv` declares ESM types and is loaded via `await import()`; keep `module: Node16`.

## Release flow

Changelog lives in `README.md` under the `### **WORK IN PROGRESS**` placeholder; `release-script` (config in `.releaseconfig.json`, runs `npm run build` before commit) moves it into `io-package.json` `common.news`. CI (`.github/workflows/test-and-release.yml`) uses `ioBroker/testing-action-check@v2` (type check, lint, package tests), `ioBroker/testing-action-adapter@v1` (Node 22/24/26 × Linux/Windows/macOS) and `ioBroker/testing-action-deploy@v1` on version tags.
