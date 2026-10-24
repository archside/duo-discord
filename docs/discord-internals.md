# Discord internals Duo Layout depends on

Discord iOS 350.0, checked against the datamined source (Wumpus-Central/discord-mobile-datamining, 350.0 and 352.7) and, where marked, on the device. Paths are the strings Discord registers with `fileFinishedImporting`, which `metro.findByFilePath` matches. Most components export `react.memo(fn)`, so patch `default.type`, not `default`.

## Columns

- `modules/screen/native/useWindowSizeClassifier.tsx` exports `default` (hook) and `getWindowSizeClassifier`. Thresholds 360, 600, 840 on the base width. Device-checked.
- `modules/screen/native/useBaseAppContainerDimensions.tsx`: window width minus left and right safe-area insets. Device-checked.
- `modules/chat/native/useChatLayout.tsx`: `isChatBesideChannelList` (LARGE+) and `isChatLockedOpen` (XLARGE).
- `modules/screen/native/drawer/useDrawerWidth.tsx`: `DRAWER_LEFT_WIDTH_MIN` 332 when tiled, otherwise `min(372, width - 32)`. Device-checked.
- `modules/screen/native/DimensionsStore.ios.tsx` and `modules/safe_area/SafeAreaStore.native.tsx`: stores keyed by app entry (`main`, `share`). Device-checked. The safe-area store updates after the dimensions store on rotation, so one render sees a stale inset (not visible on screen in testing).

## Safe-area band

- `modules/main_tabs_v2/native/MainTabs.tsx` applies `marginLeft/marginRight` from the insets; the themed gradient is absolute inside that box, so the band shows whatever is behind it.
- `panels/MainTabsNavigatorPanel.tsx` sets `BACKGROUND_BASE_LOWEST` when no custom theme is active.

## Channel header

- `modules/main_tabs_v2/native/channel/StandaloneChannelScreen.tsx` renders its header through `Header`, a component private to the module. Device-checked: the screen's render output is `NavTTISurfaceProvider` holding `Header` and the `chat_container` `NavTTIView`, so the header's style never appears in the screen's own output.
- `Header`'s props are `channelId`, `screenIndex`, `guildId`, `isNavigationScreen`, `frame`, `showCreateThread`, `isBackEnabled` and `measureNavigationTTI`. Duo Layout recognizes it by `showCreateThread` plus `measureNavigationTTI`.
- `Header` reads the safe-area top itself. Its root style ends with `{paddingTop: top, minHeight: top + MIN_HEADER_HEIGHT}`, or `{marginTop: top, minHeight: MIN_HEADER_HEIGHT}` when `frame` is set (chat beside the channel list). `MIN_HEADER_HEIGHT` is 56 (`shared_components/MainTabsV2Constants.tsx`).
- Header and conversation share `STANDALONE_CHANNEL_CONTENT_BACKGROUND`. The header's bottom divider is a 1 pt `STANDALONE_CHANNEL_HEADER_BORDER` line. With `frame` set, the header also carries a top border (`splitDividerTop`).
- `frame` is `panels/ChannelScreenAnimatedFrame.tsx`: an absolute `BACKGROUND_BASE_LOW` bar sized by `SafeAreaPaddingView top`. It fades in when the chat expands (`translateX !== maxWidth` and not locked open), so the status area gets a background. Duo Layout's lifted header paints from the top edge itself, so it cuts the bar to zero height and drops the top border.

## Peeking and expanded chat (device-checked, portrait 669 pt)

- At `LARGE` without `isChatLockedOpen`, the chat is a full-width panel pushed aside by the drawer width. Peeking, the chat view sits at x 373, 668 pt wide, cut off at the right edge, with its header actions off screen. This is stock Discord.
- Expanding pushes a `channel` route on `main` (routes `tabs, channel`, chat view at x 1). Peeking, `main` holds only `tabs`. Discord switches the route after its slide finishes, so anything keyed to it changes late. Duo Layout's header therefore keeps the status row in both states.
- The guilds route's `drawerOpen` param belongs to the home drawer experiment (`home_drawer/native/useDrawerState.tsx`). It reads `false` while the chat peeks.

## Chat clipping (device-checked, landscape)

- The chat sits inside a native stack container (`UILayoutContainerView`, x 0 to 867) with `clipsToBounds` on, sized by MainTabs' right margin. `DCDChatComponentView` also clips. Nothing rendered inside the chat can draw into the 84 pt side band.
- Duo Layout therefore paints the band from MainTabs' root, outside that container, using the header's measured window frame. Measured with 0.3.7: a chat-surface view at x 867, y 21, 84 by 648, and the divider at y 75 in the header border colour. The first render can precede the header's measurement, so the band repaints when the frame arrives.
- Root navigation state reads `main > tabs > guilds` with the chat pinned beside the list.

## Folded layout (device-checked, outer display)

- The outer display is 466 by 678 with an 84 pt trailing band. Its reserved regions are the status block (382, 0, 84 by 174) and the front camera (399.7, 29.3, 37 by 37). The camera's centre is the status column's centre, 6 pt inside the band's centre; the inner display's landscape band shows the same 6 pt offset. `statusBarManager.statusBarFrame` reports a 466 by 2 strip and is no use here.
- `MainTabs.tsx`'s root applies `marginLeft/marginRight` from the insets. Inside it, `panels/MainTabsNavigatorPanel.tsx` renders the tabs navigator (`you_bar/YouBarStackNavigator.tsx`, a memo rendered without props) and, beside it, the chat panels for `channel` routes. An open chat is a pushed `channel` route on `main`.
- To let chats fill the band, Duo Layout moves the trailing margin from `MainTabs` onto the tabs navigator. The server list, notifications and messages keep their inset, so their headers stay clear of the status column and the pill.
- The server rail is `GuildsBar` (`guilds_bar/native/GuildsBar.tsx`), rendered by `tabs/guilds/HomePanelContent.tsx` inside `components_native/MainChannels.tsx`, which offsets the channel list by `DM_WIDTH` (72, `ConstantsIOS.tsx`). Rendering `GuildsBar` anywhere else crashed Discord natively on every folded launch (0.4.1), so the rail stays where Discord puts it.
- With Discord's portrait lock released, the outer display rotates: held sideways it is 678 by 466 with the band on the leading edge (safe-area left 84).

## Orientation lock

- `device/native/DeviceOrientation.tsx` locks iPhones to portrait at startup (`lockOrientationForiOS`, skipped on iPadOS) and re-applies the lock on every app activation while `orientationLock` is set. `restoreDefaultOrientation` re-locks through a module-internal call.
- On the Duo, UIKit's allowed orientations still read "all" (mask 30) while the lock is set, yet whole sessions unfolded into portrait however the phone was held (measured: three portrait unfolds in one session, all landscape in the next). Releasing the lock with Discord's `unlockOrientation` stopped it.

## YouBar (Discord's bottom navigation)

- `modules/main_tabs_v2/native/you_bar/YouBar.tsx`, rendered by `tabs/guilds/Guilds.tsx` at the bottom of the channel-list panel. Height `YOU_BAR_HEIGHT` 56 plus margins (`you_bar/YouBarConstants.tsx`, `hooks/useYouBarTotalHeight.tsx`).
- Navigation the bar uses: `RootNavigationRef.getRootNavigationRef().navigate('you')`, `navigate('notifications', { inNestedNavigator: true })`, `navigate('icymi', { screen: 'icymi-screen', params: { inNestedNavigator: true } })`, `routing/transitionToGuild.native.tsx` (`transitionToGuild(ME)` for DMs).

## Compact navigation

- `panels/MainTabsNavigatorPanel.tsx` converts routes only when `isChatLockedOpen` changes (`panels/PanelsNavigationUtils.tsx`: `convertPortraitToLandscapeScreens`, `convertLandscapeToPortraitScreens`).
- `panels/useChannelScreensFromNavigation.tsx`: a chat panel shows only for a `channel` route (`ChannelScreenType.DEFAULT`); otherwise the last channel is kept hidden (`BACKGROUND_SAVED`).
- `main_tabs_v2/native/navigateToLastChannel.tsx` opens the guild route's last channel; `routing/transitionToChannel.tsx` opens a given one.

## Calls

- `voice_panel/native/VoicePanelUI.tsx` is the full-screen call UI; `card/VoicePanelCardLayoutManager.tsx` (`prototype.updateState`) sizes the video grid from `windowHeight`; `controls/VoicePanelControls.tsx` and `controls/VoicePanelChatView.tsx` hold the controls and call chat.
- Several sizing helpers are Reanimated worklets; patch the JS-thread entry points instead.

## UIKit on iPhone Duo (device-checked, iOS 27.1)

- Structs come back with fields on a hidden `value`; NSArray and NSDictionary come back as plain JS values.
- `UIViewReservedRegion`'s flag getter is `isActive`.
- `UITraitCollection.verticalBarEdge` is public and gives the system's preferred vertical-bar edge.
- No window, root-view or trait callback fires when the device folds without resizing (UIWindow layoutSubviews, safeAreaInsetsDidChange, traitCollectionDidChange:, the root view's layoutSubviews and viewWillLayoutSubviews were all hooked and folded against).
- `UIHingeInteraction` crashes the app when created without its handler block, and the bridge cannot make blocks. Duo Layout therefore re-reads the fold on resize, foreground and the first touch after a quiet second.
- The installed Unbound client exposes `invoke` but not `invokeAsync` or `batch` to plugins.
- Active occlusions: portrait inner display x 525, y 0, 144 by 82 (status bar, top trailing corner). Landscape inner display x 867, y 0, 84 by 124 (status bar, top of the side band).
