// Why won't the app rotate? Reads UIKit's orientation masks and Discord's orientation modules.
// Run: npm run device -- eval --file tools/probes/orientation.js
(function () {
	var objc = window.unbound.plugins.getEntity('duo.probe').context.native.objc;
	function ui(t, s, a) { return objc.invoke(t, s, a || [], { thread: 'main' }); }
	var app = ui(objc.getClass('UIApplication'), 'sharedApplication');
	var scene = ui(ui(app, 'connectedScenes'), 'allObjects')[0];
	var win = ui(scene, 'keyWindow');
	var root = ui(win, 'rootViewController');
	var presented = ui(root, 'presentedViewController');
	var nm = window.ReactNative.NativeModules || {};
	var orientationModules = Object.keys(nm).filter(function (k) { return /orient|rotation|landscape/i.test(k); });
	return JSON.stringify({
		rootVC: objc.className(root),
		presentedVC: presented ? objc.className(presented) : null,
		rootSupported: ui(root, 'supportedInterfaceOrientations'),
		presentedSupported: presented ? ui(presented, 'supportedInterfaceOrientations') : null,
		appSupportedForWindow: ui(app, 'supportedInterfaceOrientationsForWindow:', [win]),
		sceneOrientation: ui(ui(scene, 'effectiveGeometry'), 'interfaceOrientation'),
		requestedGeometryPrefs: objc.respondsTo(root, 'prefersInterfaceOrientationLocked') ? ui(root, 'prefersInterfaceOrientationLocked') : 'n/a',
		windows: ui(scene, 'windows').map(function (w) { var r = ui(w, 'rootViewController'); return objc.className(w) + ':' + (r ? objc.className(r) + ' mask ' + ui(r, 'supportedInterfaceOrientations') : 'none'); }),
		orientationModules: orientationModules,
		window: window.ReactNative.Dimensions.get('window'),
	}, null, 1);
})()
