/**
 * Buildings - Simple rectangular prism buildings on grid tiles
 * 
 * Places buildings on island tiles that are not roads.
 * All dimensions are in tile units and snap to the grid.
 */

import * as THREE from 'three';
import meshRegistry, { MeshCategory } from '../registries/meshregistry.js';
import physicsMeshers from '../physics/physicsmeshers.js';
import { BUILDINGS, randomAshGrey } from '../utilities/palette.js';

// Configuration - all dimensions in TILES
const BUILDINGS_CONFIG = {
  // Building size ranges (in tiles)
  width:  { min: 2, max: 8 },   // X dimension in tiles
  depth:  { min: 2, max: 8 },   // Z dimension in tiles
  height: { min: 2, max: 8 },   // Y dimension in tiles
  
  // Tile height (world units per tile of height)
  tileHeight: 4,
  
  // Placement
  maxBuildingsPerIsland: 0,
  minGapBetweenBuildings: 1,   // Minimum tiles between buildings
  
  // Visual
  roughness: 0.9,
  metalness: 0.1,
};

class Buildings {
  constructor() {
    this.scene = null;
    this.buildings = [];
    
    // Grid references
    this.grid = null;
    this.gridSize = 0;
    this.cellSize = 0;
    this.halfGrid = 0;
    
    // Track occupied cells: Set of "x,z" strings
    this.occupiedCells = new Set();
    
    // Road cells reference
    this.roadCells = null;
    
    // Random seed
    this.randomSeed = Date.now();
    
    // Stats
    this.stats = {
      totalBuildings: 0,
      totalCells: 0,
    };
  }
  
  /**
   * Initialize with scene reference
   * @param {THREE.Scene} scene
   */
  init(scene) {
    this.scene = scene;
    console.log('Buildings system initialized');
  }
  
  /**
   * Generate buildings on islands
   * @param {number[][]} grid - Island grid from islands.js
   * @param {Array} islands - Island data from islands.js
   * @param {Set} roadCells - Road cells from paths.js
   * @param {object} config - Grid configuration
   */
  generate(grid, islands, roadCells, config = {}) {
    this.clear();
    
    this.grid = grid;
    this.gridSize = grid.length;
    this.cellSize = config.cellSize || 4;
    this.halfGrid = this.gridSize / 2;
    this.roadCells = roadCells || new Set();
    this.randomSeed = Date.now();
    
    console.log(`Buildings: Generating on ${islands.length} islands...`);
    
    // Generate buildings for each island
    for (const island of islands) {
      this.generateIslandBuildings(island);
    }
    
    this.stats.totalCells = this.occupiedCells.size;
    console.log(`Buildings: Created ${this.stats.totalBuildings} buildings using ${this.stats.totalCells} cells`);
    
    return this.stats;
  }
  
  /**
   * Generate buildings for a single island
   * @param {object} island
   */
  generateIslandBuildings(island) {
    const cells = island.cells;
    if (cells.length < 20) return; // Too small
    
    // Get available cells (island cells that are not roads)
    const availableCells = this.getAvailableCells(island);
    if (availableCells.length === 0) return;
    
    // Shuffle available cells for random placement
    this.shuffleArray(availableCells);
    
    let buildingsPlaced = 0;
    let cellIndex = 0;
    
    while (buildingsPlaced < BUILDINGS_CONFIG.maxBuildingsPerIsland && cellIndex < availableCells.length) {
      const startCell = availableCells[cellIndex];
      cellIndex++;
      
      // Skip if this cell is now occupied
      if (this.isCellOccupied(startCell.x, startCell.z)) continue;
      
      // Try to place a building starting at this cell
      const building = this.tryPlaceBuilding(startCell.x, startCell.z, island);
      if (building) {
        buildingsPlaced++;
      }
    }
    
    console.log(`Island ${island.index}: ${buildingsPlaced} buildings`);
  }
  
  /**
   * Get cells available for building (island cells minus roads)
   * @param {object} island
   * @returns {Array}
   */
  getAvailableCells(island) {
    const available = [];
    
    for (const cell of island.cells) {
      const key = `${cell.x},${cell.z}`;
      
      // Skip road cells
      if (this.roadCells.has(key)) continue;
      
      // Skip already occupied
      if (this.occupiedCells.has(key)) continue;
      
      available.push({ x: cell.x, z: cell.z });
    }
    
    return available;
  }
  
  /**
   * Try to place a building at the given grid position
   * @param {number} startX - Grid X
   * @param {number} startZ - Grid Z
   * @param {object} island
   * @returns {object|null} Building data or null
   */
  tryPlaceBuilding(startX, startZ, island) {
    // Random dimensions in tiles
    const widthTiles = this.randomInt(BUILDINGS_CONFIG.width.min, BUILDINGS_CONFIG.width.max);
    const depthTiles = this.randomInt(BUILDINGS_CONFIG.depth.min, BUILDINGS_CONFIG.depth.max);
    const heightTiles = this.randomInt(BUILDINGS_CONFIG.height.min, BUILDINGS_CONFIG.height.max);
    
    // Check if all cells for this building are available
    const footprint = this.getFootprintCells(startX, startZ, widthTiles, depthTiles);
    
    if (!this.canPlaceFootprint(footprint, island.index)) {
      // Try smaller sizes
      return this.tryPlaceSmallerBuilding(startX, startZ, island);
    }
    
    // Place the building
    return this.placeBuilding(startX, startZ, widthTiles, depthTiles, heightTiles, footprint);
  }
  
  /**
   * Try to place a smaller building if the random size doesn't fit
   * @param {number} startX
   * @param {number} startZ
   * @param {object} island
   * @returns {object|null}
   */
  tryPlaceSmallerBuilding(startX, startZ, island) {
    // Try minimum size
    const minWidth = BUILDINGS_CONFIG.width.min;
    const minDepth = BUILDINGS_CONFIG.depth.min;
    
    const footprint = this.getFootprintCells(startX, startZ, minWidth, minDepth);
    
    if (!this.canPlaceFootprint(footprint, island.index)) {
      return null; // Can't even fit minimum size
    }
    
    const heightTiles = this.randomInt(BUILDINGS_CONFIG.height.min, BUILDINGS_CONFIG.height.max);
    return this.placeBuilding(startX, startZ, minWidth, minDepth, heightTiles, footprint);
  }
  
  /**
   * Get all cells that would be occupied by a building footprint
   * @param {number} startX - Starting grid X
   * @param {number} startZ - Starting grid Z
   * @param {number} widthTiles - Width in tiles
   * @param {number} depthTiles - Depth in tiles
   * @returns {Array} Array of {x, z} cells
   */
  getFootprintCells(startX, startZ, widthTiles, depthTiles) {
    const cells = [];
    
    for (let dx = 0; dx < widthTiles; dx++) {
      for (let dz = 0; dz < depthTiles; dz++) {
        cells.push({ x: startX + dx, z: startZ + dz });
      }
    }
    
    return cells;
  }
  
  /**
   * Check if a footprint can be placed
   * @param {Array} footprint - Array of cells
   * @param {number} islandIndex - Must all be on this island
   * @returns {boolean}
   */
  canPlaceFootprint(footprint, islandIndex) {
    const gap = BUILDINGS_CONFIG.minGapBetweenBuildings;
    
    for (const cell of footprint) {
      // Check bounds
      if (cell.x < 0 || cell.x >= this.gridSize) return false;
      if (cell.z < 0 || cell.z >= this.gridSize) return false;
      
      // Check if on correct island
      if (this.grid[cell.x][cell.z] !== islandIndex) return false;
      
      // Check if road
      if (this.roadCells.has(`${cell.x},${cell.z}`)) return false;
      
      // Check if occupied (including gap)
      for (let gx = -gap; gx <= gap; gx++) {
        for (let gz = -gap; gz <= gap; gz++) {
          if (this.isCellOccupied(cell.x + gx, cell.z + gz)) return false;
        }
      }
    }
    
    return true;
  }
  
  /**
   * Check if a cell is occupied
   * @param {number} x
   * @param {number} z
   * @returns {boolean}
   */
  isCellOccupied(x, z) {
    return this.occupiedCells.has(`${x},${z}`);
  }
  
  /**
   * Mark cells as occupied
   * @param {Array} cells
   */
  markCellsOccupied(cells) {
    for (const cell of cells) {
      this.occupiedCells.add(`${cell.x},${cell.z}`);
    }
  }
  
  /**
   * Place a building
   * @param {number} startX - Grid X
   * @param {number} startZ - Grid Z
   * @param {number} widthTiles - Width in tiles
   * @param {number} depthTiles - Depth in tiles
   * @param {number} heightTiles - Height in tiles
   * @param {Array} footprint - Cells to occupy
   * @returns {object} Building data
   */
  placeBuilding(startX, startZ, widthTiles, depthTiles, heightTiles, footprint) {
    // Mark cells as occupied
    this.markCellsOccupied(footprint);
    
    // Calculate world dimensions
    const worldWidth = widthTiles * this.cellSize;
    const worldDepth = depthTiles * this.cellSize;
    const worldHeight = heightTiles * BUILDINGS_CONFIG.tileHeight;
    
    // Calculate world position (center of footprint)
    const centerX = startX + widthTiles / 2;
    const centerZ = startZ + depthTiles / 2;
    
    const worldX = (centerX - this.halfGrid) * this.cellSize;
    const worldZ = (centerZ - this.halfGrid) * this.cellSize;
    const worldY = worldHeight / 2; // Bottom at Y=0
    
    // Create mesh
    const geometry = new THREE.BoxGeometry(worldWidth, worldHeight, worldDepth);
    const material = new THREE.MeshStandardMaterial({
      color: randomAshGrey(),
      roughness: BUILDINGS_CONFIG.roughness,
      metalness: BUILDINGS_CONFIG.metalness,
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(worldX, worldY, worldZ);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `building_${this.stats.totalBuildings}`;
    
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
      },
    });
    
    // Create physics collider
    const physics = physicsMeshers.createBoxCollider(mesh, {
      isStatic: true,
      friction: 0.5,
      restitution: 0.0,
    });
    
    if (physics) {
      meshRegistry.linkPhysicsBody(id, physics.body, physics.colliders);
    }
    
    // Store building data
    const building = {
      id,
      mesh,
      gridX: startX,
      gridZ: startZ,
      widthTiles,
      depthTiles,
      heightTiles,
      footprint,
    };
    
    this.buildings.push(building);
    this.stats.totalBuildings++;
    
    return building;
  }
  
  /**
   * Get all building meshes (for raycasting, etc.)
   * @returns {THREE.Mesh[]}
   */
  getMeshes() {
    return this.buildings.map(b => b.mesh);
  }
  
  /**
   * Get buildings as obstacles for AI line-of-sight
   * @returns {THREE.Object3D[]}
   */
  getObstacles() {
    return this.getMeshes();
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
  // Cleanup
  // ============================================
  
  /**
   * Clear all buildings
   */
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
    this.stats = { totalBuildings: 0, totalCells: 0 };
  }
  
  /**
   * Get stats
   * @returns {object}
   */
  getStats() {
    return { ...this.stats };
  }
  
  /**
   * Debug info
   */
  getDebugInfo() {
    return {
      buildings: this.buildings.length,
      occupiedCells: this.occupiedCells.size,
      stats: this.stats,
    };
  }
}

// Export singleton
const buildings = new Buildings();
export default buildings;
export { Buildings, BUILDINGS_CONFIG };