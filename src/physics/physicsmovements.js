/**
 * PhysicsMovements - Simple Movement System
 * 
 * Clean, basic movement like Swimming.js but for ground-based characters.
 * No overcomplicated state machines, just simple velocity control.
 */

import * as THREE from 'three';

// ============================================================================
// PARAMETERS - Edit these to tune the feel
// ============================================================================

const PARAMS = {
  // Movement
  speed: 5,               // Walk speed (units/sec)
  sprintSpeed: 9,         // Sprint speed
  airSpeed: 3,            // Speed while in air
  
  // Smoothing
  acceleration: 25,       // How fast you reach target speed
  deceleration: 20,       // How fast you stop
  airControl: 0.3,        // Air control multiplier (0-1)
  
  // Jumping
  jumpForce: 8,           // Initial jump velocity
  gravity: 30,            // Gravity strength
  
  // Ground detection
  groundCheckDist: 0.3,   // How far to raycast for ground
  
  // Rotation
  turnSpeed: 10,          // How fast player turns to face movement
};

// ============================================================================
// STATE
// ============================================================================

class PhysicsMovements {
  constructor() {
    this.world = null;
    this.RAPIER = null;
    
    // Per-player state
    this.players = new Map();
  }
  
  // ==========================================================================
  // SETUP
  // ==========================================================================
  
  init(world, RAPIER) {
    this.world = world;
    this.RAPIER = RAPIER;
    console.log('[Movement] Initialized');
  }
  
  registerPlayer(player) {
    this.players.set(player.id, {
      velocity: new THREE.Vector3(),
      isGrounded: false,
      canJump: true,
    });
  }
  
  unregisterPlayer(playerId) {
    this.players.delete(playerId);
  }
  
  // ==========================================================================
  // GROUND CHECK - Simple raycast
  // ==========================================================================
  
  checkGrounded(player) {
    if (!this.world || !player.physicsBody) return false;
    
    const pos = player.physicsBody.translation();
    
    // Ray from center of capsule, pointing down
    const rayOrigin = { x: pos.x, y: pos.y, z: pos.z };
    const rayDir = { x: 0, y: -1, z: 0 };
    
    // Distance = half height + ground check distance
    const halfHeight = player.height / 2;
    const maxDist = halfHeight + PARAMS.groundCheckDist;
    
    const ray = new this.RAPIER.Ray(rayOrigin, rayDir);
    const hit = this.world.castRay(ray, maxDist, true, undefined, undefined, player.collider);
    
    return hit !== null;
  }
  
  // ==========================================================================
  // MAIN UPDATE - Called each physics step
  // ==========================================================================
  
  updatePlayer(player, moveDirection, wantJump, wantSprint, dt) {
    if (!player.physicsBody || !player.isAlive) return;
    
    const state = this.players.get(player.id);
    if (!state) return;
    
    // --- Ground Check ---
    state.isGrounded = this.checkGrounded(player);
    player.isGrounded = state.isGrounded;
    
    // --- Get Current Velocity ---
    const linvel = player.physicsBody.linvel();
    let velX = linvel.x;
    let velY = linvel.y;
    let velZ = linvel.z;
    
    // --- Horizontal Movement ---
    const hasInput = moveDirection.lengthSq() > 0.001;
    
    // Choose speed based on state
    let targetSpeed = PARAMS.speed;
    if (wantSprint && state.isGrounded) targetSpeed = PARAMS.sprintSpeed;
    if (!state.isGrounded) targetSpeed = PARAMS.airSpeed;
    
    // Target velocity
    const targetVelX = hasInput ? moveDirection.x * targetSpeed : 0;
    const targetVelZ = hasInput ? moveDirection.z * targetSpeed : 0;
    
    // Smooth acceleration (lerp-style)
    const accelRate = state.isGrounded ? PARAMS.acceleration : PARAMS.acceleration * PARAMS.airControl;
    const decelRate = state.isGrounded ? PARAMS.deceleration : PARAMS.deceleration * PARAMS.airControl;
    
    if (hasInput) {
      velX = this.lerp(velX, targetVelX, accelRate * dt);
      velZ = this.lerp(velZ, targetVelZ, accelRate * dt);
    } else {
      velX = this.lerp(velX, 0, decelRate * dt);
      velZ = this.lerp(velZ, 0, decelRate * dt);
      
      // Snap to zero when very slow
      if (Math.abs(velX) < 0.1) velX = 0;
      if (Math.abs(velZ) < 0.1) velZ = 0;
    }
    
    // --- Vertical Movement ---
    if (state.isGrounded) {
      // On ground - zero out falling velocity (don't fight Rapier)
      if (velY < 0) velY = 0;
      
      // Jump
      if (wantJump && state.canJump) {
        velY = PARAMS.jumpForce;
        state.canJump = false;
      }
    } else {
      // In air - apply gravity
      velY -= PARAMS.gravity * dt;
      
      // Clamp fall speed
      if (velY < -50) velY = -50;
    }
    
    // Reset jump ability when grounded and not holding jump
    if (state.isGrounded && !wantJump) {
      state.canJump = true;
    }
    
    // --- Apply Velocity ---
    player.physicsBody.setLinvel({ x: velX, y: velY, z: velZ }, true);
    
    // --- Rotation ---
    if (hasInput && state.isGrounded) {
      const targetYaw = Math.atan2(moveDirection.x, moveDirection.z);
      player.targetRotation = targetYaw;
    }
    
    // Store for debug
    state.velocity.set(velX, velY, velZ);
  }
  
  // ==========================================================================
  // UTILITIES
  // ==========================================================================
  
  lerp(current, target, rate) {
    const diff = target - current;
    if (Math.abs(diff) < 0.001) return target;
    return current + diff * Math.min(rate, 1);
  }
  
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
    
    const state = this.players.get(player.id);
    if (state) state.velocity.set(0, 0, 0);
  }
  
  applyImpulse(player, impulse) {
    if (player.physicsBody) {
      player.physicsBody.applyImpulse(impulse, true);
    }
  }
  
  // ==========================================================================
  // DEBUG
  // ==========================================================================
  
  getDebugInfo(playerId) {
    const state = this.players.get(playerId);
    if (!state) return null;
    
    return {
      grounded: state.isGrounded,
      velocity: `${state.velocity.x.toFixed(1)}, ${state.velocity.y.toFixed(1)}, ${state.velocity.z.toFixed(1)}`,
      speed: Math.sqrt(state.velocity.x ** 2 + state.velocity.z ** 2).toFixed(1),
    };
  }
  
  // ==========================================================================
  // CONFIG
  // ==========================================================================
  
  setConfig(config) {
    Object.assign(PARAMS, config);
  }
  
  getConfig() {
    return { ...PARAMS };
  }
}

// Export singleton
const physicsMovements = new PhysicsMovements();
export default physicsMovements;
export { PhysicsMovements, PARAMS as MOVEMENT_CONFIG };