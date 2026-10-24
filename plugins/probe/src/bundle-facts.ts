import type { NativeHandle, NativePluginBridge } from '@unbound-app/api/native';

// Only build metadata that decides iPhone Duo window behavior. No account, message
// or token data is read: the keys are an allow-list, not a dump of Info.plist.
const keys = [
	'CFBundleShortVersionString',
	'CFBundleVersion',
	'DTSDKName',
	'DTPlatformVersion',
	'DTXcode',
	'DTXcodeBuild',
	'MinimumOSVersion',
	'UIDeviceFamily',
	'UIRequiresFullScreen',
	'UISupportedInterfaceOrientations',
	'UIApplicationSceneManifest',
	'UILaunchStoryboardName',
] as const;

export type BundleFacts = {
	info: Partial<Record<(typeof keys)[number], string>>;
	osVersion?: string;
};

export async function readBundleFacts(native: NativePluginBridge): Promise<BundleFacts> {
	const { objc } = native;
	const main = (target: NativeHandle, selector: string, ...args: unknown[]) => objc.invoke(target, selector, args, { thread: 'main' });
	const bundle = main(objc.getClass('NSBundle')!, 'mainBundle') as NativeHandle;
	// The bridge returns infoDictionary as a plain object (measured on device).
	const dictionary = main(bundle, 'infoDictionary') as Record<string, unknown> | null;

	const info: BundleFacts['info'] = {};
	for (const key of keys) {
		const value = dictionary?.[key];
		if (value === null || value === undefined) continue;
		info[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
	}

	const device = main(objc.getClass('UIDevice')!, 'currentDevice') as NativeHandle;
	return { info, osVersion: String(main(device, 'systemVersion')) };
}
