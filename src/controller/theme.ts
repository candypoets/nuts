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
			'--primary-content': '#9b9ea4',
			'--secondary': '#D926AA',
			'--secondary-content': '#c1cad6',
			'--base-100': '#f9fafb',
			'--base-200': '#f2f2f3',
			'--base-300': '#f8fdfd',
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
			'--primary': '#1fb092',
			'--primary-content': '#48505a',
			'--secondary': '#D926AA',
			'--secondary-content': '#c1cad6',
			'--base-100': '#131716',
			'--base-200': '#1a1a1a',
			'--base-300': '#1f2937',
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
			'--primary': '#1fb092',
			'--primary-content': '#a0a0a0',
			'--secondary': '#333333',
			'--secondary-content': '#b0b0b0',
			'--base-100': '#333333',
			'--base-200': '#1a1a1a',
			'--base-300': '#262626',
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
			'--primary-content': '#e0e0e0',
			'--secondary': '#d4d4d4',
			'--secondary-content': '#343434',
			'--base-100': '#e8e8e8',
			'--base-200': '#f8f8f8',
			'--base-300': '#ffffff',
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
			'--primary': '#ADD8E6',
			'--primary-content': '#999999',
			'--secondary': '#282828',
			'--secondary-content': '#b3b3b3',
			'--base-100': '#00213f',
			'--base-200': '#161616',
			'--base-300': '#3441597a',
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
			'--primary': '#ff6347',
			'--primary-content': '#f5f5dc',
			'--secondary': '#ffb347',
			'--secondary-content': '#4a4a4a',
			'--base-100': '#f4e4bc',
			'--base-200': '#e8d5a8',
			'--base-300': '#f7f2f3d9',
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
	console.log('[eventToTheme] Processing event kind:', event.kind(), 'id:', event.id()?.slice(0, 8));
	
	if (event.kind() !== THEME_DEFINITION_KIND) {
		console.log('[eventToTheme] Wrong kind, skipping');
		return null;
	}

	const dTag = extractTagValue(event, 'd');
	const title = extractTagValue(event, 'title');
	const description = extractTagValue(event, 'description') || '';
	
	console.log('[eventToTheme] dTag:', dTag, 'title:', title);

	if (!dTag || !title) {
		console.log('[eventToTheme] Missing dTag or title');
		return null;
	}

	// Log all tags for debugging
	console.log('[eventToTheme] All tags:');
	const tagsLength = event.tagsLength();
	for (let i = 0; i < tagsLength; i++) {
		const tagVec = event.tags(i);
		if (!tagVec) continue;
		const tagItems: string[] = [];
		for (let j = 0; j < tagVec.itemsLength(); j++) {
			tagItems.push(tagVec.items(j));
		}
		console.log('  Tag', i, ':', tagItems);
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
		console.log(`[eventToTheme] ✓ Resolved ${resolvedColors.length} colors from event:`);
		resolvedColors.forEach(({ role, hsl, hex }) => {
			// Create a colored square in console
			console.log(`  - ${role}: ${hsl} → %c${hex}`, `background:${hex};color:white;padding:2px 6px;border-radius:3px;`);
		});
	}

	if (!properties['--primary'] || !properties['--base-100']) {
		console.log('[eventToTheme] Missing required colors (primary or background)');
		return null;
	}
	
	if (bgImage) {
		properties['--bg-image'] = bgImage;
	}
	
	console.log('[eventToTheme] Success - returning theme');

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
 */
function deriveMissingColors(props: ThemeProperties): ThemeProperties {
	const base100 = props['--base-100'] || '#ffffff';
	const primary = props['--primary'] || '#158777';
	const primaryContent = props['--primary-content'] || '#000000';
	
	console.log('[deriveMissingColors] Input:', { base100, primary, primaryContent });

	// Detect if dark theme by checking background brightness
	const isDark = isColorDark(base100);
	console.log('[deriveMissingColors] Detected theme type:', isDark ? 'dark' : 'light');

	const result: ThemeProperties = { ...props };

	// Derive base-200 and base-300 from base-100
	// Logic: base-100 is the main background
	//        base-200 is for cards/surfaces (opposite direction from bg)
	//        base-300 is for elevated elements
	const base200Adjustment = isDark ? 12 : -8;   // Dark: lighter, Light: darker
	const base300Adjustment = isDark ? 20 : -4;    // Dark: even lighter, Light: slightly darker
	
	if (!result['--base-200']) {
		result['--base-200'] = adjustBrightness(base100, base200Adjustment);
		console.log(`[deriveMissingColors] base-200: ${base100} + ${base200Adjustment}% = ${result['--base-200']}`);
	}
	if (!result['--base-300']) {
		result['--base-300'] = adjustBrightness(base100, base300Adjustment);
		console.log(`[deriveMissingColors] base-300: ${base100} + ${base300Adjustment}% = ${result['--base-300']}`);
	}

	// Derive secondary - use neutralized version of primary
	if (!result['--secondary']) {
		result['--secondary'] = isDark ? '#444444' : '#cccccc';
	}
	if (!result['--secondary-content']) {
		result['--secondary-content'] = isDark ? '#b0b0b0' : '#333333';
	}

	// Derive accent - use complementary or contrasting color
	if (!result['--accent']) {
		result['--accent'] = isDark ? '#c19bfd' : '#6d28d9';
	}

	// Derive semantic colors
	if (!result['--info']) {
		result['--info'] = '#00b5ff';
	}
	if (!result['--success']) {
		result['--success'] = '#00a96e';
	}
	if (!result['--warning']) {
		result['--warning'] = '#ffbe00';
	}
	if (!result['--error']) {
		result['--error'] = '#ff5861';
	}

	// Neutral
	if (!result['--neutral']) {
		result['--neutral'] = isDark ? '#2a323c' : '#e5e7eb';
	}

	// Shadows - adjust based on theme type
	if (!result['--shadow-outer-color']) {
		result['--shadow-outer-color'] = isDark 
			? 'rgba(0, 0, 0, 0.5)' 
			: 'rgba(0, 0, 0, 0.15)';
	}
	if (!result['--shadow-inset-highlight']) {
		result['--shadow-inset-highlight'] = isDark 
			? 'rgba(255, 255, 255, 0.1)' 
			: 'rgba(255, 255, 255, 0.3)';
	}
	if (!result['--shadow-inset-subtle']) {
		result['--shadow-inset-subtle'] = isDark 
			? 'rgba(255, 255, 255, 0.02)' 
			: 'rgba(255, 255, 255, 0.08)';
	}

	// Highlight
	if (!result['--highlight']) {
		result['--highlight'] = isDark ? '#000000' : '#ffffff';
	}

	console.log('[deriveMissingColors] Output:', result);
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

	console.log('[Theme] Applying:', theme.name, 'dTag:', theme.dTag);
	console.log('[Theme] Properties:', JSON.stringify(theme.properties, null, 2));

	const root = document.documentElement;

	// Apply custom properties
	Object.entries(theme.properties).forEach(([prop, value]) => {
		if (value) {
			console.log(`[Theme] ${prop} = ${value}`);
			root.style.setProperty(prop, value);
		}
	});

	// Set DaisyUI internal OkLCH variables for custom themes (built-ins already have them in CSS)
	console.log('[Theme] Theme isDefault:', theme.isDefault, 'name:', theme.name);
	
	if (!theme.isDefault) {
		const base100 = theme.properties['--base-100'] || '#f9fafb';
		const base200 = theme.properties['--base-200'] || base100;
		const base300 = theme.properties['--base-300'] || base100;
		const baseContent = theme.properties['--base-content'] || (isColorDark(base100) ? '#ffffff' : '#000000');
		
		const oklch100 = hexToOkLCH(base100);
		const oklch200 = hexToOkLCH(base200);
		const oklch300 = hexToOkLCH(base300);
		const oklchBC = hexToOkLCH(baseContent);
		
		console.log('[Theme] DaisyUI OkLCH (custom theme):');
		console.log(`  --b1 (base-100): ${base100} → ${oklch100}`);
		console.log(`  --b2 (base-200): ${base200} → ${oklch200}`);
		console.log(`  --b3 (base-300): ${base300} → ${oklch300}`);
		console.log(`  --bc (base-content): ${baseContent} → ${oklchBC}`);

		root.style.setProperty('--b1', oklch100);
		root.style.setProperty('--b2', oklch200);
		root.style.setProperty('--b3', oklch300);
		root.style.setProperty('--bc', oklchBC);
	} else {
		// For built-in themes, clear the OkLCH variables to let DaisyUI handle them
		console.log('[Theme] Built-in theme, clearing OkLCH and CSS variables to let DaisyUI handle them');
		root.style.removeProperty('--b1');
		root.style.removeProperty('--b2');
		root.style.removeProperty('--b3');
		root.style.removeProperty('--bc');
		
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
	console.log('[Theme] data-theme set to:', theme.dTag);

	if (theme.properties['--bg-image']) {
		console.log('[Theme] BG image:', theme.properties['--bg-image']);
		root.style.setProperty('--bg-basic', theme.properties['--bg-image']);
	} else {
		console.log('[Theme] No BG image, clearing --bg-basic');
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
	console.log('[Theme] Applied successfully');
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
export function resetToDefault() {
	const defaultTheme = builtInThemes.find((t) => t.dTag === 'touchgrass');
	if (defaultTheme) {
		applyTheme(defaultTheme);
	}
}
