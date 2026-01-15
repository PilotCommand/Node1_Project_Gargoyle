/**
 * Paths - Rectangle-based road network generator
 * 
 * Creates roads as incomplete grids:
 * - Rectangles of varying sizes (outlines only, not filled)
 * - Rectangles are mostly adjacent/connected
 * - Some stray roads extend from rectangles and dead-end
 * - All roads are single tile width
 * - Roads originate from island center cells
 */

import * as THREE from 'three';
import meshRegistry, { MeshCategory } from '../registries/meshregistry.js';
import { DARK, MAP } from '../utilities/palette.js';

// Configuration
const PATHS_CONFIG = {
  // Road dimensions
  roadHeight: 0.05,          // Slight elevation above ground
  
  // Road colors from palette
  asphalt: MAP.streets,      // Main road color
  
  // Generation settings
  minIslandSize: 36,         // Minimum island cells to generate roads (smaller = stray roads only)
  
  // Rectangle settings
  rectangle: {
    minSize: 6,              // Minimum rectangle dimension (6x6 = 4x4 interior for buildings)
    maxSize: 14,             // Maximum rectangle dimension
    maxRectangles: 6,        // Max rectangles per island (fewer but larger)
    growthChance: 0.6,       // Chance to spawn adjacent rectangle
  },
  
  // Stray road settings (used more when rectangles can't fit)
  stray: {
    count: { min: 4, max: 10 },  // More stray roads to fill gaps
    length: { min: 4, max: 15 }, // Longer stray roads
    chance: 0.6,                 // Higher chance to add stray from rectangle corner
  },
  
  // Debug
  debug: {
    height: 0.6,
    opacity: 0.7,
    color: 0x333333,
  },
};

class Paths {
  constructor() {
    this.scene = null;
    this.grid = null;
    this.islands = null;
    this.gridSize = 0;
    this.cellSize = 0;
    this.halfGrid = 0;
    
    // Road data
    this.roadCells = new Set();
    this.rectangles = [];      // Store generated rectangles
    
    // The road mesh
    this.roadMesh = null;
    
    // Debug visualization
    this.debugGrid = null;
    this.debugVisible = false;
    
    // Random seed
    this.randomSeed = Date.now();
    
    // Stats
    this.stats = {
      totalRectangles: 0,
      totalStrayRoads: 0,
      totalCells: 0,
    };
  }
  
  /**
   * Initialize with scene reference
   */
  init(scene) {
    this.scene = scene;
    console.log('Paths system initialized (rectangle mode)');
  }
  
  /**
   * Generate road networks on islands
   */
  generate(grid, islands, config = {}) {
    this.clear();
    
    this.grid = grid;
    this.islands = islands;
    this.gridSize = grid.length;
    this.cellSize = config.cellSize || 4;
    this.halfGrid = this.gridSize / 2;
    this.randomSeed = Date.now();
    
    console.log(`Paths: Generating rectangle roads on ${islands.length} islands...`);
    
    // Generate roads for each island (small islands get stray roads only)
    for (const island of islands) {
      this.generateIslandRoads(island);
    }
    
    // Create the mesh
    if (this.roadCells.size > 0) {
      this.createRoadMesh();
      this.createDebugGrid();
    }
    
    this.stats.totalCells = this.roadCells.size;
    console.log(`Paths: Created ${this.stats.totalRectangles} rectangles, ${this.stats.totalStrayRoads} stray roads, ${this.roadCells.size} total cells`);
    
    return this.stats;
  }
  
  /**
   * Generate roads for a single island using rectangle algorithm
   * Small islands (< minIslandSize) get only stray roads from center
   * Very small islands (< 20 cells) get no roads
   */
  generateIslandRoads(island) {
    const config = PATHS_CONFIG.rectangle;
    const cells = island.cells;
    
    // Very small islands get no roads at all
    if (cells.length < 20) {
      console.log(`Island ${island.index}: Too small for roads (${cells.length} cells)`);
      return;
    }
    
    // Build a set for fast lookup of island cells
    const islandCellSet = new Set(cells.map(c => `${c.x},${c.z}`));
    
    // Get island center cell
    const center = island.centerCell;
    if (!center) {
      console.warn(`Island ${island.index}: No center cell found`);
      return;
    }
    
    // Store rectangles for this island
    const islandRectangles = [];
    
    // Only try rectangles on larger islands
    if (cells.length >= PATHS_CONFIG.minIslandSize) {
      // Create initial rectangle at center
      const seedRect = this.createRectangle(center.x, center.z, islandCellSet);
      if (seedRect) {
        islandRectangles.push(seedRect);
        this.drawRectangleOutline(seedRect, islandCellSet);
      }
      
      // Grow more rectangles from existing ones
      let attempts = 0;
      const maxAttempts = config.maxRectangles * 3;
      
      while (islandRectangles.length < config.maxRectangles && attempts < maxAttempts) {
        attempts++;
        
        if (this.random() > config.growthChance) continue;
        
        // Pick a random existing rectangle
        if (islandRectangles.length > 0) {
          const sourceRect = islandRectangles[this.randomInt(0, islandRectangles.length - 1)];
          
          // Try to spawn adjacent rectangle
          const newRect = this.spawnAdjacentRectangle(sourceRect, islandCellSet, islandRectangles);
          if (newRect) {
            islandRectangles.push(newRect);
            this.drawRectangleOutline(newRect, islandCellSet);
          }
        }
      }
    }
    
    // Add stray roads (dead ends) - pass island for fallback if no rectangles
    this.addStrayRoads(islandRectangles, islandCellSet, island);
    
    // Store rectangles
    this.rectangles.push(...islandRectangles);
    this.stats.totalRectangles += islandRectangles.length;
    
    console.log(`Island ${island.index}: ${islandRectangles.length} rectangles, ${cells.length} cells`);
  }
  
  /**
   * Create a rectangle at a given center position
   */
  createRectangle(centerX, centerZ, islandCellSet) {
    const config = PATHS_CONFIG.rectangle;
    
    // Random size
    const width = this.randomInt(config.minSize, config.maxSize);
    const height = this.randomInt(config.minSize, config.maxSize);
    
    // Calculate bounds
    const halfW = Math.floor(width / 2);
    const halfH = Math.floor(height / 2);
    
    let minX = centerX - halfW;
    let maxX = centerX + (width - halfW - 1);
    let minZ = centerZ - halfH;
    let maxZ = centerZ + (height - halfH - 1);
    
    // Shrink rectangle to fit within island
    const adjusted = this.fitRectangleToIsland(minX, maxX, minZ, maxZ, islandCellSet);
    if (!adjusted) return null;
    
    return adjusted;
  }
  
  /**
   * Fit a rectangle to stay within island bounds
   * Enforces minimum size for building placement
   */
  fitRectangleToIsland(minX, maxX, minZ, maxZ, islandCellSet) {
    const minDimension = PATHS_CONFIG.rectangle.minSize - 1; // minSize 6 means diff must be >= 5 (6 cells)
    
    // Shrink from each edge until outline fits
    let iterations = 0;
    const maxIterations = 20;
    
    while (iterations < maxIterations) {
      iterations++;
      
      // Check all outline cells
      let allValid = true;
      let invalidEdge = null;
      
      // Check top edge
      for (let x = minX; x <= maxX && allValid; x++) {
        if (!islandCellSet.has(`${x},${minZ}`)) {
          allValid = false;
          invalidEdge = 'top';
        }
      }
      
      // Check bottom edge
      for (let x = minX; x <= maxX && allValid; x++) {
        if (!islandCellSet.has(`${x},${maxZ}`)) {
          allValid = false;
          invalidEdge = 'bottom';
        }
      }
      
      // Check left edge
      for (let z = minZ; z <= maxZ && allValid; z++) {
        if (!islandCellSet.has(`${minX},${z}`)) {
          allValid = false;
          invalidEdge = 'left';
        }
      }
      
      // Check right edge
      for (let z = minZ; z <= maxZ && allValid; z++) {
        if (!islandCellSet.has(`${maxX},${z}`)) {
          allValid = false;
          invalidEdge = 'right';
        }
      }
      
      if (allValid) {
        // Rectangle fits! Ensure minimum size for building placement
        if (maxX - minX < minDimension || maxZ - minZ < minDimension) return null;
        return { minX, maxX, minZ, maxZ };
      }
      
      // Shrink the invalid edge
      switch (invalidEdge) {
        case 'top': minZ++; break;
        case 'bottom': maxZ--; break;
        case 'left': minX++; break;
        case 'right': maxX--; break;
      }
      
      // Check if rectangle became too small for buildings
      if (maxX - minX < minDimension || maxZ - minZ < minDimension) return null;
    }
    
    return null;
  }
  
  /**
   * Spawn a new rectangle adjacent to an existing one
   */
  spawnAdjacentRectangle(sourceRect, islandCellSet, existingRects) {
    const config = PATHS_CONFIG.rectangle;
    
    // Pick a random edge to spawn from
    const edges = ['top', 'bottom', 'left', 'right'];
    this.shuffleArray(edges);
    
    for (const edge of edges) {
      // Calculate spawn position based on edge
      let spawnX, spawnZ;
      const newWidth = this.randomInt(config.minSize, config.maxSize);
      const newHeight = this.randomInt(config.minSize, config.maxSize);
      
      switch (edge) {
        case 'top':
          spawnX = this.randomInt(sourceRect.minX, sourceRect.maxX);
          spawnZ = sourceRect.minZ - Math.floor(newHeight / 2) - 1;
          break;
        case 'bottom':
          spawnX = this.randomInt(sourceRect.minX, sourceRect.maxX);
          spawnZ = sourceRect.maxZ + Math.floor(newHeight / 2) + 1;
          break;
        case 'left':
          spawnX = sourceRect.minX - Math.floor(newWidth / 2) - 1;
          spawnZ = this.randomInt(sourceRect.minZ, sourceRect.maxZ);
          break;
        case 'right':
          spawnX = sourceRect.maxX + Math.floor(newWidth / 2) + 1;
          spawnZ = this.randomInt(sourceRect.minZ, sourceRect.maxZ);
          break;
      }
      
      // Try to create rectangle at this position
      const newRect = this.createRectangle(spawnX, spawnZ, islandCellSet);
      if (!newRect) continue;
      
      // Check for significant overlap with existing rectangles
      let hasOverlap = false;
      for (const existing of existingRects) {
        if (this.rectanglesOverlapTooMuch(newRect, existing)) {
          hasOverlap = true;
          break;
        }
      }
      
      if (!hasOverlap) {
        return newRect;
      }
    }
    
    return null;
  }
  
  /**
   * Check if two rectangles overlap too much (some overlap is fine for connections)
   */
  rectanglesOverlapTooMuch(rect1, rect2) {
    // Calculate overlap area
    const overlapMinX = Math.max(rect1.minX, rect2.minX);
    const overlapMaxX = Math.min(rect1.maxX, rect2.maxX);
    const overlapMinZ = Math.max(rect1.minZ, rect2.minZ);
    const overlapMaxZ = Math.min(rect1.maxZ, rect2.maxZ);
    
    if (overlapMinX > overlapMaxX || overlapMinZ > overlapMaxZ) {
      return false; // No overlap
    }
    
    const overlapWidth = overlapMaxX - overlapMinX + 1;
    const overlapHeight = overlapMaxZ - overlapMinZ + 1;
    const overlapArea = overlapWidth * overlapHeight;
    
    // Allow small overlap (for connections) but not too much
    const rect1Area = (rect1.maxX - rect1.minX + 1) * (rect1.maxZ - rect1.minZ + 1);
    const rect2Area = (rect2.maxX - rect2.minX + 1) * (rect2.maxZ - rect2.minZ + 1);
    const smallerArea = Math.min(rect1Area, rect2Area);
    
    // If overlap is more than 30% of smaller rectangle, it's too much
    return overlapArea > smallerArea * 0.3;
  }
  
  /**
   * Draw rectangle outline (single tile width roads)
   */
  drawRectangleOutline(rect, islandCellSet) {
    const { minX, maxX, minZ, maxZ } = rect;
    
    // Top edge (minZ)
    for (let x = minX; x <= maxX; x++) {
      this.addRoadCell(x, minZ, islandCellSet);
    }
    
    // Bottom edge (maxZ)
    for (let x = minX; x <= maxX; x++) {
      this.addRoadCell(x, maxZ, islandCellSet);
    }
    
    // Left edge (minX) - skip corners already drawn
    for (let z = minZ + 1; z < maxZ; z++) {
      this.addRoadCell(minX, z, islandCellSet);
    }
    
    // Right edge (maxX) - skip corners already drawn
    for (let z = minZ + 1; z < maxZ; z++) {
      this.addRoadCell(maxX, z, islandCellSet);
    }
  }
  
  /**
   * Add stray roads (dead ends extending from rectangles or island center)
   */
  addStrayRoads(rectangles, islandCellSet, island = null) {
    const config = PATHS_CONFIG.stray;
    const numStrays = this.randomInt(config.count.min, config.count.max);
    
    // If no rectangles but we have island center, create roads from there
    if (rectangles.length === 0 && island && island.centerCell) {
      const center = island.centerCell;
      const directions = [
        { dx: 1, dz: 0 },
        { dx: -1, dz: 0 },
        { dx: 0, dz: 1 },
        { dx: 0, dz: -1 },
      ];
      
      // Add center cell as road
      this.addRoadCell(center.x, center.z, islandCellSet);
      
      // Create roads in all 4 directions
      for (const dir of directions) {
        const length = this.randomInt(config.length.min, config.length.max);
        let x = center.x;
        let z = center.z;
        
        for (let step = 0; step < length; step++) {
          x += dir.dx;
          z += dir.dz;
          
          if (!islandCellSet.has(`${x},${z}`)) break;
          
          this.addRoadCell(x, z, islandCellSet);
        }
        this.stats.totalStrayRoads++;
      }
      return;
    }
    
    if (rectangles.length === 0) return;
    
    for (let i = 0; i < numStrays; i++) {
      // Pick a random rectangle
      const rect = rectangles[this.randomInt(0, rectangles.length - 1)];
      
      // Pick a random starting point on the rectangle edge
      const startPoint = this.pickRandomEdgePoint(rect);
      
      // Pick a direction (outward from rectangle)
      const direction = this.getOutwardDirection(startPoint, rect);
      
      // Random length
      const length = this.randomInt(config.length.min, config.length.max);
      
      // Draw the stray road
      let x = startPoint.x;
      let z = startPoint.z;
      let drawnCells = 0;
      
      for (let step = 0; step < length; step++) {
        x += direction.dx;
        z += direction.dz;
        
        // Stop if we leave the island
        if (!islandCellSet.has(`${x},${z}`)) break;
        
        // Stop if we hit an existing road (other than start)
        if (step > 0 && this.isRoadCell(x, z)) break;
        
        this.addRoadCell(x, z, islandCellSet);
        drawnCells++;
      }
      
      if (drawnCells > 0) {
        this.stats.totalStrayRoads++;
      }
    }
  }
  
  /**
   * Pick a random point on rectangle edge
   */
  pickRandomEdgePoint(rect) {
    const edge = this.randomInt(0, 3);
    
    switch (edge) {
      case 0: // Top edge
        return { x: this.randomInt(rect.minX, rect.maxX), z: rect.minZ };
      case 1: // Bottom edge
        return { x: this.randomInt(rect.minX, rect.maxX), z: rect.maxZ };
      case 2: // Left edge
        return { x: rect.minX, z: this.randomInt(rect.minZ, rect.maxZ) };
      case 3: // Right edge
        return { x: rect.maxX, z: this.randomInt(rect.minZ, rect.maxZ) };
    }
  }
  
  /**
   * Get outward direction from a point on rectangle edge
   */
  getOutwardDirection(point, rect) {
    // Determine which edge the point is on and return outward direction
    if (point.z === rect.minZ) return { dx: 0, dz: -1 }; // Top edge -> go up
    if (point.z === rect.maxZ) return { dx: 0, dz: 1 };  // Bottom edge -> go down
    if (point.x === rect.minX) return { dx: -1, dz: 0 }; // Left edge -> go left
    if (point.x === rect.maxX) return { dx: 1, dz: 0 };  // Right edge -> go right
    
    // Fallback
    return { dx: 0, dz: -1 };
  }
  
  /**
   * Add a road cell if it's on the island
   */
  addRoadCell(x, z, islandCellSet) {
    const key = `${x},${z}`;
    if (islandCellSet && !islandCellSet.has(key)) return false;
    this.roadCells.add(key);
    return true;
  }
  
  /**
   * Check if a cell is a road cell
   */
  isRoadCell(x, z) {
    return this.roadCells.has(`${x},${z}`);
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
  // Mesh Generation
  // ============================================
  
  /**
   * Create the road mesh
   */
  createRoadMesh() {
    const cellSize = this.cellSize;
    const halfGrid = this.halfGrid;
    const roadHeight = PATHS_CONFIG.roadHeight;
    
    const positions = [];
    const normals = [];
    const indices = [];
    
    let vertexIndex = 0;
    
    for (const cellKey of this.roadCells) {
      const [x, z] = cellKey.split(',').map(Number);
      
      // Convert grid to world coords
      const worldX = (x - halfGrid) * cellSize + cellSize / 2;
      const worldZ = (z - halfGrid) * cellSize + cellSize / 2;
      
      const halfCell = cellSize / 2;
      
      // Create a quad for this road cell
      const v0 = { x: worldX - halfCell, y: roadHeight, z: worldZ - halfCell };
      const v1 = { x: worldX + halfCell, y: roadHeight, z: worldZ - halfCell };
      const v2 = { x: worldX + halfCell, y: roadHeight, z: worldZ + halfCell };
      const v3 = { x: worldX - halfCell, y: roadHeight, z: worldZ + halfCell };
      
      positions.push(v0.x, v0.y, v0.z);
      positions.push(v1.x, v1.y, v1.z);
      positions.push(v2.x, v2.y, v2.z);
      positions.push(v3.x, v3.y, v3.z);
      
      for (let i = 0; i < 4; i++) {
        normals.push(0, 1, 0);
      }
      
      indices.push(
        vertexIndex, vertexIndex + 2, vertexIndex + 1,
        vertexIndex, vertexIndex + 3, vertexIndex + 2
      );
      
      vertexIndex += 4;
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);
    
    const material = new THREE.MeshStandardMaterial({
      color: PATHS_CONFIG.asphalt,
      roughness: 0.9,
      metalness: 0.1,
    });
    
    this.roadMesh = new THREE.Mesh(geometry, material);
    this.roadMesh.receiveShadow = true;
    this.roadMesh.name = 'roads';
    
    this.scene.add(this.roadMesh);
    
    meshRegistry.register(this.roadMesh, MeshCategory.GROUND, {
      name: 'roads',
      needsPhysics: false,
      isStatic: true,
    });
    
    console.log(`Paths: Road mesh created with ${this.roadCells.size} cells`);
  }
  
  /**
   * Create debug grid for roads
   */
  createDebugGrid() {
    if (this.roadCells.size === 0) return;
    
    const cellSize = this.cellSize;
    const halfGrid = this.halfGrid;
    const debugConfig = PATHS_CONFIG.debug;
    
    this.debugGrid = new THREE.Group();
    this.debugGrid.name = 'paths_debug_grid';
    
    const material = new THREE.MeshBasicMaterial({
      color: debugConfig.color,
      transparent: true,
      opacity: debugConfig.opacity,
      side: THREE.DoubleSide,
    });
    
    const cellGeom = new THREE.PlaneGeometry(cellSize * 0.85, cellSize * 0.85);
    cellGeom.rotateX(-Math.PI / 2);
    
    for (const cellKey of this.roadCells) {
      const [x, z] = cellKey.split(',').map(Number);
      
      const tile = new THREE.Mesh(cellGeom, material);
      
      const worldX = (x - halfGrid) * cellSize + cellSize / 2;
      const worldZ = (z - halfGrid) * cellSize + cellSize / 2;
      
      tile.position.set(worldX, debugConfig.height, worldZ);
      this.debugGrid.add(tile);
    }
    
    this.debugGrid.visible = this.debugVisible;
    this.scene.add(this.debugGrid);
    
    meshRegistry.register(this.debugGrid, MeshCategory.DEBUG, {
      name: 'paths_debug_grid',
      needsPhysics: false,
    });
    
    console.log(`Paths: Debug grid created with ${this.roadCells.size} tiles`);
  }
  
  /**
   * Toggle debug visibility
   */
  toggleDebug() {
    this.debugVisible = !this.debugVisible;
    if (this.debugGrid) {
      this.debugGrid.visible = this.debugVisible;
    }
    console.log(`Paths debug grid: ${this.debugVisible ? 'ON' : 'OFF'}`);
    return this.debugVisible;
  }
  
  /**
   * Set debug visibility
   */
  setDebugVisible(visible) {
    this.debugVisible = visible;
    if (this.debugGrid) {
      this.debugGrid.visible = visible;
    }
  }
  
  /**
   * Check if world position is on a road
   */
  isOnRoad(worldX, worldZ) {
    const cellX = Math.floor(worldX / this.cellSize + this.halfGrid);
    const cellZ = Math.floor(worldZ / this.cellSize + this.halfGrid);
    return this.isRoadCell(cellX, cellZ);
  }
  
  /**
   * Get stats
   */
  getStats() {
    return { ...this.stats };
  }
  
  /**
   * Clear all roads
   */
  clear() {
    if (this.roadMesh) {
      this.scene.remove(this.roadMesh);
      this.roadMesh.geometry?.dispose();
      this.roadMesh.material?.dispose();
      this.roadMesh = null;
    }
    
    if (this.debugGrid) {
      this.scene.remove(this.debugGrid);
      this.debugGrid.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      this.debugGrid = null;
    }
    
    this.roadCells.clear();
    this.rectangles = [];
    this.stats = { totalRectangles: 0, totalStrayRoads: 0, totalCells: 0 };
  }
  
  /**
   * Get debug info
   */
  getDebugInfo() {
    return {
      rectangles: this.rectangles.length,
      cells: this.roadCells.size,
      stats: this.stats,
    };
  }
}

// Export singleton
const paths = new Paths();
export default paths;
export { Paths, PATHS_CONFIG };