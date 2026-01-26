import * as PIXI from "pixi.js";

// Card spritesheet configuration
// Image: 2176x792, 15 columns x 4 rows

const EDGE_BORDER = 24; // Border at edges of image
const GAP = 8; // Gap between cards
const CARD_WIDTH = 132;
const CARD_HEIGHT = 180;

// Suit enum for readability
export const Suit = {
	HEARTS: 0,
	CLUBS: 1,
	DIAMONDS: 2,
	SPADES: 3,
} as const;

export type SuitType = (typeof Suit)[keyof typeof Suit];

// Rank enum (0-12 for 2-10, J, Q, K, A)
export const Rank = {
	TWO: 0,
	THREE: 1,
	FOUR: 2,
	FIVE: 3,
	SIX: 4,
	SEVEN: 5,
	EIGHT: 6,
	NINE: 7,
	TEN: 8,
	JACK: 9,
	QUEEN: 10,
	KING: 11,
	ACE: 12,
} as const;

export type RankType = (typeof Rank)[keyof typeof Rank];

// Special cards (column indices)
// Col 0: colored backs/jokers, Col 14: white/gray backs
export const SpecialCard = {
	BACK_RED: { col: 0, row: 0 },
	BACK_BLUE: { col: 0, row: 1 },
	BACK_WHITE: { col: 14, row: 0 },
	BACK_GRAY: { col: 14, row: 1 },
	JOKER_BLACK: { col: 0, row: 2 },
	JOKER_COLOR: { col: 0, row: 3 },
} as const;

// Cached base texture
let cardsTexture: PIXI.Texture | null = null;

/**
 * Load the cards spritesheet texture
 */
export const loadCardsTexture = async (): Promise<PIXI.Texture> => {
	if (cardsTexture) return cardsTexture;
	cardsTexture = await PIXI.Assets.load("/public/cards.png");
	return cardsTexture;
};

/**
 * Get the frame rectangle for a specific grid position
 */
const getFrameRect = (col: number, row: number): PIXI.Rectangle => {
	const x = EDGE_BORDER + col * (CARD_WIDTH + GAP);
	const y = EDGE_BORDER + row * (CARD_HEIGHT + GAP);
	return new PIXI.Rectangle(x, y, CARD_WIDTH, CARD_HEIGHT);
};

/**
 * Create a texture for a playing card by suit and rank
 */
export const getCardTexture = (suit: SuitType, rank: RankType): PIXI.Texture => {
	if (!cardsTexture) {
		throw new Error("Cards texture not loaded. Call loadCardsTexture() first.");
	}

	// Columns 1-13 are 2 through Ace (rank 0-12 maps to col 1-13)
	const col = rank + 1;
	const row = suit;
	const frame = getFrameRect(col, row);

	// Create sub-texture using Pixi v8 API
	const subTexture = new PIXI.Texture({
		source: cardsTexture.source,
		frame,
	});

	return subTexture;
};

/**
 * Get the full spritesheet texture (for debugging)
 */
export const getFullTexture = (): PIXI.Texture | null => cardsTexture;

/**
 * Create a texture for a special card (backs, jokers)
 */
export const getSpecialCardTexture = (
	card: (typeof SpecialCard)[keyof typeof SpecialCard],
): PIXI.Texture => {
	if (!cardsTexture) {
		throw new Error("Cards texture not loaded. Call loadCardsTexture() first.");
	}

	return new PIXI.Texture({
		source: cardsTexture.source,
		frame: getFrameRect(card.col, card.row),
	});
};

/**
 * Create a sprite for a playing card
 */
export const createCardSprite = (suit: SuitType, rank: RankType): PIXI.Sprite => {
	const texture = getCardTexture(suit, rank);
	return new PIXI.Sprite(texture);
};

/**
 * Create a sprite for a special card
 */
export const createSpecialCardSprite = (
	card: (typeof SpecialCard)[keyof typeof SpecialCard],
): PIXI.Sprite => {
	const texture = getSpecialCardTexture(card);
	return new PIXI.Sprite(texture);
};

/**
 * Get card dimensions for layout calculations
 */
export const getCardDimensions = (): { width: number; height: number } => ({
	width: CARD_WIDTH,
	height: CARD_HEIGHT,
});
