import type { CapacitorConfig } from '@capacitor/cli';

import { KeyboardResize, KeyboardStyle } from '@capacitor/keyboard';

const config: CapacitorConfig = {
	appId: 'app.nutscash.wallet',
	appName: 'nuts.cash',
	webDir: 'build',
	ios: {
		// contentInset: 'always'
	},
	plugins: {
		Keyboard: {
			resize: KeyboardResize.None
		},
		PhotoViewer: {
			iosImageLocation: 'Library/Images',
			androidImageLocation: 'Files/Images'
		}
	}
};

export default config;
