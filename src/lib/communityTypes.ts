import {
	CalendarPlus,
	CreditCard,
	Dumbbell,
	Ellipsis,
	FileText,
	Link2,
	MoonStar,
	Rocket,
	ShieldCheck,
	TreePine,
	UserPlus,
	UtensilsCrossed
} from 'lucide-svelte';
import type { AdminPermission } from 'src/lib/adminAccess';

export type CommunityType =
	| 'sports'
	| 'hospitality'
	| 'club'
	| 'village'
	| 'professional'
	| 'other';

export type ToolkitAction = {
	label: string;
	detail: string;
	icon: typeof CalendarPlus;
	/** Admin route segment under /admin (empty = dashboard). */
	segment: '' | 'events' | 'members' | 'roles' | 'invites' | 'store' | 'settings';
	/** Append ?create=1 (opens the create modal on the events page). */
	create?: boolean;
	/** Append ?section=... (selects a tab on the settings page). */
	section?: string;
	/** Append ?type=... (filters the Store catalog). */
	storeType?: StoreSuggestedDefinitionType;
	/** Open the post composer modal instead of navigating. */
	action?: 'post';
};

export type StorePresentation = 'catalog' | 'menu';
export type StoreSuggestedDefinitionType = 'product' | 'membership' | 'pass';
export type StoreSuggestedProductKind = 'food' | 'drink' | 'merchandise' | 'generic';

export type StorePreset = {
	/** Page title adapted to the community archetype. */
	title: string;
	/** Short explanation shown above the catalog. */
	intro: string;
	/** Vocabulary used for one catalog entry. */
	itemLabel: string;
	/** Vocabulary used for multiple catalog entries. */
	itemsLabel: string;
	/** Vocabulary used for catalog sections. */
	sectionLabel: string;
	/** Hospitality uses a section-first menu; every other archetype uses a catalog. */
	presentation: StorePresentation;
	/** Definition types shown first in the add-item flow. */
	suggestedDefinitionTypes: StoreSuggestedDefinitionType[];
	/** Product kinds shown first when adding a standard product. */
	suggestedProductKinds: StoreSuggestedProductKind[];
	/** Optional section names offered as shortcuts; custom values remain supported. */
	suggestedSections: string[];
};

export type SuggestedRole = {
	name: string;
	description: string;
	permissions: AdminPermission[];
};

export type CommunityArchetype = {
	id: CommunityType;
	/** Full label, e.g. "Sports club & gym". */
	label: string;
	/** Short label for pills, e.g. "Sports club". */
	shortLabel: string;
	icon: typeof Dumbbell;
	/** One-liner shown under the tile on the create page. */
	tagline: string;
	/** Bullets shown on the create page for the selected archetype. */
	highlights: string[];
	/** Dashboard toolkit heading + intro. */
	toolkitIntro: string;
	/** Dashboard toolkit action cards. */
	actions: ToolkitAction[];
	/** Role badges typically useful for this archetype (one-click create). */
	suggestedRoles: SuggestedRole[];
	/** Copy hint about how this archetype usually charges for membership. */
	membershipHint: string;
};

export const COMMUNITY_ARCHETYPES: CommunityArchetype[] = [
	{
		id: 'sports',
		label: 'Sports club & gym',
		shortLabel: 'Sports club',
		icon: Dumbbell,
		tagline: 'Teams, training and fitness classes',
		highlights: [
			'Class and training schedule via events',
			'Monthly or yearly membership dues',
			'Coach role with event permissions',
			'Level badges to mark member progress'
		],
		toolkitIntro: 'Classes, coaches and dues — the everyday tools of a sports community.',
		actions: [
			{
				label: 'Schedule a class',
				detail: 'Training sessions and matches live on the community calendar.',
				icon: CalendarPlus,
				segment: 'events',
				create: true
			},
			{
				label: 'Membership dues',
				detail: 'Charge monthly or yearly — members get their badge automatically.',
				icon: CreditCard,
				segment: 'store',
				storeType: 'membership'
			},
			{
				label: 'Coaches & captains',
				detail: 'Give coaches permission to run events and post updates.',
				icon: ShieldCheck,
				segment: 'roles'
			},
			{
				label: 'Invite members',
				detail: 'QR invites for players, parents and supporters.',
				icon: UserPlus,
				segment: 'invites'
			}
		],
		suggestedRoles: [
			{
				name: 'Coach',
				description: 'Runs trainings and matches. Can manage events and post updates.',
				permissions: ['events', 'posts', 'media']
			},
			{
				name: 'Team captain',
				description: 'Team representative. Can post updates to the community.',
				permissions: ['posts', 'media']
			}
		],
		membershipHint: 'Sports clubs usually charge monthly or yearly dues.'
	},
	{
		id: 'hospitality',
		label: 'Restaurant, café & bar',
		shortLabel: 'Restaurant',
		icon: UtensilsCrossed,
		tagline: 'Tables, menus and regulars',
		highlights: [
			'Booking and menu buttons on your community page',
			'VIP membership for your regulars',
			'Theme nights and tastings as events',
			'Staff roles for your team'
		],
		toolkitIntro: 'Reservations, menu and regulars — the front-of-house essentials.',
		actions: [
			{
				label: 'Menu & booking links',
				detail: 'Show “View menu” and “Book a table” buttons on your community page.',
				icon: Link2,
				segment: 'settings',
				section: 'community'
			},
			{
				label: 'VIP membership',
				detail: 'A paid plan for regulars — perks, priority, members-only nights.',
				icon: CreditCard,
				segment: 'store',
				storeType: 'membership'
			},
			{
				label: 'Plan a theme night',
				detail: 'Tastings, live music, seasonal menus — with optional paid entrance.',
				icon: CalendarPlus,
				segment: 'events',
				create: true
			},
			{
				label: 'Invite regulars',
				detail: 'A QR at the counter is all it takes to join.',
				icon: UserPlus,
				segment: 'invites'
			}
		],
		suggestedRoles: [
			{
				name: 'Staff',
				description: 'Front-of-house team. Can post updates to the community.',
				permissions: ['posts', 'media']
			},
			{
				name: 'Events host',
				description: 'Organizes theme nights and tastings. Can manage events.',
				permissions: ['events', 'posts', 'media']
			}
		],
		membershipHint: 'Restaurants usually run a yearly VIP or supporter club.'
	},
	{
		id: 'club',
		label: "Members' club & nightlife",
		shortLabel: "Members' club",
		icon: MoonStar,
		tagline: 'Dues, door policy and member nights',
		highlights: [
			'Tiered memberships with recurring dues',
			'Badge-gated entry for member-only events',
			'Committee and door-staff roles',
			'Private announcements to members'
		],
		toolkitIntro: 'Tiers, door policy and member nights — run the house your way.',
		actions: [
			{
				label: 'Membership tiers',
				detail: 'Standard, premium, founder — recurring dues with automatic badges.',
				icon: CreditCard,
				segment: 'store',
				storeType: 'membership'
			},
			{
				label: 'Member-night event',
				detail: 'Gate admission on membership badges — the door list is built in.',
				icon: CalendarPlus,
				segment: 'events',
				create: true
			},
			{
				label: 'Committee & door roles',
				detail: 'Committee manages the club; door staff get a recognition badge.',
				icon: ShieldCheck,
				segment: 'roles'
			},
			{
				label: 'Invite new members',
				detail: 'Controlled growth with expiring invite links.',
				icon: UserPlus,
				segment: 'invites'
			}
		],
		suggestedRoles: [
			{
				name: 'Committee',
				description: 'Runs the club. Can manage events, invites and moderate.',
				permissions: ['events', 'invites', 'moderation', 'posts', 'media']
			},
			{
				name: 'Door staff',
				description: 'Recognition badge for the door team — no admin permissions.',
				permissions: []
			},
			{
				name: 'Event manager',
				description: 'Programs member nights. Can manage events and post updates.',
				permissions: ['events', 'posts', 'media']
			}
		],
		membershipHint: "Members' clubs usually charge monthly or yearly dues, often tiered."
	},
	{
		id: 'village',
		label: 'Village & neighborhood',
		shortLabel: 'Village',
		icon: TreePine,
		tagline: 'Local life, notices and gatherings',
		highlights: [
			'Free membership via invites',
			'Announcements that reach every resident',
			'Council and moderator roles',
			'Local events calendar'
		],
		toolkitIntro: 'Notices, gatherings and local roles — the digital village square.',
		actions: [
			{
				label: 'Post an announcement',
				detail: 'Reach every resident with news from the village.',
				icon: FileText,
				segment: '',
				action: 'post'
			},
			{
				label: 'Organize a gathering',
				detail: 'Markets, clean-ups, celebrations — with RSVPs built in.',
				icon: CalendarPlus,
				segment: 'events',
				create: true
			},
			{
				label: 'Council & moderators',
				detail: 'The council keeps the square tidy and welcoming.',
				icon: ShieldCheck,
				segment: 'roles'
			},
			{
				label: 'Invite residents',
				detail: 'Print a QR for the notice board or the local shop.',
				icon: UserPlus,
				segment: 'invites'
			}
		],
		suggestedRoles: [
			{
				name: 'Council',
				description: 'Village council. Can manage events, invites and moderate.',
				permissions: ['events', 'invites', 'moderation', 'posts', 'media']
			},
			{
				name: 'Moderator',
				description: 'Keeps conversations civil. Can moderate and post.',
				permissions: ['moderation', 'posts']
			}
		],
		membershipHint: 'Villages are usually free — invites are all you need.'
	},
	{
		id: 'professional',
		label: 'Startup & professional network',
		shortLabel: 'Professional',
		icon: Rocket,
		tagline: 'Members, mentors and meetups',
		highlights: [
			'Paid membership plans',
			'Mentor and organizer badges',
			'Meetups and workshops',
			'A member directory that grows with you'
		],
		toolkitIntro: 'Memberships, mentors and meetups — keep the network valuable.',
		actions: [
			{
				label: 'Membership plan',
				detail: 'Charge for access — members get their badge automatically.',
				icon: CreditCard,
				segment: 'store',
				storeType: 'membership'
			},
			{
				label: 'Host a meetup',
				detail: 'Workshops, demos and office hours — with RSVPs built in.',
				icon: CalendarPlus,
				segment: 'events',
				create: true
			},
			{
				label: 'Mentors & organizers',
				detail: 'Recognize the people who make the network tick.',
				icon: ShieldCheck,
				segment: 'roles'
			},
			{
				label: 'Invite members',
				detail: 'Bring in founders, operators and mentors.',
				icon: UserPlus,
				segment: 'invites'
			}
		],
		suggestedRoles: [
			{
				name: 'Organizer',
				description: 'Runs meetups and workshops. Can manage events and post.',
				permissions: ['events', 'posts', 'media']
			},
			{
				name: 'Mentor',
				description: 'Recognition badge for mentors — no admin permissions.',
				permissions: []
			}
		],
		membershipHint: 'Professional networks usually charge a monthly membership.'
	},
	{
		id: 'other',
		label: 'Other community',
		shortLabel: 'Community',
		icon: Ellipsis,
		tagline: 'Start blank, tune it later',
		highlights: [
			'Invite links and QR codes to grow',
			'Events with RSVPs and paid entrance',
			'Roles and badges for your team',
			'Optional paid memberships'
		],
		toolkitIntro: 'The essentials — pick a community type in Settings for tailored tools.',
		actions: [
			{
				label: 'Create an event',
				detail: 'Meetups, workshops, gatherings — with RSVPs built in.',
				icon: CalendarPlus,
				segment: 'events',
				create: true
			},
			{
				label: 'Make a post',
				detail: 'Share an update with your members.',
				icon: FileText,
				segment: '',
				action: 'post'
			},
			{
				label: 'Assign roles',
				detail: 'Give permissions and empower your team.',
				icon: ShieldCheck,
				segment: 'roles'
			},
			{
				label: 'Invite members',
				detail: 'Bring people into your community.',
				icon: UserPlus,
				segment: 'invites'
			}
		],
		suggestedRoles: [
			{
				name: 'Moderator',
				description: 'Keeps conversations civil. Can moderate and post.',
				permissions: ['moderation', 'posts']
			}
		],
		membershipHint: 'Memberships can be one-time, monthly or yearly.'
	}
];

export const DEFAULT_COMMUNITY_TYPE: CommunityType = 'other';

export const STORE_PRESETS: Record<CommunityType, StorePreset> = {
	sports: {
		title: 'Store',
		intro: 'Manage memberships, entry passes and club merchandise in one catalog.',
		itemLabel: 'offer',
		itemsLabel: 'offers',
		sectionLabel: 'category',
		presentation: 'catalog',
		suggestedDefinitionTypes: ['pass', 'product'],
		suggestedProductKinds: ['merchandise', 'generic'],
		suggestedSections: ['Memberships', 'Passes', 'Merchandise']
	},
	hospitality: {
		title: 'Menu & store',
		intro: 'Organize food, drinks and other offers into a menu your team can keep current.',
		itemLabel: 'menu item',
		itemsLabel: 'menu items',
		sectionLabel: 'menu section',
		presentation: 'menu',
		suggestedDefinitionTypes: ['product', 'pass'],
		suggestedProductKinds: ['food', 'drink', 'merchandise', 'generic'],
		suggestedSections: ['Starters', 'Mains', 'Sides', 'Desserts', 'Drinks']
	},
	club: {
		title: 'Store',
		intro: 'Manage membership tiers, admission passes and club merchandise.',
		itemLabel: 'offer',
		itemsLabel: 'offers',
		sectionLabel: 'category',
		presentation: 'catalog',
		suggestedDefinitionTypes: ['pass', 'product'],
		suggestedProductKinds: ['merchandise', 'generic'],
		suggestedSections: ['Memberships', 'Admission', 'Merchandise']
	},
	village: {
		title: 'Community store',
		intro: 'Collect local goods, community passes and memberships in one catalog.',
		itemLabel: 'item',
		itemsLabel: 'items',
		sectionLabel: 'category',
		presentation: 'catalog',
		suggestedDefinitionTypes: ['product', 'pass'],
		suggestedProductKinds: ['generic', 'food', 'drink', 'merchandise'],
		suggestedSections: ['Local goods', 'Food & drink', 'Workshops', 'Memberships']
	},
	professional: {
		title: 'Store',
		intro: 'Manage memberships, workshop passes and resources for your network.',
		itemLabel: 'offer',
		itemsLabel: 'offers',
		sectionLabel: 'category',
		presentation: 'catalog',
		suggestedDefinitionTypes: ['pass', 'product'],
		suggestedProductKinds: ['generic', 'merchandise'],
		suggestedSections: ['Memberships', 'Workshops', 'Resources', 'Merchandise']
	},
	other: {
		title: 'Store',
		intro: 'Manage products, memberships and reusable passes in one catalog.',
		itemLabel: 'item',
		itemsLabel: 'items',
		sectionLabel: 'category',
		presentation: 'catalog',
		suggestedDefinitionTypes: ['product', 'pass'],
		suggestedProductKinds: ['generic', 'merchandise', 'food', 'drink'],
		suggestedSections: ['Products', 'Memberships', 'Passes']
	}
};

export function isCommunityType(value: string | undefined): value is CommunityType {
	return Boolean(value && COMMUNITY_ARCHETYPES.some((archetype) => archetype.id === value));
}

export function archetypeFor(type: CommunityType | undefined): CommunityArchetype {
	return (
		COMMUNITY_ARCHETYPES.find((archetype) => archetype.id === type) ||
		(COMMUNITY_ARCHETYPES.find(
			(archetype) => archetype.id === DEFAULT_COMMUNITY_TYPE
		) as CommunityArchetype)
	);
}

export function storePresetFor(type: CommunityType | undefined): StorePreset {
	return STORE_PRESETS[type || DEFAULT_COMMUNITY_TYPE] || STORE_PRESETS[DEFAULT_COMMUNITY_TYPE];
}
