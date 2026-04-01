import { writable, get, type Writable } from 'svelte/store';
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
			'--shadow-inset-subtle': 'rgba(255, 255, 255, 0.01)'
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
			'--shadow-inset-subtle': 'rgba(255, 255, 255, 0.1)'
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
 * Convert a Ditto/Soapbox Kind 36767 ThemeDefinition event to DittoTheme
 */
export function eventToTheme(event: ParsedEvent): DittoTheme | null {
	if (event.kind() !== THEME_DEFINITION_KIND) return null;

	const dTag = extractTagValue(event, 'd');
	if (!dTag) return null;

	const title = extractTagValue(event, 'title');
	if (!title) return null;

	const description = extractTagValue(event, 'description') || '';

	// Parse color tags (c tags with role: background, text, primary)
	const properties: ThemeProperties = {};
	const tagsLength = event.tagsLength();

	for (let i = 0; i < tagsLength; i++) {
		const tagVec = event.tags(i);
		if (!tagVec) continue;

		const tagName = tagVec.items(0);
		if (tagName === 'c' && tagVec.itemsLength() >= 3) {
			const colorValue = tagVec.items(1);
			const role = tagVec.items(2);

			switch (role) {
				case 'background':
					properties['--base-100'] = colorValue;
					break;
				case 'text':
					properties['--primary-content'] = colorValue;
					break;
				case 'primary':
					properties['--primary'] = colorValue;
					break;
			}
		}
	}

	if (!properties['--primary'] || !properties['--base-100']) {
		return null;
	}

	return {
		id: event.id() || '',
		dTag,
		name: title,
		description,
		author: event.pubkey() || '',
		createdAt: Number(event.createdAt()) || 0,
		properties
	};
}

/**
 * Apply theme CSS custom properties to the document
 */
export function applyTheme(theme: DittoTheme | null) {
	if (!theme) return;

	const root = document.documentElement;

	Object.entries(theme.properties).forEach(([prop, value]) => {
		if (value) {
			root.style.setProperty(prop, value);
		}
	});

	root.setAttribute('data-theme', theme.dTag);

	if (theme.properties['--bg-image']) {
		root.style.setProperty('--bg-basic', theme.properties['--bg-image']);
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
 * Get theme by dTag
 */
export function getThemeByDTag(dTag: string): DittoTheme | undefined {
	const allThemes = get(themesStore);
	return allThemes.find((t) => t.dTag === dTag);
}

/**
 * Reset to default theme
 */
export function resetToDefault() {
	const defaultTheme = get(themesStore).find((t) => t.dTag === 'touchgrass');
	if (defaultTheme) {
		applyTheme(defaultTheme);
	}
}
