/**
 * Buildings - Procedural building generator
 * Creates various building types with greyscale aesthetics
 */

import * as THREE from 'three';
import meshRegistry, { MeshCategory } from '../registries/meshregistry.js';
import physicsMeshers from '../physics/physicsmeshers.js';

// Building configuration
const BUILDING_CONFIG = {
  // Size ranges
  minWidth: 6,
  maxWidth: 20,
  minDepth: 6,
  maxDepth: 20,
  minHeight: 8,
  maxHeight: 40,
  
  // Floor settings
  floorHeight: 3,
  
  // Greyscale color range (0x222222 to 0x888888)
  minShade: 0x222222,
  maxShade: 0x888888,
  
  // Detail settings
  windowRows: true,
  roofVariation: true,
  ledges: true
};

// Building types
export const BuildingType = {
  SIMPLE: 'simple',         // Basic box
  TIERED: 'tiered',         // Steps back at higher floors
  TOWER: 'tower',           // Tall and narrow
  WIDE: 'wide',             // Short and wide
  COMPLEX: 'complex'        // Multiple sections
};

class Buildings {
  constructor() {
    this.buildings = [];
    this.scene = null;
    this.buildingCount = 0;
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
   * Generate a random greyscale color
   * @returns {number} Hex color
   */
  randomGreyscale() {
    const min = 0x22;
    const max = 0x88;
    const shade = Math.floor(Math.random() * (max - min) + min);
    return (shade << 16) | (shade << 8) | shade;
  }
  
  /**
   * Create a simple box building
   * @param {object} options
   * @returns {THREE.Group}
   */
  createSimpleBuilding(options = {}) {
    const width = options.width || this.randomRange(BUILDING_CONFIG.minWidth, BUILDING_CONFIG.maxWidth);
    const depth = options.depth || this.randomRange(BUILDING_CONFIG.minDepth, BUILDING_CONFIG.maxDepth);
    const height = options.height || this.randomRange(BUILDING_CONFIG.minHeight, BUILDING_CONFIG.maxHeight);
    const color = options.color || this.randomGreyscale();
    
    const group = new THREE.Group();
    
    // Main building body
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.9,
      metalness: 0.1
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = height / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    group.add(mesh);
    
    // Add window details
    if (BUILDING_CONFIG.windowRows) {
      this.addWindows(group, width, depth, height, color);
    }
    
    // Add roof variation
    if (BUILDING_CONFIG.roofVariation && Math.random() > 0.5) {
      this.addRoofDetails(group, width, depth, height, color);
    }
    
    // Add ledges
    if (BUILDING_CONFIG.ledges && Math.random() > 0.6) {
      this.addLedges(group, width, depth, height, color);
    }
    
    // Store dimensions for physics
    group.userData.buildingDimensions = { width, depth, height };
    
    return group;
  }
  
  /**
   * Create a tiered building (steps back at higher floors)
   * @param {object} options
   * @returns {THREE.Group}
   */
  createTieredBuilding(options = {}) {
    const baseWidth = options.width || this.randomRange(12, 20);
    const baseDepth = options.depth || this.randomRange(12, 20);
    const totalHeight = options.height || this.randomRange(20, 40);
    const color = options.color || this.randomGreyscale();
    const tiers = options.tiers || this.randomRange(2, 4);
    
    const group = new THREE.Group();
    
    let currentY = 0;
    let currentWidth = baseWidth;
    let currentDepth = baseDepth;
    const tierHeight = totalHeight / tiers;
    
    for (let i = 0; i < tiers; i++) {
      const geometry = new THREE.BoxGeometry(currentWidth, tierHeight, currentDepth);
      
      // Slightly vary the shade for each tier
      const tierShade = this.adjustShade(color, (i * 10));
      const material = new THREE.MeshStandardMaterial({
        color: tierShade,
        roughness: 0.9,
        metalness: 0.1
      });
      
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = currentY + tierHeight / 2;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      
      group.add(mesh);
      
      currentY += tierHeight;
      currentWidth *= 0.75;
      currentDepth *= 0.75;
    }
    
    group.userData.buildingDimensions = { width: baseWidth, depth: baseDepth, height: totalHeight };
    
    return group;
  }
  
  /**
   * Create a tower building (tall and narrow)
   * @param {object} options
   * @returns {THREE.Group}
   */
  createTowerBuilding(options = {}) {
    const width = options.width || this.randomRange(6, 10);
    const depth = options.depth || this.randomRange(6, 10);
    const height = options.height || this.randomRange(30, 50);
    const color = options.color || this.randomGreyscale();
    
    const group = new THREE.Group();
    
    // Main tower body
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.9,
      metalness: 0.1
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = height / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    group.add(mesh);
    
    // Add spire on top
    if (Math.random() > 0.5) {
      const spireHeight = height * 0.15;
      const spireGeometry = new THREE.ConeGeometry(width * 0.3, spireHeight, 4);
      const spireMaterial = new THREE.MeshStandardMaterial({
        color: this.adjustShade(color, -20),
        roughness: 0.8,
        metalness: 0.2
      });
      
      const spire = new THREE.Mesh(spireGeometry, spireMaterial);
      spire.position.y = height + spireHeight / 2;
      spire.castShadow = true;
      
      group.add(spire);
    }
    
    group.userData.buildingDimensions = { width, depth, height };
    
    return group;
  }
  
  /**
   * Create a wide building (short and wide)
   * @param {object} options
   * @returns {THREE.Group}
   */
  createWideBuilding(options = {}) {
    const width = options.width || this.randomRange(15, 30);
    const depth = options.depth || this.randomRange(15, 30);
    const height = options.height || this.randomRange(6, 15);
    const color = options.color || this.randomGreyscale();
    
    const group = new THREE.Group();
    
    // Main body
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.9,
      metalness: 0.1
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = height / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    group.add(mesh);
    
    // Add rooftop structures
    const numStructures = this.randomRange(1, 3);
    for (let i = 0; i < numStructures; i++) {
      const structWidth = this.randomRange(3, 6);
      const structHeight = this.randomRange(2, 5);
      const structGeometry = new THREE.BoxGeometry(structWidth, structHeight, structWidth);
      const structMaterial = new THREE.MeshStandardMaterial({
        color: this.adjustShade(color, -15),
        roughness: 0.9,
        metalness: 0.1
      });
      
      const structure = new THREE.Mesh(structGeometry, structMaterial);
      structure.position.set(
        this.randomRange(-width/3, width/3),
        height + structHeight / 2,
        this.randomRange(-depth/3, depth/3)
      );
      structure.castShadow = true;
      
      group.add(structure);
    }
    
    group.userData.buildingDimensions = { width, depth, height };
    
    return group;
  }
  
  /**
   * Add window details to a building
   */
  addWindows(group, width, depth, height, baseColor) {
    const windowColor = this.adjustShade(baseColor, -30);
    const windowMaterial = new THREE.MeshStandardMaterial({
      color: windowColor,
      roughness: 0.5,
      metalness: 0.3
    });
    
    const windowWidth = 1;
    const windowHeight = 1.5;
    const windowDepth = 0.1;
    const windowGeometry = new THREE.BoxGeometry(windowWidth, windowHeight, windowDepth);
    
    const floors = Math.floor(height / BUILDING_CONFIG.floorHeight);
    const windowsPerFloor = Math.floor(width / 3);
    
    // Front and back windows
    for (let floor = 1; floor < floors; floor++) {
      for (let w = 0; w < windowsPerFloor; w++) {
        const xPos = (w - (windowsPerFloor - 1) / 2) * 3;
        const yPos = floor * BUILDING_CONFIG.floorHeight;
        
        // Front
        const frontWindow = new THREE.Mesh(windowGeometry, windowMaterial);
        frontWindow.position.set(xPos, yPos, depth / 2 + 0.05);
        group.add(frontWindow);
        
        // Back
        const backWindow = new THREE.Mesh(windowGeometry, windowMaterial);
        backWindow.position.set(xPos, yPos, -depth / 2 - 0.05);
        group.add(backWindow);
      }
    }
  }
  
  /**
   * Add roof details
   */
  addRoofDetails(group, width, depth, height, baseColor) {
    const roofColor = this.adjustShade(baseColor, -20);
    
    // Simple roof box
    const roofWidth = width * 0.6;
    const roofDepth = depth * 0.6;
    const roofHeight = 2;
    
    const roofGeometry = new THREE.BoxGeometry(roofWidth, roofHeight, roofDepth);
    const roofMaterial = new THREE.MeshStandardMaterial({
      color: roofColor,
      roughness: 0.9,
      metalness: 0.1
    });
    
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = height + roofHeight / 2;
    roof.castShadow = true;
    
    group.add(roof);
  }
  
  /**
   * Add ledges to building
   */
  addLedges(group, width, depth, height, baseColor) {
    const ledgeColor = this.adjustShade(baseColor, 15);
    const ledgeMaterial = new THREE.MeshStandardMaterial({
      color: ledgeColor,
      roughness: 0.9,
      metalness: 0.1
    });
    
    // Base ledge
    const baseLedgeGeometry = new THREE.BoxGeometry(width + 0.5, 0.5, depth + 0.5);
    const baseLedge = new THREE.Mesh(baseLedgeGeometry, ledgeMaterial);
    baseLedge.position.y = 0.25;
    baseLedge.receiveShadow = true;
    
    group.add(baseLedge);
    
    // Top ledge
    const topLedgeGeometry = new THREE.BoxGeometry(width + 0.3, 0.3, depth + 0.3);
    const topLedge = new THREE.Mesh(topLedgeGeometry, ledgeMaterial);
    topLedge.position.y = height + 0.15;
    topLedge.castShadow = true;
    
    group.add(topLedge);
  }
  
  /**
   * Create a random building
   * @param {object} options
   * @returns {THREE.Group}
   */
  createRandomBuilding(options = {}) {
    const types = [
      BuildingType.SIMPLE,
      BuildingType.SIMPLE,  // Weight simple more
      BuildingType.TIERED,
      BuildingType.TOWER,
      BuildingType.WIDE
    ];
    
    const type = options.type || types[Math.floor(Math.random() * types.length)];
    
    switch (type) {
      case BuildingType.TIERED:
        return this.createTieredBuilding(options);
      case BuildingType.TOWER:
        return this.createTowerBuilding(options);
      case BuildingType.WIDE:
        return this.createWideBuilding(options);
      case BuildingType.SIMPLE:
      default:
        return this.createSimpleBuilding(options);
    }
  }
  
  /**
   * Place a building in the world
   * @param {THREE.Group} building
   * @param {number} x
   * @param {number} z
   * @returns {number} Registry ID
   */
  placeBuilding(building, x, z) {
    if (!this.scene) {
      console.error('Buildings not initialized with scene');
      return null;
    }
    
    building.position.set(x, 0, z);
    this.scene.add(building);
    
    // Register with mesh registry
    const id = meshRegistry.register(building, MeshCategory.BUILDING, {
      name: `building_${this.buildingCount++}`,
      needsPhysics: true,
      isStatic: true,
      metadata: building.userData.buildingDimensions
    });
    
    // Create physics collider for the main body
    const dims = building.userData.buildingDimensions;
    if (dims) {
      physicsMeshers.createBoxCollider(building, {
        isStatic: true,
        friction: 0.5,
        restitution: 0.0
      });
    }
    
    this.buildings.push({ id, building, x, z });
    
    return id;
  }
  
  /**
   * Generate multiple buildings at positions
   * @param {Array} positions - Array of {x, z} positions
   */
  generateBuildings(positions) {
    for (const pos of positions) {
      const building = this.createRandomBuilding(pos.options || {});
      this.placeBuilding(building, pos.x, pos.z);
    }
    
    console.log(`Generated ${positions.length} buildings`);
  }
  
  /**
   * Adjust a greyscale shade by an amount
   * @param {number} color
   * @param {number} amount - Positive = lighter, negative = darker
   * @returns {number}
   */
  adjustShade(color, amount) {
    let shade = color & 0xFF;
    shade = Math.max(0x11, Math.min(0xEE, shade + amount));
    return (shade << 16) | (shade << 8) | shade;
  }
  
  /**
   * Random number in range
   */
  randomRange(min, max) {
    return Math.random() * (max - min) + min;
  }
  
  /**
   * Random integer in range
   */
  randomIntRange(min, max) {
    return Math.floor(this.randomRange(min, max + 1));
  }
  
  /**
   * Clear all buildings
   */
  clear() {
    for (const { id, building } of this.buildings) {
      this.scene.remove(building);
      meshRegistry.unregister(id);
      
      // Dispose geometries and materials
      building.traverse((child) => {
        if (child.isMesh) {
          child.geometry?.dispose();
          child.material?.dispose();
        }
      });
    }
    
    this.buildings = [];
    this.buildingCount = 0;
  }
}

// Export singleton
const buildings = new Buildings();
export default buildings;
export { Buildings };