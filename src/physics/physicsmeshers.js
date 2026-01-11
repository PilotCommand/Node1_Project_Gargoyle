/**
 * PhysicsMeshers - Creates Rapier physics bodies from Three.js meshes
 * Supports trimesh for accurate collision and debug wireframe visualization
 * 
 * Debug wireframes show GREEN lines matching the actual physics colliders:
 * - Buildings: Trimesh wireframe (all triangle edges)
 * - Players: Capsule wireframe
 * - Ground: Box wireframe
 */

import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import meshRegistry, { MeshCategory } from '../registries/meshregistry.js';

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

// Debug wireframe material (shared, green)
const DEBUG_MATERIAL = new THREE.LineBasicMaterial({
  color: 0x00ff00,
  linewidth: 1,
  transparent: true,
  opacity: 0.8
});

class PhysicsMeshers {
  constructor() {
    this.world = null;
    this.scene = null;
    
    // Track debug wireframes
    this.debugMeshes = [];
    this.debugVisible = false;
  }
  
  /**
   * Set the Rapier physics world reference
   * @param {RAPIER.World} world
   */
  setWorld(world) {
    this.world = world;
  }
  
  /**
   * Set scene reference for debug wireframes
   * @param {THREE.Scene} scene
   */
  setScene(scene) {
    this.scene = scene;
  }
  
  /**
   * Toggle debug wireframe visibility
   * @param {boolean} visible
   */
  setDebugVisible(visible) {
    this.debugVisible = visible;
    for (const mesh of this.debugMeshes) {
      mesh.visible = visible;
    }
  }
  
  /**
   * Create debug wireframe from mesh geometry (shows all triangle edges)
   * @param {THREE.Object3D} mesh
   * @returns {THREE.Group}
   */
  createDebugTrimesh(mesh) {
    const group = new THREE.Group();
    group.name = 'debug_trimesh';
    
    mesh.updateMatrixWorld(true);
    
    mesh.traverse((child) => {
      if (child.isMesh && child.geometry) {
        // Clone geometry and transform to world space
        const geomClone = child.geometry.clone();
        geomClone.applyMatrix4(child.matrixWorld);
        
        // Create wireframe showing all edges
        const wireframeGeom = new THREE.WireframeGeometry(geomClone);
        const wireframe = new THREE.LineSegments(wireframeGeom, DEBUG_MATERIAL);
        
        group.add(wireframe);
        
        // Dispose cloned geometry (wireframe has its own copy)
        geomClone.dispose();
      }
    });
    
    group.visible = this.debugVisible;
    return group;
  }
  
  /**
   * Create debug wireframe capsule (for player colliders)
   * @param {THREE.Vector3} position - Center position
   * @param {number} radius - Capsule radius
   * @param {number} halfHeight - Half height of cylindrical part
   * @returns {THREE.Group}
   */
  createDebugCapsule(position, radius, halfHeight) {
    const group = new THREE.Group();
    group.name = 'debug_capsule';
    
    // Vertical edge lines (8 lines around cylinder)
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const x = radius * Math.cos(angle);
      const z = radius * Math.sin(angle);
      
      const lineGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, -halfHeight, z),
        new THREE.Vector3(x, halfHeight, z)
      ]);
      const line = new THREE.Line(lineGeom, DEBUG_MATERIAL);
      group.add(line);
    }
    
    // Horizontal rings (bottom, middle, top of cylinder)
    const ringYPositions = [-halfHeight, 0, halfHeight];
    for (const y of ringYPositions) {
      const ringPoints = [];
      for (let i = 0; i <= 32; i++) {
        const angle = (i / 32) * Math.PI * 2;
        ringPoints.push(new THREE.Vector3(
          radius * Math.cos(angle),
          y,
          radius * Math.sin(angle)
        ));
      }
      const ringGeom = new THREE.BufferGeometry().setFromPoints(ringPoints);
      const ring = new THREE.Line(ringGeom, DEBUG_MATERIAL);
      group.add(ring);
    }
    
    // Top hemisphere arcs (bulging UP from cylinder top)
    // Arc in X-Y plane
    const topArc1Points = [];
    for (let i = 0; i <= 16; i++) {
      const angle = (i / 16) * Math.PI;  // 0 to PI
      topArc1Points.push(new THREE.Vector3(
        radius * Math.cos(angle),
        halfHeight + radius * Math.sin(angle),
        0
      ));
    }
    const topArc1Geom = new THREE.BufferGeometry().setFromPoints(topArc1Points);
    group.add(new THREE.Line(topArc1Geom, DEBUG_MATERIAL));
    
    // Arc in Z-Y plane
    const topArc2Points = [];
    for (let i = 0; i <= 16; i++) {
      const angle = (i / 16) * Math.PI;
      topArc2Points.push(new THREE.Vector3(
        0,
        halfHeight + radius * Math.sin(angle),
        radius * Math.cos(angle)
      ));
    }
    const topArc2Geom = new THREE.BufferGeometry().setFromPoints(topArc2Points);
    group.add(new THREE.Line(topArc2Geom, DEBUG_MATERIAL));
    
    // Bottom hemisphere arcs (bulging DOWN from cylinder bottom)
    // Arc in X-Y plane
    const bottomArc1Points = [];
    for (let i = 0; i <= 16; i++) {
      const angle = (i / 16) * Math.PI;
      bottomArc1Points.push(new THREE.Vector3(
        radius * Math.cos(angle),
        -halfHeight - radius * Math.sin(angle),
        0
      ));
    }
    const bottomArc1Geom = new THREE.BufferGeometry().setFromPoints(bottomArc1Points);
    group.add(new THREE.Line(bottomArc1Geom, DEBUG_MATERIAL));
    
    // Arc in Z-Y plane
    const bottomArc2Points = [];
    for (let i = 0; i <= 16; i++) {
      const angle = (i / 16) * Math.PI;
      bottomArc2Points.push(new THREE.Vector3(
        0,
        -halfHeight - radius * Math.sin(angle),
        radius * Math.cos(angle)
      ));
    }
    const bottomArc2Geom = new THREE.BufferGeometry().setFromPoints(bottomArc2Points);
    group.add(new THREE.Line(bottomArc2Geom, DEBUG_MATERIAL));
    
    group.position.copy(position);
    group.visible = this.debugVisible;
    
    return group;
  }
  
  /**
   * Create debug wireframe box
   * @param {THREE.Vector3} position - Center position
   * @param {object} halfExtents - { x, y, z }
   * @param {THREE.Quaternion} quaternion - Optional rotation
   * @returns {THREE.LineSegments}
   */
  createDebugBox(position, halfExtents, quaternion = null) {
    const geometry = new THREE.BoxGeometry(
      halfExtents.x * 2,
      halfExtents.y * 2,
      halfExtents.z * 2
    );
    const edges = new THREE.EdgesGeometry(geometry);
    const wireframe = new THREE.LineSegments(edges, DEBUG_MATERIAL);
    wireframe.name = 'debug_box';
    
    wireframe.position.copy(position);
    if (quaternion) {
      wireframe.quaternion.copy(quaternion);
    }
    
    wireframe.visible = this.debugVisible;
    geometry.dispose();
    
    return wireframe;
  }
  
  /**
   * Add debug wireframe to scene and track it
   * @param {THREE.Object3D} wireframe
   * @param {string} name
   */
  addDebugWireframe(wireframe, name = 'physics_debug') {
    if (!this.scene) {
      console.warn('PhysicsMeshers: No scene set, cannot add debug wireframe');
      return null;
    }
    
    this.scene.add(wireframe);
    
    // Register as DEBUG category so it toggles with P key
    const id = meshRegistry.register(wireframe, MeshCategory.DEBUG, {
      name: `debug_${name}_${this.debugMeshes.length}`,
      needsPhysics: false
    });
    
    this.debugMeshes.push(wireframe);
    
    return wireframe;
  }
  
  /**
   * Create a TRIMESH collider from actual mesh geometry
   * Provides accurate collision matching the visual mesh
   * NOTE: Trimesh colliders MUST be static (fixed bodies)
   * @param {THREE.Object3D} mesh - The Three.js mesh or group
   * @param {object} options - Physics options
   * @returns {object} { body, colliders }
   */
  createTrimeshCollider(mesh, options = {}) {
    if (!this.world) {
      console.error('Physics world not set');
      return null;
    }
    
    const friction = options.friction ?? 0.5;
    const restitution = options.restitution ?? 0.0;
    
    // Collect all vertices and indices from mesh hierarchy
    const vertices = [];
    const indices = [];
    
    mesh.updateMatrixWorld(true);
    
    mesh.traverse((child) => {
      if (child.isMesh && child.geometry) {
        const geometry = child.geometry;
        const positionAttr = geometry.getAttribute('position');
        
        if (!positionAttr) return;
        
        // Get world matrix for this child mesh
        const worldMatrix = child.matrixWorld;
        
        // Starting index offset for this submesh's vertices
        const vertexOffset = vertices.length / 3;
        
        // Extract vertices and transform to world space
        const vertex = new THREE.Vector3();
        for (let i = 0; i < positionAttr.count; i++) {
          vertex.set(
            positionAttr.getX(i),
            positionAttr.getY(i),
            positionAttr.getZ(i)
          );
          vertex.applyMatrix4(worldMatrix);
          vertices.push(vertex.x, vertex.y, vertex.z);
        }
        
        // Extract indices (triangle faces)
        if (geometry.index) {
          // Indexed geometry
          for (let i = 0; i < geometry.index.count; i++) {
            indices.push(geometry.index.getX(i) + vertexOffset);
          }
        } else {
          // Non-indexed geometry - every 3 vertices is a triangle
          for (let i = 0; i < positionAttr.count; i++) {
            indices.push(i + vertexOffset);
          }
        }
      }
    });
    
    if (vertices.length === 0) {
      console.error('No geometry found for trimesh collider');
      return null;
    }
    
    // Create typed arrays for Rapier
    const verticesFloat32 = new Float32Array(vertices);
    const indicesUint32 = new Uint32Array(indices);
    
    // Trimesh MUST be a fixed (static) body
    const bodyDesc = RAPIER.RigidBodyDesc.fixed();
    const body = this.world.createRigidBody(bodyDesc);
    
    // Create trimesh collider
    const colliderDesc = RAPIER.ColliderDesc.trimesh(verticesFloat32, indicesUint32);
    colliderDesc.setFriction(friction);
    colliderDesc.setRestitution(restitution);
    
    const collider = this.world.createCollider(colliderDesc, body);
    
    // Create and add debug wireframe
    const debugWireframe = this.createDebugTrimesh(mesh);
    this.addDebugWireframe(debugWireframe, mesh.name || 'trimesh');
    
    console.log(`Created trimesh: ${vertices.length / 3} verts, ${indices.length / 3} tris`);
    
    return { body, colliders: [collider] };
  }
  
  /**
   * Create a simple box collider (for simple shapes or fallback)
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
    
    // Half extents for Rapier
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
    
    // Create and add debug wireframe
    const debugWireframe = this.createDebugBox(center, halfExtents, quaternion);
    this.addDebugWireframe(debugWireframe, mesh.name || 'box');
    
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
    
    // Create and add debug wireframe
    const debugWireframe = this.createDebugBox(
      new THREE.Vector3(0, y - 0.05, 0),
      { x: halfWidth, y: 0.05, z: halfDepth }
    );
    this.addDebugWireframe(debugWireframe, 'ground');
    
    return { body, colliders: [collider] };
  }
  
  /**
   * Create a capsule collider (for characters)
   * @param {number} radius - Capsule radius
   * @param {number} halfHeight - Half height of the cylindrical part
   * @param {THREE.Vector3} position - Initial position
   * @param {object} options - Physics options
   * @returns {object} { body, colliders, debugMesh }
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
    
    // Create and add debug wireframe
    const debugMesh = this.createDebugCapsule(position, radius, halfHeight);
    this.addDebugWireframe(debugMesh, options.name || 'capsule');
    
    return { body, colliders: [collider], debugMesh };
  }
  
  /**
   * Create physics for a registered mesh and link it
   * @param {number} meshId - Registry mesh ID
   * @param {string} colliderType - Type of collider to create
   * @param {object} options - Physics options
   * @returns {object|null} { body, colliders } or null
   */
  createForRegisteredMesh(meshId, colliderType = ColliderType.TRIMESH, options = {}) {
    const entry = meshRegistry.get(meshId);
    if (!entry) {
      console.error(`Mesh ${meshId} not found in registry`);
      return null;
    }
    
    let result = null;
    
    switch (colliderType) {
      case ColliderType.TRIMESH:
        result = this.createTrimeshCollider(entry.mesh, options);
        break;
      case ColliderType.BOX:
      case ColliderType.CUBOID:
        result = this.createBoxCollider(entry.mesh, {
          isStatic: entry.isStatic,
          ...options
        });
        break;
      default:
        // Default to trimesh for accuracy
        result = this.createTrimeshCollider(entry.mesh, options);
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
      this.createForRegisteredMesh(entry.id, ColliderType.TRIMESH);
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
  
  /**
   * Clear all debug meshes
   */
  clearDebugMeshes() {
    for (const mesh of this.debugMeshes) {
      if (this.scene) {
        this.scene.remove(mesh);
      }
      mesh.traverse((child) => {
        if (child.geometry) {
          child.geometry.dispose();
        }
      });
    }
    this.debugMeshes = [];
  }
}

// Export singleton
const physicsMeshers = new PhysicsMeshers();
export default physicsMeshers;
export { PhysicsMeshers };