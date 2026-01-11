/**
 * Player - Base player class
 * Handles player mesh, physics body, and state
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import meshRegistry, { MeshCategory } from '../registries/meshregistry.js';
import physicsMeshers from '../physics/physicsmeshers.js';
import { PLAYERS } from '../utilities/palette.js';

// Player states
export const PlayerState = {
  IDLE: 'idle',
  WALKING: 'walking',
  RUNNING: 'running',
  JUMPING: 'jumping',
  FALLING: 'falling',
  CLIMBING: 'climbing',
  GLIDING: 'gliding',
  FROZEN: 'frozen',
  DEAD: 'dead'
};

// Player types
export const PlayerType = {
  TARGET: 'target',
  GARGOYLE: 'gargoyle',
  COMPUTER: 'computer'
};

class Player {
  constructor(options = {}) {
    // Identity
    this.id = options.id || `player_${Date.now()}`;
    this.name = options.name || 'Player';
    this.type = options.type || PlayerType.TARGET;
    
    // Three.js objects
    this.mesh = null;           // The loaded GLB model or placeholder
    this.group = new THREE.Group(); // Container for mesh + helpers
    this.mixer = null;          // Animation mixer
    this.animations = {};       // Stored animations
    
    // Physics
    this.physicsBody = null;
    this.collider = null;
    
    // Transform
    this.position = new THREE.Vector3(0, 0, 0);
    this.rotation = new THREE.Euler(0, 0, 0);
    this.targetRotation = 0;    // Y rotation we're lerping toward
    this.rotationSpeed = 10;    // How fast to turn
    this.modelRotationOffset = options.modelRotationOffset ?? Math.PI; // Offset to align model facing
    
    // Player dimensions (for physics capsule)
    this.height = options.height || 1.8;
    this.radius = options.radius || 0.4;
    
    // State
    this.state = PlayerState.IDLE;
    this.previousState = PlayerState.IDLE;
    this.isGrounded = false;
    this.isAlive = true;
    
    // Stats
    this.health = options.health || 100;
    this.maxHealth = options.maxHealth || 100;
    this.speed = options.speed || 5;
    this.sprintMultiplier = options.sprintMultiplier || 2;
    this.jumpForce = options.jumpForce || 8;
    
    // Movement input (set externally)
    this.input = {
      forward: 0,
      right: 0,
      jump: false,
      sprint: false,
      crouch: false
    };
    
    // Velocity (for physics)
    this.velocity = new THREE.Vector3();
    
    // Registry ID
    this.registryId = null;
    
    // Model path
    this.modelPath = options.modelPath || '/GladpolyE.glb';
    
    // Loading state
    this.isLoaded = false;
    this.onLoadCallback = null;
  }
  
  /**
   * Initialize player and load model
   * @param {THREE.Scene} scene
   * @param {RAPIER.World} physicsWorld
   * @param {RAPIER} RAPIER - The Rapier module
   * @returns {Promise}
   */
  async init(scene, physicsWorld, RAPIER) {
    // Add group to scene immediately
    scene.add(this.group);
    
    // Create placeholder while model loads
    this.createPlaceholder();
    
    // Load the GLB model
    try {
      await this.loadModel();
    } catch (error) {
      console.warn(`Failed to load model for ${this.name}, using placeholder:`, error);
    }
    
    // Create physics body
    this.createPhysicsBody(physicsWorld, RAPIER);
    
    // Register with mesh registry
    this.registryId = meshRegistry.register(this.group, MeshCategory.PLAYER, {
      name: this.name,
      needsPhysics: false, // We handle physics ourselves
      isStatic: false,
      metadata: {
        playerId: this.id,
        playerType: this.type
      }
    });
    
    // Link physics body
    if (this.physicsBody) {
      meshRegistry.linkPhysicsBody(this.registryId, this.physicsBody, [this.collider]);
    }
    
    this.isLoaded = true;
    
    if (this.onLoadCallback) {
      this.onLoadCallback(this);
    }
    
    console.log(`Player ${this.name} initialized`);
    return this;
  }
  
  /**
   * Create a placeholder mesh while model loads
   */
  createPlaceholder() {
    const geometry = new THREE.CapsuleGeometry(this.radius, this.height - this.radius * 2, 8, 16);
    
    // Use different colors based on player type from palette
    const isGargoyle = this.type === 'gargoyle';
    const material = new THREE.MeshStandardMaterial({
      color: isGargoyle ? PLAYERS.gargoyle.normal : PLAYERS.target,
      roughness: isGargoyle ? 0.9 : 0.5,
      metalness: isGargoyle ? 0.0 : 0.2
    });
    
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    
    // Position mesh so bottom is at origin of group
    this.mesh.position.y = this.height / 2;
    
    this.group.add(this.mesh);
  }
  
  /**
   * Load the GLB model
   */
  async loadModel() {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      
      loader.load(
        this.modelPath,
        (gltf) => {
          // Remove placeholder
          if (this.mesh) {
            this.group.remove(this.mesh);
            this.mesh.geometry?.dispose();
            this.mesh.material?.dispose();
          }
          
          // Set up loaded model
          this.mesh = gltf.scene;
          this.mesh.castShadow = true;
          this.mesh.receiveShadow = true;
          
          // Enable shadows for all children
          this.mesh.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          
          // Calculate bounding box to properly position model
          const box = new THREE.Box3().setFromObject(this.mesh);
          const size = new THREE.Vector3();
          box.getSize(size);
          
          // Scale model to fit our player height
          const scale = this.height / size.y;
          this.mesh.scale.setScalar(scale);
          
          // Position so feet are at origin
          box.setFromObject(this.mesh);
          this.mesh.position.y = -box.min.y;
          
          this.group.add(this.mesh);
          
          // Set up animations if present
          if (gltf.animations && gltf.animations.length > 0) {
            this.mixer = new THREE.AnimationMixer(this.mesh);
            
            gltf.animations.forEach((clip) => {
              this.animations[clip.name] = this.mixer.clipAction(clip);
              console.log(`Loaded animation: ${clip.name}`);
            });
          }
          
          console.log(`Model loaded for ${this.name}`);
          resolve(gltf);
        },
        (progress) => {
          // Loading progress
        },
        (error) => {
          reject(error);
        }
      );
    });
  }
  
  /**
   * Create physics body for the player
   */
  createPhysicsBody(physicsWorld, RAPIER) {
    // Create a dynamic rigid body
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(this.position.x, this.position.y + this.height / 2, this.position.z)
      .setLinearDamping(0.0)      // No damping - we control velocity directly
      .setAngularDamping(1.0)
      .setCcdEnabled(true);       // Continuous collision detection for fast movement
    
    // Lock rotations so player doesn't tumble
    bodyDesc.lockRotations();
    
    this.physicsBody = physicsWorld.createRigidBody(bodyDesc);
    
    // Create capsule collider
    const halfHeight = (this.height - this.radius * 2) / 2;
    const colliderDesc = RAPIER.ColliderDesc.capsule(halfHeight, this.radius)
      .setFriction(0.0)           // No friction - we handle movement ourselves
      .setRestitution(0.0);       // No bounce
    
    this.collider = physicsWorld.createCollider(colliderDesc, this.physicsBody);
    
    // Create debug wireframe capsule (follows player via group)
    this.debugCapsule = physicsMeshers.createDebugCapsule(
      new THREE.Vector3(0, this.height / 2, 0),  // Local position in group
      this.radius,
      halfHeight
    );
    this.debugCapsule.visible = physicsMeshers.debugVisible;
    this.group.add(this.debugCapsule);
    
    // Register with physicsMeshers so visibility toggle works
    physicsMeshers.debugMeshes.push(this.debugCapsule);
  }
  
  /**
   * Set player position
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  setPosition(x, y, z) {
    this.position.set(x, y, z);
    this.group.position.copy(this.position);
    
    if (this.physicsBody) {
      this.physicsBody.setTranslation(
        { x: x, y: y + this.height / 2, z: z },
        true
      );
    }
  }
  
  /**
   * Set player rotation (Y axis only)
   * @param {number} angle - Rotation in radians
   */
  setRotation(angle) {
    this.targetRotation = angle;
    this.rotation.y = angle;
    this.group.rotation.y = angle;
  }
  
  /**
   * Update player state based on conditions
   */
  updateState() {
    this.previousState = this.state;
    
    if (!this.isAlive) {
      this.state = PlayerState.DEAD;
      return;
    }
    
    if (!this.isGrounded) {
      if (this.velocity.y > 0) {
        this.state = PlayerState.JUMPING;
      } else {
        this.state = PlayerState.FALLING;
      }
      return;
    }
    
    const isMoving = this.input.forward !== 0 || this.input.right !== 0;
    
    if (isMoving) {
      if (this.input.sprint) {
        this.state = PlayerState.RUNNING;
      } else {
        this.state = PlayerState.WALKING;
      }
    } else {
      this.state = PlayerState.IDLE;
    }
  }
  
  /**
   * Play animation by name
   * @param {string} name - Animation name
   * @param {object} options - Playback options
   */
  playAnimation(name, options = {}) {
    const action = this.animations[name];
    if (!action) return;
    
    const fadeTime = options.fadeTime || 0.2;
    
    // Fade out all other animations
    for (const key in this.animations) {
      if (key !== name) {
        this.animations[key].fadeOut(fadeTime);
      }
    }
    
    // Play this animation
    action.reset().fadeIn(fadeTime).play();
  }
  
  /**
   * Update player (call every frame)
   * @param {number} deltaTime
   */
  update(deltaTime) {
    if (!this.isLoaded) return;
    
    // Sync position from physics
    if (this.physicsBody) {
      const translation = this.physicsBody.translation();
      this.position.set(translation.x, translation.y - this.height / 2, translation.z);
      this.group.position.copy(this.position);
      
      // Get velocity
      const linvel = this.physicsBody.linvel();
      this.velocity.set(linvel.x, linvel.y, linvel.z);
    }
    
    // Smooth rotation
    const rotationDiff = this.targetRotation - this.rotation.y;
    if (Math.abs(rotationDiff) > 0.01) {
      // Handle wrap-around
      let diff = rotationDiff;
      if (diff > Math.PI) diff -= Math.PI * 2;
      if (diff < -Math.PI) diff += Math.PI * 2;
      
      this.rotation.y += diff * this.rotationSpeed * deltaTime;
      this.group.rotation.y = this.rotation.y + this.modelRotationOffset;
    }
    
    // Update state
    this.updateState();
    
    // Update animations
    if (this.mixer) {
      this.mixer.update(deltaTime);
    }
  }
  
  /**
   * Apply damage to player
   * @param {number} amount
   */
  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
    
    if (this.health <= 0) {
      this.die();
    }
  }
  
  /**
   * Heal player
   * @param {number} amount
   */
  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }
  
  /**
   * Kill the player
   */
  die() {
    this.isAlive = false;
    this.state = PlayerState.DEAD;
    console.log(`${this.name} died`);
  }
  
  /**
   * Respawn the player
   * @param {THREE.Vector3} position
   */
  respawn(position) {
    this.health = this.maxHealth;
    this.isAlive = true;
    this.state = PlayerState.IDLE;
    
    if (position) {
      this.setPosition(position.x, position.y, position.z);
    }
    
    console.log(`${this.name} respawned`);
  }
  
  /**
   * Clean up resources
   */
  dispose() {
    // Remove from scene
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
    
    // Dispose geometries and materials
    this.group.traverse((child) => {
      if (child.isMesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material?.dispose();
        }
      }
    });
    
    // Unregister from mesh registry
    if (this.registryId) {
      meshRegistry.unregister(this.registryId);
    }
    
    console.log(`Player ${this.name} disposed`);
  }
}

export default Player;
export { Player };