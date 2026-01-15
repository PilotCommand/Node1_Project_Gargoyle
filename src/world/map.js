/**
 * Map - Island-based world with connecting paths
 * Uses islands.js to generate disconnected landmasses
 * Uses creeks.js to generate paths between islands
 */

import * as THREE from 'three';
import meshRegistry, { MeshCategory } from '../registries/meshregistry.js';
import islands, { ISLANDS_CONFIG } from './islands.js';
import creeks from './creeks.js';
import paths from './paths.js';

// Configuration
const MAP_CONFIG = {
  size: 200,
  
  // Debug grid
  gridDivisions: 50,
  gridColorCenter: 0x707068,
  gridColorLines: 0x606058,
};

class GameMap {
  constructor() {
    this.scene = null;
    this.debugGrid = null;
    this.isDebugVisible = false;
  }
  
  /**
   * Initialize the map
   * @param {THREE.Scene} scene
   * @param {number} seed - Optional seed for island generation
   */
  init(scene, seed = null) {
    this.scene = scene;
    
    // Initialize and generate islands
    islands.init(scene);
    islands.generate(seed);
    
    // Initialize and generate connecting paths (bridges between islands)
    creeks.init(scene);
    creeks.generate(islands.grid, islands.islands, {
      gridSize: ISLANDS_CONFIG.gridDivisions,
      cellSize: islands.cellSize,
    });
    
    // Initialize and generate roads on islands
    paths.init(scene);
    paths.generate(islands.grid, islands.islands, {
      gridSize: ISLANDS_CONFIG.gridDivisions,
      cellSize: islands.cellSize,
    });
    
    this.createDebugGrid();
    
    // Hide debug by default
    meshRegistry.setCategoryVisibility(MeshCategory.DEBUG, this.isDebugVisible);
    
    console.log('Map initialized with islands, creeks, and roads');
  }
  
  /**
   * Create debug grid overlay
   */
  createDebugGrid() {
    // Grid helper
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
    
    // Axis helper
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
  }
  
  /**
   * Toggle debug visibility
   */
  toggleDebug() {
    this.isDebugVisible = !this.isDebugVisible;
    meshRegistry.setCategoryVisibility(MeshCategory.DEBUG, this.isDebugVisible);
    console.log(`Debug: ${this.isDebugVisible ? 'ON' : 'OFF'}`);
  }
  
  /**
   * Get spawn point
   * @param {string} type - 'target' or 'gargoyle'
   * @param {number} index - For gargoyles, which spawn point (uses different islands)
   */
  getSpawnPoint(type = 'target', index = 0) {
    if (type === 'target') {
      // Player spawns on the largest island
      return islands.getMainSpawnPoint();
    }
    
    // Gargoyles spawn on different islands
    // Skip island 0 (largest, where player spawns) if possible
    const islandIndex = islands.islands.length > 1 ? (index % (islands.islands.length - 1)) + 1 : 0;
    return islands.getSpawnPoint(islandIndex);
  }
  
  /**
   * Check if a position is on land (island or path)
   */
  isOnLand(x, z) {
    return islands.isOnIsland(x, z) || creeks.isOnPath(x, z);
  }
  
  /**
   * Check if position is on an island
   */
  isOnIsland(x, z) {
    return islands.isOnIsland(x, z);
  }
  
  /**
   * Check if position is on a path/creek
   */
  isOnPath(x, z) {
    return creeks.isOnPath(x, z);
  }
  
  /**
   * Check if position is on a road
   */
  isOnRoad(x, z) {
    return paths.isOnRoad(x, z);
  }
  
  /**
   * Get island at position
   */
  getIslandAt(x, z) {
    return islands.getIslandAt(x, z);
  }
  
  /**
   * Get map bounds
   */
  getBounds() {
    const halfSize = MAP_CONFIG.size / 2;
    return {
      minX: -halfSize,
      maxX: halfSize,
      minZ: -halfSize,
      maxZ: halfSize,
      size: MAP_CONFIG.size
    };
  }
  
  /**
   * Get islands reference
   */
  getIslands() {
    return islands;
  }
  
  /**
   * Get creeks reference
   */
  getCreeks() {
    return creeks;
  }
  
  /**
   * Get paths/roads reference
   */
  getPaths() {
    return paths;
  }
  
  /**
   * Get debug info
   */
  getDebugInfo() {
    return {
      islands: islands.getDebugInfo(),
      creeks: creeks.getDebugInfo(),
      paths: paths.getDebugInfo(),
    };
  }
  
  /**
   * Clean up
   */
  dispose() {
    islands.clear();
    creeks.clear();
    paths.clear();
    
    if (this.debugGrid) {
      this.scene.remove(this.debugGrid);
    }
  }
}

// Export singleton
const gameMap = new GameMap();
export default gameMap;
export { GameMap, MAP_CONFIG };