import { goto } from '$app/navigation';
import { page } from '$app/stores';
import { get, writable } from 'svelte/store';

export interface FeedConfig {
	route: string;
	id: string;
	label?: string;
}

type ItemState = { transform: string; opacity: string; zIndex: string };

type PendingAnimation = {
	targetX: number;
	duration: number;
	isMobile: boolean;
	targetIndex: number;
	originIndex: number;
};

export class CarouselAnimator {
	private items: HTMLElement[] = [];
	private currentAnimations: (Animation | null)[] = [];
	private pendingTouchX = 0;
	private pendingTouchIsMobile = false;
	private lastProgressX = Number.NaN;
	private scrollerWidth: number;
	private currentStates: ItemState[] = [];
	private currentIndexValue = 0;

	// Default routes - can be modified dynamically
	private activeRoutes: FeedConfig[] = [
		{ route: '/home', id: 'home', label: 'Home' },
		{ route: '/explore', id: 'explore', label: 'Explore' },
		{ route: '/chat', id: 'chat', label: 'Chat' }
	];

	// Public stores
	readonly currentIndex = writable<number>(0);
	readonly overviewMode = writable<boolean>(false);

	// Touch state
	private touchStartX = 0;
	private touchStartY = 0;
	private touchStartTime = 0;
	private isSwiping = false;
	private isHorizontalGesture = false;
	private virtualXPosition = 0;

	// Progress bars
	private progressContainer: HTMLElement | null = null;
	private progressBars: HTMLElement[] = [];

	// Mobile visibility management
	private visibleIndices: Set<number> = new Set();
	private isAnimating = false;
	private isReady = false;
	private hasSynced = false; // Track if initial sync has occurred
	private pendingAnimation: PendingAnimation | null = null;

	constructor(scrollerWidth: number = 1080) {
		this.scrollerWidth = scrollerWidth;
		this.currentIndexValue = 0;
		this.currentIndex.set(0);
	}

	// === OVERVIEW MODE API ===

	toggleOverviewMode(duration: number = 500, isMobile: boolean = false) {
		const current = get(this.overviewMode);
		if (current) {
			this.exitOverviewMode(duration, isMobile);
		} else {
			this.enterOverviewMode(duration, isMobile);
		}
	}

	enterOverviewMode(duration: number = 500, isMobile: boolean = false) {
		this.overviewMode.set(true);
		this.animateOverviewLayout(duration, isMobile);
	}

	exitOverviewMode(duration: number = 400, isMobile: boolean = false) {
		this.overviewMode.set(false);
		// Clear CSS transitions from overview mode
		this.items.forEach((item) => {
			item.style.transition = '';
		});
		// Return to current position
		const currentIdx = this.currentIndexValue;
		const targetX = currentIdx * this.scrollerWidth;
		this.animateToPosition(targetX, duration, isMobile, currentIdx);
	}

	private animateOverviewLayout(duration: number = 500, isMobile: boolean = false) {
		this.cancelAllAnimations();
		this.updateProgressBars(0, true);

		const containerWidth = this.scrollerWidth;
		const count = this.activeRoutes.length;
		const scale = isMobile ? 0.28 : 0.42;
		const scaledItemWidth = containerWidth * scale;

		// For desktop: position feeds side by side with overlap to fit screen
		const overlap = isMobile ? 0 : 220;
		const spacing = scaledItemWidth - overlap;
		const startX = isMobile
			? (containerWidth - (count * scaledItemWidth + (count - 1) * 16)) / 2
			: 30;

		// Show all items in overview mode
		this.items.forEach((item) => {
			item.style.display = '';
			item.style.zIndex = '1';
			item.style.transition = `transform ${duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity ${duration}ms ease`;
		});
		this.visibleIndices = new Set(this.items.map((_, i) => i));

		// Force a reflow before setting new transforms
		this.items[0]?.offsetHeight;

		for (let index = 0; index < this.items.length; index++) {
			const item = this.items[index];
			if (!item) continue;

			const xPos = startX + index * spacing;
			const centeringOffset = (containerWidth - scaledItemWidth) / 2;
			const translateX = xPos - centeringOffset;
			const targetTransform = `translate3d(${translateX}px, 0, 0) scale(${scale})`;

			item.style.transform = targetTransform;
			item.style.opacity = '1';

			this.currentStates[index] = {
				transform: targetTransform,
				opacity: '1',
				zIndex: '1'
			};
		}
	}

	// === FEED MANAGEMENT ===

	getActiveRoutes(): FeedConfig[] {
		return [...this.activeRoutes];
	}

	deleteRoute(index: number, isMobile: boolean = false): boolean {
		if (this.activeRoutes.length <= 1) {
			// Can't delete the last feed
			return false;
		}

		const wasInOverview = get(this.overviewMode);
		const deletedIndex = index;

		// Remove from active routes
		this.activeRoutes.splice(index, 1);

		// Update items array to match
		if (index < this.items.length) {
			this.items.splice(index, 1);
			this.currentStates.splice(index, 1);
			this.currentAnimations.splice(index, 1);
		}

		// Adjust current index if needed
		let currentIdx = this.currentIndexValue;
		if (deletedIndex <= currentIdx && currentIdx > 0) {
			currentIdx--;
		}
		currentIdx = this.clampIndex(currentIdx);
		this.setCurrentIndex(currentIdx);
		this.rebuildProgressBars();

		// Re-animate
		if (wasInOverview) {
			this.animateOverviewLayout(300, isMobile);
		} else {
			const targetX = currentIdx * this.scrollerWidth;
			this.animateToPosition(targetX, 300, isMobile, currentIdx);
			goto(this.activeRoutes[currentIdx]?.route || '/home');
		}

		return true;
	}

	addRoute(config: FeedConfig, isMobile: boolean = false) {
		this.activeRoutes.push(config);
		this.rebuildProgressBars();
		this.updateProgressBars(this.currentIndexValue * this.scrollerWidth, true);

		// If in overview mode, re-animate to show new item
		if (get(this.overviewMode)) {
			this.animateOverviewLayout(300, isMobile);
		}
	}

	selectRouteInOverview(index: number, duration: number = 400, isMobile: boolean = false) {
		if (index < 0 || index >= this.activeRoutes.length) return;

		this.exitOverviewMode(duration, isMobile);
		this.navigateTo(index, duration, isMobile);
	}

	// === PUBLIC NAVIGATION API ===

	navigateTo(index: number, duration: number = 400, isMobile: boolean = false) {
		if (index < 0 || index >= this.activeRoutes.length) return;
		if (index === this.currentIndexValue) return;

		const targetX = index * this.scrollerWidth;
		this.animateToPosition(targetX, duration, isMobile, index);
		goto(this.activeRoutes[index].route);
		this.setCurrentIndex(index);
	}

	navigateLeft(duration: number = 400, isMobile: boolean = false) {
		const current = this.currentIndexValue;
		if (current > 0) {
			this.navigateTo(current - 1, duration, isMobile);
		}
	}

	navigateRight(duration: number = 400, isMobile: boolean = false) {
		const current = this.currentIndexValue;
		if (current < this.activeRoutes.length - 1) {
			this.navigateTo(current + 1, duration, isMobile);
		}
	}

	// Backward-compat aliases
	moveLeft(duration: number = 400, isMobile: boolean = false) {
		this.navigateLeft(duration, isMobile);
	}

	moveRight(duration: number = 400, isMobile: boolean = false) {
		this.navigateRight(duration, isMobile);
	}

	// React to external URL changes (browser back/forward, direct navigation)
	syncToUrl(pathname: string, duration: number = 400, isMobile: boolean = false) {
		if (get(this.overviewMode)) {
			// Don't sync while in overview mode
			return;
		}

		const index = this.activeRoutes.findIndex((r) => pathname.startsWith(r.route));
		if (index < 0) return;

		const current = this.currentIndexValue;
		if (index !== current) {
			const targetX = index * this.scrollerWidth;
			// On first sync (initial page load), don't apply mobile visibility restrictions
			const shouldApplyMobileVisibility = this.hasSynced && isMobile;
			this.animateToPosition(targetX, duration, shouldApplyMobileVisibility, index);
			this.setCurrentIndex(index);
		}

		// Mark that we've completed at least one sync
		this.hasSynced = true;
	}

	// === SETUP ===

	setItems(items: HTMLElement[]) {
		this.items = items;
		const currentIdx = this.readCurrentIndexFromUrl();
		this.setCurrentIndex(currentIdx);
		this.virtualXPosition = currentIdx * this.scrollerWidth;

		// Reset hasSynced since we're re-initializing
		this.hasSynced = false;

		// Keep and clear pending animation snapshot
		const pending = this.pendingAnimation;
		this.pendingAnimation = null;

		// Ensure all items are visible initially
		this.visibleIndices = new Set(items.map((_, i) => i));

		for (let index = 0; index < this.items.length; index++) {
			const item = this.items[index];
			item.style.willChange = 'transform, opacity';
			item.style.backfaceVisibility = 'hidden';
			item.style.contain = 'paint';
			item.style.display = '';
			item.style.transition = '';
			item.style.zIndex = index === currentIdx ? '10' : '0';
		}

		this.cancelAllAnimations();
		this.currentAnimations = new Array(items.length).fill(null);

		const baseX = currentIdx * this.scrollerWidth;
		this.currentStates = new Array(items.length).fill(null).map((_, index) => {
			const ratio = this.getTransformRatio(index, baseX);
			const transform = this.getTransformForItem(index, ratio, false, currentIdx);
			return {
				transform,
				opacity: ratio.toString(),
				zIndex: index === currentIdx ? '10' : '0'
			};
		});

		this.rebuildProgressBars();
		this.updateProgressBars(baseX, true);

		// Mark as ready and run any pending animation
		this.isReady = true;
		if (pending && pending.duration > 0) {
			const { targetX, duration, isMobile, targetIndex, originIndex } = pending;
			const originBaseX = originIndex * this.scrollerWidth;
			this.currentStates = new Array(items.length).fill(null).map((_, index) => {
				const ratio = this.getTransformRatio(index, originBaseX);
				const transform = this.getTransformForItem(index, ratio, isMobile, originIndex);
				return {
					transform,
					opacity: isMobile ? '1' : ratio.toString(),
					zIndex: index === originIndex ? '10' : '0'
				};
			});
			this.setCurrentIndex(originIndex);
			this.animateToPosition(targetX, duration, isMobile, targetIndex);
		}
	}

	updateScrollerWidth(width: number) {
		this.scrollerWidth = width;
		this.updateProgressBars(this.currentIndexValue * this.scrollerWidth, true);
	}

	setProgressContainer(container: HTMLElement) {
		this.progressContainer = container;
		this.rebuildProgressBars();
		this.updateProgressBars(this.currentIndexValue * this.scrollerWidth, true);
	}

	// === TOUCH HANDLING ===

	handleTouchStart(e: TouchEvent) {
		if (get(this.overviewMode)) return; // Disable touch in overview mode

		// Re-sync from current URL to avoid stale index after external/router transitions
		this.setCurrentIndex(this.readCurrentIndexFromUrl());

		this.touchStartX = e.touches[0].clientX;
		this.touchStartY = e.touches[0].clientY;
		this.touchStartTime = Date.now();
		this.isSwiping = false;
		this.isHorizontalGesture = false;
		this.cancelAllAnimations();
		this.virtualXPosition = this.currentIndexValue * this.scrollerWidth;
	}

	handleTouchMove(e: TouchEvent, isMobile: boolean = false) {
		if (!this.items.length || get(this.overviewMode)) return;

		const touchCurrentX = e.touches[0].clientX;
		const touchCurrentY = e.touches[0].clientY;
		const deltaX = touchCurrentX - this.touchStartX;
		const deltaY = touchCurrentY - this.touchStartY;

		if (!this.isHorizontalGesture && !this.isSwiping) {
			const absDeltaX = Math.abs(deltaX);
			const absDeltaY = Math.abs(deltaY);

			if (absDeltaX > 10 || absDeltaY > 10) {
				this.isHorizontalGesture = absDeltaX > absDeltaY;
				if (!this.isHorizontalGesture) return;
			} else {
				return;
			}
		}

		if (this.isHorizontalGesture && Math.abs(deltaX) > 5) {
			this.isSwiping = true;
			e.preventDefault();
			e.stopPropagation();

			const currentIdx = this.currentIndexValue;
			const constrainedDeltaX = this.constrainDeltaX(deltaX, currentIdx);
			this.virtualXPosition = currentIdx * this.scrollerWidth - constrainedDeltaX;
			this.trackTouchPosition(this.virtualXPosition, isMobile);
		}
	}

	handleTouchEnd(e: TouchEvent, isMobile: boolean = false) {
		if (!this.items.length || get(this.overviewMode)) return;

		if (this.isHorizontalGesture) {
			const touchEndX = e.changedTouches[0].clientX;
			const deltaX = touchEndX - this.touchStartX;
			const elapsed = Math.max(1, Date.now() - this.touchStartTime);
			const velocity = Math.abs(deltaX) / elapsed;

			const currentIdx = this.currentIndexValue;
			const constrainedDeltaX = this.constrainDeltaX(deltaX, currentIdx);
			this.virtualXPosition = currentIdx * this.scrollerWidth - constrainedDeltaX;
			this.trackTouchPosition(this.virtualXPosition, isMobile);
			this.flushPendingTouchFrame();

			let targetIndex = currentIdx;
			const threshold = this.scrollerWidth / 3;
			const velocityThreshold = 0.5;

			if (this.isSwiping && (Math.abs(deltaX) > threshold || velocity > velocityThreshold)) {
				if (deltaX > 0 && currentIdx > 0) {
					targetIndex = currentIdx - 1;
				} else if (deltaX < 0 && currentIdx < this.activeRoutes.length - 1) {
					targetIndex = currentIdx + 1;
				}
			}

			// Always animate to target position, even if it's the same as current
			const targetX = targetIndex * this.scrollerWidth;
			this.animateToPosition(targetX, 250, isMobile, targetIndex);

			// Only update route and index if actually navigating
			if (targetIndex !== currentIdx) {
				goto(this.activeRoutes[targetIndex].route);
				this.setCurrentIndex(targetIndex);
			}
		}

		this.isSwiping = false;
		this.isHorizontalGesture = false;
	}

	// === PRIVATE METHODS ===

	private clampIndex(index: number): number {
		if (this.activeRoutes.length === 0) return 0;
		return Math.max(0, Math.min(this.activeRoutes.length - 1, index));
	}

	private setCurrentIndex(index: number) {
		const next = this.clampIndex(index);
		this.currentIndexValue = next;
		this.currentIndex.set(next);
	}

	private hasRenderableState(index: number): boolean {
		const st = this.currentStates[index];
		return !!st && !!st.transform;
	}

	private readCurrentIndexFromUrl(): number {
		if (typeof window === 'undefined') return 0;
		const currentPage = get(page) as { url?: URL } | undefined;
		const pathname = currentPage?.url?.pathname;
		if (!pathname) return this.currentIndexValue;
		const index = this.activeRoutes.findIndex((r) => pathname.startsWith(r.route));
		return this.clampIndex(index < 0 ? 0 : index);
	}

	private getCurrentIndex(): number {
		return this.currentIndexValue;
	}

	private rebuildProgressBars() {
		if (!this.progressContainer) return;
		this.progressContainer.innerHTML = '';
		this.progressBars = [];

		const n = this.activeRoutes.length;
		for (let i = 0; i < n; i++) {
			const bar = document.createElement('div');
			bar.className = 'h-1 bg-white bg-opacity-30 rounded-full will-change-transform progress-bar';
			bar.style.willChange = 'transform, opacity';
			bar.style.backfaceVisibility = 'hidden';
			bar.style.transformOrigin = 'center center';
			bar.style.flexGrow = '1';
			bar.style.flexBasis = '0%';
			bar.style.transform = 'scale3d(1, 1, 1)';
			this.progressContainer.appendChild(bar);
			this.progressBars.push(bar);
		}
	}

	private updateProgressBars(virtualXPosition: number, force: boolean = false) {
		if (!this.progressBars.length) return;
		if (!force && Number.isFinite(this.lastProgressX) && Math.abs(this.lastProgressX - virtualXPosition) < 0.25)
			return;
		this.lastProgressX = virtualXPosition;

		for (let i = 0; i < this.progressBars.length; i++) {
			const r = this.getTransformRatio(i, virtualXPosition);
			const scaleX = 0.75 + r * 0.5;
			const opacity = 0.3 + r * 0.7;
			this.progressBars[i].style.opacity = opacity.toFixed(3);
			this.progressBars[i].style.transform = `scale3d(${scaleX}, ${0.9 + r * 0.1}, 1)`;
		}
	}

	private getFallbackState(index: number, isMobile: boolean, originIndex: number): ItemState {
		const ratio = this.getTransformRatio(index, originIndex * this.scrollerWidth);
		return {
			transform: this.getTransformForItem(index, ratio, isMobile, originIndex),
			opacity: isMobile ? '1' : ratio.toString(),
			zIndex: index === originIndex ? '10' : '0'
		};
	}

	private stopAnimationAtCurrent(index: number) {
		const animation = this.currentAnimations[index];
		if (!animation) return;

		const item = this.items[index];
		if (!item) {
			animation.cancel();
			this.currentAnimations[index] = null;
			return;
		}

		try {
			animation.commitStyles();
		} catch {
			// ignore
		}
		animation.cancel();

		const prev = this.currentStates[index] ?? { transform: '', opacity: '1', zIndex: item.style.zIndex || '0' };
		const nextState: ItemState = {
			transform: item.style.transform || prev.transform,
			opacity: item.style.opacity || prev.opacity,
			zIndex: item.style.zIndex || prev.zIndex || '0'
		};

		item.style.transform = nextState.transform;
		item.style.opacity = nextState.opacity;
		item.style.zIndex = nextState.zIndex;
		this.currentStates[index] = nextState;
		this.currentAnimations[index] = null;
	}

	private animateToPosition(
		virtualXPosition: number,
		duration = 400,
		isMobile: boolean = false,
		targetIndex?: number
	) {
		// Guard: don't animate if items haven't been set yet
		if (!this.isReady) {
			const originIndex = this.getCurrentIndex();
			this.pendingAnimation = {
				targetX: virtualXPosition,
				duration,
				isMobile,
				targetIndex: targetIndex ?? originIndex,
				originIndex
			};
			return;
		}

		this.updateProgressBars(virtualXPosition, true);

		const originIndex = this.getCurrentIndex();
		const destIndex = this.clampIndex(targetIndex ?? originIndex);
		const immediate = duration <= 0;

		// Only apply mobile visibility restrictions when animating
		if (isMobile && duration > 0) {
			const indicesToInclude = new Set([originIndex, destIndex]);
			if (originIndex > 0) indicesToInclude.add(originIndex - 1);
			if (originIndex < this.items.length - 1) indicesToInclude.add(originIndex + 1);
			if (destIndex > 0) indicesToInclude.add(destIndex - 1);
			if (destIndex < this.items.length - 1) indicesToInclude.add(destIndex + 1);
			this.setVisibleIndicesMobile(Array.from(indicesToInclude));
		}

		let pending = 0;
		this.isAnimating = false;

		for (let index = 0; index < this.items.length; index++) {
			const item = this.items[index];
			if (!item) continue;

			if (isMobile && duration > 0 && !this.visibleIndices.has(index)) {
				item.style.display = 'none';
				continue;
			}

			const ratio = this.getTransformRatio(index, virtualXPosition);
			const targetZ = index === destIndex ? '10' : '0';
			const targetTransform = this.getTransformForItem(index, ratio, isMobile, destIndex);
			const targetOpacity = isMobile ? '1' : ratio.toString();

			if (this.currentAnimations[index]) {
				this.stopAnimationAtCurrent(index);
			}

			const currentState =
				this.currentStates[index] ?? this.getFallbackState(index, isMobile, originIndex);
			const currentTransform = currentState.transform || targetTransform;
			const currentOpacity = currentState.opacity || '1';

			const needsAnimation =
				currentTransform !== targetTransform || currentOpacity !== targetOpacity || currentState.zIndex !== targetZ;

			if (!needsAnimation || immediate) {
				item.style.transform = targetTransform;
				item.style.opacity = targetOpacity;
				item.style.zIndex = targetZ;
				this.currentStates[index] = {
					transform: targetTransform,
					opacity: targetOpacity,
					zIndex: targetZ
				};
				this.currentAnimations[index] = null;
				continue;
			}

			pending++;
			const anim = item.animate(
				[
					{ transform: currentTransform === 'none' ? targetTransform : currentTransform, opacity: currentOpacity },
					{ transform: targetTransform, opacity: targetOpacity }
				],
				{
					duration,
					easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
					fill: 'forwards'
				}
			);

			item.style.zIndex = targetZ;
			this.currentAnimations[index] = anim;
			anim.addEventListener(
				'finish',
				() => {
					// Persist final frame as inline styles, then remove WAAPI effect.
					// This is critical so subsequent touch tracking can override transform directly.
					try {
						anim.commitStyles();
					} catch {
						// ignore
					}
					anim.cancel();

					item.style.transform = targetTransform;
					item.style.opacity = targetOpacity;
					item.style.zIndex = targetZ;

					this.currentStates[index] = {
						transform: targetTransform,
						opacity: targetOpacity,
						zIndex: targetZ
					};
					this.currentAnimations[index] = null;
					pending--;
					if (pending === 0) {
						this.isAnimating = false;
						if (isMobile) this.finalizeMobileVisibilityIdle();
					}
				},
				{ once: true }
			);
		}

		if (pending > 0) {
			this.isAnimating = true;
		} else if (isMobile) {
			this.finalizeMobileVisibilityIdle();
		}
	}

	private applyTouchPosition(virtualXPosition: number, isMobile: boolean = false) {
		if (!this.items.length) return;
		this.updateProgressBars(virtualXPosition);

		if (isMobile) {
			this.ensureVisibleForSwipeMobile(virtualXPosition);
		}

		const nearestIndex = Math.round(virtualXPosition / this.scrollerWidth);

		for (let index = 0; index < this.items.length; index++) {
			const item = this.items[index];
			if (!item) continue;

			if (isMobile && !this.visibleIndices.has(index)) {
				item.style.display = 'none';
				continue;
			}

			const transform = this.getTransformForTouchPosition(index, virtualXPosition, isMobile);
			const ratio = this.getTransformRatio(index, virtualXPosition);
			const opacity = isMobile ? '1' : ratio.toString();
			const zIndex = index === nearestIndex ? '10' : '0';

			item.style.zIndex = zIndex;
			item.style.transform = transform;
			item.style.opacity = opacity;

			this.currentStates[index] = { transform, opacity, zIndex };
		}
	}

	private trackTouchPosition(virtualXPosition: number, isMobile: boolean = false) {
		this.pendingTouchX = virtualXPosition;
		this.pendingTouchIsMobile = isMobile;
		this.applyTouchPosition(virtualXPosition, isMobile);
	}

	private flushPendingTouchFrame() {
		this.applyTouchPosition(this.pendingTouchX, this.pendingTouchIsMobile);
	}

	private constrainDeltaX(deltaX: number, currentIdx: number): number {
		let constrainedDeltaX = deltaX;
		const maxDeltaX = currentIdx * this.scrollerWidth;
		const minDeltaX = -(this.activeRoutes.length - 1 - currentIdx) * this.scrollerWidth;

		if (deltaX > maxDeltaX) {
			constrainedDeltaX = maxDeltaX + (deltaX - maxDeltaX) * 0.3;
		} else if (deltaX < minDeltaX) {
			constrainedDeltaX = minDeltaX + (deltaX - minDeltaX) * 0.3;
		}

		return constrainedDeltaX;
	}

	private getTransformRatio(index: number, x: number) {
		const targetPoint = index * this.scrollerWidth;
		const distanceInWidths = Math.abs(x - targetPoint) / this.scrollerWidth;
		return 1 / (distanceInWidths + 1);
	}

	private getTransformForItem(
		index: number,
		ratio: number,
		isMobile: boolean,
		currentIndex: number = this.getCurrentIndex()
	) {
		if (isMobile) {
			return `translate3d(${(index - currentIndex) * this.scrollerWidth}px, 0, 0)`;
		}

		const direction = index - currentIndex;
		return `translate3d(${direction * this.scrollerWidth * 0.5}px, 0, ${ratio * 10}px) rotateY(${(1 - ratio) * direction * 30}deg) scale(${ratio})`;
	}

	private getTransformForTouchPosition(index: number, virtualXPosition: number, isMobile: boolean) {
		if (isMobile) {
			const itemBasePosition = index * this.scrollerWidth;
			const translateX = itemBasePosition - virtualXPosition;
			return `translate3d(${translateX}px, 0, 0)`;
		}

		const ratio = this.getTransformRatio(index, virtualXPosition);
		const currentVirtualIndex = virtualXPosition / this.scrollerWidth;
		const direction = index - currentVirtualIndex;
		return `translate3d(${direction * this.scrollerWidth * 0.5}px, 0, ${ratio * 10}px) rotateY(${(1 - ratio) * direction * 30}deg) scale(${ratio})`;
	}

	cancelAllAnimations() {
		for (let i = 0; i < this.currentAnimations.length; i++) {
			if (this.currentAnimations[i]) {
				this.stopAnimationAtCurrent(i);
			}
		}
		this.currentAnimations = new Array(this.items.length).fill(null);
	}

	// === MOBILE VISIBILITY HELPERS ===

	private sameIndexSet(a: Set<number>, b: Set<number>): boolean {
		if (a.size !== b.size) return false;
		for (const v of a) if (!b.has(v)) return false;
		return true;
	}

	private setVisibleIndicesMobile(visible: number[]) {
		const bounded = visible.filter((i) => i >= 0 && i < this.items.length);
		const nextSet = new Set<number>(bounded);
		if (this.sameIndexSet(this.visibleIndices, nextSet)) return;

		for (const index of nextSet) {
			if (this.visibleIndices.has(index)) continue;
			const item = this.items[index];
			if (!item) continue;
			item.style.display = '';
			const st = this.currentStates[index];
			if (this.hasRenderableState(index) && st) {
				item.style.transform = st.transform;
				item.style.opacity = st.opacity || '1';
				item.style.zIndex = st.zIndex || '0';
			} else {
				item.style.transform = this.getTransformForTouchPosition(index, this.virtualXPosition, true);
				item.style.opacity = '1';
				item.style.zIndex = index === this.currentIndexValue ? '10' : '0';
				this.currentStates[index] = {
					transform: item.style.transform,
					opacity: '1',
					zIndex: item.style.zIndex
				};
			}
		}

		for (const index of this.visibleIndices) {
			if (nextSet.has(index)) continue;
			const item = this.items[index];
			if (!item) continue;
			item.style.display = 'none';
		}

		this.visibleIndices = nextSet;
	}

	private ensureVisibleForSwipeMobile(virtualXPosition: number) {
		const currentIdx = this.currentIndexValue;
		const basePos = currentIdx * this.scrollerWidth;
		let neighbor = currentIdx;

		if (virtualXPosition > basePos && currentIdx < this.items.length - 1) {
			neighbor = currentIdx + 1;
		} else if (virtualXPosition < basePos && currentIdx > 0) {
			neighbor = currentIdx - 1;
		}

		if (neighbor === currentIdx) {
			this.setVisibleIndicesMobile([currentIdx]);
		} else {
			this.setVisibleIndicesMobile([currentIdx, neighbor]);
		}
	}

	private finalizeMobileVisibilityIdle() {
		this.setVisibleIndicesMobile([this.currentIndexValue]);
	}

	// === STATIC UTILS ===

	static getTransformRatio(index: number, currentIndex: number): number {
		const distance = Math.abs(index - currentIndex);
		return 1 / (distance + 1);
	}
}
