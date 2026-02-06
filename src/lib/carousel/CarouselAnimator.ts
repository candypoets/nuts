import { goto } from '$app/navigation';
import { page } from '$app/stores';
import { get, writable } from 'svelte/store';

export interface FeedConfig {
	route: string;
	id: string;
	label?: string;
}

export class CarouselAnimator {
	private items: HTMLElement[] = [];
	private currentAnimations: Animation[] = [];
	private touchRAF: number | null = null;
	private scrollerWidth: number;
	private currentStates: { transform: string; opacity: string }[] = [];

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

	constructor(scrollerWidth: number = 1080) {
		this.scrollerWidth = scrollerWidth;
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
		// Return to current position
		const currentIdx = this.getCurrentIndex();
		const targetX = currentIdx * this.scrollerWidth;
		this.animateToPosition(targetX, duration, isMobile, currentIdx);
	}

	private animateOverviewLayout(duration: number = 500, isMobile: boolean = false) {
		this.cancelAllAnimations();
		this.updateProgressBars(0);

		// Show all items in overview mode
		this.items.forEach((item, index) => {
			item.style.display = '';
			item.style.zIndex = '1';
		});
		this.visibleIndices = new Set(this.items.map((_, i) => i));

		const count = this.activeRoutes.length;
		const gap = isMobile ? 16 : 32; // gap between items in px
		const scale = isMobile ? 0.28 : 0.35; // scale down for overview

		// Calculate layout - arrange side by side with gaps
		// Center the whole group in the viewport
		const containerWidth = this.scrollerWidth;
		const itemWidth = containerWidth * scale;
		const totalWidth = count * itemWidth + (count - 1) * gap;
		const startX = (containerWidth - totalWidth) / 2;

		this.items.forEach((item, index) => {
			if (this.currentAnimations[index]) {
				const currentState = this.captureCurrentState(index);
				this.currentStates[index] = currentState;
				item.style.transform = currentState.transform;
				item.style.opacity = currentState.opacity;
				this.currentAnimations[index].cancel();
			}

			const currentState = this.currentStates[index] || this.captureCurrentState(index);
			const currentTransform = currentState.transform || '';

			const xPos = startX + index * (itemWidth + gap);
			const centerOffset = (containerWidth - itemWidth) / 2;
			const translateX = xPos - centerOffset;

			const targetTransform = `translateX(${translateX}px) translateY(0) scale(${scale})`;
			const targetOpacity = '1';

			this.currentAnimations[index] = item.animate(
				[
					{
						transform: currentTransform === 'none' ? targetTransform : currentTransform,
						opacity: currentState.opacity || '1'
					},
					{
						transform: targetTransform,
						opacity: targetOpacity
					}
				],
				{
					duration,
					easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
					fill: 'forwards'
				}
			);

			this.currentAnimations[index].addEventListener('finish', () => {
				this.currentStates[index] = {
					transform: targetTransform,
					opacity: targetOpacity
				};
			});
		});
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
		}

		// Adjust current index if needed
		let currentIdx = this.getCurrentIndex();
		if (deletedIndex <= currentIdx && currentIdx > 0) {
			currentIdx--;
		}

		// Update the store
		this.currentIndex.set(currentIdx);

		// Re-animate
		if (wasInOverview) {
			this.animateOverviewLayout(300, isMobile);
		} else {
			// Navigate to adjusted position
			const targetX = currentIdx * this.scrollerWidth;
			this.animateToPosition(targetX, 300, isMobile, currentIdx);
			goto(this.activeRoutes[currentIdx]?.route || '/home');
		}

		return true;
	}

	addRoute(config: FeedConfig, isMobile: boolean = false) {
		this.activeRoutes.push(config);

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
		if (index === this.getCurrentIndex()) return;

		const targetX = index * this.scrollerWidth;
		this.animateToPosition(targetX, duration, isMobile, index);
		goto(this.activeRoutes[index].route);
		this.currentIndex.set(index);
	}

	navigateLeft(duration: number = 400, isMobile: boolean = false) {
		const current = this.getCurrentIndex();
		if (current > 0) {
			this.navigateTo(current - 1, duration, isMobile);
		}
	}

	navigateRight(duration: number = 400, isMobile: boolean = false) {
		const current = this.getCurrentIndex();
		if (current < this.activeRoutes.length - 1) {
			this.navigateTo(current + 1, duration, isMobile);
		}
	}

	// React to external URL changes (browser back/forward, direct navigation)
	syncToUrl(pathname: string, duration: number = 400, isMobile: boolean = false) {
		if (get(this.overviewMode)) {
			// Don't sync while in overview mode
			return;
		}

		const index = this.activeRoutes.findIndex((r) => pathname.startsWith(r.route));
		if (index < 0) return;

		const current = this.getCurrentIndex();
		if (index !== current) {
			const targetX = index * this.scrollerWidth;
			this.animateToPosition(targetX, duration, isMobile, index);
			this.currentIndex.set(index);
		}
	}

	// === SETUP ===

	setItems(items: HTMLElement[]) {
		this.items = items;
		this.items.forEach((item) => {
			item.style.willChange = 'transform, opacity';
			item.style.backfaceVisibility = 'hidden';
		});
		this.cancelAllAnimations();
		this.currentAnimations = new Array(items.length).fill(null);
		this.currentStates = new Array(items.length)
			.fill(null)
			.map(() => ({ transform: '', opacity: '1' }));
		this.rebuildProgressBars();
		this.updateProgressBars(this.getCurrentIndex() * this.scrollerWidth);
	}

	updateScrollerWidth(width: number) {
		this.scrollerWidth = width;
	}

	setProgressContainer(container: HTMLElement) {
		this.progressContainer = container;
		this.rebuildProgressBars();
		this.updateProgressBars(this.getCurrentIndex() * this.scrollerWidth);
	}

	// === TOUCH HANDLING ===

	handleTouchStart(e: TouchEvent) {
		if (get(this.overviewMode)) return; // Disable touch in overview mode

		this.touchStartX = e.touches[0].clientX;
		this.touchStartY = e.touches[0].clientY;
		this.touchStartTime = Date.now();
		this.isSwiping = false;
		this.isHorizontalGesture = false;
		this.cancelAllAnimations();
		this.virtualXPosition = this.getCurrentIndex() * this.scrollerWidth;
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

			const currentIdx = this.getCurrentIndex();
			let constrainedDeltaX = deltaX;
			const maxDeltaX = currentIdx * this.scrollerWidth;
			const minDeltaX = -(this.activeRoutes.length - 1 - currentIdx) * this.scrollerWidth;

			if (deltaX > maxDeltaX) {
				constrainedDeltaX = maxDeltaX + (deltaX - maxDeltaX) * 0.3;
			} else if (deltaX < minDeltaX) {
				constrainedDeltaX = minDeltaX + (deltaX - minDeltaX) * 0.3;
			}

			this.virtualXPosition = currentIdx * this.scrollerWidth - constrainedDeltaX;
			this.trackTouchPosition(this.virtualXPosition, isMobile);
		}
	}

	handleTouchEnd(e: TouchEvent, isMobile: boolean = false) {
		if (!this.items.length || get(this.overviewMode)) return;

		if (this.isHorizontalGesture) {
			const touchEndX = e.changedTouches[0].clientX;
			const deltaX = touchEndX - this.touchStartX;
			const velocity = Math.abs(deltaX) / (Date.now() - this.touchStartTime);

			const currentIdx = this.getCurrentIndex();
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

			this.navigateTo(targetIndex, 250, isMobile);
		}

		this.isSwiping = false;
		this.isHorizontalGesture = false;
	}

	// === PRIVATE METHODS ===

	private getCurrentIndex(): number {
		const pathname = get(page).url.pathname;
		return this.activeRoutes.findIndex((r) => pathname.startsWith(r.route));
	}

	private rebuildProgressBars() {
		if (!this.progressContainer) return;
		this.progressContainer.innerHTML = '';
		this.progressBars = [];

		const n = this.activeRoutes.length;
		for (let i = 0; i < n; i++) {
			const bar = document.createElement('div');
			bar.className = 'h-1 bg-white bg-opacity-30 rounded-full will-change-transform progress-bar';
			bar.style.willChange = 'transform, opacity, flex-grow';
			bar.style.backfaceVisibility = 'hidden';
			bar.style.flexGrow = '1';
			bar.style.flexBasis = '0%';
			this.progressContainer.appendChild(bar);
			this.progressBars.push(bar);
		}
	}

	private updateProgressBars(virtualXPosition: number) {
		if (!this.progressBars.length) return;

		for (let i = 0; i < this.progressBars.length; i++) {
			const r = this.getTransformRatio(i, virtualXPosition);
			const grow = 0.5 + r;
			const opacity = 0.3 + r * 0.7;
			this.progressBars[i].style.flexGrow = `${grow}`;
			this.progressBars[i].style.opacity = opacity.toFixed(3);
			this.progressBars[i].style.transform = `scaleY(${0.9 + r * 0.1})`;
		}
	}

	private animateToPosition(
		virtualXPosition: number,
		duration = 400,
		isMobile: boolean = false,
		targetIndex?: number
	) {
		this.updateProgressBars(virtualXPosition);

		const originIndex = targetIndex !== undefined ? this.getCurrentIndex() : this.getCurrentIndex();
		const destIndex = targetIndex ?? this.getCurrentIndex();

		if (isMobile) {
			const visible = Array.from(new Set([originIndex, destIndex])).filter(
				(i) => i >= 0 && i < this.items.length
			);
			this.setVisibleIndicesMobile(visible);
		}

		let pending = 0;
		this.isAnimating = false;

		this.items.forEach((item, index) => {
			if (isMobile && !this.visibleIndices.has(index)) {
				item.style.display = 'none';
				return;
			}

			const ratio = this.getTransformRatio(index, virtualXPosition);
			item.style.zIndex = index === destIndex ? '10' : '0';

			if (this.currentAnimations[index]) {
				const currentState = this.captureCurrentState(index);
				this.currentStates[index] = currentState;
				item.style.transform = currentState.transform;
				item.style.opacity = currentState.opacity;
				this.currentAnimations[index].cancel();
			}

			const currentState = this.currentStates[index] || this.captureCurrentState(index);
			const currentTransform =
				currentState.transform ||
				this.getTransformForItem(
					index,
					this.getTransformRatio(index, this.getCurrentIndex() * this.scrollerWidth),
					isMobile,
					destIndex
				);
			const currentOpacity = currentState.opacity || '1';
			const targetTransform = this.getTransformForItem(index, ratio, isMobile, destIndex);
			const targetOpacity = isMobile ? '1' : ratio.toString();

			const needsAnimation =
				currentTransform !== targetTransform || currentOpacity !== targetOpacity;

			if (needsAnimation) {
				pending++;
				this.currentAnimations[index] = item.animate(
					[
						{
							transform: currentTransform === 'none' ? targetTransform : currentTransform,
							opacity: currentOpacity
						},
						{
							transform: targetTransform,
							opacity: targetOpacity
						}
					],
					{
						duration,
						easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
						fill: 'forwards'
					}
				);

				this.currentAnimations[index].addEventListener('finish', () => {
					this.currentStates[index] = {
						transform: targetTransform,
						opacity: targetOpacity
					};
					pending--;
					if (pending === 0) {
						this.isAnimating = false;
						if (isMobile) this.finalizeMobileVisibilityIdle();
					}
				});
			} else {
				item.style.transform = targetTransform;
				item.style.opacity = targetOpacity;
				this.currentStates[index] = {
					transform: targetTransform,
					opacity: targetOpacity
				};
			}
		});

		if (pending > 0) {
			this.isAnimating = true;
		} else {
			if (isMobile) this.finalizeMobileVisibilityIdle();
		}
	}

	private trackTouchPosition(virtualXPosition: number, isMobile: boolean = false) {
		if (this.touchRAF) {
			cancelAnimationFrame(this.touchRAF);
		}

		this.touchRAF = requestAnimationFrame(() => {
			this.updateProgressBars(virtualXPosition);

			if (isMobile) {
				this.ensureVisibleForSwipeMobile(virtualXPosition);
			}

			const nearestIndex = Math.round(virtualXPosition / this.scrollerWidth);

			this.items.forEach((item, index) => {
				if (isMobile && !this.visibleIndices.has(index)) {
					item.style.display = 'none';
					return;
				}

				const transform = this.getTransformForTouchPosition(index, virtualXPosition, isMobile);
				const ratio = this.getTransformRatio(index, virtualXPosition);
				const opacity = isMobile ? '1' : ratio.toString();

				item.style.zIndex = index === nearestIndex ? '10' : '0';
				item.style.transform = transform;
				item.style.opacity = opacity;

				this.currentStates[index] = { transform, opacity };
			});
			this.touchRAF = null;
		});
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
			return `translateX(${(index - currentIndex) * 100}vw) translateY(0)`;
		}

		const direction = index - currentIndex;
		return `translateX(${direction * 50}vw) translateY(0)
				translateZ(${ratio * 10}px)
				rotateY(${(1 - ratio) * direction * 30}deg)
				scale(${ratio})`;
	}

	private getTransformForTouchPosition(index: number, virtualXPosition: number, isMobile: boolean) {
		if (isMobile) {
			const itemBasePosition = index * this.scrollerWidth;
			const translateX = itemBasePosition - virtualXPosition;
			return `translateX(${translateX}px) translateY(0)`;
		}

		const ratio = this.getTransformRatio(index, virtualXPosition);
		const currentVirtualIndex = virtualXPosition / this.scrollerWidth;
		const direction = index - currentVirtualIndex;

		return `translateX(${direction * 50}vw) translateY(0)
				translateZ(${ratio * 10}px)
				rotateY(${(1 - ratio) * direction * 30}deg)
				scale(${ratio})`;
	}

	private captureCurrentState(index: number): { transform: string; opacity: string } {
		const item = this.items[index];
		if (!item) return { transform: '', opacity: '1' };

		const computedStyle = window.getComputedStyle(item);
		const currentTransform =
			computedStyle.transform !== 'none' ? computedStyle.transform : item.style.transform || '';
		const currentOpacity = computedStyle.opacity || item.style.opacity || '1';

		return { transform: currentTransform, opacity: currentOpacity };
	}

	cancelAllAnimations() {
		this.currentAnimations.forEach((animation, index) => {
			if (animation) {
				const currentState = this.captureCurrentState(index);
				this.currentStates[index] = currentState;

				const item = this.items[index];
				if (item) {
					item.style.transform = currentState.transform;
					item.style.opacity = currentState.opacity;
				}

				animation.cancel();
			}
		});
		this.currentAnimations = [];

		if (this.touchRAF) {
			cancelAnimationFrame(this.touchRAF);
			this.touchRAF = null;
		}
	}

	// === MOBILE VISIBILITY HELPERS ===

	private setVisibleIndicesMobile(visible: number[]) {
		const bounded = visible.filter((i) => i >= 0 && i < this.items.length);
		const nextSet = new Set<number>(bounded);

		this.items.forEach((item, index) => {
			const shouldBeVisible = nextSet.has(index);
			const isVisible = this.visibleIndices.has(index);

			if (shouldBeVisible && !isVisible) {
				item.style.display = '';
				const st = this.currentStates[index];
				if (st) {
					item.style.transform = st.transform || '';
					item.style.opacity = st.opacity || '1';
				} else {
					item.style.transform = '';
					item.style.opacity = '1';
				}
			} else if (!shouldBeVisible && isVisible) {
				item.style.display = 'none';
			}
		});

		this.visibleIndices = nextSet;
	}

	private ensureVisibleForSwipeMobile(virtualXPosition: number) {
		const currentIdx = this.getCurrentIndex();
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
		this.setVisibleIndicesMobile([this.getCurrentIndex()]);
	}

	// === STATIC UTILS ===

	static getTransformRatio(index: number, currentIndex: number): number {
		const distance = Math.abs(index - currentIndex);
		return 1 / (distance + 1);
	}
}
