import { writable, type Writable } from 'svelte/store';
import type { ParsedEvent } from '@candypoets/nipworker';
import { extractTagValue } from '@candypoets/nipworker';

/**
 * Ditto/Soapbox Theme Event Kinds
 *
 * Kind 36767: ThemeDefinition - Addressable event for shareable, named themes
 * Kind 16767: ActiveProfileTheme - Replaceable event for user's currently active theme
 */
export const THEME_DEFINITION_KIND = 36767;
export const ACTIVE_THEME_KIND = 16767;

export interface ThemeProperties {
	[key: string]: string;
	'--primary'?: string;
	'--primary-content'?: string;
	'--secondary'?: string;
	'--secondary-content'?: string;
	'--base-100'?: string;
	'--base-200'?: string;
	'--base-300'?: string;
	'--accent'?: string;
	'--neutral'?: string;
	'--info'?: string;
	'--success'?: string;
	'--warning'?: string;
	'--error'?: string;
	'--highlight'?: string;
	'--shadow-outer-color'?: string;
	'--shadow-inset-highlight'?: string;
	'--shadow-inset-subtle'?: string;
	'--font-family'?: string;
	'--bg-image'?: string;
}

export interface DittoTheme {
	id: string;
	dTag: string;
	name: string;
	description?: string;
	author: string;
	createdAt: number;
	properties: ThemeProperties;
	isDefault?: boolean;
}

// Built-in themes (constant - never changes)
export const builtInThemes: DittoTheme[] = [
	{
		id: 'built-in-touchgrass',
		dTag: 'touchgrass',
		name: 'Touch Grass',
		description: 'Light theme with green accents',
		author: 'system',
		createdAt: 0,
		isDefault: true,
		properties: {
			'--primary': '#158777',
			'--primary-content': '#010806',
			'--secondary': '#D926AA',
			'--secondary-content': '#160010',
			'--base-100': '#f9fafb',
			'--base-200': '#f2f2f3',
			'--base-300': '#f8fdfd',
			'--base-content': '#161617',
			'--accent': '#6d28d9',
			'--neutral': '#2a323c',
			'--info': '#00b5ff',
			'--success': '#00a96e',
			'--warning': '#ffbe00',
			'--error': '#ff5861',
			'--highlight': '#ffffff',
			'--shadow-outer-color': 'rgba(0, 0, 0, 0.15)',
			'--shadow-inset-highlight': 'rgba(255, 255, 255, 0.3)',
			'--shadow-inset-subtle': 'rgba(255, 255, 255, 0.08)',
			'--bg-image': "url('/touchgrass.jpg')"
		}
	},
	{
		id: 'built-in-nightsky',
		dTag: 'nightsky',
		name: 'Night Sky',
		description: 'Dark theme with teal accents',
		author: 'system',
		createdAt: 0,
		isDefault: true,
		properties: {
			'--primary': '#0b5f52',
			'--primary-content': '#f4fffc',
			'--secondary': '#b41488',
			'--secondary-content': '#fff0fa',
			'--base-100': '#131716',
			'--base-200': '#1a1a1a',
			'--base-300': '#1f2937',
			'--base-content': '#f4f4f5',
			'--accent': '#c19bfd',
			'--neutral': '#2a323c',
			'--info': '#00b5ff',
			'--success': '#00a96e',
			'--warning': '#ffbe00',
			'--error': '#ff5861',
			'--highlight': '#000000',
			'--shadow-outer-color': 'rgba(0, 0, 0, 0.5)',
			'--shadow-inset-highlight': 'rgba(255, 255, 255, 0.1)',
			'--shadow-inset-subtle': 'rgba(255, 255, 255, 0.02)',
			'--bg-image': "url('/nightsky.jpg')"
		}
	},
	{
		id: 'built-in-matteblack',
		dTag: 'matteblack',
		name: 'Matte Black',
		description: 'Dark, muted, low-contrast theme',
		author: 'system',
		createdAt: 0,
		isDefault: true,
		properties: {
			'--primary': '#0b5f52',
			'--primary-content': '#f4fffc',
			'--secondary': '#333333',
			'--secondary-content': '#eeeeee',
			'--base-100': '#333333',
			'--base-200': '#1a1a1a',
			'--base-300': '#262626',
			'--base-content': '#f2f2f2',
			'--accent': '#a855f7',
			'--neutral': '#1a1a1a',
			'--info': '#4d4d4d',
			'--success': '#006600',
			'--warning': '#cc6600',
			'--error': '#990000',
			'--highlight': '#333333',
			'--shadow-outer-color': 'rgba(0, 0, 0, 0.6)',
			'--shadow-inset-highlight': 'rgba(255, 255, 255, 0.05)',
			'--shadow-inset-subtle': 'rgba(255, 255, 255, 0.01)',
			'--bg-image': 'none'
		}
	},
	{
		id: 'built-in-snowwhite',
		dTag: 'snowwhite',
		name: 'Snow White',
		description: 'Light, clean theme with cool tones',
		author: 'system',
		createdAt: 0,
		isDefault: true,
		properties: {
			'--primary': '#158777',
			'--primary-content': '#010806',
			'--secondary': '#d4d4d4',
			'--secondary-content': '#343434',
			'--base-100': '#e8e8e8',
			'--base-200': '#f8f8f8',
			'--base-300': '#ffffff',
			'--base-content': '#1f1f20',
			'--accent': '#3366ff',
			'--neutral': '#f0f0f0',
			'--info': '#99ddff',
			'--success': '#aaffaa',
			'--warning': '#ffdd99',
			'--error': '#ff9999',
			'--highlight': '#d4d4d4',
			'--shadow-outer-color': 'rgba(0, 0, 0, 0.1)',
			'--shadow-inset-highlight': 'rgba(255, 255, 255, 0.4)',
			'--shadow-inset-subtle': 'rgba(255, 255, 255, 0.1)',
			'--bg-image': 'none'
		}
	},
	{
		id: 'built-in-downfox',
		dTag: 'downfox',
		name: 'Down Fox',
		description: 'Dark theme with Bitcoin orange accent',
		author: 'system',
		createdAt: 0,
		isDefault: true,
		properties: {
			'--primary': '#236f8f',
			'--primary-content': '#f5fbff',
			'--secondary': '#282828',
			'--secondary-content': '#f2f2f2',
			'--base-100': '#00213f',
			'--base-200': '#161616',
			'--base-300': '#344159',
			'--base-content': '#eff2f7',
			'--accent': '#f7931a',
			'--neutral': '#141414',
			'--info': '#336699',
			'--success': '#004d00',
			'--warning': '#996600',
			'--error': '#660000',
			'--highlight': '#282828',
			'--shadow-outer-color': 'rgba(0, 0, 0, 0.65)',
			'--shadow-inset-highlight': 'rgba(255, 255, 255, 0.06)',
			'--shadow-inset-subtle': 'rgba(255, 255, 255, 0.012)',
			'--bg-image': "url('/downfox.jpg')"
		}
	},
	{
		id: 'built-in-sunset',
		dTag: 'sunset',
		name: 'Sunset Beach',
		description: 'Warm tropical colors inspired by beach sunsets',
		author: 'system',
		createdAt: 0,
		isDefault: true,
		properties: {
			'--primary': '#e2553d',
			'--primary-content': '#1c0803',
			'--secondary': '#ffb347',
			'--secondary-content': '#3a2200',
			'--base-100': '#f4e4bc',
			'--base-200': '#e8d5a8',
			'--base-300': '#f7f2f3d9',
			'--base-content': '#241a13',
			'--accent': '#1e90ff',
			'--neutral': '#daa520',
			'--info': '#87ceeb',
			'--success': '#32cd32',
			'--warning': '#ffa500',
			'--error': '#dc143c',
			'--highlight': '#ffe4b5',
			'--shadow-outer-color': 'rgba(255, 69, 0, 0.2)',
			'--shadow-inset-highlight': 'rgba(255, 255, 255, 0.2)',
			'--shadow-inset-subtle': 'rgba(255, 255, 255, 0.05)',
			'--bg-image': "url('/beach.jpg')"
		}
	}
];

// Stores
export const currentTheme: Writable<DittoTheme | null> = writable(null);
export const themesLoading = writable(false);

/**
 * Convert HSL string to hex color
 * HSL format: "270 50% 97%" or "270 50% 97%/alpha"
 */
function hslToHex(hsl: string): string {
	const parts = hsl.split(/[\s/]+/);
	if (parts.length < 3) return hsl;
	
	const h = parseFloat(parts[0]);
	const s = parseFloat(parts[1]) / 100;
	const l = parseFloat(parts[2]) / 100;
	
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs((h / 60) % 2 - 1));
	const m = l - c / 2;
	
	let r = 0, g = 0, b = 0;
	
	if (h < 60) { r = c; g = x; b = 0; }
	else if (h < 120) { r = x; g = c; b = 0; }
	else if (h < 180) { r = 0; g = c; b = x; }
	else if (h < 240) { r = 0; g = x; b = c; }
	else if (h < 300) { r = x; g = 0; b = c; }
	else { r = c; g = 0; b = x; }
	
	const toHex = (n: number) => {
		const hex = Math.round((n + m) * 255).toString(16);
		return hex.length === 1 ? '0' + hex : hex;
	};
	
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Convert a Ditto/Soapbox Kind 36767 ThemeDefinition event to DittoTheme
 */
export function eventToTheme(event: ParsedEvent): DittoTheme | null {
	
	if (event.kind() !== THEME_DEFINITION_KIND) {
		return null;
	}

	const dTag = extractTagValue(event, 'd');
	const title = extractTagValue(event, 'title');
	const description = extractTagValue(event, 'description') || '';
	

	if (!dTag || !title) {
		return null;
	}

	// Log all tags for debugging
	const tagsLength = event.tagsLength();
	for (let i = 0; i < tagsLength; i++) {
		const tagVec = event.tags(i);
		if (!tagVec) continue;
		const tagItems: string[] = [];
		for (let j = 0; j < tagVec.itemsLength(); j++) {
			tagItems.push(tagVec.items(j));
		}
	}

	// Parse color tags (c tags with role: background, text, primary)
	const properties: ThemeProperties = {};
	let bgImage: string | undefined;
	const resolvedColors: { role: string; hsl: string; hex: string }[] = [];

	for (let i = 0; i < tagsLength; i++) {
		const tagVec = event.tags(i);
		if (!tagVec) continue;

		const tagName = tagVec.items(0);
		
		// Color tags: ["c", "<hsl>", "<role>"] - convert HSL to hex
		if (tagName === 'c' && tagVec.itemsLength() >= 3) {
			const colorValue = tagVec.items(1);
			const role = tagVec.items(2);
			const hexColor = hslToHex(colorValue);
			
			// Track resolved colors for summary
			resolvedColors.push({ role, hsl: colorValue, hex: hexColor });

			switch (role) {
				case 'background':
					properties['--base-100'] = hexColor;
					break;
				case 'text':
					properties['--base-content'] = hexColor;
					break;
				case 'primary':
					properties['--primary'] = hexColor;
					break;
			}
		}
		
		// Background tag: ["bg", "url <url>", "mode <mode>", ...]
		if (tagName === 'bg' && tagVec.itemsLength() >= 2) {
			for (let j = 1; j < tagVec.itemsLength(); j++) {
				const item = tagVec.items(j);
				if (item.startsWith('url ')) {
					bgImage = `url('${item.slice(4)}')`;
					break;
				}
			}
		}
	}

	// Show color summary if 3 or more colors resolved
	if (resolvedColors.length >= 3) {
		resolvedColors.forEach(({ role, hsl, hex }) => {
			// Create a colored square in console
		});
	}

	if (!properties['--primary'] || !properties['--base-100']) {
		return null;
	}
	
	if (bgImage) {
		properties['--bg-image'] = bgImage;
	}
	

	// Derive missing colors that Ditto doesn't provide but nuts needs
	const completeProperties = deriveMissingColors(properties);

	return {
		id: event.id() || '',
		dTag,
		name: title,
		description,
		author: event.pubkey() || '',
		createdAt: Number(event.createdAt()) || 0,
		properties: completeProperties
	};
}

/**
 * Derive missing theme colors from the core Ditto colors
 * Ditto only provides: primary, background, text
 * Nuts needs many more: base-200, base-300, secondary, accent, info, success, warning, error, etc.
 * 
 * KEY INSIGHT: Primary and accent should OPPOSE the background tint.
 * If bg is greenish, primary should be reddish/orange. If bg is bluish, 
 * primary should be orange/amber. This creates visual pop and readability.
 */
function deriveMissingColors(props: ThemeProperties): ThemeProperties {
	const base100 = props['--base-100'] || '#ffffff';
	const primary = props['--primary'] || '#158777';
	const primaryContent = props['--primary-content'] || '#000000';
	

	const isDark = isColorDark(base100);

	const result: ThemeProperties = { ...props };

	// === BASE LAYERS (keep existing good logic) ===
	const base200Adjustment = isDark ? 12 : -8;
	const base300Adjustment = isDark ? 20 : -4;
	
	if (!result['--base-200']) {
		result['--base-200'] = adjustBrightness(base100, base200Adjustment);
	}
	if (!result['--base-300']) {
		result['--base-300'] = adjustBrightness(base100, base300Adjustment);
	}

	// === COLOR OPPOSITION LOGIC ===
	// If background has a tint, primary/accent should oppose it for contrast
	const bgHsl = hexToHslObject(base100);
	const primaryHsl = hexToHslObject(primary);
	
	// Detect if bg has a noticeable tint (>8% saturation)
	const bgHasTint = bgHsl.s > 8;
	
	// Check if provided primary is too similar to bg hue (within 60° = analogous)
	// Proper hue distance calculation (handles wrap-around at 360°)
	const hueDiff = primaryHsl.h - bgHsl.h;
	const hueDistance = Math.abs(((hueDiff % 360) + 540) % 360 - 180);
	const primaryTooCloseToBg = hueDistance < 60;
	

	// === PRIMARY: Oppose background if needed ===
	// If bg has a tint and primary is too similar, rotate primary to oppose bg
	let finalPrimary = primary;
	let finalPrimaryHsl = { ...primaryHsl };
	
	if (bgHasTint && primaryTooCloseToBg) {
		// Opposing hue = bg hue + 180°
		// Add ±30° jitter based on bg hue to favor pleasing oppositions
		// (reds oppose greens, blues oppose oranges, etc.)
		let opposingHue = (bgHsl.h + 180 + 30) % 360;
		
		// Avoid red zone (0-30° and 330-360°) - shift toward orange or purple
		opposingHue = avoidRedZone(opposingHue);
		
		finalPrimaryHsl = {
			h: opposingHue,
			s: Math.max(35, Math.min(55, primaryHsl.s * 0.8)), // Reduced saturation (was 60-85)
			l: isDark ? 50 : 48 // Mid-toned, not too bright
		};
		finalPrimary = hslObjectToHex(finalPrimaryHsl);
		result['--primary'] = finalPrimary;
	} else {
		// Even if not rotating, check if primary is in red zone and nudge it
		const safePrimaryHue = avoidRedZone(finalPrimaryHsl.h);
		if (safePrimaryHue !== finalPrimaryHsl.h) {
			finalPrimaryHsl.h = safePrimaryHue;
			finalPrimary = hslObjectToHex(finalPrimaryHsl);
			result['--primary'] = finalPrimary;
		}
	}

	// === PRIMARY CONTENT: Oppose both primary AND text color ===
	if (!result['--primary-content']) {
		// Ditto provides text color as --base-content
		// We need primary-content to contrast with BOTH primary AND text
		const baseContent = props['--base-content'] || '#000000';
		const primaryIsDark = isColorDark(finalPrimary);
		const textIsDark = isColorDark(baseContent);
		
		// Primary-content should oppose text color for visual separation
		// But also needs contrast against primary itself
		if (primaryIsDark && textIsDark) {
			// Both primary and text are dark - use light but distinct from text
			result['--primary-content'] = '#e8e8e8';
		} else if (!primaryIsDark && !textIsDark) {
			// Both primary and text are light - use dark but distinct from text  
			result['--primary-content'] = '#1a1a1a';
		} else {
			// One is dark, one is light - standard contrast
			result['--primary-content'] = primaryIsDark ? '#ffffff' : '#1a1a1a';
		}
	}

	// === SECONDARY: Desaturated neutral ===
	if (!result['--secondary']) {
		// Neutral gray with subtle warmth/coolness from primary hue
		const s = isDark ? 8 : 5;
		const l = isDark ? 30 : 80;
		result['--secondary'] = hslObjectToHex({ h: finalPrimaryHsl.h, s, l });
	}
	if (!result['--secondary-content']) {
		const baseContent = props['--base-content'] || '#000000';
		const textIsDark = isColorDark(baseContent);
		// Secondary-content should oppose text color
		result['--secondary-content'] = textIsDark ? '#c0c0c0' : '#505050';
	}

	// === ACCENT: Split-complementary to primary ===
	// Rotate ±30-60° from primary for a harmonious but distinct pop
	if (!result['--accent']) {
		// Choose direction that maximizes distance from background
		let accentHue1 = (finalPrimaryHsl.h + 30) % 360;
		let accentHue2 = (finalPrimaryHsl.h - 30 + 360) % 360;
		
		// Avoid red zone for both options
		accentHue1 = avoidRedZone(accentHue1);
		accentHue2 = avoidRedZone(accentHue2);
		
		const dist1 = Math.abs((((accentHue1 - bgHsl.h) % 360) + 540) % 360 - 180);
		const dist2 = Math.abs((((accentHue2 - bgHsl.h) % 360) + 540) % 360 - 180);
		
		// Pick the accent that contrasts more with background
		const accentHue = dist1 > dist2 ? accentHue1 : accentHue2;
		const accentSat = Math.max(40, Math.min(60, finalPrimaryHsl.s * 1.1)); // Reduced (was 70+)
		const accentLight = isDark ? 55 : 52;
		
		result['--accent'] = hslObjectToHex({ h: accentHue, s: accentSat, l: accentLight });
		
		// Accent content opposes text color
		const baseContent = props['--base-content'] || '#000000';
		const textIsDark = isColorDark(baseContent);
		const accentIsDark = isColorDark(result['--accent']);
		
		if (accentIsDark && textIsDark) {
			result['--accent-content'] = '#e8e8e8';
		} else if (!accentIsDark && !textIsDark) {
			result['--accent-content'] = '#1a1a1a';
		} else {
			result['--accent-content'] = accentIsDark ? '#ffffff' : '#1a1a1a';
		}
	}

	// === SEMANTIC COLORS: Derived from primary's hue family ===
	if (!result['--info']) {
		// Cyan/blue shift (toward 200°)
		const infoHue = shiftHueToward(finalPrimaryHsl.h, 200, 0.6);
		result['--info'] = hslObjectToHex({ h: infoHue, s: 55, l: isDark ? 55 : 50 });
	}
	if (!result['--success']) {
		// Green shift (toward 145°)
		const successHue = shiftHueToward(finalPrimaryHsl.h, 145, 0.5);
		result['--success'] = hslObjectToHex({ h: successHue, s: 45, l: isDark ? 50 : 45 });
	}
	if (!result['--warning']) {
		// Yellow/orange (toward 45°)
		const warnHue = shiftHueToward(finalPrimaryHsl.h, 45, 0.4);
		result['--warning'] = hslObjectToHex({ h: warnHue, s: 60, l: isDark ? 60 : 55 });
	}
	if (!result['--error']) {
		// Red/magenta (toward 10° or 350°)
		const errHue = shiftHueToward(finalPrimaryHsl.h, 10, 0.5);
		result['--error'] = hslObjectToHex({ h: errHue, s: 50, l: isDark ? 55 : 50 });
	}

	// === NEUTRAL: Near-gray, harmonized hue ===
	if (!result['--neutral']) {
		const l = isDark ? 25 : 88;
		result['--neutral'] = hslObjectToHex({ h: bgHsl.h, s: 6, l });
	}

	// === SHADOWS ===
	if (!result['--shadow-outer-color']) {
		result['--shadow-outer-color'] = isDark 
			? `rgba(0, 0, 0, ${0.4 + (bgHsl.l / 500)})` // Darker shadows on dark tinted bgs
			: 'rgba(0, 0, 0, 0.15)';
	}
	if (!result['--shadow-inset-highlight']) {
		result['--shadow-inset-highlight'] = isDark 
			? 'rgba(255, 255, 255, 0.08)' 
			: 'rgba(255, 255, 255, 0.35)';
	}
	if (!result['--shadow-inset-subtle']) {
		result['--shadow-inset-subtle'] = isDark 
			? 'rgba(255, 255, 255, 0.02)' 
			: 'rgba(255, 255, 255, 0.08)';
	}

	// === HIGHLIGHT: Brighter version of bg ===
	if (!result['--highlight']) {
		result['--highlight'] = isDark 
			? hslObjectToHex({ h: bgHsl.h, s: bgHsl.s * 0.5, l: Math.min(95, bgHsl.l + 35) })
			: hslObjectToHex({ h: bgHsl.h, s: bgHsl.s * 0.3, l: Math.max(95, bgHsl.l + 8) });
	}

	// === FINAL SAFETY GUARD: Ensure no red slips through ===
	if (result['--primary']) {
		const primaryHsl = hexToHslObject(result['--primary']);
		const safeHue = avoidRedZone(primaryHsl.h);
		if (safeHue !== primaryHsl.h) {
			result['--primary'] = hslObjectToHex({ h: safeHue, s: primaryHsl.s, l: primaryHsl.l });
		}
	}
	if (result['--accent']) {
		const accentHsl = hexToHslObject(result['--accent']);
		const safeHue = avoidRedZone(accentHsl.h);
		if (safeHue !== accentHsl.h) {
			result['--accent'] = hslObjectToHex({ h: safeHue, s: accentHsl.s, l: accentHsl.l });
		}
	}

	return result;
}

/**
 * Check if a hex color is dark (brightness < 128)
 */
function isColorDark(hex: string): boolean {
	const rgb = hexToRgb(hex);
	if (!rgb) return false;
	// Formula: (0.299 * R + 0.587 * G + 0.114 * B)
	const brightness = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
	return brightness < 128;
}

/**
 * Convert hex to RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	if (!result) return null;
	return {
		r: parseInt(result[1], 16),
		g: parseInt(result[2], 16),
		b: parseInt(result[3], 16)
	};
}

/**
 * Convert RGB to hex
 */
function rgbToHex(r: number, g: number, b: number): string {
	const toHex = (n: number) => {
		const hex = Math.max(0, Math.min(255, Math.round(n))).toString(16);
		return hex.length === 1 ? '0' + hex : hex;
	};
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Adjust brightness of a hex color by percentage
 * Positive = lighter, Negative = darker
 */
function adjustBrightness(hex: string, percent: number): string {
	const rgb = hexToRgb(hex);
	if (!rgb) return hex;
	
	const amount = percent * 2.55; // Convert percentage to 0-255 scale
	
	return rgbToHex(
		rgb.r + amount,
		rgb.g + amount,
		rgb.b + amount
	);
}
export function applyTheme(theme: DittoTheme | null) {
	if (!theme) return;


	const root = document.documentElement;

	// Apply custom properties
	Object.entries(theme.properties).forEach(([prop, value]) => {
		if (value) {
			root.style.setProperty(prop, value);
		}
	});

	// Set DaisyUI internal OkLCH variables for custom themes (built-ins already have them in CSS)
	
	if (!theme.isDefault) {
		const base100 = theme.properties['--base-100'] || '#f9fafb';
		const isDark = isColorDark(base100);
		const base200 = theme.properties['--base-200'] || base100;
		const base300 = theme.properties['--base-300'] || base100;
		const baseContent = theme.properties['--base-content'] || (isDark ? '#ffffff' : '#1a1a1a');
		
		const primary = theme.properties['--primary'] || '#158777';
		const safePrimary = avoidRedInHex(primary);
		const primaryContentFromProps = theme.properties['--primary-content'];
		const primaryContent = primaryContentFromProps || (() => {
			const textIsDark = isColorDark(baseContent);
			const primaryIsDark = isColorDark(safePrimary);
			if (primaryIsDark && textIsDark) return '#e8e8e8';
			if (!primaryIsDark && !textIsDark) return '#1a1a1a';
			return primaryIsDark ? '#ffffff' : '#1a1a1a';
		})();
		const secondary = theme.properties['--secondary'] || (isDark ? '#444444' : '#cccccc');
		const secondaryContentFromProps = theme.properties['--secondary-content'];
		const secondaryContent = secondaryContentFromProps || (() => {
			const textIsDark = isColorDark(baseContent);
			if (textIsDark) return '#c0c0c0';
			return '#505050';
		})();
		const accent = theme.properties['--accent'] || '#6d28d9';
		const safeAccent = avoidRedInHex(accent);
		const accentContentFromProps = theme.properties['--accent-content'];
		// If not provided, derive it opposing text color
		const accentContent = accentContentFromProps || (() => {
			const textIsDark = isColorDark(baseContent);
			const accentIsDark = isColorDark(safeAccent);
			if (accentIsDark && textIsDark) return '#e8e8e8';
			if (!accentIsDark && !textIsDark) return '#1a1a1a';
			return accentIsDark ? '#ffffff' : '#1a1a1a';
		})();
		const neutral = theme.properties['--neutral'] || (isDark ? '#2a323c' : '#e5e7eb');
		const info = theme.properties['--info'] || '#00b5ff';
		const success = theme.properties['--success'] || '#00a96e';
		const warning = theme.properties['--warning'] || '#ffbe00';
		const error = theme.properties['--error'] || '#ff5861';
		

		// Base colors
		root.style.setProperty('--b1', hexToOkLCH(base100));
		root.style.setProperty('--b2', hexToOkLCH(base200));
		root.style.setProperty('--b3', hexToOkLCH(base300));
		root.style.setProperty('--bc', hexToOkLCH(baseContent));
		
		// Primary
		root.style.setProperty('--p', hexToOkLCH(safePrimary));
		root.style.setProperty('--pc', hexToOkLCH(primaryContent));
		
		// Secondary
		root.style.setProperty('--s', hexToOkLCH(secondary));
		root.style.setProperty('--sc', hexToOkLCH(secondaryContent));
		
		// Accent
		root.style.setProperty('--a', hexToOkLCH(safeAccent));
		root.style.setProperty('--ac', hexToOkLCH(accentContent));
		
		// Neutral
		root.style.setProperty('--n', hexToOkLCH(neutral));
		root.style.setProperty('--nc', hexToOkLCH(isColorDark(neutral) ? '#ffffff' : '#1a1a1a'));
		
		// Semantic colors
		root.style.setProperty('--in', hexToOkLCH(info));
		root.style.setProperty('--inc', hexToOkLCH('#ffffff'));
		root.style.setProperty('--su', hexToOkLCH(success));
		root.style.setProperty('--suc', hexToOkLCH('#ffffff'));
		root.style.setProperty('--wa', hexToOkLCH(warning));
		root.style.setProperty('--wac', hexToOkLCH('#1a1a1a'));
		root.style.setProperty('--er', hexToOkLCH(error));
		root.style.setProperty('--erc', hexToOkLCH('#ffffff'));
	} else {
		// For built-in themes, clear the OkLCH variables to let DaisyUI handle them
		
		// Base colors
		root.style.removeProperty('--b1');
		root.style.removeProperty('--b2');
		root.style.removeProperty('--b3');
		root.style.removeProperty('--bc');
		
		// Primary
		root.style.removeProperty('--p');
		root.style.removeProperty('--pc');
		
		// Secondary
		root.style.removeProperty('--s');
		root.style.removeProperty('--sc');
		
		// Accent
		root.style.removeProperty('--a');
		root.style.removeProperty('--ac');
		
		// Neutral
		root.style.removeProperty('--n');
		root.style.removeProperty('--nc');
		
		// Semantic
		root.style.removeProperty('--in');
		root.style.removeProperty('--inc');
		root.style.removeProperty('--su');
		root.style.removeProperty('--suc');
		root.style.removeProperty('--wa');
		root.style.removeProperty('--wac');
		root.style.removeProperty('--er');
		root.style.removeProperty('--erc');
		
		// Also clear CSS custom properties that might conflict
		root.style.removeProperty('--primary');
		root.style.removeProperty('--primary-content');
		root.style.removeProperty('--secondary');
		root.style.removeProperty('--accent');
		root.style.removeProperty('--base-100');
		root.style.removeProperty('--base-200');
		root.style.removeProperty('--base-300');
		root.style.removeProperty('--base-content');
	}

	root.setAttribute('data-theme', theme.dTag);

	if (theme.properties['--bg-image']) {
		root.style.setProperty('--bg-basic', theme.properties['--bg-image']);
	} else {
		root.style.setProperty('--bg-basic', 'none');
	}

	localStorage.setItem(
		'nuts-theme',
		JSON.stringify({
			dTag: theme.dTag,
			name: theme.name,
			properties: theme.properties,
			isCustom: !theme.isDefault
		})
	);

	currentTheme.set(theme);
}

/**
 * Load theme from localStorage on app start
 */
export function loadStoredTheme(): DittoTheme | null {
	try {
		const stored = localStorage.getItem('nuts-theme');
		if (stored) {
			const parsed = JSON.parse(stored);
			const theme: DittoTheme = {
				id: 'stored',
				dTag: parsed.dTag,
				name: parsed.name,
				author: 'local',
				createdAt: 0,
				properties: parsed.properties,
				isDefault: !parsed.isCustom
			};
			applyTheme(theme);
			return theme;
		}
	} catch (e) {
		console.error('Failed to load stored theme:', e);
	}
	return null;
}

/**
 * Get theme by dTag from built-in themes
 */
export function getThemeByDTag(dTag: string): DittoTheme | undefined {
	return builtInThemes.find((t) => t.dTag === dTag);
}

/**
 * Convert hex color to OkLCH format (for DaisyUI compatibility)
 * Returns string in format: "L% C H" (e.g., "96.1151% 0 0")
 */
function hexToOkLCH(hex: string): string {
	const rgb = hexToRgb(hex);
	if (!rgb) return '100% 0 0';

	// Normalize RGB to 0-1
	const r = rgb.r / 255;
	const g = rgb.g / 255;
	const b = rgb.b / 255;

	// Linearize RGB
	const toLinear = (c: number) => (c <= 0.04045) ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
	const lr = toLinear(r);
	const lg = toLinear(g);
	const lb = toLinear(b);

	// Convert to XYZ (D65)
	const x = 0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb;
	const y = 0.2126729 * lr + 0.7151522 * lg + 0.0721750 * lb;
	const z = 0.0193339 * lr + 0.1191920 * lg + 0.9503041 * lb;

	// Convert XYZ to Lab
	const toLabF = (t: number) => (t > 0.00885645) ? Math.pow(t, 1/3) : 7.787037 * t + 16/116;
	const fy = toLabF(y);
	const L = 116 * fy - 16;
	const a = 500 * (toLabF(x / 0.95047) - fy);
	const b_ = 200 * (fy - toLabF(z / 1.08883));

	// Convert Lab to LCH
	const C = Math.sqrt(a * a + b_ * b_);
	const H = (Math.atan2(b_, a) * 180 / Math.PI + 360) % 360;

	// Return in DaisyUI format: "L% C H"
	// DaisyUI expects chroma values ~0.001 to 0.05, but raw C is much larger
	// We need to scale down significantly to match DaisyUI's expectations
	const scaledC = C * 0.01; // Scale down by 100x to match DaisyUI range
	return `${L.toFixed(4)}% ${scaledC.toFixed(5)} ${scaledC < 0.0001 ? 0 : H.toFixed(5)}`;
}
/**
 * Convert hex to HSL object {h,s,l} - returns values in degrees and percentages
 */
function hexToHslObject(hex: string): { h: number; s: number; l: number } {
	const rgb = hexToRgb(hex);
	if (!rgb) return { h: 0, s: 0, l: 50 };

	const r = rgb.r / 255;
	const g = rgb.g / 255;
	const b = rgb.b / 255;

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	let h = 0, s = 0;
	const l = (max + min) / 2;

	if (max !== min) {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		switch (max) {
			case r: h = (g - b) / d + (g < b ? 6 : 0); break;
			case g: h = (b - r) / d + 2; break;
			case b: h = (r - g) / d + 4; break;
		}
		h /= 6;
	}

	return { h: h * 360, s: s * 100, l: l * 100 };
}

/**
 * Convert HSL object to hex string
 */
function hslObjectToHex({ h, s, l }: { h: number; s: number; l: number }): string {
	h = ((h % 360) + 360) % 360;
	s = Math.max(0, Math.min(100, s));
	l = Math.max(0, Math.min(100, l));

	const hp = h / 360;
	const sp = s / 100;
	const lp = l / 100;

	let r, g, b;

	if (sp === 0) {
		r = g = b = lp;
	} else {
		const q = lp < 0.5 ? lp * (1 + sp) : lp + sp - lp * sp;
		const p = 2 * lp - q;
		const hue2rgb = (p: number, q: number, t: number) => {
			if (t < 0) t += 1;
			if (t > 1) t -= 1;
			if (t < 1/6) return p + (q - p) * 6 * t;
			if (t < 1/2) return q;
			if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
			return p;
		};
		r = hue2rgb(p, q, hp + 1/3);
		g = hue2rgb(p, q, hp);
		b = hue2rgb(p, q, hp - 1/3);
	}

	return rgbToHex(r * 255, g * 255, b * 255);
}

/**
 * Shift hue toward target by factor (0-1)
 * factor 0 = no change, 1 = full shift to target
 */
function shiftHueToward(current: number, target: number, factor: number): number {
	const diff = ((target - current + 180) % 360) - 180;
	return current + diff * factor;
}

/**
 * Nudge hue away from red zone (0-30° and 330-360°)
 * Returns modified hue if in red zone, otherwise returns original
 */
function avoidRedZone(hue: number): number {
	// Red zone: 0-30° (push to orange ~35°) and 330-360° (push to purple ~325°)
	const redZoneLow = 0;
	const redZoneHigh = 30;
	const purpleZone = 325;
	const orangeZone = 35;
	
	// Normalize to 0-360
	hue = ((hue % 360) + 360) % 360;
	
	if (hue >= redZoneLow && hue <= redZoneHigh) {
		// In red-orange zone, push toward orange
		return orangeZone;
	}
	if (hue >= 330 && hue < 360) {
		// In magenta-red zone, push toward purple
		return purpleZone;
	}
	
	return hue;
}

/**
 * Check if hex color is in red zone and nudge it out
 */
function avoidRedInHex(hex: string): string {
	const hsl = hexToHslObject(hex);
	const safeHue = avoidRedZone(hsl.h);
	if (safeHue !== hsl.h) {
		return hslObjectToHex({ h: safeHue, s: hsl.s, l: hsl.l });
	}
	return hex;
}

export function resetToDefault() {
	const defaultTheme = builtInThemes.find((t) => t.dTag === 'touchgrass');
	if (defaultTheme) {
		applyTheme(defaultTheme);
	}
}
