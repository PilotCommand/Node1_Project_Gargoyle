/**
 * Paths - Road network generator for islands
 * Creates asphalt roads on island surfaces
 * Uses optimized mesh generation (only necessary faces)
 */

import * as THREE from 'three';
import meshRegistry, { MeshCategory } from '../registries/meshregistry.js';
import { DARK, MAP } from '../utilities/palette.js';

// Configuration
const PATHS_CONFIG = {
  // Road dimensions
  roadWidth: 2,              // Width in cells (2 = two cell wide roads)
  roadHeight: 0.05,          // Slight elevation above ground to prevent z-fighting
  
  // Road colors from palette
  asphalt: MAP.streets,      // Main road color (DARK.medium = 0x3A3A38)
  asphaltDark: DARK.dark,    // Darker variant for variety
  asphaltLight: DARK.light,  // Lighter variant
  
  // Generation settings
  minIslandSize: 30,         // Minimum island cells to generate roads
  
  // Circuit settings
  circuit: {
    insetDistance: 3,        // How far from edge the circuit runs
    minCircuitCells: 12,     // Minimum cells needed to form a circuit
    smoothing: true,         // Smooth sharp corners
  },
  
  // Debug
  debug: {
    height: 0.6,             // Above creeks debug tiles
    opacity: 0.7,
    color: 0x333333,         // Dark grey for roads
  },
};

class Paths {
  constructor() {
    this.scene = null;
    this.grid = null;           // Reference to islands grid
    this.islands = null;        // Reference to islands data
    this.gridSize = 0;
    this.cellSize = 0;
    this.halfGrid = 0;
    
    // Road data
    this.roadCells = new Set(); // Set of "x,z" strings for road cells
    this.roads = [];            // Array of road definitions
    
    // The road mesh
    this.roadMesh = null;
    
    // Debug visualization
    this.debugGrid = null;
    this.debugVisible = false;
    
    // Stats
    this.stats = {
      totalRoads: 0,
      totalCells: 0,
    };
  }
  
  /**
   * Initialize with scene reference
   * @param {THREE.Scene} scene
   */
  init(scene) {
    this.scene = scene;
    console.log('Paths system initialized');
  }
  
  /**
   * Generate road networks on islands
   * @param {Array} grid - 2D grid from islands.js
   * @param {Array} islands - Island data from islands.js
   * @param {object} config - Grid configuration
   */
  generate(grid, islands, config = {}) {
    this.clear();
    
    this.grid = grid;
    this.islands = islands;
    this.gridSize = grid.length;
    this.cellSize = config.cellSize || 4;
    this.halfGrid = this.gridSize / 2;
    
    console.log(`Paths: Generating roads on ${islands.length} islands...`);
    
    // Generate roads for each island
    for (const island of islands) {
      if (island.cells.length >= PATHS_CONFIG.minIslandSize) {
        this.generateIslandRoads(island);
      }
    }
    
    // Create the mesh
    if (this.roadCells.size > 0) {
      this.createRoadMesh();
      this.createDebugGrid();
    }
    
    this.stats.totalCells = this.roadCells.size;
    console.log(`Paths: Created ${this.roads.length} roads with ${this.roadCells.size} cells`);
    
    return this.stats;
  }
  
  /**
   * Generate roads for a single island
   * Creates a circuit (loop) road around the island interior
   * @param {object} island
   */
  generateIslandRoads(island) {
    const config = PATHS_CONFIG.circuit;
    const cells = island.cells;
    
    if (cells.length < PATHS_CONFIG.minIslandSize) return;
    
    // Build a set for fast lookup
    const cellSet = new Set(cells.map(c => `${c.x},${c.z}`));
    
    // Find island center
    const center = this.getIslandCenter(island);
    
    // Find the "inner ring" - cells that are inset from the edge
    const innerRing = this.findInnerRing(island, cellSet, config.insetDistance);
    
    if (innerRing.length < config.minCircuitCells) {
      console.log(`Island ${island.index}: Too small for circuit (${innerRing.length} inner cells)`);
      return;
    }
    
    // Order inner ring cells by angle around center to form a circuit
    const orderedRing = this.orderCellsByAngle(innerRing, center);
    
    // Build the circuit path connecting ordered cells
    const circuit = this.buildCircuit(orderedRing, cellSet);
    
    if (circuit.length > 0) {
      this.roads.push({
        island: island.index,
        type: 'circuit',
        cells: circuit,
      });
      
      // Add circuit cells (2 tiles wide)
      for (const cell of circuit) {
        this.addRoadCell(cell.x, cell.z, cellSet);
        
        // Add width - make road 2 tiles wide
        this.addRoadWidth(cell, circuit, cellSet);
      }
      
      console.log(`Island ${island.index}: Circuit with ${circuit.length} cells, ${this.roadCells.size} total road cells`);
    }
  }
  
  /**
   * Find the inner ring of an island
   * These are cells that are a certain distance from any edge
   * @param {object} island
   * @param {Set} cellSet
   * @param {number} insetDistance
   */
  findInnerRing(island, cellSet, insetDistance) {
    const innerCells = [];
    
    for (const cell of island.cells) {
      const distToEdge = this.getDistanceToEdge(cell, cellSet);
      
      // We want cells that are approximately at the inset distance
      // Allow some tolerance for natural-looking paths
      if (distToEdge >= insetDistance && distToEdge <= insetDistance + 1) {
        innerCells.push(cell);
      }
    }
    
    // If not enough cells at exact distance, try cells that are at least inset
    if (innerCells.length < PATHS_CONFIG.circuit.minCircuitCells) {
      innerCells.length = 0;
      for (const cell of island.cells) {
        const distToEdge = this.getDistanceToEdge(cell, cellSet);
        if (distToEdge >= Math.max(1, insetDistance - 1)) {
          innerCells.push(cell);
        }
      }
    }
    
    return innerCells;
  }
  
  /**
   * Get the minimum distance from a cell to the island edge
   * Uses BFS to find nearest void cell
   */
  getDistanceToEdge(cell, cellSet) {
    // Check immediate neighbors first (fast path)
    const dirs = [
      { x: 1, z: 0 }, { x: -1, z: 0 },
      { x: 0, z: 1 }, { x: 0, z: -1 },
    ];
    
    for (const dir of dirs) {
      if (!cellSet.has(`${cell.x + dir.x},${cell.z + dir.z}`)) {
        return 1; // Adjacent to edge
      }
    }
    
    // BFS to find distance to edge
    const visited = new Set([`${cell.x},${cell.z}`]);
    const queue = [{ x: cell.x, z: cell.z, dist: 0 }];
    
    while (queue.length > 0) {
      const current = queue.shift();
      
      for (const dir of dirs) {
        const nx = current.x + dir.x;
        const nz = current.z + dir.z;
        const key = `${nx},${nz}`;
        
        if (visited.has(key)) continue;
        visited.add(key);
        
        if (!cellSet.has(key)) {
          // Found edge
          return current.dist + 1;
        }
        
        queue.push({ x: nx, z: nz, dist: current.dist + 1 });
      }
      
      // Limit search depth
      if (current.dist > 10) return current.dist;
    }
    
    return 10; // Deep inside island
  }
  
  /**
   * Get the center of an island
   */
  getIslandCenter(island) {
    let sumX = 0, sumZ = 0;
    for (const cell of island.cells) {
      sumX += cell.x;
      sumZ += cell.z;
    }
    return {
      x: sumX / island.cells.length,
      z: sumZ / island.cells.length,
    };
  }
  
  /**
   * Order cells by angle around a center point
   * This creates a natural circuit order
   */
  orderCellsByAngle(cells, center) {
    return cells
      .map(cell => ({
        ...cell,
        angle: Math.atan2(cell.z - center.z, cell.x - center.x),
      }))
      .sort((a, b) => a.angle - b.angle);
  }
  
  /**
   * Build a circuit by connecting ordered ring cells
   * Uses pathfinding between consecutive cells to create smooth paths
   */
  buildCircuit(orderedRing, cellSet) {
    if (orderedRing.length < 3) return [];
    
    const circuit = [];
    
    // Connect each cell to the next
    for (let i = 0; i < orderedRing.length; i++) {
      const from = orderedRing[i];
      const to = orderedRing[(i + 1) % orderedRing.length];
      
      // Find path between consecutive ring cells
      const segment = this.findPathBetween(from, to, cellSet);
      
      // Add segment (skip first cell after first segment to avoid duplicates)
      for (let j = (i === 0 ? 0 : 1); j < segment.length; j++) {
        circuit.push(segment[j]);
      }
    }
    
    return circuit;
  }
  
  /**
   * Find a path between two cells staying on the island
   * Simple A* that stays within the island
   */
  findPathBetween(start, end, cellSet) {
    const path = [];
    const openSet = new Map();
    const closedSet = new Set();
    const cameFrom = new Map();
    const gScore = new Map();
    
    const key = (c) => `${c.x},${c.z}`;
    const heuristic = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
    
    openSet.set(key(start), start);
    gScore.set(key(start), 0);
    
    const dirs = [
      { x: 1, z: 0 }, { x: -1, z: 0 },
      { x: 0, z: 1 }, { x: 0, z: -1 },
    ];
    
    let iterations = 0;
    const maxIter = 200;
    
    while (openSet.size > 0 && iterations < maxIter) {
      iterations++;
      
      // Find lowest f-score
      let current = null;
      let currentKey = null;
      let lowestF = Infinity;
      
      for (const [k, cell] of openSet) {
        const f = (gScore.get(k) || Infinity) + heuristic(cell, end);
        if (f < lowestF) {
          lowestF = f;
          current = cell;
          currentKey = k;
        }
      }
      
      if (!current) break;
      
      // Reached end?
      if (current.x === end.x && current.z === end.z) {
        // Reconstruct path
        const result = [current];
        let curr = current;
        while (cameFrom.has(key(curr))) {
          curr = cameFrom.get(key(curr));
          result.push(curr);
        }
        return result.reverse();
      }
      
      openSet.delete(currentKey);
      closedSet.add(currentKey);
      
      // Check neighbors
      for (const dir of dirs) {
        const nx = current.x + dir.x;
        const nz = current.z + dir.z;
        const nKey = `${nx},${nz}`;
        
        // Must be on island
        if (!cellSet.has(nKey)) continue;
        if (closedSet.has(nKey)) continue;
        
        const tentativeG = (gScore.get(currentKey) || 0) + 1;
        
        if (!openSet.has(nKey)) {
          openSet.set(nKey, { x: nx, z: nz });
        } else if (tentativeG >= (gScore.get(nKey) || Infinity)) {
          continue;
        }
        
        cameFrom.set(nKey, current);
        gScore.set(nKey, tentativeG);
      }
    }
    
    // Fallback: direct line
    return [start, end];
  }
  
  /**
   * Add a road cell if it's on the island
   */
  addRoadCell(x, z, cellSet) {
    const key = `${x},${z}`;
    if (cellSet.has(key)) {
      this.roadCells.add(key);
    }
  }
  
  /**
   * Add width to make road 2 tiles wide
   * Adds cells perpendicular to the road direction
   */
  addRoadWidth(cell, circuit, cellSet) {
    // Find this cell's index in circuit
    const idx = circuit.findIndex(c => c.x === cell.x && c.z === cell.z);
    if (idx === -1) return;
    
    // Get prev and next cells to determine road direction
    const prev = circuit[(idx - 1 + circuit.length) % circuit.length];
    const next = circuit[(idx + 1) % circuit.length];
    
    // Road direction
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    
    // Perpendicular direction (normalize roughly)
    let perpX = -dz;
    let perpZ = dx;
    
    // Normalize to unit steps
    if (perpX !== 0) perpX = perpX > 0 ? 1 : -1;
    if (perpZ !== 0) perpZ = perpZ > 0 ? 1 : -1;
    
    // Add cell in perpendicular direction (making road 2 wide)
    this.addRoadCell(cell.x + perpX, cell.z + perpZ, cellSet);
    
    // For corners or when perpendicular is diagonal, add both perpendicular cells
    if (Math.abs(dx) > 0 && Math.abs(dz) > 0) {
      this.addRoadCell(cell.x - perpX, cell.z - perpZ, cellSet);
    }
  }
  
  // ============================================
  // Helper Methods
  // ============================================
  
  /**
   * Get bounds of an island
   */
  getIslandBounds(island) {
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    
    for (const cell of island.cells) {
      minX = Math.min(minX, cell.x);
      maxX = Math.max(maxX, cell.x);
      minZ = Math.min(minZ, cell.z);
      maxZ = Math.max(maxZ, cell.z);
    }
    
    return { minX, maxX, minZ, maxZ };
  }
  
  /**
   * Check if a cell is a road cell
   */
  isRoadCell(x, z) {
    return this.roadCells.has(`${x},${z}`);
  }
  
  // ============================================
  // Mesh Generation
  // ============================================
  
  /**
   * Create the road mesh
   * Roads are thin quads slightly above ground level
   */
  createRoadMesh() {
    const cellSize = this.cellSize;
    const halfGrid = this.halfGrid;
    const roadHeight = PATHS_CONFIG.roadHeight;
    
    // Collect all road cell positions
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
      
      // Create a quad for this road cell (at slight elevation)
      // 4 vertices per cell
      const v0 = { x: worldX - halfCell, y: roadHeight, z: worldZ - halfCell };
      const v1 = { x: worldX + halfCell, y: roadHeight, z: worldZ - halfCell };
      const v2 = { x: worldX + halfCell, y: roadHeight, z: worldZ + halfCell };
      const v3 = { x: worldX - halfCell, y: roadHeight, z: worldZ + halfCell };
      
      // Add vertices
      positions.push(v0.x, v0.y, v0.z);
      positions.push(v1.x, v1.y, v1.z);
      positions.push(v2.x, v2.y, v2.z);
      positions.push(v3.x, v3.y, v3.z);
      
      // Normals (all pointing up)
      for (let i = 0; i < 4; i++) {
        normals.push(0, 1, 0);
      }
      
      // Indices (two triangles, CCW winding)
      indices.push(
        vertexIndex, vertexIndex + 2, vertexIndex + 1,
        vertexIndex, vertexIndex + 3, vertexIndex + 2
      );
      
      vertexIndex += 4;
    }
    
    // Create geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);
    
    // Material - asphalt from palette
    const material = new THREE.MeshStandardMaterial({
      color: PATHS_CONFIG.asphalt,
      roughness: 0.9,
      metalness: 0.1,
    });
    
    // Create mesh
    this.roadMesh = new THREE.Mesh(geometry, material);
    this.roadMesh.receiveShadow = true;
    this.roadMesh.name = 'roads';
    
    this.scene.add(this.roadMesh);
    
    // Register with mesh registry
    meshRegistry.register(this.roadMesh, MeshCategory.GROUND, {
      name: 'roads',
      needsPhysics: false,  // Roads don't need separate physics - player walks on island
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
    
    // Dark grey material for road cells
    const material = new THREE.MeshBasicMaterial({
      color: debugConfig.color,
      transparent: true,
      opacity: debugConfig.opacity,
      side: THREE.DoubleSide,
    });
    
    // Shared geometry
    const cellGeom = new THREE.PlaneGeometry(cellSize * 0.85, cellSize * 0.85);
    cellGeom.rotateX(-Math.PI / 2);
    
    // Create tile for each road cell
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
    
    // Register as DEBUG category
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
    
    this.roads = [];
    this.roadCells.clear();
    this.stats = { totalRoads: 0, totalCells: 0 };
  }
  
  /**
   * Get debug info
   */
  getDebugInfo() {
    return {
      roads: this.roads.length,
      cells: this.roadCells.size,
      stats: this.stats,
    };
  }
}

// Export singleton
const paths = new Paths();
export default paths;
export { Paths, PATHS_CONFIG };