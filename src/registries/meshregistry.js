/**
 * MeshRegistry - Central registry for all meshes in the game
 * Tracks and categorizes all visual meshes and their associated physics bodies
 */

// Mesh categories
export const MeshCategory = {
  GROUND: 'ground',
  BUILDING: 'building',
  PLAYER: 'player',
  TROPHY: 'trophy',
  PROP: 'prop',
  DEBUG: 'debug',
  OTHER: 'other'
};

class MeshRegistry {
  constructor() {
    // Main registry: Map of id -> mesh data
    this.meshes = new Map();
    
    // Category index for fast lookups
    this.byCategory = {
      [MeshCategory.GROUND]: new Set(),
      [MeshCategory.BUILDING]: new Set(),
      [MeshCategory.PLAYER]: new Set(),
      [MeshCategory.TROPHY]: new Set(),
      [MeshCategory.PROP]: new Set(),
      [MeshCategory.DEBUG]: new Set(),
      [MeshCategory.OTHER]: new Set()
    };
    
    // Auto-incrementing ID counter
    this.nextId = 1;
  }
  
  /**
   * Register a mesh with the registry
   * @param {THREE.Object3D} mesh - The Three.js mesh or group
   * @param {string} category - Category from MeshCategory
   * @param {object} options - Additional options
   * @returns {number} The assigned mesh ID
   */
  register(mesh, category = MeshCategory.OTHER, options = {}) {
    const id = this.nextId++;
    
    const entry = {
      id,
      mesh,
      category,
      name: options.name || `mesh_${id}`,
      needsPhysics: options.needsPhysics ?? true,
      physicsBody: null,
      colliders: [],
      isStatic: options.isStatic ?? true,
      visible: true,
      metadata: options.metadata || {}
    };
    
    // Store mesh ID on the mesh itself for reverse lookup
    mesh.userData.registryId = id;
    mesh.userData.category = category;
    
    // Add to main registry
    this.meshes.set(id, entry);
    
    // Add to category index
    if (this.byCategory[category]) {
      this.byCategory[category].add(id);
    }
    
    return id;
  }
  
  /**
   * Unregister a mesh from the registry
   * @param {number} id - The mesh ID
   * @returns {boolean} True if successfully removed
   */
  unregister(id) {
    const entry = this.meshes.get(id);
    if (!entry) return false;
    
    // Remove from category index
    if (this.byCategory[entry.category]) {
      this.byCategory[entry.category].delete(id);
    }
    
    // Clean up mesh userData
    if (entry.mesh) {
      delete entry.mesh.userData.registryId;
      delete entry.mesh.userData.category;
    }
    
    // Remove from main registry
    this.meshes.delete(id);
    
    return true;
  }
  
  /**
   * Get a mesh entry by ID
   * @param {number} id - The mesh ID
   * @returns {object|null} The mesh entry or null
   */
  get(id) {
    return this.meshes.get(id) || null;
  }
  
  /**
   * Get a mesh entry by the mesh object itself
   * @param {THREE.Object3D} mesh - The mesh object
   * @returns {object|null} The mesh entry or null
   */
  getByMesh(mesh) {
    const id = mesh.userData?.registryId;
    if (id === undefined) return null;
    return this.get(id);
  }
  
  /**
   * Get all mesh entries in a category
   * @param {string} category - The category to query
   * @returns {array} Array of mesh entries
   */
  getByCategory(category) {
    const ids = this.byCategory[category];
    if (!ids) return [];
    
    const entries = [];
    for (const id of ids) {
      const entry = this.meshes.get(id);
      if (entry) entries.push(entry);
    }
    return entries;
  }
  
  /**
   * Get all meshes that need physics bodies
   * @returns {array} Array of mesh entries needing physics
   */
  getMeshesNeedingPhysics() {
    const entries = [];
    for (const entry of this.meshes.values()) {
      if (entry.needsPhysics && !entry.physicsBody) {
        entries.push(entry);
      }
    }
    return entries;
  }
  
  /**
   * Link a physics body to a registered mesh
   * @param {number} id - The mesh ID
   * @param {RAPIER.RigidBody} body - The Rapier rigid body
   * @param {array} colliders - Array of Rapier colliders
   */
  linkPhysicsBody(id, body, colliders = []) {
    const entry = this.meshes.get(id);
    if (entry) {
      entry.physicsBody = body;
      entry.colliders = colliders;
    }
  }
  
  /**
   * Set visibility for all meshes in a category
   * @param {string} category - The category
   * @param {boolean} visible - Visibility state
   */
  setCategoryVisibility(category, visible) {
    const entries = this.getByCategory(category);
    for (const entry of entries) {
      entry.visible = visible;
      if (entry.mesh) {
        entry.mesh.visible = visible;
      }
    }
  }
  
  /**
   * Get total count of registered meshes
   * @returns {number}
   */
  get count() {
    return this.meshes.size;
  }
  
  /**
   * Get count by category
   * @param {string} category
   * @returns {number}
   */
  countByCategory(category) {
    return this.byCategory[category]?.size || 0;
  }
  
  /**
   * Clear all meshes from registry
   */
  clear() {
    this.meshes.clear();
    for (const category in this.byCategory) {
      this.byCategory[category].clear();
    }
    this.nextId = 1;
  }
  
  /**
   * Debug: print registry contents
   */
  debug() {
    console.log('=== Mesh Registry ===');
    console.log(`Total meshes: ${this.count}`);
    for (const category in this.byCategory) {
      const count = this.byCategory[category].size;
      if (count > 0) {
        console.log(`  ${category}: ${count}`);
      }
    }
  }
}

// Export singleton instance
const meshRegistry = new MeshRegistry();
export default meshRegistry;
export { MeshRegistry };