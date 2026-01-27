/**
 * Wheel rendering and animation for the casino wheel.
 * Uses Pixi.js for canvas-based rendering with glow effects.
 */

import * as PIXI from "pixi.js";
import { GlowFilter } from "pixi-filters";
import type { Candidate } from "../shared/types";

// Pixi.js wheel state
let pixiApp: PIXI.Application | null = null;
let wheelContainer: PIXI.Container | null = null;
let wheelGlowFilter: GlowFilter | null = null;
let glowTickerCallback: (() => void) | null = null;
let isSpinning = false;

// Spin animation constants
const SPIN_DURATION = 5000; // 5 seconds
const EXTRA_ROTATIONS = 4; // Number of full rotations before landing

// Segment colors for the wheel - vibrant casino-style colors
const SEGMENT_COLORS = [
	0xdc143c, // crimson red
	0x1e90ff, // dodger blue
	0x32cd32, // lime green
	0x9400d3, // dark violet
	0xff8c00, // dark orange
	0x00ced1, // dark turquoise
	0xff1493, // deep pink
	0xffd700, // gold
];

/** Get the Pixi application instance */
export const getPixiApp = (): PIXI.Application | null => pixiApp;

/** Get the wheel container */
export const getWheelContainer = (): PIXI.Container | null => wheelContainer;

/** Get the wheel glow filter */
export const getWheelGlowFilter = (): GlowFilter | null => wheelGlowFilter;

/** Check if wheel is currently spinning */
export const isWheelSpinning = (): boolean => isSpinning;

/** Get the glow ticker callback (for cleanup) */
export const getGlowTickerCallback = (): (() => void) | null => glowTickerCallback;

/** Clear the glow ticker callback reference */
export const clearGlowTickerCallback = (): void => {
	glowTickerCallback = null;
};

const getSegmentColor = (index: number): number => {
	return SEGMENT_COLORS[index % SEGMENT_COLORS.length];
};

// Easing function for smooth deceleration
const easeOutCubic = (t: number): number => {
	return 1 - (1 - t) ** 3;
};

/** Draw pointer (fixed at top, doesn't rotate) - leather flapper style */
const drawPointer = (): void => {
	if (!pixiApp) return;

	const centerX = 300;

	// Mounting bracket (brass)
	const bracket = new PIXI.Graphics();
	bracket.rect(centerX - 14, 0, 28, 24);
	bracket.fill({ color: 0xdaa520 }); // goldenrod (brass)
	bracket.stroke({ color: 0xffd700, width: 2 });
	pixiApp.stage.addChild(bracket);

	// Main pointer body (leather flapper triangle)
	const pointer = new PIXI.Graphics();
	pointer.moveTo(centerX, 20);
	pointer.lineTo(centerX - 20, 60);
	pointer.lineTo(centerX + 20, 60);
	pointer.closePath();
	pointer.fill({ color: 0x8b0000 }); // dark red (leather)
	pointer.stroke({ color: 0xffd700, width: 2 }); // gold outline
	pixiApp.stage.addChild(pointer);
};

/** Draw the wheel with candidate segments - casino style */
export const drawWheel = (candidates: readonly Candidate[]): void => {
	if (!wheelContainer || !pixiApp) return;

	// Clear previous wheel
	wheelContainer.removeChildren();

	if (candidates.length === 0) return;

	const radius = 270;
	const segmentAngle = (2 * Math.PI) / candidates.length;

	// Draw outer wooden rim (dark brown with texture effect)
	const outerRim = new PIXI.Graphics();
	outerRim.circle(0, 0, radius + 20);
	outerRim.fill({ color: 0x4a3728 }); // dark wood brown
	outerRim.circle(0, 0, radius + 15);
	outerRim.stroke({ color: 0xffd700, width: 3 }); // gold inner edge
	wheelContainer.addChild(outerRim);

	// Draw segments
	for (let i = 0; i < candidates.length; i++) {
		const candidate = candidates[i];
		const startAngle = i * segmentAngle - Math.PI / 2; // Start from top
		const endAngle = startAngle + segmentAngle;

		// Segment fill
		const segment = new PIXI.Graphics();
		segment.moveTo(0, 0);
		segment.arc(0, 0, radius, startAngle, endAngle);
		segment.lineTo(0, 0);
		segment.fill({ color: getSegmentColor(i) });

		// Segment border
		segment.moveTo(0, 0);
		segment.arc(0, 0, radius, startAngle, endAngle);
		segment.lineTo(0, 0);
		segment.stroke({ color: 0xffffff, width: 2 });
		wheelContainer.addChild(segment);

		// Add peg/divider at segment edge (the little bumps that make clicking sounds)
		const pegAngle = startAngle;
		const pegX = Math.cos(pegAngle) * (radius - 5);
		const pegY = Math.sin(pegAngle) * (radius - 5);
		const peg = new PIXI.Graphics();
		peg.circle(pegX, pegY, 4);
		peg.fill({ color: 0xffd700 }); // gold peg
		peg.stroke({ color: 0x000000, width: 1 });
		wheelContainer.addChild(peg);

		// Player name text - radiating outward from center
		const midAngle = startAngle + segmentAngle / 2;
		const textStartRadius = radius * 0.25; // Start near center
		const text = new PIXI.Text({
			text: candidate.name.slice(0, 12), // Truncate long names
			style: {
				fontFamily: "Arial Black, Arial",
				fontSize: 22,
				fill: 0xffffff,
				fontWeight: "bold",
				stroke: { color: 0x000000, width: 3 },
			},
		});
		// Anchor at left-center so text starts from this point and goes right
		text.anchor.set(0, 0.5);
		text.x = Math.cos(midAngle) * textStartRadius;
		text.y = Math.sin(midAngle) * textStartRadius;
		// Rotate to point outward from center
		text.rotation = midAngle;
		wheelContainer.addChild(text);
	}

	// Ornate center hub
	// Outer ring (wood)
	const hubOuter = new PIXI.Graphics();
	hubOuter.circle(0, 0, 35);
	hubOuter.fill({ color: 0x4a3728 }); // wood
	hubOuter.stroke({ color: 0xffd700, width: 3 });
	wheelContainer.addChild(hubOuter);

	// Inner brass cone effect
	const hubInner = new PIXI.Graphics();
	hubInner.circle(0, 0, 25);
	hubInner.fill({ color: 0xdaa520 }); // goldenrod
	hubInner.stroke({ color: 0xffd700, width: 2 });
	wheelContainer.addChild(hubInner);

	// Center jewel (ruby red)
	const centerJewel = new PIXI.Graphics();
	centerJewel.circle(0, 0, 10);
	centerJewel.fill({ color: 0xff0000 }); // ruby red
	centerJewel.stroke({ color: 0xffd700, width: 2 });
	wheelContainer.addChild(centerJewel);
};

/** Initialize Pixi.js application */
export const initPixi = async (): Promise<void> => {
	const container = document.getElementById("wheel-container");
	if (!container || pixiApp) return;

	pixiApp = new PIXI.Application();
	await pixiApp.init({
		width: 600,
		height: 600,
		backgroundAlpha: 0,
		antialias: true,
	});

	container.appendChild(pixiApp.canvas);

	// Create wheel container centered
	wheelContainer = new PIXI.Container();
	wheelContainer.x = 300;
	wheelContainer.y = 300;
	pixiApp.stage.addChild(wheelContainer);

	// Add glow filter to wheel container (disabled initially for performance)
	wheelGlowFilter = new GlowFilter({
		distance: 15,
		outerStrength: 1.5,
		innerStrength: 0.5,
		color: 0x00ff88,
		quality: 0.3,
	});
	// Only enable glow during spin/result - filter runs every frame and is expensive
	wheelContainer.filters = [];

	// Draw pointer/arrow at top (fixed, doesn't rotate)
	drawPointer();

	// Stop ticker when wheel is static - only start during spin/glow animation
	pixiApp.ticker.stop();
	// Render once to show initial state
	pixiApp.render();
};

/** Pulse glow effect on winner reveal */
const pulseWinnerGlow = (): void => {
	if (!wheelGlowFilter || !pixiApp) return;

	// Remove previous callback if exists (prevents accumulation)
	if (glowTickerCallback) {
		pixiApp.ticker.remove(glowTickerCallback);
	}

	let intensity = 1.5;
	let increasing = true;

	glowTickerCallback = (): void => {
		if (!wheelGlowFilter) return;

		if (increasing) {
			intensity += 0.05;
			if (intensity >= 4) increasing = false;
		} else {
			intensity -= 0.05;
			if (intensity <= 1.5) increasing = true;
		}

		wheelGlowFilter.outerStrength = intensity;
	};

	pixiApp.ticker.add(glowTickerCallback);
};

/** Spin the wheel to land on the winner */
export const spinWheel = (
	winnerId: string,
	candidates: readonly Candidate[],
): void => {
	if (!wheelContainer || isSpinning) return;
	isSpinning = true;

	// Enable glow filter and start ticker during spin
	if (wheelGlowFilter) {
		wheelContainer.filters = [wheelGlowFilter];
	}
	if (pixiApp) {
		pixiApp.ticker.start();
	}

	const winnerIndex = candidates.findIndex((c) => c.id === winnerId);
	if (winnerIndex === -1) {
		isSpinning = false;
		return;
	}

	// Calculate target angle to land on winner's segment
	// Segments start at -PI/2 (top), pointer is at top
	const segmentAngle = (2 * Math.PI) / candidates.length;

	// Add small random offset within segment so it doesn't always land dead center
	// +/-30% of segment width
	const randomOffset = (Math.random() - 0.5) * segmentAngle * 0.6;

	// Winner's segment center is at: winnerIndex * segmentAngle + segmentAngle/2
	const winnerSegmentCenter = winnerIndex * segmentAngle + segmentAngle / 2 + randomOffset;

	// The wheel needs to rotate so the winner segment aligns with the pointer at top
	// If winner is at angle theta from top, we need to rotate by (2pi - theta) to bring it to top
	const targetAngle = 2 * Math.PI - winnerSegmentCenter;

	// Calculate rotation needed from current position to reach target
	const startRotation = wheelContainer.rotation;
	let rotationToTarget = targetAngle - (startRotation % (2 * Math.PI));
	if (rotationToTarget < 0) rotationToTarget += 2 * Math.PI;
	const totalRotation = EXTRA_ROTATIONS * 2 * Math.PI + rotationToTarget;
	const startTime = performance.now();
	const container = wheelContainer; // Capture reference for closure

	const animate = (currentTime: number): void => {
		const elapsed = currentTime - startTime;
		const progress = Math.min(elapsed / SPIN_DURATION, 1);
		const easedProgress = easeOutCubic(progress);

		container.rotation = startRotation + totalRotation * easedProgress;

		if (progress < 1) {
			requestAnimationFrame(animate);
		} else {
			// Animation complete - wheel landed on winner
			isSpinning = false;
			console.log("Spin complete, winner:", winnerId);
			pulseWinnerGlow();
		}
	};

	requestAnimationFrame(animate);
};

/** Reset wheel state (for cleanup when navigating away) */
export const resetWheelState = (): void => {
	if (glowTickerCallback && pixiApp) {
		pixiApp.ticker.remove(glowTickerCallback);
	}
	if (pixiApp) {
		pixiApp.destroy(true, { children: true, texture: true });
	}
	pixiApp = null;
	wheelContainer = null;
	wheelGlowFilter = null;
	glowTickerCallback = null;
	isSpinning = false;
};

/** Cleanup glow effects for waiting phase */
export const disableGlowEffects = (): void => {
	if (!wheelGlowFilter || !pixiApp || !wheelContainer) return;

	if (glowTickerCallback) {
		pixiApp.ticker.remove(glowTickerCallback);
		glowTickerCallback = null;
	}
	wheelGlowFilter.outerStrength = 1.5;
	// Disable glow filter when not needed (expensive shader)
	wheelContainer.filters = [];
	// Stop ticker when wheel is static
	pixiApp.ticker.stop();
	pixiApp.render();
};

/** Manually trigger a render (for when ticker is stopped) */
export const renderWheel = (): void => {
	if (pixiApp && !pixiApp.ticker.started) {
		pixiApp.render();
	}
};
