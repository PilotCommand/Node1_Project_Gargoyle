/**
 * GargoylePlayer - The hunters
 * Can walk, sprint, climb, and glide - but freezes when observed by target
 */

import * as THREE from 'three';
import Player, { PlayerState, PlayerType } from './player.js';

// Gargoyle-specific states
export const GargoyleState = {
  ...PlayerState,
  CLIMBING: 'climbing',
  GLIDING: 'gliding',
  FROZEN: 'frozen',
  UNFREEZING: 'unfreezing'
};

// Gargoyle configuration
const GARGOYLE_CONFIG = {
  // Movement
  walkSpeed: 5,
  sprintSpeed: 12,
  climbSpeed: 4,
  glideSpeed: 8,
  glideFallSpeed: 2,      // How fast they fall while gliding
  
  // Freeze mechanic
  freezeDelay: 0.05,       // Seconds before freezing when spotted
  unfreezeDelay: 0.2,      // Seconds before unfreezing when not spotted
  
  // Climbing
  climbCheckDistance: 0.8,
  climbSurfaceAngle: 70,   // Minimum angle from horizontal to be climbable
  
  // Gliding
  minGlideHeight: 3,       // Minimum height to start gliding
  glideStaminaCost: 10,    // Stamina per second while gliding
  
  // Stamina
  maxStamina: 100,
  staminaRegen: 15,        // Per second when not using abilities
  sprintStaminaCost: 20,   // Per second
  climbStaminaCost: 15     // Per second
};

class GargoylePlayer extends Player {
  constructor(options = {}) {
    super({
      ...options,
      type: PlayerType.GARGOYLE,
      name: options.name || 'Gargoyle',
      speed: options.speed || GARGOYLE_CONFIG.walkSpeed,
      sprintMultiplier: GARGOYLE_CONFIG.sprintSpeed / GARGOYLE_CONFIG.walkSpeed,
      jumpForce: options.jumpForce || 10
    });
    
    // Gargoyle-specific state
    this.gargoyleState = GargoyleState.IDLE;
    
    // Freeze state
    this.isFrozen = false;
    this.isBeingObserved = false;
    this.freezeTimer = 0;
    this.unfreezeTimer = 0;
    this.frozenPosition = new THREE.Vector3();
    this.frozenRotation = 0;
    
    // Stamina system
    this.stamina = GARGOYLE_CONFIG.maxStamina;
    this.maxStamina = GARGOYLE_CONFIG.maxStamina;
    
    // Climbing state
    this.isClimbing = false;
    this.climbSurface = null;
    this.climbNormal = new THREE.Vector3();
    
    // Gliding state
    this.isGliding = false;
    this.canGlide = false;
    
    // Abilities input
    this.abilities = {
      climb: false,
      glide: false
    };
    
    // Visual feedback for frozen state
    this.originalMaterial = null;
    this.frozenMaterial = null;
    
    // Reference to target player for attack
    this.targetPlayer = null;
    this.attackRange = 2;
    this.attackCooldown = 0;
    this.attackCooldownTime = 1;
  }
  
  /**
   * Set observed state (called by target player's FOV system)
   * @param {boolean} observed
   */
  setObserved(observed) {
    this.isBeingObserved = observed;
  }
  
  /**
   * Update freeze state based on observation
   * @param {number} deltaTime
   */
  updateFreezeState(deltaTime) {
    if (this.isBeingObserved) {
      // Being watched - freeze
      this.unfreezeTimer = 0;
      this.freezeTimer += deltaTime;
      
      if (!this.isFrozen && this.freezeTimer >= GARGOYLE_CONFIG.freezeDelay) {
        this.freeze();
      }
    } else {
      // Not being watched - unfreeze
      this.freezeTimer = 0;
      this.unfreezeTimer += deltaTime;
      
      if (this.isFrozen && this.unfreezeTimer >= GARGOYLE_CONFIG.unfreezeDelay) {
        this.unfreeze();
      }
    }
  }
  
  /**
   * Freeze the gargoyle
   */
  freeze() {
    if (this.isFrozen) return;
    
    this.isFrozen = true;
    this.gargoyleState = GargoyleState.FROZEN;
    
    // Store frozen position/rotation
    this.frozenPosition.copy(this.position);
    this.frozenRotation = this.rotation.y;
    
    // Stop physics movement
    if (this.physicsBody) {
      this.physicsBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      // Make kinematic to prevent being pushed
      // this.physicsBody.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased);
    }
    
    // Apply frozen visual (stone texture)
    this.applyFrozenVisual(true);
    
    // Stop animations
    if (this.mixer) {
      this.mixer.timeScale = 0;
    }
  }
  
  /**
   * Unfreeze the gargoyle
   */
  unfreeze() {
    if (!this.isFrozen) return;
    
    this.isFrozen = false;
    this.gargoyleState = GargoyleState.IDLE;
    
    // Restore physics
    if (this.physicsBody) {
      // this.physicsBody.setBodyType(RAPIER.RigidBodyType.Dynamic);
    }
    
    // Remove frozen visual
    this.applyFrozenVisual(false);
    
    // Resume animations
    if (this.mixer) {
      this.mixer.timeScale = 1;
    }
  }
  
  /**
   * Apply or remove frozen visual effect
   * @param {boolean} frozen
   */
  applyFrozenVisual(frozen) {
    if (!this.mesh) return;
    
    this.mesh.traverse((child) => {
      if (child.isMesh) {
        if (frozen) {
          // Store original material
          if (!child.userData.originalMaterial) {
            child.userData.originalMaterial = child.material;
          }
          
          // Apply stone-like frozen material
          child.material = new THREE.MeshStandardMaterial({
            color: 0x555555,
            roughness: 1.0,
            metalness: 0.0
          });
        } else {
          // Restore original material
          if (child.userData.originalMaterial) {
            child.material = child.userData.originalMaterial;
          }
        }
      }
    });
  }
  
  /**
   * Check if gargoyle can climb at current position
   * @param {RAPIER.World} world
   * @param {RAPIER} RAPIER
   * @returns {object|null} Climb surface info or null
   */
  checkClimbSurface(world, RAPIER) {
    if (!world || !this.physicsBody) return null;
    
    const position = this.physicsBody.translation();
    
    // Cast rays in movement direction to find walls
    const directions = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1)
    ];
    
    // Also check in the direction the player is moving
    const moveDir = new THREE.Vector3(
      Math.sin(this.rotation.y),
      0,
      Math.cos(this.rotation.y)
    );
    directions.unshift(moveDir);
    
    for (const dir of directions) {
      const rayOrigin = {
        x: position.x,
        y: position.y,
        z: position.z
      };
      
      const ray = new RAPIER.Ray(rayOrigin, { x: dir.x, y: dir.y, z: dir.z });
      
      const hit = world.castRayAndGetNormal(
        ray,
        GARGOYLE_CONFIG.climbCheckDistance,
        true,
        undefined,
        undefined,
        this.collider
      );
      
      if (hit) {
        const normal = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z);
        
        // Check if surface is steep enough to climb
        const angle = Math.acos(Math.abs(normal.y)) * (180 / Math.PI);
        
        if (angle >= GARGOYLE_CONFIG.climbSurfaceAngle) {
          return {
            normal: normal,
            point: ray.pointAt(hit.timeOfImpact),
            distance: hit.timeOfImpact
          };
        }
      }
    }
    
    return null;
  }
  
  /**
   * Start climbing
   * @param {object} surface - Climb surface info
   */
  startClimbing(surface) {
    if (this.isFrozen || this.stamina <= 0) return;
    
    this.isClimbing = true;
    this.gargoyleState = GargoyleState.CLIMBING;
    this.climbSurface = surface;
    this.climbNormal.copy(surface.normal);
  }
  
  /**
   * Stop climbing
   */
  stopClimbing() {
    this.isClimbing = false;
    this.climbSurface = null;
    this.gargoyleState = this.isGrounded ? GargoyleState.IDLE : GargoyleState.FALLING;
  }
  
  /**
   * Start gliding
   */
  startGliding() {
    if (this.isFrozen || this.isGrounded || this.stamina <= 0) return;
    
    // Check minimum height
    // For now, just check if falling
    if (this.velocity.y < 0) {
      this.isGliding = true;
      this.gargoyleState = GargoyleState.GLIDING;
    }
  }
  
  /**
   * Stop gliding
   */
  stopGliding() {
    this.isGliding = false;
    this.gargoyleState = this.isGrounded ? GargoyleState.IDLE : GargoyleState.FALLING;
  }
  
  /**
   * Update stamina
   * @param {number} deltaTime
   */
  updateStamina(deltaTime) {
    let staminaCost = 0;
    
    if (this.input.sprint && this.isGrounded && !this.isFrozen) {
      staminaCost += GARGOYLE_CONFIG.sprintStaminaCost * deltaTime;
    }
    
    if (this.isClimbing) {
      staminaCost += GARGOYLE_CONFIG.climbStaminaCost * deltaTime;
    }
    
    if (this.isGliding) {
      staminaCost += GARGOYLE_CONFIG.glideStaminaCost * deltaTime;
    }
    
    if (staminaCost > 0) {
      this.stamina = Math.max(0, this.stamina - staminaCost);
      
      // Stop abilities if out of stamina
      if (this.stamina <= 0) {
        if (this.isClimbing) this.stopClimbing();
        if (this.isGliding) this.stopGliding();
      }
    } else if (!this.isFrozen) {
      // Regenerate stamina when not using abilities
      this.stamina = Math.min(
        this.maxStamina,
        this.stamina + GARGOYLE_CONFIG.staminaRegen * deltaTime
      );
    }
  }
  
  /**
   * Attempt to attack target player
   * @returns {boolean} True if attack successful
   */
  attemptAttack() {
    if (this.isFrozen || this.attackCooldown > 0 || !this.targetPlayer) {
      return false;
    }
    
    const distance = this.position.distanceTo(this.targetPlayer.position);
    
    if (distance <= this.attackRange) {
      this.attackCooldown = this.attackCooldownTime;
      this.targetPlayer.onCaught();
      console.log('GARGOYLE ATTACKS!');
      return true;
    }
    
    return false;
  }
  
  /**
   * Override update for gargoyle-specific logic
   * @param {number} deltaTime
   */
  update(deltaTime) {
    // Update freeze state
    this.updateFreezeState(deltaTime);
    
    // If frozen, don't process movement
    if (this.isFrozen) {
      // Keep position locked
      if (this.physicsBody) {
        this.physicsBody.setTranslation({
          x: this.frozenPosition.x,
          y: this.frozenPosition.y + this.height / 2,
          z: this.frozenPosition.z
        }, true);
        this.physicsBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
      return;
    }
    
    // Update stamina
    this.updateStamina(deltaTime);
    
    // Update attack cooldown
    if (this.attackCooldown > 0) {
      this.attackCooldown -= deltaTime;
    }
    
    // Handle gliding
    if (this.abilities.glide && !this.isGrounded && !this.isClimbing) {
      if (!this.isGliding) {
        this.startGliding();
      }
    } else if (this.isGliding) {
      this.stopGliding();
    }
    
    // Disable sprint if no stamina
    if (this.stamina <= 0) {
      this.input.sprint = false;
    }
    
    // Call parent update
    super.update(deltaTime);
    
    // Update gargoyle state
    this.updateGargoyleState();
  }
  
  /**
   * Update gargoyle-specific state
   */
  updateGargoyleState() {
    if (this.isFrozen) {
      this.gargoyleState = GargoyleState.FROZEN;
      return;
    }
    
    if (this.isClimbing) {
      this.gargoyleState = GargoyleState.CLIMBING;
      return;
    }
    
    if (this.isGliding) {
      this.gargoyleState = GargoyleState.GLIDING;
      return;
    }
    
    // Use parent state for basic movement states
    this.gargoyleState = this.state;
  }
  
  /**
   * Get debug info
   * @returns {object}
   */
  getDebugInfo() {
    return {
      frozen: this.isFrozen,
      observed: this.isBeingObserved,
      stamina: `${Math.round(this.stamina)}/${this.maxStamina}`,
      climbing: this.isClimbing,
      gliding: this.isGliding,
      state: this.gargoyleState,
      position: `${this.position.x.toFixed(1)}, ${this.position.y.toFixed(1)}, ${this.position.z.toFixed(1)}`
    };
  }
}

export default GargoylePlayer;
export { GargoylePlayer };