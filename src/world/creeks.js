/**
 * Creeks - Inter-island path/bridge generator
 * 
 * Analyzes islands and canyons, then builds narrow paths connecting
 * islands so players can traverse between them.
 * 
 * Algorithm:
 *   1. Find all island pairs that should be connected
 *   2. For each pair, find the narrowest canyon crossing point
 *   3. Build a path through the canyon using A* or direct line
 *   4. Generate optimized mesh (same technique as islands.js)
 */

import * as THREE from 'three';
import meshRegistry, { MeshCategory } from '../registries/meshregistry.js';
import physicsMeshers from '../physics/physicsmeshers.js';
import { ASH } from '../utilities/palette.js';

// Configuration
const CREEKS_CONFIG = {
  // Path dimensions
  pathWidth: 1,              // Width in cells (1 = single cell, 2 = two cells wide)
  
  // Path depth (should match island depth for seamless connection)
  pathDepth: 20,
  
  // Visual - same color as islands for seamless appearance
  pathColor: ASH.darkest,  // Matches islands.groundColor
  
  // Connection strategy
  connectAllIslands: true,   // Ensure all islands are reachable (spanning tree)
  maxBridgesPerIsland: 3,    // Maximum bridges from one island
  
  // Path finding
  preferStraightPaths: true, // Try to minimize turns
  maxPathLength: 30,         // Maximum cells for a single path
  
  // Mesh optimization
  mesh: {
    includeTop: true,
    includeBottom: true,
    includeSides: true,
  },
  
  // Debug grid
  debug: {
    height: 0.55,            // Slightly above island debug tiles
    opacity: 0.7,
    color: 0x000066,         // Navy blue for paths
    connectionColor: 0x58D68D, // Gasoline green for island connection points
  },
};

// Face directions (same as islands.js)
const FACE_DIRECTIONS = {
  TOP:    { normal: [ 0,  1,  0] },
  BOTTOM: { normal: [ 0, -1,  0] },
  RIGHT:  { normal: [ 1,  0,  0] },
  LEFT:   { normal: [-1,  0,  0] },
  FRONT:  { normal: [ 0,  0,  1] },
  BACK:   { normal: [ 0,  0, -1] },
};

class Creeks {
  constructor() {
    this.scene = null;
    this.grid = null;           // Reference to islands grid
    this.gridSize = 0;
    this.cellSize = 0;
    this.halfGrid = 0;
    
    // Path data
    this.paths = [];            // Array of path definitions
    this.pathCells = new Set(); // Set of "x,z" strings for path cells
    this.connectionCells = new Set(); // Set of "x,z" strings for island cells adjacent to paths
    
    // The path mesh
    this.pathMesh = null;
    this.physicsBody = null;
    
    // Debug visualization
    this.debugGrid = null;
    this.debugVisible = false;
    
    // Stats
    this.stats = {
      totalPaths: 0,
      totalCells: 0,
      connectionCells: 0,
      optimizedFaces: 0,
    };
  }
  
  /**
   * Initialize creeks system
   * @param {THREE.Scene} scene
   */
  init(scene) {
    this.scene = scene;
    console.log('Creeks system initialized');
  }
  
  /**
   * Generate paths between islands
   * @param {number[][]} grid - The island grid from islands.js
   * @param {Array} islands - Island data from islands.js
   * @param {object} config - Grid configuration
   */
  generate(grid, islands, config) {
    this.grid = grid;
    this.gridSize = config.gridSize || grid.length;
    this.cellSize = config.cellSize || 4;
    this.halfGrid = this.gridSize / 2;
    
    // Clear previous
    this.clear();
    
    if (islands.length < 2) {
      console.log('Creeks: Need at least 2 islands to create paths');
      return;
    }
    
    console.log(`Creeks: Analyzing ${islands.length} islands for connections...`);
    
    // Step 1: Find connection points between islands
    const connections = this.findConnections(islands);
    
    // Step 2: Build paths for each connection
    for (const connection of connections) {
      this.buildPath(connection);
    }
    
    // Step 3: Identify island cells that connect to paths
    this.identifyConnectionCells();
    
    // Step 4: Create the mesh
    if (this.pathCells.size > 0) {
      this.createPathMesh();
      this.createDebugGrid();
    }
    
    console.log(`Creeks: Created ${this.paths.length} paths with ${this.pathCells.size} cells`);
  }
  
  /**
   * Find optimal connection points between islands
   * Uses minimum spanning tree to ensure all islands are connected
   * @param {Array} islands
   * @returns {Array} Array of connection definitions
   */
  findConnections(islands) {
    const connections = [];
    
    // Calculate centroids for each island
    const centroids = islands.map(island => {
      let sumX = 0, sumZ = 0;
      for (const cell of island.cells) {
        sumX += cell.x;
        sumZ += cell.z;
      }
      return {
        x: sumX / island.cells.length,
        z: sumZ / island.cells.length,
        index: island.index,
      };
    });
    
    // Find all possible edges with their costs (distances)
    const edges = [];
    for (let i = 0; i < islands.length; i++) {
      for (let j = i + 1; j < islands.length; j++) {
        // Find closest cells between these two islands
        const closest = this.findClosestCells(islands[i], islands[j]);
        if (closest) {
          edges.push({
            from: i,
            to: j,
            fromCell: closest.from,
            toCell: closest.to,
            distance: closest.distance,
          });
        }
      }
    }
    
    // Sort by distance
    edges.sort((a, b) => a.distance - b.distance);
    
    // Use Kruskal's algorithm for minimum spanning tree
    const parent = islands.map((_, i) => i);
    
    const find = (x) => {
      if (parent[x] !== x) parent[x] = find(parent[x]);
      return parent[x];
    };
    
    const union = (x, y) => {
      const px = find(x), py = find(y);
      if (px !== py) {
        parent[px] = py;
        return true;
      }
      return false;
    };
    
    // Build MST
    for (const edge of edges) {
      if (union(edge.from, edge.to)) {
        // Skip very long paths
        if (edge.distance <= CREEKS_CONFIG.maxPathLength) {
          connections.push(edge);
        }
      }
      
      // Check if all islands are connected
      const roots = new Set(islands.map((_, i) => find(i)));
      if (roots.size === 1) break;
    }
    
    console.log(`Creeks: Found ${connections.length} connections to build`);
    return connections;
  }
  
  /**
   * Find the closest cells between two islands
   * @param {object} islandA
   * @param {object} islandB
   * @returns {object|null} { from, to, distance }
   */
  findClosestCells(islandA, islandB) {
    let minDist = Infinity;
    let closest = null;
    
    // Only check edge cells (cells with at least one void neighbor)
    const edgeCellsA = this.getEdgeCells(islandA);
    const edgeCellsB = this.getEdgeCells(islandB);
    
    for (const cellA of edgeCellsA) {
      for (const cellB of edgeCellsB) {
        const dist = Math.abs(cellA.x - cellB.x) + Math.abs(cellA.z - cellB.z); // Manhattan
        if (dist < minDist) {
          minDist = dist;
          closest = {
            from: cellA,
            to: cellB,
            distance: dist,
          };
        }
      }
    }
    
    return closest;
  }
  
  /**
   * Get edge cells of an island (cells bordering void)
   * @param {object} island
   * @returns {Array}
   */
  getEdgeCells(island) {
    const edgeCells = [];
    
    for (const cell of island.cells) {
      // Check if any neighbor is void
      const neighbors = [
        { x: cell.x + 1, z: cell.z },
        { x: cell.x - 1, z: cell.z },
        { x: cell.x, z: cell.z + 1 },
        { x: cell.x, z: cell.z - 1 },
      ];
      
      for (const n of neighbors) {
        if (this.isVoidCell(n.x, n.z)) {
          edgeCells.push(cell);
          break;
        }
      }
    }
    
    return edgeCells;
  }
  
  /**
   * Check if a cell is void
   */
  isVoidCell(x, z) {
    if (x < 0 || x >= this.gridSize || z < 0 || z >= this.gridSize) {
      return true;
    }
    return this.grid[x][z] < 0;
  }
  
  /**
   * Check if a cell is a path cell
   */
  isPathCell(x, z) {
    return this.pathCells.has(`${x},${z}`);
  }
  
  /**
   * Check if a cell is a connection cell (island cell adjacent to path)
   */
  isConnectionCell(x, z) {
    return this.connectionCells.has(`${x},${z}`);
  }
  
  /**
   * Build a path between two points
   * Uses A* pathfinding through ONLY void cells
   * Path will be adjacent to islands, never overlapping
   * @param {object} connection
   */
  buildPath(connection) {
    const { fromCell, toCell } = connection;
    
    // Find path through void cells only
    const path = this.findPathAStar(fromCell, toCell);
    
    if (path && path.length > 0) {
      this.paths.push({
        from: connection.from,
        to: connection.to,
        cells: path,
      });
      
      // Add all path cells (they are all void cells)
      for (let i = 0; i < path.length; i++) {
        const cell = path[i];
        this.pathCells.add(`${cell.x},${cell.z}`);
        
        // Add width if configured
        if (CREEKS_CONFIG.pathWidth > 1) {
          this.addPathWidth(cell, path, i);
        }
      }
    }
  }
  
  /**
   * A* pathfinding through ONLY void cells
   * Starts from void cell adjacent to start island cell
   * Ends at void cell adjacent to end island cell
   * @param {object} startIslandCell - Edge cell of starting island
   * @param {object} endIslandCell - Edge cell of destination island
   * @returns {Array|null} Array of void cells forming the path
   */
  findPathAStar(startIslandCell, endIslandCell) {
    const openSet = new Map();
    const closedSet = new Set();
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();
    
    const key = (cell) => `${cell.x},${cell.z}`;
    const heuristic = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
    
    // Get void cells adjacent to start island cell - these are our starting points
    const startVoidCells = this.getVoidNeighbors(startIslandCell);
    if (startVoidCells.length === 0) {
      console.warn('Creeks: No void cells adjacent to start');
      return null;
    }
    
    // Initialize all starting void cells
    for (const startCell of startVoidCells) {
      const k = key(startCell);
      gScore.set(k, 0);
      fScore.set(k, heuristic(startCell, endIslandCell));
      openSet.set(k, startCell);
    }
    
    let iterations = 0;
    const maxIterations = CREEKS_CONFIG.maxPathLength * 20;
    
    while (openSet.size > 0 && iterations < maxIterations) {
      iterations++;
      
      // Find lowest fScore in openSet
      let current = null;
      let currentKey = null;
      let lowestF = Infinity;
      
      for (const [k, cell] of openSet) {
        const f = fScore.get(k) ?? Infinity;
        if (f < lowestF) {
          lowestF = f;
          current = cell;
          currentKey = k;
        }
      }
      
      if (!current) break;
      
      // Check if we're adjacent to the end island cell (success!)
      if (this.isAdjacentTo(current, endIslandCell)) {
        // Reconstruct path - only void cells
        const path = [current];
        let curr = current;
        while (cameFrom.has(key(curr))) {
          curr = cameFrom.get(key(curr));
          path.push(curr);
        }
        return path.reverse();
      }
      
      openSet.delete(currentKey);
      closedSet.add(currentKey);
      
      // Get void neighbors only (never step into island cells)
      const neighbors = this.getVoidNeighbors(current);
      
      for (const neighbor of neighbors) {
        const neighborKey = key(neighbor);
        
        if (closedSet.has(neighborKey)) continue;
        
        const tentativeG = (gScore.get(currentKey) ?? Infinity) + 1;
        
        if (!openSet.has(neighborKey)) {
          openSet.set(neighborKey, neighbor);
        } else if (tentativeG >= (gScore.get(neighborKey) ?? Infinity)) {
          continue;
        }
        
        cameFrom.set(neighborKey, current);
        gScore.set(neighborKey, tentativeG);
        fScore.set(neighborKey, tentativeG + heuristic(neighbor, endIslandCell));
      }
    }
    
    if (iterations >= maxIterations) {
      console.warn('Creeks: Path search exceeded iteration limit');
    }
    
    return null;
  }
  
  /**
   * Get void neighbors of a cell
   */
  getVoidNeighbors(cell) {
    const neighbors = [];
    const dirs = [
      { x: 1, z: 0 },
      { x: -1, z: 0 },
      { x: 0, z: 1 },
      { x: 0, z: -1 },
    ];
    
    for (const dir of dirs) {
      const nx = cell.x + dir.x;
      const nz = cell.z + dir.z;
      if (this.isVoidCell(nx, nz)) {
        neighbors.push({ x: nx, z: nz });
      }
    }
    
    return neighbors;
  }
  
  /**
   * Check if cell a is adjacent to cell b
   */
  isAdjacentTo(a, b) {
    const dx = Math.abs(a.x - b.x);
    const dz = Math.abs(a.z - b.z);
    return (dx === 1 && dz === 0) || (dx === 0 && dz === 1);
  }
  
  /**
   * Add width to path (for wider bridges)
   * Only adds void cells, never overlaps with islands
   */
  addPathWidth(cell, path, index) {
    // Determine path direction
    const prev = index > 0 ? path[index - 1] : cell;
    const next = index < path.length - 1 ? path[index + 1] : cell;
    
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    
    // Add cells perpendicular to path direction
    const perpendicular = [];
    if (Math.abs(dx) > Math.abs(dz)) {
      // Path goes X direction, expand in Z
      perpendicular.push({ x: cell.x, z: cell.z + 1 });
      perpendicular.push({ x: cell.x, z: cell.z - 1 });
    } else {
      // Path goes Z direction, expand in X
      perpendicular.push({ x: cell.x + 1, z: cell.z });
      perpendicular.push({ x: cell.x - 1, z: cell.z });
    }
    
    for (const p of perpendicular) {
      // Only add if it's a void cell (not an island)
      if (this.isVoidCell(p.x, p.z) && !this.isPathCell(p.x, p.z)) {
        this.pathCells.add(`${p.x},${p.z}`);
      }
    }
  }
  
  /**
   * Identify island cells that are adjacent to path cells
   * These are the "connection points" where creeks attach to islands
   */
  identifyConnectionCells() {
    this.connectionCells.clear();
    
    const dirs = [
      { x: 1, z: 0 },
      { x: -1, z: 0 },
      { x: 0, z: 1 },
      { x: 0, z: -1 },
    ];
    
    // For each path cell, check its neighbors
    for (const cellKey of this.pathCells) {
      const [x, z] = cellKey.split(',').map(Number);
      
      for (const dir of dirs) {
        const nx = x + dir.x;
        const nz = z + dir.z;
        
        // Check if neighbor is an island cell (not void, not path)
        if (nx >= 0 && nx < this.gridSize && nz >= 0 && nz < this.gridSize) {
          if (this.grid[nx][nz] >= 0) {  // Island cell
            this.connectionCells.add(`${nx},${nz}`);
          }
        }
      }
    }
    
    console.log(`Creeks: Identified ${this.connectionCells.size} island connection cells`);
  }
  
  /**
   * Create the path mesh using optimized face generation
   */
  createPathMesh() {
    const cellSize = this.cellSize;
    const halfGrid = this.halfGrid;
    const depth = CREEKS_CONFIG.pathDepth;
    const meshConfig = CREEKS_CONFIG.mesh;
    
    const faces = [];
    
    // Generate faces for each path cell
    for (const cellKey of this.pathCells) {
      const [x, z] = cellKey.split(',').map(Number);
      
      const worldX = (x - halfGrid) * cellSize + cellSize / 2;
      const worldZ = (z - halfGrid) * cellSize + cellSize / 2;
      
      // TOP face
      if (meshConfig.includeTop) {
        faces.push({
          direction: 'TOP',
          x: worldX,
          y: 0,
          z: worldZ,
          width: cellSize,
          height: cellSize,
        });
      }
      
      // BOTTOM face
      if (meshConfig.includeBottom) {
        faces.push({
          direction: 'BOTTOM',
          x: worldX,
          y: -depth,
          z: worldZ,
          width: cellSize,
          height: cellSize,
        });
      }
      
      // SIDE faces - only if neighbor is not a path cell and not an island
      if (meshConfig.includeSides) {
        // +X
        if (this.isOpenSide(x + 1, z)) {
          faces.push({
            direction: 'RIGHT',
            x: worldX + cellSize / 2,
            y: -depth / 2,
            z: worldZ,
            width: cellSize,
            height: depth,
          });
        }
        
        // -X
        if (this.isOpenSide(x - 1, z)) {
          faces.push({
            direction: 'LEFT',
            x: worldX - cellSize / 2,
            y: -depth / 2,
            z: worldZ,
            width: cellSize,
            height: depth,
          });
        }
        
        // +Z
        if (this.isOpenSide(x, z + 1)) {
          faces.push({
            direction: 'FRONT',
            x: worldX,
            y: -depth / 2,
            z: worldZ + cellSize / 2,
            width: cellSize,
            height: depth,
          });
        }
        
        // -Z
        if (this.isOpenSide(x, z - 1)) {
          faces.push({
            direction: 'BACK',
            x: worldX,
            y: -depth / 2,
            z: worldZ - cellSize / 2,
            width: cellSize,
            height: depth,
          });
        }
      }
    }
    
    if (faces.length === 0) {
      console.warn('Creeks: No faces to create mesh from');
      return;
    }
    
    // Build geometry
    const geometry = this.buildGeometryFromFaces(faces);
    
    // Create material
    const material = new THREE.MeshStandardMaterial({
      color: CREEKS_CONFIG.pathColor,
      roughness: 0.85,
      metalness: 0.1,
    });
    
    // Create mesh
    this.pathMesh = new THREE.Mesh(geometry, material);
    this.pathMesh.castShadow = true;
    this.pathMesh.receiveShadow = true;
    this.pathMesh.name = 'creek_paths';
    
    this.scene.add(this.pathMesh);
    
    // Register with mesh registry
    const id = meshRegistry.register(this.pathMesh, MeshCategory.GROUND, {
      name: 'creek_paths',
      needsPhysics: true,
      isStatic: true,
    });
    
    // Create physics collider
    const physics = physicsMeshers.createTrimeshCollider(this.pathMesh, {
      friction: 0.8,
      restitution: 0.0,
    });
    
    if (physics) {
      meshRegistry.linkPhysicsBody(id, physics.body, physics.colliders);
      this.physicsBody = physics.body;
    }
    
    // Update stats
    this.stats.totalPaths = this.paths.length;
    this.stats.totalCells = this.pathCells.size;
    this.stats.connectionCells = this.connectionCells.size;
    this.stats.optimizedFaces = faces.length;
    
    console.log(`Creeks: Mesh created with ${faces.length} faces (${this.pathCells.size} path cells, ${this.connectionCells.size} connection points)`);
  }
  
  /**
   * Check if a side should be open (not connected to path or island)
   */
  isOpenSide(x, z) {
    // Out of bounds = open
    if (x < 0 || x >= this.gridSize || z < 0 || z >= this.gridSize) {
      return true;
    }
    
    // Island cell = not open (seamless connection)
    if (this.grid[x][z] >= 0) {
      return false;
    }
    
    // Another path cell = not open
    if (this.isPathCell(x, z)) {
      return false;
    }
    
    // Void = open
    return true;
  }
  
  /**
   * Build BufferGeometry from face definitions
   * (Same as islands.js)
   */
  buildGeometryFromFaces(faces) {
    const vertexCount = faces.length * 4;
    const indexCount = faces.length * 6;
    
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const indices = new Uint32Array(indexCount);
    
    let vertexOffset = 0;
    let uvOffset = 0;
    let indexOffset = 0;
    
    for (const face of faces) {
      const vStart = vertexOffset / 3;
      const dirInfo = FACE_DIRECTIONS[face.direction];
      const normal = dirInfo.normal;
      const verts = this.getQuadVertices(face);
      
      for (let i = 0; i < 4; i++) {
        positions[vertexOffset + i * 3 + 0] = verts[i].x;
        positions[vertexOffset + i * 3 + 1] = verts[i].y;
        positions[vertexOffset + i * 3 + 2] = verts[i].z;
        
        normals[vertexOffset + i * 3 + 0] = normal[0];
        normals[vertexOffset + i * 3 + 1] = normal[1];
        normals[vertexOffset + i * 3 + 2] = normal[2];
      }
      
      uvs[uvOffset + 0] = 0; uvs[uvOffset + 1] = 0;
      uvs[uvOffset + 2] = 1; uvs[uvOffset + 3] = 0;
      uvs[uvOffset + 4] = 1; uvs[uvOffset + 5] = 1;
      uvs[uvOffset + 6] = 0; uvs[uvOffset + 7] = 1;
      
      // CCW winding for correct normals
      indices[indexOffset + 0] = vStart + 0;
      indices[indexOffset + 1] = vStart + 2;
      indices[indexOffset + 2] = vStart + 1;
      indices[indexOffset + 3] = vStart + 0;
      indices[indexOffset + 4] = vStart + 3;
      indices[indexOffset + 5] = vStart + 2;
      
      vertexOffset += 4 * 3;
      uvOffset += 4 * 2;
      indexOffset += 6;
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    
    return geometry;
  }
  
  /**
   * Generate quad vertices (same as islands.js)
   */
  getQuadVertices(face) {
    const { direction, x, y, z, width, height } = face;
    const hw = width / 2;
    const hh = height / 2;
    
    switch (direction) {
      case 'TOP':
        return [
          { x: x - hw, y: y, z: z - hw },
          { x: x + hw, y: y, z: z - hw },
          { x: x + hw, y: y, z: z + hw },
          { x: x - hw, y: y, z: z + hw },
        ];
        
      case 'BOTTOM':
        return [
          { x: x - hw, y: y, z: z + hw },
          { x: x + hw, y: y, z: z + hw },
          { x: x + hw, y: y, z: z - hw },
          { x: x - hw, y: y, z: z - hw },
        ];
        
      case 'RIGHT':
        return [
          { x: x, y: y - hh, z: z - hw },
          { x: x, y: y - hh, z: z + hw },
          { x: x, y: y + hh, z: z + hw },
          { x: x, y: y + hh, z: z - hw },
        ];
        
      case 'LEFT':
        return [
          { x: x, y: y - hh, z: z + hw },
          { x: x, y: y - hh, z: z - hw },
          { x: x, y: y + hh, z: z - hw },
          { x: x, y: y + hh, z: z + hw },
        ];
        
      case 'FRONT':
        return [
          { x: x + hw, y: y - hh, z: z },
          { x: x - hw, y: y - hh, z: z },
          { x: x - hw, y: y + hh, z: z },
          { x: x + hw, y: y + hh, z: z },
        ];
        
      case 'BACK':
        return [
          { x: x - hw, y: y - hh, z: z },
          { x: x + hw, y: y - hh, z: z },
          { x: x + hw, y: y + hh, z: z },
          { x: x - hw, y: y + hh, z: z },
        ];
        
      default:
        return [
          { x: 0, y: 0, z: 0 },
          { x: 0, y: 0, z: 0 },
          { x: 0, y: 0, z: 0 },
          { x: 0, y: 0, z: 0 },
        ];
    }
  }
  
  /**
   * Create debug grid tiles for path cells (navy) and connection cells (gasoline green)
   */
  createDebugGrid() {
    if (this.pathCells.size === 0) return;
    
    const cellSize = this.cellSize;
    const halfGrid = this.halfGrid;
    const debugConfig = CREEKS_CONFIG.debug;
    
    // Group to hold all debug tiles
    this.debugGrid = new THREE.Group();
    this.debugGrid.name = 'creeks_debug_grid';
    
    // Navy material for path cells
    const pathMaterial = new THREE.MeshBasicMaterial({
      color: debugConfig.color,
      transparent: true,
      opacity: debugConfig.opacity,
      side: THREE.DoubleSide,
    });
    
    // Gasoline green material for connection cells
    const connectionMaterial = new THREE.MeshBasicMaterial({
      color: debugConfig.connectionColor,
      transparent: true,
      opacity: 0.9,  // Slightly more visible
      side: THREE.DoubleSide,
    });
    
    // Shared geometry for all cells
    const cellGeom = new THREE.PlaneGeometry(cellSize * 0.9, cellSize * 0.9);
    cellGeom.rotateX(-Math.PI / 2);
    
    // Create tiles for path cells (navy)
    for (const cellKey of this.pathCells) {
      const [x, z] = cellKey.split(',').map(Number);
      
      const tile = new THREE.Mesh(cellGeom, pathMaterial);
      
      // Convert grid coords to world coords
      const worldX = (x - halfGrid) * cellSize + cellSize / 2;
      const worldZ = (z - halfGrid) * cellSize + cellSize / 2;
      
      tile.position.set(worldX, debugConfig.height, worldZ);
      this.debugGrid.add(tile);
    }
    
    // Create tiles for connection cells (gasoline green)
    // These go slightly higher so they're visible on top of island debug tiles
    for (const cellKey of this.connectionCells) {
      const [x, z] = cellKey.split(',').map(Number);
      
      const tile = new THREE.Mesh(cellGeom, connectionMaterial);
      
      const worldX = (x - halfGrid) * cellSize + cellSize / 2;
      const worldZ = (z - halfGrid) * cellSize + cellSize / 2;
      
      tile.position.set(worldX, debugConfig.height + 0.05, worldZ);
      this.debugGrid.add(tile);
    }
    
    // Start hidden (matches DEBUG category default)
    this.debugGrid.visible = this.debugVisible;
    this.scene.add(this.debugGrid);
    
    // Register with mesh registry as DEBUG category
    meshRegistry.register(this.debugGrid, MeshCategory.DEBUG, {
      name: 'creeks_debug_grid',
      needsPhysics: false,
    });
    
    console.log(`Creeks: Debug grid created with ${this.pathCells.size} path tiles (navy) and ${this.connectionCells.size} connection tiles (green)`);
  }
  
  /**
   * Toggle debug grid visibility
   * @returns {boolean} New visibility state
   */
  toggleDebug() {
    this.debugVisible = !this.debugVisible;
    if (this.debugGrid) {
      this.debugGrid.visible = this.debugVisible;
    }
    console.log(`Creeks debug grid: ${this.debugVisible ? 'ON' : 'OFF'}`);
    return this.debugVisible;
  }
  
  /**
   * Set debug grid visibility
   * @param {boolean} visible
   */
  setDebugVisible(visible) {
    this.debugVisible = visible;
    if (this.debugGrid) {
      this.debugGrid.visible = visible;
    }
  }
  
  /**
   * Check if a world position is on a path
   */
  isOnPath(worldX, worldZ) {
    const cellX = Math.floor(worldX / this.cellSize + this.halfGrid);
    const cellZ = Math.floor(worldZ / this.cellSize + this.halfGrid);
    return this.isPathCell(cellX, cellZ);
  }
  
  /**
   * Get stats
   */
  getStats() {
    return { ...this.stats };
  }
  
  /**
   * Clear all paths
   */
  clear() {
    if (this.pathMesh) {
      this.scene.remove(this.pathMesh);
      this.pathMesh.geometry?.dispose();
      this.pathMesh.material?.dispose();
      this.pathMesh = null;
    }
    
    if (this.debugGrid) {
      this.scene.remove(this.debugGrid);
      // Dispose children
      this.debugGrid.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      this.debugGrid = null;
    }
    
    this.paths = [];
    this.pathCells.clear();
    this.connectionCells.clear();
    this.physicsBody = null;
  }
  
  /**
   * Debug info
   */
  getDebugInfo() {
    return {
      paths: this.paths.length,
      cells: this.pathCells.size,
      connectionCells: this.connectionCells.size,
      stats: this.stats,
    };
  }
}

// Export singleton
const creeks = new Creeks();
export default creeks;
export { Creeks, CREEKS_CONFIG };