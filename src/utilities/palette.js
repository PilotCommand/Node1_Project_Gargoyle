/**
 * Palette - Centralized color definitions for Gargoyle
 * 
 * All game colors are defined here for easy tweaking.
 * Import this file wherever colors are needed.
 * 
 * The palette uses an "Ash Grey" theme:
 * - Bright warm greys for buildings and environment
 * - Dark black-greys for roads, gargoyles, and menacing elements
 * - Gold accents for collectibles
 */

// ============================================
// ASH GREY - Bright, warm greys
// Main surfaces: buildings, ground, player
// ============================================
export const ASH = {
  lightest:   0xD8D8D0,  // Lightest building shade
  light:      0xD0D0C8,  // Player, light surfaces
  medium:     0xB8B8B0,  // Mid-tone surfaces
  dark:       0xA0A098,  // Darker building shade
  darkest:    0x909088,  // Ground plane
};

// ============================================
// DARK GREY - Black-ish, high contrast
// Roads, gargoyles, menacing elements
// ============================================
export const DARK = {
  lightest:   0x606058,  // Grid lines
  light:      0x505048,  // Boundaries
  medium:     0x3A3A38,  // Roads/streets
  dark:       0x2A2A28,  // Gargoyles (menacing)
  darkest:    0x1A1A18,  // Deepest shadows
};

// ============================================
// ATMOSPHERE - Sky, fog, lighting
// Creates depth and mood
// ============================================
export const ATMOSPHERE = {
  sky:        0x707880,  // Background/sky (cool grey)
  fog:        0x888890,  // Fog color (cool ash)
  fogNear:    40,        // Fog start distance
  fogFar:     280,       // Fog end distance
};

// ============================================
// LIGHTING - Scene illumination
// ============================================
export const LIGHTING = {
  ambient:    0x909090,  // Ambient light (bright for ash palette)
  sun:        0xFFFAF0,  // Directional/sun light (warm white)
  hemisphere: {
    sky:      0x808080,  // Hemisphere sky color
    ground:   0x404040,  // Hemisphere ground color
  },
};

// ============================================
// BUILDINGS - Procedural building colors
// ============================================
export const BUILDINGS = {
  minShade:   ASH.dark,      // Darkest building color
  maxShade:   ASH.lightest,  // Lightest building color
  windows:    DARK.light,    // Window color (darker than walls)
  roof:       ASH.dark,      // Roof structures
  ledge:      ASH.medium,    // Building ledges
};

// ============================================
// MAP - Ground and environment
// ============================================
export const MAP = {
  ground:     ASH.darkest,   // Ground plane
  streets:    DARK.medium,   // Roads
  boundaries: DARK.light,    // Map boundary walls
  grid: {
    center:   0x707068,      // Debug grid center line
    lines:    DARK.lightest, // Debug grid lines
  },
};

// ============================================
// PLAYERS - Character colors
// ============================================
export const PLAYERS = {
  target:     ASH.light,     // Human player (friendly, visible)
  gargoyle: {
    normal:   DARK.dark,     // Gargoyle default
    frozen:   DARK.dark,     // When frozen (stone-like)
  },
};

// ============================================
// ACCENTS - Highlights and UI elements
// ============================================
export const ACCENTS = {
  gold:       0xFFDD44,  // Trophy base color
  goldGlow:   0xFFFFAA,  // Trophy glow
  goldBright: 0xFFEE88,  // Highlighted gold
  
  danger:     0xFF4444,  // Warning, damage
  safe:       0x44FF44,  // Success, safe zones
  info:       0x64C8FF,  // Information, UI highlights
  
  white:      0xFFFFFF,  // Pure white
  star:       0xFFFF00,  // Trophy star emissive
};

// ============================================
// DEBUG - Development visualization
// ============================================
export const DEBUG = {
  wireframe:  0x00FF00,  // Physics debug wireframes
  origin:     0xFF0000,  // Origin marker
  surface:    0x00FFFF,  // Ground surface marker
  capsuleTop: 0xFFFF00,  // Capsule top marker
  capsuleBot: 0x0000FF,  // Capsule bottom marker
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate a random ash grey color
 * @returns {number} Hex color between ASH.dark and ASH.lightest
 */
export function randomAshGrey() {
  const min = 0xA0;
  const max = 0xD8;
  const base = Math.floor(Math.random() * (max - min) + min);
  
  // Ash grey is slightly warm: R >= G >= B
  const r = base;
  const g = base;
  const b = base - 8;  // Slightly less blue for warmth
  
  return (r << 16) | (g << 8) | Math.max(0, b);
}

/**
 * Adjust a color's brightness
 * @param {number} color - Base hex color
 * @param {number} amount - Positive = lighter, negative = darker
 * @returns {number} Adjusted hex color
 */
export function adjustBrightness(color, amount) {
  let r = (color >> 16) & 0xFF;
  let g = (color >> 8) & 0xFF;
  let b = color & 0xFF;
  
  r = Math.max(0, Math.min(255, r + amount));
  g = Math.max(0, Math.min(255, g + amount));
  b = Math.max(0, Math.min(255, b + amount));
  
  return (r << 16) | (g << 8) | b;
}

/**
 * Convert hex color to CSS string
 * @param {number} hex - Hex color (e.g., 0xFF0000)
 * @returns {string} CSS color string (e.g., "#FF0000")
 */
export function hexToCSS(hex) {
  return '#' + hex.toString(16).padStart(6, '0');
}

// ============================================
// DEFAULT EXPORT - Full palette object
// ============================================
const PALETTE = {
  ASH,
  DARK,
  ATMOSPHERE,
  LIGHTING,
  BUILDINGS,
  MAP,
  PLAYERS,
  ACCENTS,
  DEBUG,
  // Helper functions
  randomAshGrey,
  adjustBrightness,
  hexToCSS,
};

export default PALETTE;
