/**
 * PhysicsMeshers - Creates Rapier physics bodies from Three.js meshes
 * Wraps visual meshes with appropriate physics colliders
 */

import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import meshRegistry from '../registries/meshregistry.js';

// Collider types
export const ColliderType = {
  BOX: 'box',
  SPHERE: 'sphere',
  CAPSULE: 'capsule',
  CYLINDER: 'cylinder',
  CUBOID: 'cuboid',
  TRIMESH: 'trimesh',
  CONVEX_HULL: 'convexHull',
  HEIGHTFIELD: 'heightfield'
};

class PhysicsMeshers {
  constructor() {
    this.world = null;
  }
  
  /**
   * Set the Rapier physics world reference
   * @param {RAPIER.World} world
   */
  setWorld(world) {
    this.world = world;
  }
  
  /**
   * Create a physics body for a mesh based on its bounding box
   * @param {THREE.Object3D} mesh - The Three.js mesh
   * @param {object} options - Physics options
   * @returns {object} { body, colliders }
   */
  createBoxCollider(mesh, options = {}) {
    if (!this.world) {
      console.error('Physics world not set');
      return null;
    }
    
    const isStatic = options.isStatic ?? true;
    const friction = options.friction ?? 0.5;
    const restitution = options.restitution ?? 0.2;
    
    // Get world position and scale
    mesh.updateMatrixWorld(true);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    mesh.matrixWorld.decompose(position, quaternion, scale);
    
    // Calculate bounding box
    const box = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3();
    box.getSize(size);
    
    // Half extents for Rapier (it uses half-sizes)
    const halfExtents = {
      x: size.x / 2,
      y: size.y / 2,
      z: size.z / 2
    };
    
    // Get center of bounding box
    const center = new THREE.Vector3();
    box.getCenter(center);
    
    // Create rigid body
    let bodyDesc;
    if (isStatic) {
      bodyDesc = RAPIER.RigidBodyDesc.fixed();
    } else {
      bodyDesc = RAPIER.RigidBodyDesc.dynamic();
    }
    bodyDesc.setTranslation(center.x, center.y, center.z);
    bodyDesc.setRotation({ x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w });
    
    const body = this.world.createRigidBody(bodyDesc);
    
    // Create collider
    const colliderDesc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z);
    colliderDesc.setFriction(friction);
    colliderDesc.setRestitution(restitution);
    
    const collider = this.world.createCollider(colliderDesc, body);
    
    return { body, colliders: [collider] };
  }
  
  /**
   * Create a flat ground plane collider
   * @param {number} halfWidth - Half width of the plane
   * @param {number} halfDepth - Half depth of the plane
   * @param {object} options - Physics options
   * @returns {object} { body, colliders }
   */
  createGroundPlane(halfWidth, halfDepth, options = {}) {
    if (!this.world) {
      console.error('Physics world not set');
      return null;
    }
    
    const y = options.y ?? 0;
    const friction = options.friction ?? 0.7;
    const restitution = options.restitution ?? 0.1;
    
    // Create static body at ground level
    const bodyDesc = RAPIER.RigidBodyDesc.fixed();
    bodyDesc.setTranslation(0, y - 0.05, 0);
    
    const body = this.world.createRigidBody(bodyDesc);
    
    // Create thin box collider for ground
    const colliderDesc = RAPIER.ColliderDesc.cuboid(halfWidth, 0.05, halfDepth);
    colliderDesc.setFriction(friction);
    colliderDesc.setRestitution(restitution);
    
    const collider = this.world.createCollider(colliderDesc, body);
    
    return { body, colliders: [collider] };
  }
  
  /**
   * Create a capsule collider (good for characters)
   * @param {number} radius - Capsule radius
   * @param {number} halfHeight - Half height of the cylindrical part
   * @param {THREE.Vector3} position - Initial position
   * @param {object} options - Physics options
   * @returns {object} { body, colliders }
   */
  createCapsuleCollider(radius, halfHeight, position, options = {}) {
    if (!this.world) {
      console.error('Physics world not set');
      return null;
    }
    
    const isStatic = options.isStatic ?? false;
    const friction = options.friction ?? 0.5;
    
    // Create body
    let bodyDesc;
    if (isStatic) {
      bodyDesc = RAPIER.RigidBodyDesc.fixed();
    } else {
      bodyDesc = RAPIER.RigidBodyDesc.dynamic();
      bodyDesc.setLinearDamping(0.5);
      bodyDesc.setAngularDamping(0.5);
    }
    bodyDesc.setTranslation(position.x, position.y, position.z);
    
    // Lock rotation for character controllers
    if (options.lockRotation) {
      bodyDesc.lockRotations();
    }
    
    const body = this.world.createRigidBody(bodyDesc);
    
    // Create capsule collider
    const colliderDesc = RAPIER.ColliderDesc.capsule(halfHeight, radius);
    colliderDesc.setFriction(friction);
    
    const collider = this.world.createCollider(colliderDesc, body);
    
    return { body, colliders: [collider] };
  }
  
  /**
   * Create physics for a registered mesh and link it
   * @param {number} meshId - Registry mesh ID
   * @param {string} colliderType - Type of collider to create
   * @param {object} options - Physics options
   * @returns {object|null} { body, colliders } or null
   */
  createForRegisteredMesh(meshId, colliderType = ColliderType.BOX, options = {}) {
    const entry = meshRegistry.get(meshId);
    if (!entry) {
      console.error(`Mesh ${meshId} not found in registry`);
      return null;
    }
    
    let result = null;
    
    switch (colliderType) {
      case ColliderType.BOX:
      case ColliderType.CUBOID:
        result = this.createBoxCollider(entry.mesh, {
          isStatic: entry.isStatic,
          ...options
        });
        break;
      // Add more collider types as needed
      default:
        result = this.createBoxCollider(entry.mesh, {
          isStatic: entry.isStatic,
          ...options
        });
    }
    
    if (result) {
      meshRegistry.linkPhysicsBody(meshId, result.body, result.colliders);
    }
    
    return result;
  }
  
  /**
   * Process all meshes in registry that need physics
   */
  processAllPending() {
    const pending = meshRegistry.getMeshesNeedingPhysics();
    console.log(`Processing ${pending.length} meshes for physics`);
    
    for (const entry of pending) {
      this.createForRegisteredMesh(entry.id, ColliderType.BOX);
    }
  }
  
  /**
   * Remove physics body from world
   * @param {RAPIER.RigidBody} body
   */
  removeBody(body) {
    if (this.world && body) {
      this.world.removeRigidBody(body);
    }
  }
}

// Export singleton
const physicsMeshers = new PhysicsMeshers();
export default physicsMeshers;
export { PhysicsMeshers };