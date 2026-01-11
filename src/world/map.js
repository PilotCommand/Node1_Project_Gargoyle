/**
 * Map - World foundation, ground plane, debug grid, and city generation
 * Manages the base environment and procedural city layout
 */

import * as THREE from 'three';
import meshRegistry, { MeshCategory } from '../registries/meshregistry.js';
import physicsMeshers from '../physics/physicsmeshers.js';
import buildings from './buildings.js';

// Map configuration
const MAP_CONFIG = {
  // World size
  size: 200,
  halfSize: 100,
  
  // Ground
  groundColor: 0x2a2a2a,
  
  // Debug grid
  gridDivisions: 50,
  gridColorCenter: 0x444444,
  gridColorLines: 0x333333,
  
  // Bounds
  boundaryHeight: 10,
  boundaryColor: 0x1a1a1a,
  
  // City generation
  city: {
    enabled: true,
    blockSize: 30,          // Size of each city block
    streetWidth: 10,        // Width of streets
    minBuildings: 1,        // Min buildings per block
    maxBuildings: 3,        // Max buildings per block
    centerClearRadius: 15,  // Keep center clear for spawn
    edgeMargin: 20          // Margin from map edges
  }
};

class GameMap {
  constructor() {
    this.scene = null;
    this.ground = null;
    this.debugGrid = null;
    this.boundaries = [];
    this.isDebugVisible = false;  // Start with debug OFF
    this.seed = null;
    
    // Map data
    this.mapData = {
      size: MAP_CONFIG.size,
      spawnPoints: [],
      trophyLocations: [],
      occupiedCells: new Set(),
      buildingPositions: []
    };
  }
  
  /**
   * Initialize the map with a scene reference
   * @param {THREE.Scene} scene
   * @param {object} options
   */
  init(scene, options = {}) {
    this.scene = scene;
    this.seed = options.seed || Date.now();
    
    console.log('Map initializing...');
    console.log(`Map seed: ${this.seed}`);
    
    // Initialize buildings system
    buildings.init(scene);
    
    this.createGround();
    this.createDebugGrid();
    this.createBoundaries();
    this.createStreets();
    
    // Generate city if enabled
    if (MAP_CONFIG.city.enabled) {
      this.generateCity();
    }
    
    // Set up spawn points
    this.generateSpawnPoints();
    
    meshRegistry.setCategoryVisibility(MeshCategory.DEBUG, this.isDebugVisible);
    console.log('Map initialized');
  }
  
  /**
   * Create the ground plane
   */
  createGround() {
    const groundGeometry = new THREE.PlaneGeometry(
      MAP_CONFIG.size, 
      MAP_CONFIG.size,
      1, 
      1
    );
    
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: MAP_CONFIG.groundColor,
      roughness: 0.9,
      metalness: 0.1,
      side: THREE.DoubleSide
    });
    
    this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = 0;
    this.ground.receiveShadow = true;
    this.ground.name = 'ground';
    
    this.scene.add(this.ground);
    
    const groundId = meshRegistry.register(this.ground, MeshCategory.GROUND, {
      name: 'main_ground',
      needsPhysics: true,
      isStatic: true
    });
    
    const physics = physicsMeshers.createGroundPlane(
      MAP_CONFIG.halfSize,
      MAP_CONFIG.halfSize,
      { y: 0, friction: 0.8 }
    );
    
    if (physics) {
      meshRegistry.linkPhysicsBody(groundId, physics.body, physics.colliders);
    }
    
    console.log('Ground created');
  }
  
  /**
   * Create debug grid overlay
   */
  createDebugGrid() {
    this.debugGrid = new THREE.GridHelper(
      MAP_CONFIG.size,
      MAP_CONFIG.gridDivisions,
      MAP_CONFIG.gridColorCenter,
      MAP_CONFIG.gridColorLines
    );
    this.debugGrid.position.y = 0.01;
    this.debugGrid.name = 'debugGrid';
    
    this.scene.add(this.debugGrid);
    
    meshRegistry.register(this.debugGrid, MeshCategory.DEBUG, {
      name: 'debug_grid',
      needsPhysics: false
    });
    
    // Axis helper at origin
    const axisHelper = new THREE.AxesHelper(10);
    axisHelper.position.y = 0.02;
    axisHelper.name = 'axisHelper';
    this.scene.add(axisHelper);
    
    meshRegistry.register(axisHelper, MeshCategory.DEBUG, {
      name: 'axis_helper',
      needsPhysics: false
    });
    
    // Origin marker
    const originGeometry = new THREE.SphereGeometry(0.5, 16, 16);
    const originMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const originMarker = new THREE.Mesh(originGeometry, originMaterial);
    originMarker.position.y = 0.5;
    originMarker.name = 'originMarker';
    this.scene.add(originMarker);
    
    meshRegistry.register(originMarker, MeshCategory.DEBUG, {
      name: 'origin_marker',
      needsPhysics: false
    });
    
    console.log('Debug grid created');
  }
  
  /**
   * Create invisible boundary walls
   */
  createBoundaries() {
    const halfSize = MAP_CONFIG.halfSize;
    const height = MAP_CONFIG.boundaryHeight;
    const thickness = 1;
    
    const walls = [
      { x: 0, z: -halfSize, width: MAP_CONFIG.size },
      { x: 0, z: halfSize, width: MAP_CONFIG.size },
      { x: -halfSize, z: 0, width: MAP_CONFIG.size },
      { x: halfSize, z: 0, width: MAP_CONFIG.size }
    ];
    
    walls.forEach((wall, index) => {
      const isNorthSouth = index < 2;
      
      const geometry = new THREE.BoxGeometry(
        isNorthSouth ? wall.width : thickness,
        height,
        isNorthSouth ? thickness : wall.width
      );
      
      const material = new THREE.MeshBasicMaterial({
        color: MAP_CONFIG.boundaryColor,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide
      });
      
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(wall.x, height / 2, wall.z);
      mesh.name = `boundary_${index}`;
      
      this.scene.add(mesh);
      this.boundaries.push(mesh);
      
      const id = meshRegistry.register(mesh, MeshCategory.GROUND, {
        name: `boundary_wall_${index}`,
        needsPhysics: true,
        isStatic: true
      });
      
      physicsMeshers.createForRegisteredMesh(id);
    });
    
    console.log('Boundaries created');
  }
  
  /**
   * Create street markings/visual guides
   */
  createStreets() {
    const streetColor = 0x1f1f1f;
    const streetMaterial = new THREE.MeshStandardMaterial({
      color: streetColor,
      roughness: 0.95,
      metalness: 0.0
    });
    
    const cityConfig = MAP_CONFIG.city;
    const halfSize = MAP_CONFIG.halfSize - cityConfig.edgeMargin;
    const blockSize = cityConfig.blockSize;
    const streetWidth = cityConfig.streetWidth;
    
    // Create street grid
    const streets = [];
    
    // Horizontal streets
    for (let z = -halfSize; z <= halfSize; z += blockSize + streetWidth) {
      const geometry = new THREE.PlaneGeometry(MAP_CONFIG.size - cityConfig.edgeMargin * 2, streetWidth);
      const street = new THREE.Mesh(geometry, streetMaterial);
      street.rotation.x = -Math.PI / 2;
      street.position.set(0, 0.02, z);
      street.receiveShadow = true;
      this.scene.add(street);
      streets.push(street);
    }
    
    // Vertical streets
    for (let x = -halfSize; x <= halfSize; x += blockSize + streetWidth) {
      const geometry = new THREE.PlaneGeometry(streetWidth, MAP_CONFIG.size - cityConfig.edgeMargin * 2);
      const street = new THREE.Mesh(geometry, streetMaterial);
      street.rotation.x = -Math.PI / 2;
      street.position.set(x, 0.02, 0);
      street.receiveShadow = true;
      this.scene.add(street);
      streets.push(street);
    }
    
    console.log(`Created ${streets.length} street segments`);
  }
  
  /**
   * Generate the procedural city layout
   */
  generateCity() {
    const cityConfig = MAP_CONFIG.city;
    const halfSize = MAP_CONFIG.halfSize - cityConfig.edgeMargin;
    const blockSize = cityConfig.blockSize;
    const streetWidth = cityConfig.streetWidth;
    
    const buildingPositions = [];
    
    // Generate city blocks
    for (let x = -halfSize; x < halfSize; x += blockSize + streetWidth) {
      for (let z = -halfSize; z < halfSize; z += blockSize + streetWidth) {
        // Block center
        const blockCenterX = x + blockSize / 2;
        const blockCenterZ = z + blockSize / 2;
        
        // Skip if too close to center (spawn area)
        const distFromCenter = Math.sqrt(blockCenterX * blockCenterX + blockCenterZ * blockCenterZ);
        if (distFromCenter < cityConfig.centerClearRadius) {
          continue;
        }
        
        // Generate buildings in this block
        const numBuildings = this.seededRandomInt(
          cityConfig.minBuildings,
          cityConfig.maxBuildings
        );
        
        for (let i = 0; i < numBuildings; i++) {
          // Random position within block (with margin)
          const margin = 3;
          const buildingX = blockCenterX + this.seededRandom() * (blockSize - margin * 2) - (blockSize - margin * 2) / 2;
          const buildingZ = blockCenterZ + this.seededRandom() * (blockSize - margin * 2) - (blockSize - margin * 2) / 2;
          
          // Check if position is valid (not overlapping)
          const valid = this.isPositionValid(buildingX, buildingZ, 8);
          
          if (valid) {
            buildingPositions.push({
              x: buildingX,
              z: buildingZ,
              options: {
                // Vary building sizes based on distance from center
                height: 8 + distFromCenter * 0.2 + this.seededRandom() * 15
              }
            });
            
            // Mark area as occupied
            this.markOccupied(buildingX, buildingZ, 10);
          }
        }
      }
    }
    
    // Generate the buildings
    buildings.generateBuildings(buildingPositions);
    this.mapData.buildingPositions = buildingPositions;
    
    console.log(`City generated with ${buildingPositions.length} buildings`);
  }
  
  /**
   * Generate spawn points
   */
  generateSpawnPoints() {
    // Main spawn point at origin
    this.mapData.spawnPoints.push({
      x: 0,
      y: 1,
      z: 0,
      type: 'target'
    });
    
    // Gargoyle spawn points around the edges
    const spawnRadius = MAP_CONFIG.halfSize - 30;
    const numGargoyleSpawns = 4;
    
    for (let i = 0; i < numGargoyleSpawns; i++) {
      const angle = (i / numGargoyleSpawns) * Math.PI * 2;
      this.mapData.spawnPoints.push({
        x: Math.cos(angle) * spawnRadius,
        y: 1,
        z: Math.sin(angle) * spawnRadius,
        type: 'gargoyle'
      });
    }
    
    console.log(`Created ${this.mapData.spawnPoints.length} spawn points`);
  }
  
  /**
   * Check if a position is valid for building placement
   */
  isPositionValid(x, z, minDistance) {
    const key = `${Math.floor(x / 5)},${Math.floor(z / 5)}`;
    
    // Check nearby cells
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const checkKey = `${Math.floor(x / 5) + dx},${Math.floor(z / 5) + dz}`;
        if (this.mapData.occupiedCells.has(checkKey)) {
          return false;
        }
      }
    }
    
    return true;
  }
  
  /**
   * Mark an area as occupied
   */
  markOccupied(x, z, radius) {
    const cellSize = 5;
    const cells = Math.ceil(radius / cellSize);
    
    for (let dx = -cells; dx <= cells; dx++) {
      for (let dz = -cells; dz <= cells; dz++) {
        const key = `${Math.floor(x / cellSize) + dx},${Math.floor(z / cellSize) + dz}`;
        this.mapData.occupiedCells.add(key);
      }
    }
  }
  
  /**
   * Seeded random number generator
   */
  seededRandom() {
    // Simple seeded random
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
  
  /**
   * Seeded random integer
   */
  seededRandomInt(min, max) {
    return Math.floor(this.seededRandom() * (max - min + 1)) + min;
  }
  
  /**
   * Toggle debug grid visibility
   */
  toggleDebug() {
    this.isDebugVisible = !this.isDebugVisible;
    meshRegistry.setCategoryVisibility(MeshCategory.DEBUG, this.isDebugVisible);
    console.log(`Debug visuals: ${this.isDebugVisible ? 'ON' : 'OFF'}`);
  }
  
  /**
   * Get spawn point for player type
   * @param {string} type - 'target' or 'gargoyle'
   * @returns {object} Spawn point {x, y, z}
   */
  getSpawnPoint(type = 'target') {
    const spawns = this.mapData.spawnPoints.filter(s => s.type === type);
    if (spawns.length === 0) return { x: 0, y: 1, z: 0 };
    
    const spawn = spawns[Math.floor(Math.random() * spawns.length)];
    return { x: spawn.x, y: spawn.y, z: spawn.z };
  }
  
  /**
   * Get a random position on the map
   */
  getRandomPosition(margin = 10) {
    const range = MAP_CONFIG.halfSize - margin;
    const x = (Math.random() * 2 - 1) * range;
    const z = (Math.random() * 2 - 1) * range;
    return { x, z };
  }
  
  /**
   * Get map bounds
   */
  getBounds() {
    return {
      minX: -MAP_CONFIG.halfSize,
      maxX: MAP_CONFIG.halfSize,
      minZ: -MAP_CONFIG.halfSize,
      maxZ: MAP_CONFIG.halfSize,
      size: MAP_CONFIG.size
    };
  }
  
  /**
   * Clean up map resources
   */
  dispose() {
    // Clear buildings
    buildings.clear();
    
    if (this.ground) {
      this.scene.remove(this.ground);
      this.ground.geometry.dispose();
      this.ground.material.dispose();
    }
    
    if (this.debugGrid) {
      this.scene.remove(this.debugGrid);
    }
    
    this.boundaries.forEach(wall => {
      this.scene.remove(wall);
      wall.geometry.dispose();
      wall.material.dispose();
    });
    
    this.boundaries = [];
    this.mapData.occupiedCells.clear();
    this.mapData.buildingPositions = [];
  }
}

// Export singleton
const gameMap = new GameMap();
export default gameMap;
export { GameMap, MAP_CONFIG };