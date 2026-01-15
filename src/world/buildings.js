/**
 * Buildings - Hollow buildings with doors and windows
 * 
 * Uses direct geometry construction (not runtime CSG) to create
 * hollow buildings that players can enter.
 * 
 * MULTI-PASS PLACEMENT: Prioritizes grander (larger) buildings first.
 * Grand/Large buildings are hollow with interiors.
 * Medium/Small buildings remain solid boxes.
 */

import * as THREE from 'three';
import meshRegistry, { MeshCategory } from '../registries/meshregistry.js';
import physicsMeshers from '../physics/physicsmeshers.js';
import { BUILDINGS, randomAshGrey } from '../utilities/palette.js';

// ============================================
// CONFIGURATION
// ============================================

const BUILDINGS_CONFIG = {
  // Tile height (world units per tile of height)
  tileHeight: 4,
  
  // Placement
  maxBuildingsPerIsland: 35,
  minGapBetweenBuildings: 1,
  
  // Visual
  roughness: 0.9,
  metalness: 0.1,
  
  // Hollow building parameters
  hollow: {
    wallThickness: 0.5,      // Thickness of walls in world units
    floorThickness: 0.3,     // Thickness of floor
    ceilingThickness: 0.3,   // Thickness of ceiling
    
    // Door configuration
    door: {
      width: 3,              // Door width in world units
      height: 4,             // Door height in world units
      offsetFromCenter: 0,   // How far from wall center (0 = centered)
    },
    
    // Window configuration
    window: {
      width: 2,              // Window width
      height: 2,             // Window height
      sillHeight: 2.5,       // Height of bottom of window from floor
      spacing: 6,            // Minimum spacing between windows
      minWallWidth: 8,       // Minimum wall width to have windows
    },
  },
  
  // Multi-pass size tiers
  sizeTiers: [
    {
      name: 'grand',
      width:  { min: 7, max: 12 },
      depth:  { min: 7, max: 12 },
      height: { min: 8, max: 14 },
      maxPerIsland: 5,
      placementAttempts: 25,
      hollow: true,          // Grand buildings are hollow
    },
    {
      name: 'large',
      width:  { min: 5, max: 8 },
      depth:  { min: 5, max: 8 },
      height: { min: 6, max: 10 },
      maxPerIsland: 8,
      placementAttempts: 20,
      hollow: true,          // Large buildings are hollow
    },
    {
      name: 'medium',
      width:  { min: 3, max: 5 },
      depth:  { min: 3, max: 5 },
      height: { min: 4, max: 7 },
      maxPerIsland: 12,
      placementAttempts: 15,
      hollow: false,         // Medium buildings are solid
    },
    {
      name: 'small',
      width:  { min: 2, max: 3 },
      depth:  { min: 2, max: 3 },
      height: { min: 2, max: 4 },
      maxPerIsland: 20,
      placementAttempts: 10,
      hollow: false,         // Small buildings are solid
    },
  ],
};

// ============================================
// HOLLOW BUILDING GEOMETRY GENERATOR
// ============================================

class HollowBuildingGenerator {
  constructor() {
    // Temporary arrays for building geometry
    this.vertices = [];
    this.normals = [];
    this.uvs = [];
    this.indices = [];
    this.vertexCount = 0;
  }
  
  /**
   * Reset the generator for a new building
   */
  reset() {
    this.vertices = [];
    this.normals = [];
    this.uvs = [];
    this.indices = [];
    this.vertexCount = 0;
  }
  
  /**
   * Generate a hollow building geometry
   * @param {number} width - Building width (X axis)
   * @param {number} depth - Building depth (Z axis)  
   * @param {number} height - Building height (Y axis)
   * @param {object} config - Hollow building configuration
   * @returns {THREE.BufferGeometry}
   */
  generate(width, depth, height, config) {
    this.reset();
    
    const wall = config.wallThickness;
    const floor = config.floorThickness;
    const ceiling = config.ceilingThickness;
    const doorConfig = config.door;
    const windowConfig = config.window;
    
    // Inner dimensions
    const innerWidth = width - wall * 2;
    const innerDepth = depth - wall * 2;
    const innerHeight = height - floor - ceiling;
    
    // Half dimensions for centering (building centered at origin)
    const hw = width / 2;
    const hd = depth / 2;
    
    // Door wall is -Z (front)
    const doorWall = 'front';
    
    // ========================================
    // FLOOR
    // ========================================
    // Exterior bottom
    this.addQuad(
      { x: -hw, y: 0, z: -hd },
      { x: hw, y: 0, z: -hd },
      { x: hw, y: 0, z: hd },
      { x: -hw, y: 0, z: hd },
      { x: 0, y: -1, z: 0 }  // Normal pointing down
    );
    
    // Interior floor (top of floor slab)
    this.addQuad(
      { x: -hw + wall, y: floor, z: -hd + wall },
      { x: -hw + wall, y: floor, z: hd - wall },
      { x: hw - wall, y: floor, z: hd - wall },
      { x: hw - wall, y: floor, z: -hd + wall },
      { x: 0, y: 1, z: 0 }  // Normal pointing up
    );
    
    // ========================================
    // CEILING
    // ========================================
    // Exterior top
    this.addQuad(
      { x: -hw, y: height, z: -hd },
      { x: -hw, y: height, z: hd },
      { x: hw, y: height, z: hd },
      { x: hw, y: height, z: -hd },
      { x: 0, y: 1, z: 0 }
    );
    
    // Interior ceiling (bottom of ceiling slab)
    this.addQuad(
      { x: -hw + wall, y: height - ceiling, z: -hd + wall },
      { x: hw - wall, y: height - ceiling, z: -hd + wall },
      { x: hw - wall, y: height - ceiling, z: hd - wall },
      { x: -hw + wall, y: height - ceiling, z: hd - wall },
      { x: 0, y: -1, z: 0 }
    );
    
    // ========================================
    // WALLS - Each wall has exterior, interior, and top edge
    // ========================================
    
    // FRONT WALL (-Z) - Has door
    this.addWallWithDoor(
      -hw, hw,           // X range
      0, height,         // Y range (full height for exterior)
      -hd,               // Z position
      'front',
      wall, floor, height - ceiling,
      doorConfig,
      windowConfig
    );
    
    // BACK WALL (+Z) - Windows only
    this.addWallWithWindows(
      -hw, hw,
      0, height,
      hd,
      'back',
      wall, floor, height - ceiling,
      windowConfig
    );
    
    // LEFT WALL (-X) - Windows only
    this.addWallWithWindows(
      -hd, hd,           // Z range (using depth)
      0, height,
      -hw,
      'left',
      wall, floor, height - ceiling,
      windowConfig
    );
    
    // RIGHT WALL (+X) - Windows only
    this.addWallWithWindows(
      -hd, hd,
      0, height,
      hw,
      'right',
      wall, floor, height - ceiling,
      windowConfig
    );
    
    // ========================================
    // BUILD GEOMETRY
    // ========================================
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setIndex(this.indices);
    
    geometry.computeBoundingBox();
    
    return geometry;
  }
  
  /**
   * Add a wall with a door opening
   */
  addWallWithDoor(xMin, xMax, yMin, yMax, z, side, wallThickness, floorHeight, interiorHeight, doorConfig, windowConfig) {
    const wallWidth = xMax - xMin;
    const doorWidth = doorConfig.width;
    const doorHeight = doorConfig.height;
    
    // Door position (centered on wall)
    const doorLeft = -doorWidth / 2 + doorConfig.offsetFromCenter;
    const doorRight = doorWidth / 2 + doorConfig.offsetFromCenter;
    const doorTop = floorHeight + doorHeight;
    
    // Normal directions based on side
    const extNormal = { x: 0, y: 0, z: -1 };  // Exterior faces outward
    const intNormal = { x: 0, y: 0, z: 1 };   // Interior faces inward
    
    const zExt = z;
    const zInt = z + wallThickness;
    
    // ---- EXTERIOR WALL (3 sections around door) ----
    
    // Section above door (full width)
    if (doorTop < yMax) {
      this.addQuad(
        { x: xMin, y: doorTop, z: zExt },
        { x: xMax, y: doorTop, z: zExt },
        { x: xMax, y: yMax, z: zExt },
        { x: xMin, y: yMax, z: zExt },
        extNormal
      );
    }
    
    // Section left of door
    if (doorLeft > xMin) {
      this.addQuad(
        { x: xMin, y: yMin, z: zExt },
        { x: doorLeft, y: yMin, z: zExt },
        { x: doorLeft, y: doorTop, z: zExt },
        { x: xMin, y: doorTop, z: zExt },
        extNormal
      );
    }
    
    // Section right of door
    if (doorRight < xMax) {
      this.addQuad(
        { x: doorRight, y: yMin, z: zExt },
        { x: xMax, y: yMin, z: zExt },
        { x: xMax, y: doorTop, z: zExt },
        { x: doorRight, y: doorTop, z: zExt },
        extNormal
      );
    }
    
    // ---- INTERIOR WALL (3 sections around door) ----
    
    // Section above door
    if (doorTop < floorHeight + interiorHeight) {
      this.addQuad(
        { x: xMin + wallThickness, y: doorTop, z: zInt },
        { x: xMin + wallThickness, y: floorHeight + interiorHeight, z: zInt },
        { x: xMax - wallThickness, y: floorHeight + interiorHeight, z: zInt },
        { x: xMax - wallThickness, y: doorTop, z: zInt },
        intNormal
      );
    }
    
    // Section left of door
    if (doorLeft > xMin + wallThickness) {
      this.addQuad(
        { x: xMin + wallThickness, y: floorHeight, z: zInt },
        { x: xMin + wallThickness, y: doorTop, z: zInt },
        { x: doorLeft, y: doorTop, z: zInt },
        { x: doorLeft, y: floorHeight, z: zInt },
        intNormal
      );
    }
    
    // Section right of door
    if (doorRight < xMax - wallThickness) {
      this.addQuad(
        { x: doorRight, y: floorHeight, z: zInt },
        { x: doorRight, y: doorTop, z: zInt },
        { x: xMax - wallThickness, y: doorTop, z: zInt },
        { x: xMax - wallThickness, y: floorHeight, z: zInt },
        intNormal
      );
    }
    
    // ---- DOOR OPENING THICKNESS (jambs and header) ----
    
    // Left jamb (side of door opening)
    this.addQuad(
      { x: doorLeft, y: floorHeight, z: zExt },
      { x: doorLeft, y: floorHeight, z: zInt },
      { x: doorLeft, y: doorTop, z: zInt },
      { x: doorLeft, y: doorTop, z: zExt },
      { x: -1, y: 0, z: 0 }
    );
    
    // Right jamb
    this.addQuad(
      { x: doorRight, y: floorHeight, z: zExt },
      { x: doorRight, y: doorTop, z: zExt },
      { x: doorRight, y: doorTop, z: zInt },
      { x: doorRight, y: floorHeight, z: zInt },
      { x: 1, y: 0, z: 0 }
    );
    
    // Header (top of door opening)
    this.addQuad(
      { x: doorLeft, y: doorTop, z: zExt },
      { x: doorLeft, y: doorTop, z: zInt },
      { x: doorRight, y: doorTop, z: zInt },
      { x: doorRight, y: doorTop, z: zExt },
      { x: 0, y: -1, z: 0 }
    );
    
    // ---- WALL TOP EDGE ----
    this.addQuad(
      { x: xMin, y: yMax, z: zExt },
      { x: xMax, y: yMax, z: zExt },
      { x: xMax - wallThickness, y: yMax, z: zInt },
      { x: xMin + wallThickness, y: yMax, z: zInt },
      { x: 0, y: 1, z: 0 }
    );
    
    // ---- WALL SIDE EDGES (connect exterior to interior at corners) ----
    // Left edge
    this.addQuad(
      { x: xMin, y: yMin, z: zExt },
      { x: xMin, y: yMax, z: zExt },
      { x: xMin + wallThickness, y: floorHeight + interiorHeight, z: zInt },
      { x: xMin + wallThickness, y: floorHeight, z: zInt },
      { x: -1, y: 0, z: 0 }
    );
    
    // Right edge
    this.addQuad(
      { x: xMax, y: yMin, z: zExt },
      { x: xMax - wallThickness, y: floorHeight, z: zInt },
      { x: xMax - wallThickness, y: floorHeight + interiorHeight, z: zInt },
      { x: xMax, y: yMax, z: zExt },
      { x: 1, y: 0, z: 0 }
    );
    
    // Add windows to sections if wall is wide enough
    this.addWindowsToWallSection(xMin, doorLeft, floorHeight, interiorHeight, zExt, zInt, wallThickness, windowConfig, extNormal, intNormal, 'front');
    this.addWindowsToWallSection(doorRight, xMax, floorHeight, interiorHeight, zExt, zInt, wallThickness, windowConfig, extNormal, intNormal, 'front');
  }
  
  /**
   * Add a wall with only windows (no door)
   */
  addWallWithWindows(rangeMin, rangeMax, yMin, yMax, pos, side, wallThickness, floorHeight, interiorHeight, windowConfig) {
    const isXWall = (side === 'front' || side === 'back');
    
    let extNormal, intNormal;
    let extPos, intPos;
    
    switch (side) {
      case 'front':
        extNormal = { x: 0, y: 0, z: -1 };
        intNormal = { x: 0, y: 0, z: 1 };
        extPos = pos;
        intPos = pos + wallThickness;
        break;
      case 'back':
        extNormal = { x: 0, y: 0, z: 1 };
        intNormal = { x: 0, y: 0, z: -1 };
        extPos = pos;
        intPos = pos - wallThickness;
        break;
      case 'left':
        extNormal = { x: -1, y: 0, z: 0 };
        intNormal = { x: 1, y: 0, z: 0 };
        extPos = pos;
        intPos = pos + wallThickness;
        break;
      case 'right':
        extNormal = { x: 1, y: 0, z: 0 };
        intNormal = { x: -1, y: 0, z: 0 };
        extPos = pos;
        intPos = pos - wallThickness;
        break;
    }
    
    const wallLength = rangeMax - rangeMin;
    
    // Calculate window positions
    const windows = this.calculateWindowPositions(rangeMin + wallThickness, rangeMax - wallThickness, wallLength - wallThickness * 2, floorHeight, interiorHeight, windowConfig);
    
    if (windows.length === 0) {
      // No windows - simple solid wall
      this.addSolidWall(rangeMin, rangeMax, yMin, yMax, extPos, intPos, side, wallThickness, floorHeight, interiorHeight, extNormal, intNormal);
    } else {
      // Wall with windows
      this.addWallWithWindowCutouts(rangeMin, rangeMax, yMin, yMax, extPos, intPos, side, wallThickness, floorHeight, interiorHeight, extNormal, intNormal, windows);
    }
  }
  
  /**
   * Add a solid wall (no openings)
   */
  addSolidWall(rangeMin, rangeMax, yMin, yMax, extPos, intPos, side, wallThickness, floorHeight, interiorHeight, extNormal, intNormal) {
    const isXWall = (side === 'front' || side === 'back');
    
    if (isXWall) {
      // Exterior
      this.addQuad(
        { x: rangeMin, y: yMin, z: extPos },
        { x: rangeMax, y: yMin, z: extPos },
        { x: rangeMax, y: yMax, z: extPos },
        { x: rangeMin, y: yMax, z: extPos },
        extNormal
      );
      
      // Interior
      this.addQuad(
        { x: rangeMin + wallThickness, y: floorHeight, z: intPos },
        { x: rangeMin + wallThickness, y: floorHeight + interiorHeight, z: intPos },
        { x: rangeMax - wallThickness, y: floorHeight + interiorHeight, z: intPos },
        { x: rangeMax - wallThickness, y: floorHeight, z: intPos },
        intNormal
      );
      
      // Top edge
      const topY = yMax;
      if (side === 'back') {
        this.addQuad(
          { x: rangeMin, y: topY, z: extPos },
          { x: rangeMin + wallThickness, y: topY, z: intPos },
          { x: rangeMax - wallThickness, y: topY, z: intPos },
          { x: rangeMax, y: topY, z: extPos },
          { x: 0, y: 1, z: 0 }
        );
      } else {
        this.addQuad(
          { x: rangeMin, y: topY, z: extPos },
          { x: rangeMax, y: topY, z: extPos },
          { x: rangeMax - wallThickness, y: topY, z: intPos },
          { x: rangeMin + wallThickness, y: topY, z: intPos },
          { x: 0, y: 1, z: 0 }
        );
      }
    } else {
      // Z-aligned walls (left/right)
      // Exterior
      this.addQuad(
        { x: extPos, y: yMin, z: rangeMin },
        { x: extPos, y: yMax, z: rangeMin },
        { x: extPos, y: yMax, z: rangeMax },
        { x: extPos, y: yMin, z: rangeMax },
        extNormal
      );
      
      // Interior  
      this.addQuad(
        { x: intPos, y: floorHeight, z: rangeMin + wallThickness },
        { x: intPos, y: floorHeight, z: rangeMax - wallThickness },
        { x: intPos, y: floorHeight + interiorHeight, z: rangeMax - wallThickness },
        { x: intPos, y: floorHeight + interiorHeight, z: rangeMin + wallThickness },
        intNormal
      );
      
      // Top edge
      const topY = yMax;
      if (side === 'right') {
        this.addQuad(
          { x: extPos, y: topY, z: rangeMin },
          { x: intPos, y: topY, z: rangeMin + wallThickness },
          { x: intPos, y: topY, z: rangeMax - wallThickness },
          { x: extPos, y: topY, z: rangeMax },
          { x: 0, y: 1, z: 0 }
        );
      } else {
        this.addQuad(
          { x: extPos, y: topY, z: rangeMin },
          { x: extPos, y: topY, z: rangeMax },
          { x: intPos, y: topY, z: rangeMax - wallThickness },
          { x: intPos, y: topY, z: rangeMin + wallThickness },
          { x: 0, y: 1, z: 0 }
        );
      }
    }
  }
  
  /**
   * Add wall with window cutouts
   */
  addWallWithWindowCutouts(rangeMin, rangeMax, yMin, yMax, extPos, intPos, side, wallThickness, floorHeight, interiorHeight, extNormal, intNormal, windows) {
    const isXWall = (side === 'front' || side === 'back');
    
    // For simplicity, we'll create the wall in horizontal strips:
    // 1. Bottom strip (below windows)
    // 2. Window row (with gaps)
    // 3. Top strip (above windows)
    
    if (windows.length === 0) {
      this.addSolidWall(rangeMin, rangeMax, yMin, yMax, extPos, intPos, side, wallThickness, floorHeight, interiorHeight, extNormal, intNormal);
      return;
    }
    
    // Use first window's dimensions for strip calculations
    const winBottom = windows[0].bottom;
    const winTop = windows[0].top;
    
    if (isXWall) {
      // ---- EXTERIOR ----
      // Bottom strip
      this.addQuad(
        { x: rangeMin, y: yMin, z: extPos },
        { x: rangeMax, y: yMin, z: extPos },
        { x: rangeMax, y: winBottom, z: extPos },
        { x: rangeMin, y: winBottom, z: extPos },
        extNormal
      );
      
      // Top strip
      this.addQuad(
        { x: rangeMin, y: winTop, z: extPos },
        { x: rangeMax, y: winTop, z: extPos },
        { x: rangeMax, y: yMax, z: extPos },
        { x: rangeMin, y: yMax, z: extPos },
        extNormal
      );
      
      // Window row sections
      let prevX = rangeMin;
      for (const win of windows) {
        // Section before this window
        if (win.left > prevX) {
          this.addQuad(
            { x: prevX, y: winBottom, z: extPos },
            { x: win.left, y: winBottom, z: extPos },
            { x: win.left, y: winTop, z: extPos },
            { x: prevX, y: winTop, z: extPos },
            extNormal
          );
        }
        prevX = win.right;
        
        // Window opening thickness faces
        this.addWindowThickness(win, extPos, intPos, side, wallThickness);
      }
      // Section after last window
      if (prevX < rangeMax) {
        this.addQuad(
          { x: prevX, y: winBottom, z: extPos },
          { x: rangeMax, y: winBottom, z: extPos },
          { x: rangeMax, y: winTop, z: extPos },
          { x: prevX, y: winTop, z: extPos },
          extNormal
        );
      }
      
      // ---- INTERIOR ----
      const intRangeMin = rangeMin + wallThickness;
      const intRangeMax = rangeMax - wallThickness;
      const intYMin = floorHeight;
      const intYMax = floorHeight + interiorHeight;
      
      // Bottom strip
      if (winBottom > intYMin) {
        this.addQuad(
          { x: intRangeMin, y: intYMin, z: intPos },
          { x: intRangeMin, y: winBottom, z: intPos },
          { x: intRangeMax, y: winBottom, z: intPos },
          { x: intRangeMax, y: intYMin, z: intPos },
          intNormal
        );
      }
      
      // Top strip
      if (winTop < intYMax) {
        this.addQuad(
          { x: intRangeMin, y: winTop, z: intPos },
          { x: intRangeMin, y: intYMax, z: intPos },
          { x: intRangeMax, y: intYMax, z: intPos },
          { x: intRangeMax, y: winTop, z: intPos },
          intNormal
        );
      }
      
      // Window row sections (interior)
      prevX = intRangeMin;
      for (const win of windows) {
        if (win.left > prevX) {
          this.addQuad(
            { x: prevX, y: winBottom, z: intPos },
            { x: prevX, y: winTop, z: intPos },
            { x: win.left, y: winTop, z: intPos },
            { x: win.left, y: winBottom, z: intPos },
            intNormal
          );
        }
        prevX = win.right;
      }
      if (prevX < intRangeMax) {
        this.addQuad(
          { x: prevX, y: winBottom, z: intPos },
          { x: prevX, y: winTop, z: intPos },
          { x: intRangeMax, y: winTop, z: intPos },
          { x: intRangeMax, y: winBottom, z: intPos },
          intNormal
        );
      }
      
      // Top edge of wall
      const topY = yMax;
      if (side === 'back') {
        this.addQuad(
          { x: rangeMin, y: topY, z: extPos },
          { x: intRangeMin, y: topY, z: intPos },
          { x: intRangeMax, y: topY, z: intPos },
          { x: rangeMax, y: topY, z: extPos },
          { x: 0, y: 1, z: 0 }
        );
      } else {
        this.addQuad(
          { x: rangeMin, y: topY, z: extPos },
          { x: rangeMax, y: topY, z: extPos },
          { x: intRangeMax, y: topY, z: intPos },
          { x: intRangeMin, y: topY, z: intPos },
          { x: 0, y: 1, z: 0 }
        );
      }
      
    } else {
      // Z-aligned walls (left/right) - similar logic but swapped axes
      // Bottom strip
      this.addQuad(
        { x: extPos, y: yMin, z: rangeMin },
        { x: extPos, y: winBottom, z: rangeMin },
        { x: extPos, y: winBottom, z: rangeMax },
        { x: extPos, y: yMin, z: rangeMax },
        extNormal
      );
      
      // Top strip
      this.addQuad(
        { x: extPos, y: winTop, z: rangeMin },
        { x: extPos, y: yMax, z: rangeMin },
        { x: extPos, y: yMax, z: rangeMax },
        { x: extPos, y: winTop, z: rangeMax },
        extNormal
      );
      
      // Window row sections
      let prevZ = rangeMin;
      for (const win of windows) {
        if (win.left > prevZ) {
          this.addQuad(
            { x: extPos, y: winBottom, z: prevZ },
            { x: extPos, y: winTop, z: prevZ },
            { x: extPos, y: winTop, z: win.left },
            { x: extPos, y: winBottom, z: win.left },
            extNormal
          );
        }
        prevZ = win.right;
        
        // Window thickness
        this.addWindowThicknessZ(win, extPos, intPos, side, wallThickness);
      }
      if (prevZ < rangeMax) {
        this.addQuad(
          { x: extPos, y: winBottom, z: prevZ },
          { x: extPos, y: winTop, z: prevZ },
          { x: extPos, y: winTop, z: rangeMax },
          { x: extPos, y: winBottom, z: rangeMax },
          extNormal
        );
      }
      
      // Interior
      const intRangeMin = rangeMin + wallThickness;
      const intRangeMax = rangeMax - wallThickness;
      const intYMin = floorHeight;
      const intYMax = floorHeight + interiorHeight;
      
      // Interior bottom strip
      if (winBottom > intYMin) {
        this.addQuad(
          { x: intPos, y: intYMin, z: intRangeMin },
          { x: intPos, y: intYMin, z: intRangeMax },
          { x: intPos, y: winBottom, z: intRangeMax },
          { x: intPos, y: winBottom, z: intRangeMin },
          intNormal
        );
      }
      
      // Interior top strip
      if (winTop < intYMax) {
        this.addQuad(
          { x: intPos, y: winTop, z: intRangeMin },
          { x: intPos, y: winTop, z: intRangeMax },
          { x: intPos, y: intYMax, z: intRangeMax },
          { x: intPos, y: intYMax, z: intRangeMin },
          intNormal
        );
      }
      
      // Interior window row
      prevZ = intRangeMin;
      for (const win of windows) {
        if (win.left > prevZ) {
          this.addQuad(
            { x: intPos, y: winBottom, z: prevZ },
            { x: intPos, y: winBottom, z: win.left },
            { x: intPos, y: winTop, z: win.left },
            { x: intPos, y: winTop, z: prevZ },
            intNormal
          );
        }
        prevZ = win.right;
      }
      if (prevZ < intRangeMax) {
        this.addQuad(
          { x: intPos, y: winBottom, z: prevZ },
          { x: intPos, y: winBottom, z: intRangeMax },
          { x: intPos, y: winTop, z: intRangeMax },
          { x: intPos, y: winTop, z: prevZ },
          intNormal
        );
      }
      
      // Top edge
      const topY = yMax;
      if (side === 'right') {
        this.addQuad(
          { x: extPos, y: topY, z: rangeMin },
          { x: intPos, y: topY, z: intRangeMin },
          { x: intPos, y: topY, z: intRangeMax },
          { x: extPos, y: topY, z: rangeMax },
          { x: 0, y: 1, z: 0 }
        );
      } else {
        this.addQuad(
          { x: extPos, y: topY, z: rangeMin },
          { x: extPos, y: topY, z: rangeMax },
          { x: intPos, y: topY, z: intRangeMax },
          { x: intPos, y: topY, z: intRangeMin },
          { x: 0, y: 1, z: 0 }
        );
      }
    }
  }
  
  /**
   * Add window thickness faces (X-aligned walls)
   */
  addWindowThickness(win, extZ, intZ, side, wallThickness) {
    // Left sill
    this.addQuad(
      { x: win.left, y: win.bottom, z: extZ },
      { x: win.left, y: win.top, z: extZ },
      { x: win.left, y: win.top, z: intZ },
      { x: win.left, y: win.bottom, z: intZ },
      { x: -1, y: 0, z: 0 }
    );
    
    // Right sill
    this.addQuad(
      { x: win.right, y: win.bottom, z: extZ },
      { x: win.right, y: win.bottom, z: intZ },
      { x: win.right, y: win.top, z: intZ },
      { x: win.right, y: win.top, z: extZ },
      { x: 1, y: 0, z: 0 }
    );
    
    // Top sill
    this.addQuad(
      { x: win.left, y: win.top, z: extZ },
      { x: win.right, y: win.top, z: extZ },
      { x: win.right, y: win.top, z: intZ },
      { x: win.left, y: win.top, z: intZ },
      { x: 0, y: 1, z: 0 }
    );
    
    // Bottom sill
    this.addQuad(
      { x: win.left, y: win.bottom, z: extZ },
      { x: win.left, y: win.bottom, z: intZ },
      { x: win.right, y: win.bottom, z: intZ },
      { x: win.right, y: win.bottom, z: extZ },
      { x: 0, y: -1, z: 0 }
    );
  }
  
  /**
   * Add window thickness faces (Z-aligned walls)
   */
  addWindowThicknessZ(win, extX, intX, side, wallThickness) {
    const sign = (side === 'right') ? 1 : -1;
    
    // Front sill (toward +Z)
    this.addQuad(
      { x: extX, y: win.bottom, z: win.left },
      { x: intX, y: win.bottom, z: win.left },
      { x: intX, y: win.top, z: win.left },
      { x: extX, y: win.top, z: win.left },
      { x: 0, y: 0, z: -1 }
    );
    
    // Back sill
    this.addQuad(
      { x: extX, y: win.bottom, z: win.right },
      { x: extX, y: win.top, z: win.right },
      { x: intX, y: win.top, z: win.right },
      { x: intX, y: win.bottom, z: win.right },
      { x: 0, y: 0, z: 1 }
    );
    
    // Top sill
    this.addQuad(
      { x: extX, y: win.top, z: win.left },
      { x: intX, y: win.top, z: win.left },
      { x: intX, y: win.top, z: win.right },
      { x: extX, y: win.top, z: win.right },
      { x: 0, y: 1, z: 0 }
    );
    
    // Bottom sill
    this.addQuad(
      { x: extX, y: win.bottom, z: win.left },
      { x: extX, y: win.bottom, z: win.right },
      { x: intX, y: win.bottom, z: win.right },
      { x: intX, y: win.bottom, z: win.left },
      { x: 0, y: -1, z: 0 }
    );
  }
  
  /**
   * Calculate window positions for a wall section
   */
  calculateWindowPositions(rangeMin, rangeMax, wallLength, floorHeight, interiorHeight, config) {
    const windows = [];
    
    if (wallLength < config.minWallWidth) {
      return windows;
    }
    
    const winWidth = config.width;
    const winHeight = config.height;
    const sillHeight = config.sillHeight;
    const spacing = config.spacing;
    
    // Check if window fits vertically
    if (sillHeight + winHeight > floorHeight + interiorHeight) {
      return windows;
    }
    
    // Calculate how many windows fit
    const availableWidth = wallLength - spacing;  // Margin on each end
    const windowPlusSpace = winWidth + spacing;
    const numWindows = Math.floor(availableWidth / windowPlusSpace);
    
    if (numWindows <= 0) {
      return windows;
    }
    
    // Center the window group
    const totalWindowsWidth = numWindows * winWidth + (numWindows - 1) * spacing;
    const startOffset = (wallLength - totalWindowsWidth) / 2;
    
    for (let i = 0; i < numWindows; i++) {
      const winLeft = rangeMin + startOffset + i * (winWidth + spacing);
      windows.push({
        left: winLeft,
        right: winLeft + winWidth,
        bottom: floorHeight + sillHeight,
        top: floorHeight + sillHeight + winHeight,
      });
    }
    
    return windows;
  }
  
  /**
   * Add windows to a wall section (for door wall sides)
   */
  addWindowsToWallSection(xMin, xMax, floorHeight, interiorHeight, zExt, zInt, wallThickness, windowConfig, extNormal, intNormal, side) {
    const sectionWidth = xMax - xMin - wallThickness * 2;
    if (sectionWidth < windowConfig.minWallWidth) return;
    
    const windows = this.calculateWindowPositions(
      xMin + wallThickness, 
      xMax - wallThickness, 
      sectionWidth, 
      floorHeight, 
      interiorHeight, 
      windowConfig
    );
    
    // Window thickness faces only (wall sections are already drawn)
    for (const win of windows) {
      this.addWindowThickness(win, zExt, zInt, side, wallThickness);
    }
  }
  
  /**
   * Add a quad (4 vertices, 2 triangles)
   */
  addQuad(v0, v1, v2, v3, normal) {
    const startIndex = this.vertexCount;
    
    // Vertices
    this.vertices.push(v0.x, v0.y, v0.z);
    this.vertices.push(v1.x, v1.y, v1.z);
    this.vertices.push(v2.x, v2.y, v2.z);
    this.vertices.push(v3.x, v3.y, v3.z);
    
    // Normals (same for all 4 vertices)
    for (let i = 0; i < 4; i++) {
      this.normals.push(normal.x, normal.y, normal.z);
    }
    
    // UVs
    this.uvs.push(0, 0);
    this.uvs.push(1, 0);
    this.uvs.push(1, 1);
    this.uvs.push(0, 1);
    
    // Indices (two triangles, CCW winding)
    this.indices.push(startIndex, startIndex + 1, startIndex + 2);
    this.indices.push(startIndex, startIndex + 2, startIndex + 3);
    
    this.vertexCount += 4;
  }
}

// ============================================
// BUILDINGS CLASS
// ============================================

class Buildings {
  constructor() {
    this.scene = null;
    this.buildings = [];
    
    // Grid references
    this.grid = null;
    this.gridSize = 0;
    this.cellSize = 0;
    this.halfGrid = 0;
    
    // Track occupied cells
    this.occupiedCells = new Set();
    
    // Road cells reference
    this.roadCells = null;
    
    // Random seed
    this.randomSeed = Date.now();
    
    // Hollow building generator
    this.hollowGenerator = new HollowBuildingGenerator();
    
    // Stats
    this.stats = {
      totalBuildings: 0,
      totalCells: 0,
      byTier: {},
      hollowBuildings: 0,
      solidBuildings: 0,
    };
  }
  
  /**
   * Initialize with scene reference
   */
  init(scene) {
    this.scene = scene;
    console.log('Buildings system initialized (hollow buildings enabled)');
  }
  
  /**
   * Generate buildings on islands
   */
  generate(grid, islands, roadCells, config = {}) {
    this.clear();
    
    this.grid = grid;
    this.gridSize = grid.length;
    this.cellSize = config.cellSize || 4;
    this.halfGrid = this.gridSize / 2;
    this.roadCells = roadCells || new Set();
    this.randomSeed = Date.now();
    
    // Initialize tier stats
    for (const tier of BUILDINGS_CONFIG.sizeTiers) {
      this.stats.byTier[tier.name] = 0;
    }
    
    console.log(`Buildings: Generating on ${islands.length} islands...`);
    
    for (const island of islands) {
      this.generateIslandBuildingsMultiPass(island);
    }
    
    this.stats.totalCells = this.occupiedCells.size;
    
    console.log(`Buildings: Created ${this.stats.totalBuildings} buildings`);
    console.log(`  - Hollow: ${this.stats.hollowBuildings}`);
    console.log(`  - Solid: ${this.stats.solidBuildings}`);
    for (const tier of BUILDINGS_CONFIG.sizeTiers) {
      console.log(`  - ${tier.name}: ${this.stats.byTier[tier.name]}`);
    }
    
    return this.stats;
  }
  
  /**
   * Generate buildings using multi-pass algorithm
   */
  generateIslandBuildingsMultiPass(island) {
    const cells = island.cells;
    if (cells.length < 20) return;
    
    let totalBuildingsPlaced = 0;
    const tierResults = [];
    
    for (const tier of BUILDINGS_CONFIG.sizeTiers) {
      if (totalBuildingsPlaced >= BUILDINGS_CONFIG.maxBuildingsPerIsland) break;
      
      const availableCells = this.getAvailableCells(island);
      if (availableCells.length === 0) break;
      
      const remainingSlots = BUILDINGS_CONFIG.maxBuildingsPerIsland - totalBuildingsPlaced;
      const maxForTier = Math.min(tier.maxPerIsland, remainingSlots);
      
      let tierBuildingsPlaced = 0;
      
      for (let i = 0; i < maxForTier; i++) {
        const building = this.tryPlaceTieredBuilding(tier, island);
        if (building) {
          tierBuildingsPlaced++;
          totalBuildingsPlaced++;
          this.stats.byTier[tier.name]++;
        }
      }
      
      tierResults.push(`${tier.name}:${tierBuildingsPlaced}`);
    }
    
    console.log(`Island ${island.index}: ${totalBuildingsPlaced} buildings [${tierResults.join(', ')}]`);
  }
  
  /**
   * Try to place a building of a specific tier
   */
  tryPlaceTieredBuilding(tier, island) {
    const availableCells = this.getAvailableCells(island);
    if (availableCells.length === 0) return null;
    
    this.shuffleArray(availableCells);
    
    const attemptsToMake = Math.min(tier.placementAttempts, availableCells.length);
    
    for (let attempt = 0; attempt < attemptsToMake; attempt++) {
      const startCell = availableCells[attempt];
      
      if (this.isCellOccupied(startCell.x, startCell.z)) continue;
      
      const widthTiles = this.randomInt(tier.width.min, tier.width.max);
      const depthTiles = this.randomInt(tier.depth.min, tier.depth.max);
      const heightTiles = this.randomInt(tier.height.min, tier.height.max);
      
      const footprint = this.getFootprintCells(startCell.x, startCell.z, widthTiles, depthTiles);
      
      if (this.canPlaceFootprint(footprint, island.index)) {
        return this.placeBuilding(startCell.x, startCell.z, widthTiles, depthTiles, heightTiles, footprint, tier);
      }
      
      const shrunkBuilding = this.tryPlaceShrunkBuilding(startCell.x, startCell.z, tier, island);
      if (shrunkBuilding) {
        return shrunkBuilding;
      }
    }
    
    return null;
  }
  
  /**
   * Try to place a smaller building within tier range
   */
  tryPlaceShrunkBuilding(startX, startZ, tier, island) {
    for (let w = tier.width.max - 1; w >= tier.width.min; w--) {
      for (let d = tier.depth.max - 1; d >= tier.depth.min; d--) {
        const footprint = this.getFootprintCells(startX, startZ, w, d);
        
        if (this.canPlaceFootprint(footprint, island.index)) {
          const heightTiles = this.randomInt(tier.height.min, tier.height.max);
          return this.placeBuilding(startX, startZ, w, d, heightTiles, footprint, tier);
        }
      }
    }
    
    return null;
  }
  
  /**
   * Place a building (hollow or solid based on tier)
   */
  placeBuilding(startX, startZ, widthTiles, depthTiles, heightTiles, footprint, tier) {
    this.markCellsOccupied(footprint);
    
    const worldWidth = widthTiles * this.cellSize;
    const worldDepth = depthTiles * this.cellSize;
    const worldHeight = heightTiles * BUILDINGS_CONFIG.tileHeight;
    
    const centerX = startX + widthTiles / 2;
    const centerZ = startZ + depthTiles / 2;
    
    const worldX = (centerX - this.halfGrid) * this.cellSize;
    const worldZ = (centerZ - this.halfGrid) * this.cellSize;
    
    let geometry;
    let isHollow = false;
    
    // Create hollow or solid geometry based on tier
    if (tier.hollow && worldWidth >= 8 && worldDepth >= 8) {
      geometry = this.hollowGenerator.generate(worldWidth, worldDepth, worldHeight, BUILDINGS_CONFIG.hollow);
      isHollow = true;
      this.stats.hollowBuildings++;
    } else {
      geometry = new THREE.BoxGeometry(worldWidth, worldHeight, worldDepth);
      this.stats.solidBuildings++;
    }
    
    const material = new THREE.MeshStandardMaterial({
      color: randomAshGrey(),
      roughness: BUILDINGS_CONFIG.roughness,
      metalness: BUILDINGS_CONFIG.metalness,
      side: isHollow ? THREE.DoubleSide : THREE.FrontSide,
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    
    if (isHollow) {
      // Hollow buildings are generated centered at origin, move to world position
      mesh.position.set(worldX, 0, worldZ);
    } else {
      // Solid buildings need Y offset
      mesh.position.set(worldX, worldHeight / 2, worldZ);
    }
    
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `building_${this.stats.totalBuildings}_${tier.name}${isHollow ? '_hollow' : ''}`;
    
    this.scene.add(mesh);
    
    // Register with mesh registry
    const id = meshRegistry.register(mesh, MeshCategory.BUILDING, {
      name: mesh.name,
      needsPhysics: true,
      isStatic: true,
      metadata: {
        gridX: startX,
        gridZ: startZ,
        widthTiles,
        depthTiles,
        heightTiles,
        tier: tier.name,
        hollow: isHollow,
      },
    });
    
    // Create physics - use trimesh for hollow buildings, box for solid
    let physics;
    if (isHollow) {
      physics = physicsMeshers.createTrimeshCollider(mesh, {
        friction: 0.5,
        restitution: 0.0,
      });
    } else {
      physics = physicsMeshers.createBoxCollider(mesh, {
        isStatic: true,
        friction: 0.5,
        restitution: 0.0,
      });
    }
    
    if (physics) {
      meshRegistry.linkPhysicsBody(id, physics.body, physics.colliders);
    }
    
    const building = {
      id,
      mesh,
      gridX: startX,
      gridZ: startZ,
      widthTiles,
      depthTiles,
      heightTiles,
      footprint,
      tier: tier.name,
      hollow: isHollow,
    };
    
    this.buildings.push(building);
    this.stats.totalBuildings++;
    
    return building;
  }
  
  // ============================================
  // Cell Management
  // ============================================
  
  getAvailableCells(island) {
    const available = [];
    
    for (const cell of island.cells) {
      const key = `${cell.x},${cell.z}`;
      if (this.roadCells.has(key)) continue;
      if (this.occupiedCells.has(key)) continue;
      available.push({ x: cell.x, z: cell.z });
    }
    
    return available;
  }
  
  getFootprintCells(startX, startZ, widthTiles, depthTiles) {
    const cells = [];
    for (let dx = 0; dx < widthTiles; dx++) {
      for (let dz = 0; dz < depthTiles; dz++) {
        cells.push({ x: startX + dx, z: startZ + dz });
      }
    }
    return cells;
  }
  
  canPlaceFootprint(footprint, islandIndex) {
    const gap = BUILDINGS_CONFIG.minGapBetweenBuildings;
    
    for (const cell of footprint) {
      if (cell.x < 0 || cell.x >= this.gridSize) return false;
      if (cell.z < 0 || cell.z >= this.gridSize) return false;
      if (this.grid[cell.x][cell.z] !== islandIndex) return false;
      if (this.roadCells.has(`${cell.x},${cell.z}`)) return false;
      
      for (let gx = -gap; gx <= gap; gx++) {
        for (let gz = -gap; gz <= gap; gz++) {
          if (this.isCellOccupied(cell.x + gx, cell.z + gz)) return false;
        }
      }
    }
    
    return true;
  }
  
  isCellOccupied(x, z) {
    return this.occupiedCells.has(`${x},${z}`);
  }
  
  markCellsOccupied(cells) {
    for (const cell of cells) {
      this.occupiedCells.add(`${cell.x},${cell.z}`);
    }
  }
  
  // ============================================
  // Utility Methods
  // ============================================
  
  random() {
    this.randomSeed = (this.randomSeed * 9301 + 49297) % 233280;
    return this.randomSeed / 233280;
  }
  
  randomInt(min, max) {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }
  
  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.randomInt(0, i);
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
  
  // ============================================
  // Accessors
  // ============================================
  
  getMeshes() {
    return this.buildings.map(b => b.mesh);
  }
  
  getObstacles() {
    return this.getMeshes();
  }
  
  getHollowBuildings() {
    return this.buildings.filter(b => b.hollow);
  }
  
  getSolidBuildings() {
    return this.buildings.filter(b => !b.hollow);
  }
  
  // ============================================
  // Cleanup
  // ============================================
  
  clear() {
    for (const building of this.buildings) {
      this.scene.remove(building.mesh);
      building.mesh.geometry?.dispose();
      building.mesh.material?.dispose();
      
      if (building.id) {
        meshRegistry.unregister(building.id);
      }
    }
    
    this.buildings = [];
    this.occupiedCells.clear();
    this.stats = { 
      totalBuildings: 0, 
      totalCells: 0, 
      byTier: {},
      hollowBuildings: 0,
      solidBuildings: 0,
    };
  }
  
  getStats() {
    return { ...this.stats };
  }
  
  getDebugInfo() {
    return {
      buildings: this.buildings.length,
      hollow: this.stats.hollowBuildings,
      solid: this.stats.solidBuildings,
      occupiedCells: this.occupiedCells.size,
      byTier: this.stats.byTier,
    };
  }
}

// Export singleton
const buildings = new Buildings();
export default buildings;
export { Buildings, BUILDINGS_CONFIG, HollowBuildingGenerator };