// Discord's orientation lock against what UIKit actually allows and shows.
// Run: npm run device -- eval --file tools/probes/orientation-lock.js
(function () {
	var probe = window.unbound.plugins.getEntity('duo.probe');
	var objc = probe.context.native.objc;
	var metro = window.unbound.metro;
	function ui(t, s, a) { return objc.invoke(t, s, a || [], { thread: 'main' }); }
	function list(v) { return Array.isArray(v) ? v : objc.array(v); }
	var lock = metro.find(metro.filters.byFilePath('modules/device/native/DeviceOrientation.tsx'), { interop: false, initialize: false });
	var app = ui(objc.getClass('UIApplication'), 'sharedApplication');
	var scenes = list(ui(ui(app, 'connectedScenes'), 'allObjects'));
	var scene = null, w = null;
	for (var i = 0; i < scenes.length && !w; i++) if (objc.respondsTo(scenes[i], 'keyWindow')) { scene = scenes[i]; w = ui(scenes[i], 'keyWindow'); }
	var root = w && ui(w, 'rootViewController');
	var b = w && ui(w, 'bounds');
	return JSON.stringify({
		discordLock: lock && lock.getOrientationLock ? lock.getOrientationLock() : 'module not loaded',
		discordOrientation: lock && lock.getOrientation ? lock.getOrientation() : null,
		// UIInterfaceOrientationMask: 2 portrait, 8 landscape left, 16 landscape right, 26 all but upside down, 30 all.
		allowedForWindow: w ? ui(app, 'supportedInterfaceOrientationsForWindow:', [w]) : null,
		rootAllows: root ? ui(root, 'supportedInterfaceOrientations') : null,
		rootClass: root ? String(ui(ui(root, 'class'), 'description')) : null,
		// UIInterfaceOrientation: 1 portrait, 3 landscape right, 4 landscape left.
		interfaceOrientation: scene && objc.respondsTo(scene, 'effectiveGeometry') ? ui(ui(scene, 'effectiveGeometry'), 'interfaceOrientation') : null,
		// UIDeviceOrientation: 1 portrait, 3 landscape left, 4 landscape right, 5 face up.
		deviceOrientation: ui(ui(objc.getClass('UIDevice'), 'currentDevice'), 'orientation'),
		window: b && b.value && b.value.size,
	});
})()
