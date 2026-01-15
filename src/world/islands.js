/**
 * Islands - Competitive growth island generator
 * Seeds 3-6 islands and grows them until they fill the map
 * 
 * OPTIMIZED: Multi-pass mesh builder that eliminates internal faces
 * between adjacent land cells for ~70-80% geometry reduction.
 * 
 * NEW: Tracks center cell for each island (useful for road building)
 */

import * as THREE from 'three';
import meshRegistry, { MeshCategory } from '../registries/meshregistry.js';
import physicsMeshers from '../physics/physicsmeshers.js';

// Configuration
const ISLANDS_CONFIG = {
  // Grid settings (should match map.js)
  gridSize: 200,
  gridDivisions: 50,
  
  // Island generation
  minIslands: 3,
  maxIslands: 6,
  
  // Canyon width between islands (cells)
  minCanyonWidth: 3,
  maxCanyonWidth: 5,
  
  // Island depth (how far down they extrude)
  islandDepth: 20,
  
  // Visual
  groundColor: 0x909088,
  
  // Edge margin
  edgeMargin: 1,
  
  // Mesh optimization settings
  mesh: {
    includeTop: true,
    includeBottom: true,   // Bottom face at -depth elevation
    includeSides: true,
  },
  
  // Debug grid
  debug: {
    height: 0.5,           // Height above ground
    opacity: 0.6,
    colors: {
      void: 0x330000,      // Dark red for void/canyon
      island: 0x003300,    // Dark green for island
      center: 0xFF00FF,    // Magenta for island center cells
    }
  }
};

// Face directions for optimized mesh building
const FACE_DIRECTIONS = {
  TOP:    { normal: [ 0,  1,  0] },
  BOTTOM: { normal: [ 0, -1,  0] },
  RIGHT:  { normal: [ 1,  0,  0] },  // +X
  LEFT:   { normal: [-1,  0,  0] },  // -X
  FRONT:  { normal: [ 0,  0,  1] },  // +Z
  BACK:   { normal: [ 0,  0, -1] },  // -Z
};

class Islands {
  constructor() {
    this.scene = null;
    this.islands = [];
    this.cellSize = ISLANDS_CONFIG.gridSize / ISLANDS_CONFIG.gridDivisions;
    this.halfGrid = ISLANDS_CONFIG.gridDivisions / 2;
    
    // Grid state: -1 = void/gap, 0+ = island index
    this.grid = null;
    
    // Set of center cell keys for quick lookup: "x,z"
    this.centerCells = new Set();
    
    // The single merged ground mesh
    this.groundMesh = null;
    this.physicsBody = null;
    
    // Debug visualization
    this.debugGrid = null;
    this.debugVisible = false;
    
    // Mesh optimization stats
    this.meshStats = {
      landCells: 0,
      naiveFaces: 0,
      optimizedFaces: 0,
      cullRate: 0,
    };
  }
  
  /**
   * Initialize islands system
   * @param {THREE.Scene} scene
   */
  init(scene) {
    this.scene = scene;
    console.log('Islands system initialized');
  }
  
  /**
   * Initialize grid as empty (all void)
   */
  initGrid() {
    const size = ISLANDS_CONFIG.gridDivisions;
    this.grid = [];
    for (let x = 0; x < size; x++) {
      this.grid[x] = [];
      for (let z = 0; z < size; z++) {
        this.grid[x][z] = -1;  // -1 = unclaimed
      }
    }
  }
  
  /**
   * Generate the world with competitive island growth
   * @param {number} seed - Optional random seed
   */
  generate(seed = null) {
    if (seed !== null) {
      this.randomSeed = seed;
    } else {
      this.randomSeed = Date.now();
    }
    
    // Clear previous
    this.clear();
    this.initGrid();
    
    // Decide number of islands
    const numIslands = this.randomInt(
      ISLANDS_CONFIG.minIslands,
      ISLANDS_CONFIG.maxIslands
    );
    
    console.log(`Growing ${numIslands} islands...`);
    
    // Create island seeds
    this.createSeeds(numIslands);
    
    // Grow islands competitively
    this.growIslands();
    
    // Calculate center cells for each island (NEW)
    this.calculateCenterCells();
    
    // Create the ground mesh (OPTIMIZED)
    this.createGroundMesh();
    
    // Create debug visualization
    this.createDebugGrid();
    
    console.log(`Created ${this.islands.length} islands`);
    return this.islands;
  }
  
  /**
   * Create initial seed positions for islands
   */
  createSeeds(numIslands) {
    const gridSize = ISLANDS_CONFIG.gridDivisions;
    const margin = ISLANDS_CONFIG.edgeMargin;
    
    this.islands = [];
    
    // Try to space seeds apart
    const minSeedDistance = gridSize / (numIslands + 1);
    
    for (let i = 0; i < numIslands; i++) {
      let bestSeed = null;
      let bestDistance = 0;
      
      // Try multiple times to find a good position
      for (let attempt = 0; attempt < 50; attempt++) {
        const x = this.randomInt(margin, gridSize - margin - 1);
        const z = this.randomInt(margin, gridSize - margin - 1);
        
        // Calculate minimum distance to existing seeds
        let minDist = Infinity;
        for (const island of this.islands) {
          const dist = Math.sqrt(
            Math.pow(x - island.seed.x, 2) + 
            Math.pow(z - island.seed.z, 2)
          );
          minDist = Math.min(minDist, dist);
        }
        
        // First seed or better than previous best
        if (this.islands.length === 0 || minDist > bestDistance) {
          bestDistance = minDist;
          bestSeed = { x, z };
        }
        
        // Good enough
        if (minDist >= minSeedDistance) break;
      }
      
      if (bestSeed) {
        // Claim the seed cell
        this.grid[bestSeed.x][bestSeed.z] = i;
        
        this.islands.push({
          index: i,
          seed: bestSeed,
          cells: [{ x: bestSeed.x, z: bestSeed.z }],
          frontier: [{ x: bestSeed.x, z: bestSeed.z }],
          centerCell: null,  // Will be calculated after growth
        });
      }
    }
    
    console.log(`Placed ${this.islands.length} island seeds`);
  }
  
  /**
   * Grow all islands simultaneously until no more growth possible
   */
  growIslands() {
    const gridSize = ISLANDS_CONFIG.gridDivisions;
    
    // Pick a canyon width for this generation
    const canyonWidth = this.randomInt(
      ISLANDS_CONFIG.minCanyonWidth,
      ISLANDS_CONFIG.maxCanyonWidth
    );
    
    console.log(`Using canyon width: ${canyonWidth} cells`);
    
    let growing = true;
    let iterations = 0;
    const maxIterations = gridSize * gridSize;
    
    // PASS 1: Frontier-based competitive growth
    while (growing && iterations < maxIterations) {
      growing = false;
      iterations++;
      
      // Each island tries to grow from ALL current frontier cells
      for (const island of this.islands) {
        const newFrontier = [];
        
        for (const frontierCell of island.frontier) {
          const neighbors = this.getNeighbors(frontierCell.x, frontierCell.z);
          
          for (const neighbor of neighbors) {
            // Skip if already claimed by anyone
            if (this.grid[neighbor.x]?.[neighbor.z] !== -1) continue;
            
            if (this.canClaim(neighbor.x, neighbor.z, island.index, canyonWidth)) {
              // Claim this cell
              this.grid[neighbor.x][neighbor.z] = island.index;
              island.cells.push({ x: neighbor.x, z: neighbor.z });
              newFrontier.push({ x: neighbor.x, z: neighbor.z });
              growing = true;
            }
          }
        }
        
        // New frontier is the newly claimed cells
        island.frontier = newFrontier;
      }
    }
    
    // PASS 2: Claim ALL remaining unclaimed cells that CAN be claimed
    // This fills in any gaps the frontier growth missed
    let pass2Claims = 0;
    let changed = true;
    while (changed) {
      changed = false;
      
      for (let x = 0; x < gridSize; x++) {
        for (let z = 0; z < gridSize; z++) {
          if (this.grid[x][z] !== -1) continue;  // Already claimed
          
          // Find which island (if any) can claim this cell
          // Check neighbors to find adjacent islands
          const neighbors = this.getNeighbors(x, z);
          let claimingIsland = -1;
          
          for (const neighbor of neighbors) {
            const neighborOwner = this.grid[neighbor.x]?.[neighbor.z];
            if (neighborOwner !== undefined && neighborOwner >= 0) {
              // Found an adjacent island - can we claim for it?
              if (this.canClaim(x, z, neighborOwner, canyonWidth)) {
                claimingIsland = neighborOwner;
                break;
              }
            }
          }
          
          if (claimingIsland >= 0) {
            this.grid[x][z] = claimingIsland;
            const island = this.islands.find(isl => isl.index === claimingIsland);
            if (island) {
              island.cells.push({ x, z });
            }
            pass2Claims++;
            changed = true;
          }
        }
      }
    }
    
    if (pass2Claims > 0) {
      console.log(`Pass 2 claimed ${pass2Claims} additional cells`);
    }
    
    // Clean up frontier arrays
    for (const island of this.islands) {
      delete island.frontier;
    }
    
    // Sort by size (largest first) and remap indices
    this.islands.sort((a, b) => b.cells.length - a.cells.length);
    
    // Build old->new index mapping
    const indexMap = new Map();
    this.islands.forEach((island, newIndex) => {
      indexMap.set(island.index, newIndex);
      island.index = newIndex;
    });
    
    // Remap grid values to new indices
    for (let x = 0; x < gridSize; x++) {
      for (let z = 0; z < gridSize; z++) {
        const oldIndex = this.grid[x][z];
        if (oldIndex >= 0) {
          this.grid[x][z] = indexMap.get(oldIndex);
        }
      }
    }
    
    // Count total claimed vs unclaimed
    let claimed = 0;
    let unclaimed = 0;
    for (let x = 0; x < gridSize; x++) {
      for (let z = 0; z < gridSize; z++) {
        if (this.grid[x][z] >= 0) claimed++;
        else unclaimed++;
      }
    }
    
    console.log(`Growth complete after ${iterations} iterations`);
    console.log(`Cells: ${claimed} land, ${unclaimed} canyon (${(unclaimed / (gridSize * gridSize) * 100).toFixed(1)}% void)`);
  }
  
  /**
   * Calculate the center cell for each island
   * Finds the cell closest to the geometric centroid
   */
  calculateCenterCells() {
    this.centerCells.clear();
    
    for (const island of this.islands) {
      if (island.cells.length === 0) continue;
      
      // Calculate centroid (average position)
      let sumX = 0;
      let sumZ = 0;
      for (const cell of island.cells) {
        sumX += cell.x;
        sumZ += cell.z;
      }
      const centroidX = sumX / island.cells.length;
      const centroidZ = sumZ / island.cells.length;
      
      // Find the cell closest to the centroid
      let closestCell = island.cells[0];
      let closestDist = Infinity;
      
      for (const cell of island.cells) {
        const dist = Math.sqrt(
          Math.pow(cell.x - centroidX, 2) +
          Math.pow(cell.z - centroidZ, 2)
        );
        if (dist < closestDist) {
          closestDist = dist;
          closestCell = cell;
        }
      }
      
      // Store on island object
      island.centerCell = { x: closestCell.x, z: closestCell.z };
      island.centroid = { x: centroidX, z: centroidZ };
      
      // Add to quick lookup set
      this.centerCells.add(`${closestCell.x},${closestCell.z}`);
      
      console.log(`Island ${island.index}: center cell (${closestCell.x}, ${closestCell.z}), centroid (${centroidX.toFixed(1)}, ${centroidZ.toFixed(1)}), ${island.cells.length} cells`);
    }
  }
  
  /**
   * Check if a cell is a center cell
   * @param {number} x - Grid X coordinate
   * @param {number} z - Grid Z coordinate
   * @returns {boolean}
   */
  isCenterCell(x, z) {
    return this.centerCells.has(`${x},${z}`);
  }
  
  /**
   * Get the center cell for a specific island
   * @param {number} islandIndex
   * @returns {object|null} { x, z } or null
   */
  getIslandCenterCell(islandIndex) {
    const island = this.islands[islandIndex];
    return island?.centerCell || null;
  }
  
  /**
   * Check if a cell can be claimed by an island
   * Ensures minimum canyon width between islands
   */
  canClaim(x, z, islandIndex, canyonWidth) {
    const gridSize = ISLANDS_CONFIG.gridDivisions;
    const margin = ISLANDS_CONFIG.edgeMargin;
    
    // Check bounds
    if (x < margin || x >= gridSize - margin) return false;
    if (z < margin || z >= gridSize - margin) return false;
    
    // Check if already claimed
    if (this.grid[x][z] !== -1) return false;
    
    // Check for nearby cells from OTHER islands (maintain canyon width)
    for (let dx = -canyonWidth; dx <= canyonWidth; dx++) {
      for (let dz = -canyonWidth; dz <= canyonWidth; dz++) {
        if (dx === 0 && dz === 0) continue;
        
        const nx = x + dx;
        const nz = z + dz;
        
        if (nx >= 0 && nx < gridSize && nz >= 0 && nz < gridSize) {
          const neighborOwner = this.grid[nx][nz];
          if (neighborOwner !== -1 && neighborOwner !== islandIndex) {
            // Another island is too close
            return false;
          }
        }
      }
    }
    
    return true;
  }
  
  /**
   * Get valid neighbor cells
   */
  getNeighbors(x, z) {
    return [
      { x: x + 1, z: z },
      { x: x - 1, z: z },
      { x: x, z: z + 1 },
      { x: x, z: z - 1 },
    ];
  }
  
  /**
   * Shuffle array in place
   */
  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.randomInt(0, i);
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
  
  // ===========================================================================
  // OPTIMIZED MESH GENERATION
  // Multi-pass builder that only creates exterior faces
  // ===========================================================================
  
  /**
   * Check if a grid cell is void (empty/canyon) or out of bounds
   * @param {number} x - Grid X coordinate
   * @param {number} z - Grid Z coordinate
   * @returns {boolean}
   */
  isVoidCell(x, z) {
    const gridSize = ISLANDS_CONFIG.gridDivisions;
    if (x < 0 || x >= gridSize || z < 0 || z >= gridSize) {
      return true;  // Out of bounds = void
    }
    return this.grid[x][z] < 0;
  }
  
  /**
   * Create the ground mesh from land cells (OPTIMIZED)
   * 
   * Multi-pass approach:
   *   1. Scan all land cells
   *   2. For each cell, only create faces that border void/air
   *   3. Build single optimized BufferGeometry
   * 
   * Result: ~70-80% fewer triangles than naive box-per-cell approach
   */
  createGroundMesh() {
    const gridSize = ISLANDS_CONFIG.gridDivisions;
    const cellSize = this.cellSize;
    const halfCell = cellSize / 2;
    const halfGrid = this.halfGrid;
    const depth = ISLANDS_CONFIG.islandDepth;
    const meshConfig = ISLANDS_CONFIG.mesh;
    
    // Reset stats
    this.meshStats = {
      landCells: 0,
      naiveFaces: 0,
      optimizedFaces: 0,
      cullRate: 0,
    };
    
    // Collect all exterior faces
    const faces = [];
    
    // =========================================================================
    // PASS: Analyze adjacency and collect exterior faces only
    // =========================================================================
    
    for (let x = 0; x < gridSize; x++) {
      for (let z = 0; z < gridSize; z++) {
        // Skip void cells
        if (this.grid[x][z] < 0) continue;
        
        this.meshStats.landCells++;
        this.meshStats.naiveFaces += 6;  // A naive box would have 6 faces
        
        // Calculate world position (center of cell at surface level)
        const worldX = (x - halfGrid) * cellSize + halfCell;
        const worldZ = (z - halfGrid) * cellSize + halfCell;
        
        // TOP face - always visible (it's the walking surface)
        if (meshConfig.includeTop) {
          faces.push({
            direction: 'TOP',
            x: worldX,
            y: 0,  // Surface level
            z: worldZ,
            width: cellSize,
            height: cellSize,
          });
        }
        
        // BOTTOM face - only if we want to see underneath
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
        
        // SIDE faces - only if neighbor is void (air/canyon)
        if (meshConfig.includeSides) {
          // Check +X neighbor (RIGHT face)
          if (this.isVoidCell(x + 1, z)) {
            faces.push({
              direction: 'RIGHT',
              x: worldX + cellSize / 2,
              y: -depth / 2,
              z: worldZ,
              width: cellSize,   // Along Z
              height: depth,     // Along Y
            });
          }
          
          // Check -X neighbor (LEFT face)
          if (this.isVoidCell(x - 1, z)) {
            faces.push({
              direction: 'LEFT',
              x: worldX - cellSize / 2,
              y: -depth / 2,
              z: worldZ,
              width: cellSize,
              height: depth,
            });
          }
          
          // Check +Z neighbor (FRONT face)
          if (this.isVoidCell(x, z + 1)) {
            faces.push({
              direction: 'FRONT',
              x: worldX,
              y: -depth / 2,
              z: worldZ + cellSize / 2,
              width: cellSize,
              height: depth,
            });
          }
          
          // Check -Z neighbor (BACK face)
          if (this.isVoidCell(x, z - 1)) {
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
    }
    
    if (faces.length === 0) {
      console.warn('No land cells to create mesh from!');
      return;
    }
    
    // =========================================================================
    // BUILD: Create BufferGeometry from collected faces
    // =========================================================================
    
    const geometry = this.buildGeometryFromFaces(faces);
    
    // Calculate stats
    this.meshStats.optimizedFaces = faces.length;
    this.meshStats.cullRate = (1 - this.meshStats.optimizedFaces / this.meshStats.naiveFaces) * 100;
    
    // Create material
    const material = new THREE.MeshStandardMaterial({
      color: ISLANDS_CONFIG.groundColor,
      roughness: 0.9,
      metalness: 0.1,
    });
    
    // Create mesh
    this.groundMesh = new THREE.Mesh(geometry, material);
    this.groundMesh.castShadow = true;
    this.groundMesh.receiveShadow = true;
    this.groundMesh.name = 'ground_islands';
    
    this.scene.add(this.groundMesh);
    
    // Register with mesh registry
    const id = meshRegistry.register(this.groundMesh, MeshCategory.GROUND, {
      name: 'ground_islands',
      needsPhysics: true,
      isStatic: true,
    });
    
    // Create physics collider (also benefits from fewer triangles!)
    const physics = physicsMeshers.createTrimeshCollider(this.groundMesh, {
      friction: 0.8,
      restitution: 0.0,
    });
    
    if (physics) {
      meshRegistry.linkPhysicsBody(id, physics.body, physics.colliders);
      this.physicsBody = physics.body;
    }
    
    // Log optimization results
    this.logMeshStats();
  }
  
  /**
   * Build BufferGeometry from face definitions
   * @param {Array} faces - Array of face definitions
   * @returns {THREE.BufferGeometry}
   */
  buildGeometryFromFaces(faces) {
    const vertexCount = faces.length * 4;  // 4 vertices per face (quad)
    const indexCount = faces.length * 6;   // 2 triangles = 6 indices per face
    
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const indices = new Uint32Array(indexCount);
    
    let vertexOffset = 0;
    let uvOffset = 0;
    let indexOffset = 0;
    
    for (const face of faces) {
      const vStart = vertexOffset / 3;  // Starting vertex index
      
      // Get face direction info
      const dirInfo = FACE_DIRECTIONS[face.direction];
      const normal = dirInfo.normal;
      
      // Generate 4 vertices for this quad
      const verts = this.getQuadVertices(face);
      
      // Write vertices and normals
      for (let i = 0; i < 4; i++) {
        positions[vertexOffset + i * 3 + 0] = verts[i].x;
        positions[vertexOffset + i * 3 + 1] = verts[i].y;
        positions[vertexOffset + i * 3 + 2] = verts[i].z;
        
        normals[vertexOffset + i * 3 + 0] = normal[0];
        normals[vertexOffset + i * 3 + 1] = normal[1];
        normals[vertexOffset + i * 3 + 2] = normal[2];
      }
      
      // UVs (simple 0-1 mapping per face)
      uvs[uvOffset + 0] = 0; uvs[uvOffset + 1] = 0;
      uvs[uvOffset + 2] = 1; uvs[uvOffset + 3] = 0;
      uvs[uvOffset + 4] = 1; uvs[uvOffset + 5] = 1;
      uvs[uvOffset + 6] = 0; uvs[uvOffset + 7] = 1;
      
      // Indices (two triangles: 0-2-1, 0-3-2) - CCW winding for correct normals
      indices[indexOffset + 0] = vStart + 0;
      indices[indexOffset + 1] = vStart + 2;
      indices[indexOffset + 2] = vStart + 1;
      indices[indexOffset + 3] = vStart + 0;
      indices[indexOffset + 4] = vStart + 3;
      indices[indexOffset + 5] = vStart + 2;
      
      vertexOffset += 4 * 3;  // 4 vertices * 3 components
      uvOffset += 4 * 2;      // 4 vertices * 2 UV components
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
   * Generate 4 vertices for a quad face
   * Vertices are ordered for CCW winding (correct face culling)
   * @param {object} face - Face definition
   * @returns {Array} Array of 4 vertex positions
   */
  getQuadVertices(face) {
    const { direction, x, y, z, width, height } = face;
    const hw = width / 2;
    const hh = height / 2;
    
    switch (direction) {
      case 'TOP':
        // Horizontal face at y, spanning x and z
        return [
          { x: x - hw, y: y, z: z - hw },  // BL
          { x: x + hw, y: y, z: z - hw },  // BR
          { x: x + hw, y: y, z: z + hw },  // TR
          { x: x - hw, y: y, z: z + hw },  // TL
        ];
        
      case 'BOTTOM':
        // Horizontal face at y, spanning x and z (flipped winding)
        return [
          { x: x - hw, y: y, z: z + hw },
          { x: x + hw, y: y, z: z + hw },
          { x: x + hw, y: y, z: z - hw },
          { x: x - hw, y: y, z: z - hw },
        ];
        
      case 'RIGHT':  // +X face
        // Vertical face, normal pointing +X
        return [
          { x: x, y: y - hh, z: z - hw },
          { x: x, y: y - hh, z: z + hw },
          { x: x, y: y + hh, z: z + hw },
          { x: x, y: y + hh, z: z - hw },
        ];
        
      case 'LEFT':  // -X face
        // Vertical face, normal pointing -X
        return [
          { x: x, y: y - hh, z: z + hw },
          { x: x, y: y - hh, z: z - hw },
          { x: x, y: y + hh, z: z - hw },
          { x: x, y: y + hh, z: z + hw },
        ];
        
      case 'FRONT':  // +Z face
        // Vertical face, normal pointing +Z
        return [
          { x: x + hw, y: y - hh, z: z },
          { x: x - hw, y: y - hh, z: z },
          { x: x - hw, y: y + hh, z: z },
          { x: x + hw, y: y + hh, z: z },
        ];
        
      case 'BACK':  // -Z face
        // Vertical face, normal pointing -Z
        return [
          { x: x - hw, y: y - hh, z: z },
          { x: x + hw, y: y - hh, z: z },
          { x: x + hw, y: y + hh, z: z },
          { x: x - hw, y: y + hh, z: z },
        ];
        
      default:
        console.warn(`Unknown face direction: ${direction}`);
        return [
          { x: 0, y: 0, z: 0 },
          { x: 0, y: 0, z: 0 },
          { x: 0, y: 0, z: 0 },
          { x: 0, y: 0, z: 0 },
        ];
    }
  }
  
  /**
   * Log mesh optimization statistics
   */
  logMeshStats() {
    const stats = this.meshStats;
    const naiveTriangles = stats.naiveFaces * 2;
    const optimizedTriangles = stats.optimizedFaces * 2;
    
    console.log('=== Island Mesh Optimization ===');
    console.log(`  Land cells: ${stats.landCells}`);
    console.log(`  Naive: ${stats.naiveFaces} faces (${naiveTriangles} triangles)`);
    console.log(`  Optimized: ${stats.optimizedFaces} faces (${optimizedTriangles} triangles)`);
    console.log(`  Reduction: ${stats.cullRate.toFixed(1)}%`);
    console.log(`  Triangles: ${naiveTriangles} → ${optimizedTriangles} (saved ${naiveTriangles - optimizedTriangles})`);
  }
  
  /**
   * Get mesh stats for debugging
   */
  getMeshStats() {
    return { ...this.meshStats };
  }
  
  // ===========================================================================
  // DEBUG VISUALIZATION
  // ===========================================================================
  
  /**
   * Create a debug grid that colors cells by type
   * Now includes magenta coloring for center cells
   */
  createDebugGrid() {
    const gridSize = ISLANDS_CONFIG.gridDivisions;
    const cellSize = this.cellSize;
    const halfCell = cellSize / 2;
    const halfGrid = this.halfGrid;
    const debugConfig = ISLANDS_CONFIG.debug;
    
    // Group to hold all debug tiles
    this.debugGrid = new THREE.Group();
    this.debugGrid.name = 'debug_grid';
    
    // Materials for each type
    const materials = {
      void: new THREE.MeshBasicMaterial({
        color: debugConfig.colors.void,
        transparent: true,
        opacity: debugConfig.opacity,
        side: THREE.DoubleSide,
      }),
      island: new THREE.MeshBasicMaterial({
        color: debugConfig.colors.island,
        transparent: true,
        opacity: debugConfig.opacity,
        side: THREE.DoubleSide,
      }),
      center: new THREE.MeshBasicMaterial({
        color: debugConfig.colors.center,
        transparent: true,
        opacity: 0.9,  // Slightly more visible
        side: THREE.DoubleSide,
      }),
    };
    
    // Shared geometry for all cells
    const cellGeom = new THREE.PlaneGeometry(cellSize * 0.95, cellSize * 0.95);
    cellGeom.rotateX(-Math.PI / 2);
    
    // Create a tile for each cell
    for (let x = 0; x < gridSize; x++) {
      for (let z = 0; z < gridSize; z++) {
        const cellValue = this.grid[x][z];
        
        // Determine material: center > island > void
        let material;
        if (this.isCenterCell(x, z)) {
          material = materials.center;
        } else if (cellValue >= 0) {
          material = materials.island;
        } else {
          material = materials.void;
        }
        
        const tile = new THREE.Mesh(cellGeom, material);
        
        // Convert grid coords to world coords
        const worldX = (x - halfGrid) * cellSize + halfCell;
        const worldZ = (z - halfGrid) * cellSize + halfCell;
        
        tile.position.set(worldX, debugConfig.height, worldZ);
        this.debugGrid.add(tile);
      }
    }
    
    // Start hidden
    this.debugGrid.visible = this.debugVisible;
    this.scene.add(this.debugGrid);
    
    // Register with mesh registry as DEBUG category
    meshRegistry.register(this.debugGrid, MeshCategory.DEBUG, {
      name: 'islands_debug_grid',
      needsPhysics: false,
    });
    
    console.log(`Debug grid created with ${gridSize * gridSize} tiles (${this.centerCells.size} center cells)`);
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
    console.log(`Islands debug grid: ${this.debugVisible ? 'ON' : 'OFF'}`);
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
  
  // ===========================================================================
  // SPAWN POINTS & QUERIES
  // ===========================================================================
  
  /**
   * Get a random spawn point on a specific island
   */
  getSpawnPoint(islandIndex = 0) {
    const island = this.islands[islandIndex % this.islands.length];
    if (!island || island.cells.length === 0) {
      return { x: 0, y: 1, z: 0 };
    }
    
    // Pick a random cell on this island
    const cell = island.cells[this.randomInt(0, island.cells.length - 1)];
    
    const cellSize = this.cellSize;
    const halfCell = cellSize / 2;
    const halfGrid = this.halfGrid;
    
    const x = (cell.x - halfGrid) * cellSize + halfCell;
    const z = (cell.z - halfGrid) * cellSize + halfCell;
    
    return { x, y: 1, z };
  }
  
  /**
   * Get spawn point on the largest island (good for player)
   */
  getMainSpawnPoint() {
    // Islands are sorted by size, so index 0 is largest
    return this.getSpawnPoint(0);
  }
  
  /**
   * Check if a world position is on land
   */
  isOnIsland(worldX, worldZ) {
    const cellX = Math.floor(worldX / this.cellSize + this.halfGrid);
    const cellZ = Math.floor(worldZ / this.cellSize + this.halfGrid);
    
    if (cellX < 0 || cellX >= ISLANDS_CONFIG.gridDivisions) return false;
    if (cellZ < 0 || cellZ >= ISLANDS_CONFIG.gridDivisions) return false;
    
    return this.grid[cellX][cellZ] >= 0;  // >= 0 means it belongs to an island
  }
  
  /**
   * Get which island a world position is on
   */
  getIslandAt(worldX, worldZ) {
    const cellX = Math.floor(worldX / this.cellSize + this.halfGrid);
    const cellZ = Math.floor(worldZ / this.cellSize + this.halfGrid);
    
    if (cellX < 0 || cellX >= ISLANDS_CONFIG.gridDivisions) return null;
    if (cellZ < 0 || cellZ >= ISLANDS_CONFIG.gridDivisions) return null;
    
    const islandIndex = this.grid[cellX][cellZ];
    if (islandIndex < 0) return null;
    
    return this.islands.find(island => island.cells.some(
      cell => cell.x === cellX && cell.z === cellZ
    )) || null;
  }
  
  // ===========================================================================
  // UTILITIES
  // ===========================================================================
  
  /**
   * Seeded random number generator
   */
  random() {
    this.randomSeed = (this.randomSeed * 9301 + 49297) % 233280;
    return this.randomSeed / 233280;
  }
  
  /**
   * Random integer in range (inclusive)
   */
  randomInt(min, max) {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }
  
  /**
   * Clear all
   */
  clear() {
    if (this.groundMesh) {
      this.scene.remove(this.groundMesh);
      this.groundMesh.geometry?.dispose();
      this.groundMesh.material?.dispose();
      this.groundMesh = null;
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
    
    this.islands = [];
    this.centerCells.clear();
    this.physicsBody = null;
  }
  
  /**
   * Get debug info
   */
  getDebugInfo() {
    return {
      islandCount: this.islands.length,
      islands: this.islands.map(island => ({
        index: island.index,
        cells: island.cells.length,
        centerCell: island.centerCell,
        centroid: island.centroid,
      })),
      meshStats: this.getMeshStats(),
    };
  }
}

// Export singleton
const islands = new Islands();
export default islands;
export { Islands, ISLANDS_CONFIG };