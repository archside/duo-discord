// Whether the chat is peeking beside the channel list or expanded, as Discord's own
// useDrawerOpen reads it: the active guilds route's drawerOpen param. Prints no IDs.
// Run: npm run device -- eval --file tools/probes/drawer.js
(function () {
	var metro = window.unbound.metro;
	function find(path) {
		return metro.find(metro.filters.byFilePath(path), { interop: false, initialize: false });
	}
	var ref = find('modules/main_tabs_v2/RootNavigationRef.native.tsx');
	var layout = find('modules/chat/native/useChatLayout.tsx');
	var nav = ref && ref.getRootNavigationRef && ref.getRootNavigationRef();
	function active(route) {
		var s = route && route.state;
		return s ? s.routes[s.index == null ? s.routes.length - 1 : s.index] : undefined;
	}
	var root = nav && nav.getRootState && nav.getRootState();
	var top = root && root.routes[root.index == null ? root.routes.length - 1 : root.index];
	var main = top && top.name === 'main' ? active(top) : undefined;
	var tab = main && main.name === 'tabs' ? active(main) : undefined;
	var params = (tab && tab.params) || {};
	return JSON.stringify({
		window: window.ReactNative.Dimensions.get('window'),
		chat: layout && layout.getChatLayout ? layout.getChatLayout() : null,
		mainRoute: main && main.name,
		mainRoutes: top && top.state ? top.state.routes.map(function (r) { return r.name; }) : null,
		tabRoutes: main && main.state ? main.state.routes.map(function (r) { return r.name; }) : null,
		tab: tab && tab.name,
		drawerOpen: params.drawerOpen,
		paramKeys: Object.keys(params),
	});
})()
