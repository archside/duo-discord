# Duo Discord

Unbound plugins that adapt Discord for iPhone Duo, plus the packaging tool that gives Discord the Duo's full window. Built and checked on Windows, and tested on an iPhone Duo with Discord 350.0 and the Unbound loader, installed through SideStore.

Duo Layout keeps Discord's own screens and adds:

- **Unfolded, portrait.** The server list and chat headers sit on the status bar's row, clear of the status icons, and hold that row while the chat slides between peeking and full width.
- **Unfolded, landscape.** The chat's surface and header divider carry on into the side band. A pill with messages, notifications and you replaces the bottom bar, just under the status icons.
- **Folded.** Chats run under the side band. The pill sits at the band's foot, in thumb reach, and steps aside inside chats.
- **Folding and half-folding.** Folding mid-conversation keeps that conversation open. Half-folded like a book, the channel list ends at the fold; like a laptop during a call, video stays above it. These two postures pass the smoke checks but are not yet checked on the device.
- **Rotation.** Discord locks iPhones to portrait, which made unfolding open in the wrong orientation. On the Duo the lock is released, as Discord already does on iPad.

Each part has a switch in Duo Layout's settings and falls back to stock Discord when Discord's internals change shape. Duo Probe is a read-only companion that logs window geometry for diagnosis.

## Feasibility, as first assessed on 2026-10-24

The work splits into three problems, and only the first can block it.

**1. Getting the full window.** Apple picks the inner-display window from the SDK the app was built with ([Prepare](https://developer.apple.com/iphone-duo/prepare/)). With iOS 26 SDK or earlier, the app sits centered with empty space around it. With iOS 27 it fills most of the display but stops short of the status bar edge. With iOS 27.1 it uses the full display. A plugin cannot change this, because iOS decides at launch from the app bundle. One developer measured 375×667, 871×669 and 951×669 points for the three tiers, and reports iOS reads the SDK from the executable's `LC_BUILD_VERSION` ([Kiradex write-up](https://blakecrosley.com/blog/prepare-your-app-for-iphone-duo), third-party, not Apple). The Unbound build in use carries Discord 350.0 built with Xcode 26.5 against the iOS 26.5 SDK, so it gets the phone-sized window. `tools/ipa/duo_ipa.py inspect` reads this from the IPA, and the Duo Probe plugin reads it on the device.

If the IPA reports SDK 26.x, `duo_ipa.py stamp` rewrites only the SDK field of Discord's main executable. Apple does not document this. Apollo's GLASS build reportedly made the same change and got Duo layouts on real hardware. The stamp also turns on newer UIKit behavior that Discord was never tested with, so it needs the full device protocol below, not just a check that the black bars are gone.

**2. Getting geometry.** No native code is needed. React Native's `Dimensions` events report resizes. Unbound's Objective-C bridge (native plugin ABI 1.0) reads window bounds, safe areas, size classes and `UIViewReservedRegion` fold regions (iOS 27.1) on the main thread. One gap remains. A fold-angle change with no resize (flat to book) does not reach JavaScript yet. `UIHingeInteraction` needs a block, and the bridge cannot create native closures.

**3. Adapting the interface.** Discord already lays itself out by window width, not device type. `useWindowSizeClassifier` sorts the window width minus side safe areas into four classes. At over 600 pt the chat sits beside the channel list. Over 840 pt it tiles with a 332 pt sidebar. The old `isTablet` override has nothing left to patch. Duo Layout keeps Discord's own components and state. It only narrows the class Discord picks. Larger Dynamic Type stops tiling when the chat column would get cramped, and a setting keeps the phone layout.

## Pinned versions

| Component | Version | Source |
| --- | --- | --- |
| Discord iOS | 350.0, 2026-10-19 | App Store, Unbound feed |
| Unbound client | 0.9.0, 2026-10-23 | `marioparaschiv/unbound` releases |
| `@unbound-app/api` types | 0.9.0 | npm |
| Native plugin ABI | 1.0.0, `native.objc.classes` and `native.objc.invoke` only | loader source |
| Unbound IPA | Discord 350.0 (115636), SDK 26.5, Xcode 26.5, ElleKit 1.1.3 | `unbound-app/loader-ios` Actions run 40094890283, `feat/monorepo` at `edfd5a6`, artifact `ipa` (development build). Feed links return 404 today |
| Build tools | Node 24, TypeScript 5.9.3, rollup 4.65.0, SWC 1.16.20, Python 3.11 | `package.json` |

Both plugins declare only the two base native capabilities. If a manifest names a capability the installed loader lacks, Unbound rejects the whole plugin.

## Layout

- `plugins/probe` is Duo Probe. It is read-only. It logs window, screen, safe areas, size classes, fold regions, keyboard frames and Discord's own column decision on every change, plus an allow-list of Info.plist build keys. It reads no messages, accounts or tokens.
- `plugins/layout` is Duo Layout. It keeps Discord's own screens and adds five switchable parts. Fold continuity keeps a conversation open when you fold mid-conversation. The status bar band puts the server list and chat headers on the status bar's row in portrait, carries the chat's surface into the side band in landscape, and lets chats run under the side band on the outer display. Floating navigation replaces the YouBar with a pill centred under the status icons: just below them on the inner display, at the foot of the band on the outer display, and out of the way inside chats there. On the Duo, Discord's iPhone portrait lock is released, as Discord already does on iPad, so unfolding follows the way the phone is held. The book split ends the channel list at the fold. Tabletop calls keep video above the fold. Each part checks Discord's module shapes and stays at stock behavior if they change.
- `src/shared` holds the column policy (`columns.ts`) and the posture model (`posture.ts`), both unit tested, plus the geometry store and the UIKit reader.
- `docs/discord-internals.md` lists every Discord module and UIKit fact Duo Layout depends on, and what was measured on the device.
- `tools/ipa/duo_ipa.py` inspects an IPA and rewrites the SDK stamp. It never modifies its input.
- `tools/device.mjs` is a Bun-free stand-in for `ub-debugger`. It streams device logs, runs JavaScript on the phone and hot-pushes plugins.
- `tools/serve.mjs` serves one folder on the LAN so the phone can download an IPA in Safari.
- `tools/smoke.mjs` runs the built bundles against stand-ins shaped like the measured device bridge, checking each feature's wiring, lifecycle and cleanup. It is not a device result.
- `tools/probes/` holds one-shot device readings for `npm run device -- eval --file`. `window.js` reads the window and regions, `clip.js` finds native views that clip the chat, `nav-state.js` prints the route tree with IDs shortened, and `drawer.js` prints the chat layout and the main stack's routes without IDs. `orientation-lock.js` compares Discord's orientation lock with what UIKit allows. `discover.js`, `fold.js`, `internals.js`, `layout-state.js` and `orientation.js` cover module paths, fold signals and rotation.
- `measurements/` keeps the device readings each design decision rests on.

## Build on Windows

```bash
npm install
```

```bash
npm run check
```

`check` typechecks, runs the unit tests (policy and IPA tool), builds `dist/probe` and `dist/layout`, and runs the smoke checks.

## Install on the Duo

This route uses SideStore with LocalDevVPN on the phone, so the PC only serves files. SideStore re-signs the IPA on the phone and injects nothing, so the ElleKit runtime packaged in the IPA stays as built. With a free Apple ID, SideStore allows 3 active apps (SideStore included) and 10 new App IDs per week ([SideStore FAQ](https://docs.sidestore.io/docs/faq)). Discord brings 5 app extensions.

1. Inspect the exact IPA. Keep this file unchanged, because reinstalling it is the rollback.

   ```bash
   python -I tools/ipa/duo_ipa.py inspect downloads/unbound-original/Unbound.ipa
   ```

2. On the PC, serve the IPA and start the debugger bridge, each in its own terminal.

   ```bash
   npm run serve -- downloads/unbound-original
   ```

   ```bash
   npm run device -- bridge
   ```

3. On the phone, connect LocalDevVPN. In Safari, open the address the serve command printed, tap `Unbound.ipa`, and download it. In SideStore, open My Apps, tap +, and pick `Unbound.ipa` from Downloads.

4. Open Discord, sign in, and check that Settings now starts with an Unbound section.

5. In Unbound General, turn on Developer Mode. On the Developer screen, enable the debugger and set its address to the `<pc-ip>:9090` the bridge printed. Restart Discord from Unbound General. If iOS asks for Local Network access, allow it, because the debugger needs it.

6. Install the plugins over the debugger connection. Unbound's ATS settings block plain-HTTP manifest installs, but a debugger push installs and persists a plugin that is not installed yet.

   ```bash
   npm run device -- push probe
   ```

   Turn Duo Probe on in Unbound Plugins. Push `layout` the same way, but leave Duo Layout off until the window is measured. Confirm the module paths Duo Layout patches:

   ```bash
   npm run device -- eval --file tools/probes/discover.js
   ```

7. If the probe shows a phone-sized window, stamp a separate copy and install it over the original. SideStore treats the same bundle ID as an update and keeps your data.

   ```bash
   python -I tools/ipa/duo_ipa.py stamp downloads/unbound-original/Unbound.ipa --sdk 27.1 -o downloads/unbound-stamped/Unbound-sdk27.1.ipa
   ```

   ```bash
   npm run serve -- downloads/unbound-stamped
   ```

## Device protocol

Record the probe's `[DuoProbe]` lines, or use Copy report in its settings, for each state below. Then repeat with Duo Layout on.

| State | What passes |
| --- | --- |
| Closed | `isChatBesideChannelList` false, phone navigation |
| Open, wide and tall | `native.window` equals `native.screen`, size classes regular, chat beside channel list |
| Partially open (book, laptop) | A `division` region reported active, no layout jump |
| Fold and unfold in a channel with a draft | Same channel, draft text kept, scroll position kept, keyboard focus sensible |
| Keyboard up while open | Composer stays attached to the keyboard, nothing jumps between columns |
| Larger Dynamic Type, then VoiceOver, then Reduce Motion | Duo Layout logs `XLARGE -> LARGE` at large text, focus order follows the columns |
| Voice or video call, fold during the call | Call continues, controls stay reachable |
| Duo Layout off, then on | Stock decision returns at once, then the plugin's decision returns, with no crash or remount |

## Rollback

- Turn off Duo Layout. Its patches come off at once. It then re-renders Discord's dimension readers with unchanged values, so the stock layout returns without a restart. That re-render depends on finding Discord's iOS dimensions store, whose path is not verified yet. If the plugin logs `Dimensions store not found`, the stock layout returns at the next fold or rotation.
- If Discord misbehaves, shake the phone for Unbound's toolbox or turn on Recovery Mode, which stops every addon from loading.
- To undo the SDK stamp, reinstall the original IPA from step 1.

## What needs a Mac

Nothing on this path. Xcode 27.1 on macOS 26.6 is needed only for the iPhone Duo simulator, or to rebuild the Unbound loader, whose build uses Theos, `xcodebuild` and `PlistBuddy`.
