/**
 * PWA utility functions for detecting standalone mode and managing fullscreen behavior
 */

/**
 * Detects if the PWA is running in standalone mode
 * @returns true if running in standalone mode, false otherwise
 */
export function isStandalone(): boolean {
	// Check for iOS Safari standalone mode
	if (window.navigator && 'standalone' in window.navigator) {
		return (window.navigator as any).standalone;
	}

	// Check for Android Chrome standalone mode
	if (window.matchMedia) {
		return window.matchMedia('(display-mode: standalone)').matches;
	}

	// Fallback: check for standalone parameter in URL
	const urlParams = new URLSearchParams(window.location.search);
	return urlParams.has('standalone');
}

/**
 * Detects if the PWA is running in fullscreen mode
 * @returns true if running in fullscreen mode, false otherwise
 */
export function isFullscreen(): boolean {
	if (window.matchMedia) {
		return window.matchMedia('(display-mode: fullscreen)').matches;
	}
	return false;
}

/**
 * Gets the current display mode of the PWA
 * @returns the display mode as a string
 */
export function getDisplayMode(): 'fullscreen' | 'standalone' | 'minimal-ui' | 'browser' {
	if (isFullscreen()) return 'fullscreen';
	if (isStandalone()) return 'standalone';

	if (window.matchMedia) {
		if (window.matchMedia('(display-mode: minimal-ui)').matches) return 'minimal-ui';
	}

	return 'browser';
}

/**
 * Checks if the device has a notch or safe area insets
 * @returns true if safe area insets are available, false otherwise
 */
export function hasSafeAreaInsets(): boolean {
	// Check if CSS env() function is supported for safe-area-inset-top
	if (typeof window !== 'undefined' && window.CSS && window.CSS.supports) {
		return window.CSS.supports('padding-top', 'env(safe-area-inset-top)');
	}

	// Fallback: assume iOS devices with notch have safe area insets
	const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
	const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;

	if (isIOS) {
		// Check for iPhone X and newer models based on screen dimensions
		const { screen } = window;
		const ratio = screen.width / screen.height;
		return ratio < 0.5 || ratio > 2; // Likely has notch if aspect ratio is extreme
	}

	return false;
}

/**
 * Creates a media query listener for display mode changes
 * @param callback Function to call when display mode changes
 * @returns cleanup function to remove the listener
 */
export function watchDisplayMode(callback: (mode: string) => void): () => void {
	if (!window.matchMedia) {
		return () => {}; // No-op if matchMedia is not supported
	}

	const modes = ['fullscreen', 'standalone', 'minimal-ui', 'browser'];
	const mediaQueries = modes.map(mode => ({
		mode,
		query: window.matchMedia(`(display-mode: ${mode})`)
	}));

	const handleChange = () => {
		const currentMode = getDisplayMode();
		callback(currentMode);
	};

	// Add listeners
	mediaQueries.forEach(({ query }) => {
		query.addEventListener('change', handleChange);
	});

	// Return cleanup function
	return () => {
		mediaQueries.forEach(({ query }) => {
			query.removeEventListener('change', handleChange);
		});
	};
}

/**
 * Gets safe area inset values in pixels
 * @returns object with top, right, bottom, left inset values
 */
export function getSafeAreaInsets(): { top: number; right: number; bottom: number; left: number } {
	const defaultInsets = { top: 0, right: 0, bottom: 0, left: 0 };

	if (typeof window === 'undefined' || !window.getComputedStyle) {
		return defaultInsets;
	}

	// Create a temporary element to measure safe area insets
	const testElement = document.createElement('div');
	testElement.style.position = 'fixed';
	testElement.style.top = '0';
	testElement.style.left = '0';
	testElement.style.width = '1px';
	testElement.style.height = '1px';
	testElement.style.visibility = 'hidden';
	testElement.style.paddingTop = 'env(safe-area-inset-top)';
	testElement.style.paddingRight = 'env(safe-area-inset-right)';
	testElement.style.paddingBottom = 'env(safe-area-inset-bottom)';
	testElement.style.paddingLeft = 'env(safe-area-inset-left)';

	document.body.appendChild(testElement);

	const computedStyle = window.getComputedStyle(testElement);
	const insets = {
		top: parseInt(computedStyle.paddingTop, 10) || 0,
		right: parseInt(computedStyle.paddingRight, 10) || 0,
		bottom: parseInt(computedStyle.paddingBottom, 10) || 0,
		left: parseInt(computedStyle.paddingLeft, 10) || 0
	};

	document.body.removeChild(testElement);

	return insets;
}

/**
 * Utility to set up proper viewport handling for PWA
 * Should be called on app initialization
 */
export function setupPWAViewport(): void {
	if (typeof window === 'undefined') return;

	// Set up viewport height handling for mobile browsers
	const setViewportHeight = () => {
		const vh = window.innerHeight * 0.01;
		const vw = window.innerWidth * 0.01;
		document.documentElement.style.setProperty('--vh', `${vh}px`);
		document.documentElement.style.setProperty('--vw', `${vw}px`);
		document.documentElement.style.setProperty('--vc', `${vh}px`);
	};

	// Set initial values
	setViewportHeight();

	// Update on resize and orientation change
	window.addEventListener('resize', setViewportHeight);
	window.addEventListener('orientationchange', () => {
		setTimeout(setViewportHeight, 100); // Small delay for orientation change
	});
}

/**
 * Checks if the current context supports PWA installation
 * @returns true if PWA can be installed, false otherwise
 */
export function canInstallPWA(): boolean {
	if (typeof window === 'undefined') return false;

	// Check for beforeinstallprompt event support
	return 'onbeforeinstallprompt' in window;
}

/**
 * PWA installation prompt handler
 * @returns Promise that resolves with installation result
 */
export function promptPWAInstall(): Promise<{ outcome: 'accepted' | 'dismissed' }> {
	return new Promise((resolve) => {
		if (typeof window === 'undefined') {
			resolve({ outcome: 'dismissed' });
			return;
		}

		// Listen for the beforeinstallprompt event
		window.addEventListener('beforeinstallprompt', (e) => {
			e.preventDefault();

			// Show the install prompt
			(e as any).prompt();

			// Wait for the user to respond
			(e as any).userChoice.then((choiceResult: any) => {
				resolve({ outcome: choiceResult.outcome });
			});
		});
	});
}
