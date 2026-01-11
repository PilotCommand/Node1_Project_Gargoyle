/**
 * PhysicsMovements - Physics-based movement system
 * Handles player movement, jumping, ground detection
 */

import * as THREE from 'three';
import { PlayerState } from '../players/player.js';

// Movement configuration
const MOVEMENT_CONFIG = {
  // Ground detection
  groundCheckDistance: 0.2,
  groundCheckOffset: 0.1,
  
  // Movement
  acceleration: 50,
  deceleration: 30,
  airControl: 0.3,      // How much control in air (0-1)
  maxVelocity: 20,
  
  // Jumping
  jumpForce: 8,
  jumpCooldown: 0.1,    // Seconds between jumps
  coyoteTime: 0.15,     // Grace period after leaving ground
  jumpBufferTime: 0.1,  // Buffer jump input
  
  // Gravity
  gravity: -25,
  maxFallSpeed: -50,
  
  // Slopes
  maxSlopeAngle: 45,    // Degrees
};

class PhysicsMovements {
  constructor() {
    this.world = null;
    this.RAPIER = null;
    
    // Raycasting for ground detection
    this.raycaster = new THREE.Raycaster();
    
    // Player-specific state
    this.playerStates = new Map();
  }
  
  /**
   * Initialize with physics world
   * @param {RAPIER.World} world
   * @param {RAPIER} RAPIER
   */
  init(world, RAPIER) {
    this.world = world;
    this.RAPIER = RAPIER;
    console.log('Physics movements initialized');
  }
  
  /**
   * Register a player for movement handling
   * @param {Player} player
   */
  registerPlayer(player) {
    this.playerStates.set(player.id, {
      lastGroundedTime: 0,
      lastJumpTime: 0,
      jumpBuffered: false,
      jumpBufferTime: 0,
      wasGrounded: false
    });
  }
  
  /**
   * Unregister a player
   * @param {string} playerId
   */
  unregisterPlayer(playerId) {
    this.playerStates.delete(playerId);
  }
  
  /**
   * Check if player is grounded using raycast
   * @param {Player} player
   * @returns {object} { grounded, groundNormal, groundPoint }
   */
  checkGrounded(player) {
    if (!this.world || !player.physicsBody) {
      return { grounded: false, groundNormal: null, groundPoint: null };
    }
    
    const position = player.physicsBody.translation();
    
    // Cast ray downward from player center
    const rayOrigin = {
      x: position.x,
      y: position.y - player.height / 2 + MOVEMENT_CONFIG.groundCheckOffset,
      z: position.z
    };
    
    const rayDir = { x: 0, y: -1, z: 0 };
    
    const ray = new this.RAPIER.Ray(rayOrigin, rayDir);
    const maxToi = MOVEMENT_CONFIG.groundCheckDistance + MOVEMENT_CONFIG.groundCheckOffset;
    
    // Cast ray and get normal
    const hit = this.world.castRayAndGetNormal(
      ray,
      maxToi,
      true, // solid
      undefined, // flags
      undefined, // groups
      player.collider // exclude
    );
    
    if (hit) {
      const hitPoint = ray.pointAt(hit.timeOfImpact);
      const normal = hit.normal;
      
      // Check slope angle
      const slopeAngle = Math.acos(normal.y) * (180 / Math.PI);
      const walkable = slopeAngle <= MOVEMENT_CONFIG.maxSlopeAngle;
      
      return {
        grounded: walkable,
        groundNormal: new THREE.Vector3(normal.x, normal.y, normal.z),
        groundPoint: new THREE.Vector3(hitPoint.x, hitPoint.y, hitPoint.z)
      };
    }
    
    return { grounded: false, groundNormal: null, groundPoint: null };
  }
  
  /**
   * Apply movement to a player
   * @param {Player} player
   * @param {THREE.Vector3} moveDirection - Normalized movement direction
   * @param {number} deltaTime
   */
  applyMovement(player, moveDirection, deltaTime) {
    if (!player.physicsBody || !player.isAlive) return;
    
    const state = this.playerStates.get(player.id);
    if (!state) return;
    
    // Check grounded
    const groundCheck = this.checkGrounded(player);
    player.isGrounded = groundCheck.grounded;
    
    // Track grounded time for coyote time
    if (player.isGrounded) {
      state.lastGroundedTime = performance.now() / 1000;
      state.wasGrounded = true;
    }
    
    // Get current velocity
    const currentVel = player.physicsBody.linvel();
    let velX = currentVel.x;
    let velY = currentVel.y;
    let velZ = currentVel.z;
    
    // Calculate target speed
    const isSprinting = player.input.sprint && player.isGrounded;
    const targetSpeed = player.speed * (isSprinting ? player.sprintMultiplier : 1);
    
    // Calculate target velocity
    const targetVelX = moveDirection.x * targetSpeed;
    const targetVelZ = moveDirection.z * targetSpeed;
    
    // Apply acceleration/deceleration
    const accel = player.isGrounded ? MOVEMENT_CONFIG.acceleration : MOVEMENT_CONFIG.acceleration * MOVEMENT_CONFIG.airControl;
    const decel = player.isGrounded ? MOVEMENT_CONFIG.deceleration : MOVEMENT_CONFIG.deceleration * MOVEMENT_CONFIG.airControl;
    
    // X velocity
    if (Math.abs(targetVelX) > 0.01) {
      velX = this.moveToward(velX, targetVelX, accel * deltaTime);
    } else {
      velX = this.moveToward(velX, 0, decel * deltaTime);
    }
    
    // Z velocity
    if (Math.abs(targetVelZ) > 0.01) {
      velZ = this.moveToward(velZ, targetVelZ, accel * deltaTime);
    } else {
      velZ = this.moveToward(velZ, 0, decel * deltaTime);
    }
    
    // Clamp horizontal velocity
    const horizontalSpeed = Math.sqrt(velX * velX + velZ * velZ);
    if (horizontalSpeed > MOVEMENT_CONFIG.maxVelocity) {
      const scale = MOVEMENT_CONFIG.maxVelocity / horizontalSpeed;
      velX *= scale;
      velZ *= scale;
    }
    
    // Apply gravity
    if (!player.isGrounded) {
      velY += MOVEMENT_CONFIG.gravity * deltaTime;
      velY = Math.max(velY, MOVEMENT_CONFIG.maxFallSpeed);
    } else if (velY < 0) {
      // Stick to ground slightly
      velY = -2;
    }
    
    // Handle jumping
    velY = this.handleJump(player, state, velY, deltaTime);
    
    // Apply velocity
    player.physicsBody.setLinvel({ x: velX, y: velY, z: velZ }, true);
    
    // Update player rotation to face movement direction
    if (moveDirection.lengthSq() > 0.01 && player.isGrounded) {
      const targetAngle = Math.atan2(moveDirection.x, moveDirection.z);
      player.targetRotation = targetAngle;
    }
  }
  
  /**
   * Handle jump logic
   * @returns {number} New Y velocity
   */
  handleJump(player, state, velY, deltaTime) {
    const currentTime = performance.now() / 1000;
    
    // Buffer jump input
    if (player.input.jump) {
      state.jumpBuffered = true;
      state.jumpBufferTime = currentTime;
    }
    
    // Clear old buffer
    if (currentTime - state.jumpBufferTime > MOVEMENT_CONFIG.jumpBufferTime) {
      state.jumpBuffered = false;
    }
    
    // Check if can jump (coyote time)
    const timeSinceGrounded = currentTime - state.lastGroundedTime;
    const canCoyoteJump = timeSinceGrounded < MOVEMENT_CONFIG.coyoteTime;
    const canJump = player.isGrounded || (canCoyoteJump && state.wasGrounded);
    
    // Check jump cooldown
    const timeSinceJump = currentTime - state.lastJumpTime;
    const jumpCooldownReady = timeSinceJump > MOVEMENT_CONFIG.jumpCooldown;
    
    // Execute jump
    if (state.jumpBuffered && canJump && jumpCooldownReady) {
      velY = player.jumpForce;
      state.lastJumpTime = currentTime;
      state.jumpBuffered = false;
      state.wasGrounded = false;
      player.isGrounded = false;
    }
    
    return velY;
  }
  
  /**
   * Move a value toward a target
   * @param {number} current
   * @param {number} target
   * @param {number} maxDelta
   * @returns {number}
   */
  moveToward(current, target, maxDelta) {
    if (Math.abs(target - current) <= maxDelta) {
      return target;
    }
    return current + Math.sign(target - current) * maxDelta;
  }
  
  /**
   * Update a player's movement (main update function)
   * @param {Player} player
   * @param {THREE.Vector3} cameraForward - Camera forward direction (horizontal)
   * @param {THREE.Vector3} cameraRight - Camera right direction
   * @param {number} deltaTime
   */
  updatePlayer(player, cameraForward, cameraRight, deltaTime) {
    if (!player.isAlive) return;
    
    // Calculate movement direction from input
    const moveDirection = new THREE.Vector3();
    
    if (player.input.forward !== 0 || player.input.right !== 0) {
      moveDirection.addScaledVector(cameraForward, player.input.forward);
      moveDirection.addScaledVector(cameraRight, player.input.right);
      moveDirection.normalize();
    }
    
    // Apply physics-based movement
    this.applyMovement(player, moveDirection, deltaTime);
  }
  
  /**
   * Apply an impulse to a player (for knockback, etc.)
   * @param {Player} player
   * @param {THREE.Vector3} impulse
   */
  applyImpulse(player, impulse) {
    if (player.physicsBody) {
      player.physicsBody.applyImpulse({ x: impulse.x, y: impulse.y, z: impulse.z }, true);
    }
  }
  
  /**
   * Teleport a player to a position
   * @param {Player} player
   * @param {THREE.Vector3} position
   */
  teleport(player, position) {
    if (player.physicsBody) {
      player.physicsBody.setTranslation(
        { x: position.x, y: position.y + player.height / 2, z: position.z },
        true
      );
      player.physicsBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
    player.position.copy(position);
    player.group.position.copy(position);
  }
}

// Export singleton
const physicsMovements = new PhysicsMovements();
export default physicsMovements;
export { PhysicsMovements, MOVEMENT_CONFIG };