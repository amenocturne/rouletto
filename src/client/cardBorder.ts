/**
 * Decorative card border with hover effects.
 * Creates a border of playing cards around the screen edge
 * that react to mouse movement.
 */

import * as PIXI from "pixi.js";
import { loadCardsTexture, createCardSprite, Suit, Rank, getCardDimensions } from "./cards";
import { playCardHoverSound } from "./audio";

// Card border state for hover effects
interface CardState {
	sprite: PIXI.Sprite;
	originalX: number;
	originalY: number;
}

let borderCards: CardState[] = [];
let borderCardsApp: PIXI.Application | null = null;

// Track displaced cards for efficient return-to-origin updates
const displacedCards = new Set<CardState>();

// Track the closest card from previous frame (for sound triggering)
let previousClosestCard: CardState | null = null;

// Spatial hash grid for efficient card lookups
const GRID_CELL_SIZE = 250;

interface GridCell {
	cards: CardState[];
}

const spatialGrid: Map<string, GridCell> = new Map();

/** Helper to get grid key from coordinates */
const getGridKey = (x: number, y: number): string => {
	const cellX = Math.floor(x / GRID_CELL_SIZE);
	const cellY = Math.floor(y / GRID_CELL_SIZE);
	return `${cellX},${cellY}`;
};

/** Get all cells that could contain cards within radius of mouse */
const getNearbyCells = (mouseX: number, mouseY: number, radius: number): readonly string[] => {
	const keys: string[] = [];
	const minCellX = Math.floor((mouseX - radius) / GRID_CELL_SIZE);
	const maxCellX = Math.floor((mouseX + radius) / GRID_CELL_SIZE);
	const minCellY = Math.floor((mouseY - radius) / GRID_CELL_SIZE);
	const maxCellY = Math.floor((mouseY + radius) / GRID_CELL_SIZE);

	for (let cx = minCellX; cx <= maxCellX; cx++) {
		for (let cy = minCellY; cy <= maxCellY; cy++) {
			keys.push(`${cx},${cy}`);
		}
	}
	return keys;
};

/** Generate card positions for border */
const generateBorderCards = (): void => {
	if (!borderCardsApp) return;

	// Clear existing cards and displaced tracking
	borderCardsApp.stage.removeChildren();
	borderCards = [];
	spatialGrid.clear();
	displacedCards.clear();

	const cardDims = getCardDimensions();
	const w = window.innerWidth;
	const h = window.innerHeight;

	// Scale cards based on viewport size - smaller on small screens
	const minDimension = Math.min(w, h);
	const scale = minDimension < 600 ? 0.5 : minDimension < 900 ? 0.7 : 1;

	// All suits and ranks for variety
	const suits = [Suit.HEARTS, Suit.SPADES, Suit.DIAMONDS, Suit.CLUBS];
	const ranks = [
		Rank.TWO,
		Rank.THREE,
		Rank.FOUR,
		Rank.FIVE,
		Rank.SIX,
		Rank.SEVEN,
		Rank.EIGHT,
		Rank.NINE,
		Rank.TEN,
		Rank.JACK,
		Rank.QUEEN,
		Rank.KING,
		Rank.ACE,
	];

	const getRandomCard = () => {
		const suit = suits[Math.floor(Math.random() * suits.length)];
		const rank = ranks[Math.floor(Math.random() * ranks.length)];
		return createCardSprite(suit, rank);
	};

	// Helper to add a card and track its original position
	const addCard = (x: number, y: number, rotation: number): void => {
		const card = getRandomCard();
		card.anchor.set(0.5);
		card.scale.set(scale);
		card.x = x;
		card.y = y;
		card.rotation = rotation;
		borderCardsApp?.stage.addChild(card);

		const cardState = { sprite: card, originalX: x, originalY: y };
		borderCards.push(cardState);

		// Add to spatial grid
		const key = getGridKey(x, y);
		if (!spatialGrid.has(key)) {
			spatialGrid.set(key, { cards: [] });
		}
		spatialGrid.get(key)?.cards.push(cardState);
	};

	// Generate cards along edges - keep them tight to edges
	const cardWidth = cardDims.width * scale;
	const cardHeight = cardDims.height * scale;
	const overlap = 0.5;

	// Top edge - cards peek from top
	for (let x = -cardWidth / 2; x < w + cardWidth / 2; x += cardWidth * overlap) {
		const posX = x + (Math.random() - 0.5) * 30;
		const posY = cardHeight * 0.2 + (Math.random() - 0.5) * 20;
		const rotation = (Math.random() - 0.5) * 0.6;
		addCard(posX, posY, rotation);
	}

	// Bottom edge - cards peek from bottom
	for (let x = -cardWidth / 2; x < w + cardWidth / 2; x += cardWidth * overlap) {
		const posX = x + (Math.random() - 0.5) * 30;
		const posY = h - cardHeight * 0.2 + (Math.random() - 0.5) * 20;
		const rotation = (Math.random() - 0.5) * 0.6;
		addCard(posX, posY, rotation);
	}

	// Left edge - cards peek from left
	for (let y = cardHeight / 2; y < h - cardHeight / 2; y += cardHeight * overlap) {
		const posX = cardWidth * 0.2 + (Math.random() - 0.5) * 20;
		const posY = y + (Math.random() - 0.5) * 30;
		const rotation = (Math.random() - 0.5) * 0.6;
		addCard(posX, posY, rotation);
	}

	// Right edge - cards peek from right
	for (let y = cardHeight / 2; y < h - cardHeight / 2; y += cardHeight * overlap) {
		const posX = w - cardWidth * 0.2 + (Math.random() - 0.5) * 20;
		const posY = y + (Math.random() - 0.5) * 30;
		const rotation = (Math.random() - 0.5) * 0.6;
		addCard(posX, posY, rotation);
	}
};

/** Create scattered card border around the screen */
export const createCardBorder = async (): Promise<void> => {
	borderCardsApp = new PIXI.Application();
	await borderCardsApp.init({
		width: window.innerWidth,
		height: window.innerHeight,
		backgroundAlpha: 0,
	});
	borderCardsApp.canvas.style.position = "fixed";
	borderCardsApp.canvas.style.top = "0";
	borderCardsApp.canvas.style.left = "0";
	borderCardsApp.canvas.style.pointerEvents = "none";
	borderCardsApp.canvas.style.zIndex = "-1";
	document.body.appendChild(borderCardsApp.canvas);

	await loadCardsTexture();

	// Generate initial cards
	generateBorderCards();

	// Stop ticker - we use manual RAF-based rendering for hover effect
	borderCardsApp.ticker.stop();
	borderCardsApp.render();

	// Handle window resize - debounced to avoid excessive regeneration
	let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
	window.addEventListener("resize", () => {
		if (resizeTimeout) {
			clearTimeout(resizeTimeout);
		}
		resizeTimeout = setTimeout(() => {
			if (borderCardsApp) {
				borderCardsApp.renderer.resize(window.innerWidth, window.innerHeight);
				generateBorderCards();
				borderCardsApp.render();
			}
		}, 150);
	});

	// Add hover effect - cards move away from mouse when nearby
	const hoverRadius = 220; // Distance at which cards start reacting
	const maxDisplacement = 25; // Maximum pixels to move

	// RAF-throttled mouse tracking
	let mouseX = 0;
	let mouseY = 0;
	let rafScheduled = false;

	const updateCardPositions = (): void => {
		rafScheduled = false;

		// Get cards from nearby cells only (spatial partitioning optimization)
		const nearbyKeys = getNearbyCells(mouseX, mouseY, hoverRadius + maxDisplacement);
		const nearbyCards = new Set<CardState>();

		for (const key of nearbyKeys) {
			const cell = spatialGrid.get(key);
			if (cell) {
				for (const card of cell.cards) {
					nearbyCards.add(card);
				}
			}
		}

		// Find closest card and update all nearby cards
		let closestCard: CardState | null = null;
		let closestDistance = Number.POSITIVE_INFINITY;

		// Update nearby cards (move away from mouse)
		for (const cardState of nearbyCards) {
			const dx = cardState.originalX - mouseX;
			const dy = cardState.originalY - mouseY;
			const distance = Math.sqrt(dx * dx + dy * dy);

			if (distance < hoverRadius && distance > 0) {
				// Track closest card
				if (distance < closestDistance) {
					closestDistance = distance;
					closestCard = cardState;
				}

				// Calculate displacement - stronger when closer
				const strength = 1 - distance / hoverRadius;
				const displacement = maxDisplacement * strength;

				// Move away from mouse
				const targetX = cardState.originalX + (dx / distance) * displacement;
				const targetY = cardState.originalY + (dy / distance) * displacement;

				// Smooth lerp toward target
				cardState.sprite.x += (targetX - cardState.sprite.x) * 0.3;
				cardState.sprite.y += (targetY - cardState.sprite.y) * 0.3;

				// Track as displaced
				displacedCards.add(cardState);
			} else {
				// Return to original position
				cardState.sprite.x += (cardState.originalX - cardState.sprite.x) * 0.1;
				cardState.sprite.y += (cardState.originalY - cardState.sprite.y) * 0.1;

				// Remove from displaced if settled
				if (
					Math.abs(cardState.sprite.x - cardState.originalX) < 0.5 &&
					Math.abs(cardState.sprite.y - cardState.originalY) < 0.5
				) {
					displacedCards.delete(cardState);
				}
			}
		}

		// Return displaced cards that are no longer near mouse to origin
		for (const cardState of displacedCards) {
			if (!nearbyCards.has(cardState)) {
				cardState.sprite.x += (cardState.originalX - cardState.sprite.x) * 0.1;
				cardState.sprite.y += (cardState.originalY - cardState.sprite.y) * 0.1;

				// Remove from displaced if settled
				if (
					Math.abs(cardState.sprite.x - cardState.originalX) < 0.5 &&
					Math.abs(cardState.sprite.y - cardState.originalY) < 0.5
				) {
					displacedCards.delete(cardState);
				}
			}
		}

		// Play sound only when closest card changes, with volume based on displaced count
		if (closestCard && closestCard !== previousClosestCard) {
			playCardHoverSound(displacedCards.size);
		}
		previousClosestCard = closestCard;

		// Render the updated card positions
		if (borderCardsApp) {
			borderCardsApp.render();
		}
	};

	document.addEventListener("mousemove", (e) => {
		mouseX = e.clientX;
		mouseY = e.clientY;

		if (!rafScheduled) {
			rafScheduled = true;
			requestAnimationFrame(updateCardPositions);
		}
	});
};
