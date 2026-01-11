/**
 * PhysicsMovements - Physics-based movement system
 * 
 * FIXED VERSION:
 * - Movement updates at fixed timestep (synced with physics)
 * - Proper velocity-based character controller
 * - Ground detection with tolerance
 * - Smooth acceleration/deceleration
 */

import * as THREE from 'three';

// Movement configuration
const MOVEMENT_CONFIG = {
  // Ground detection
  groundCheckDistance: 0.15,
  groundCheckRadius: 0.3,       // Multiple raycasts in a circle
  stickyGroundForce: -2,        // Small downward force when grounded
  
  // Movement speeds
  walkSpeed: 5,
  sprintMultiplier: 1.8,
  
  // Acceleration (units per second per second)
  groundAcceleration: 40,       // How fast to reach target speed on ground
  groundDeceleration: 50,       // How fast to stop on ground
  airAcceleration: 15,          // Reduced control in air
  airDeceleration: 5,           // Slow decel in air (momentum)
  
  // Velocity limits
  maxHorizontalSpeed: 15,
  maxFallSpeed: 40,
  
  // Jumping
  jumpVelocity: 8,
  jumpCooldown: 0.15,
  coyoteTime: 0.12,             // Time after leaving ground you can still jump
  jumpBufferTime: 0.15,         // Time before landing that jump input is remembered
  
  // Gravity (applied manually - Rapier world gravity should be 0)
  gravity: 25,                  // Positive value, applied as negative Y
  
  // Slopes
  maxWalkableSlopeAngle: 50,    // Degrees
  
  // Smoothing
  rotationSpeed: 12,            // How fast player turns to face movement direction
};

class PhysicsMovements {
  constructor() {
    this.world = null;
    this.RAPIER = null;
    
    // Player movement states
    this.playerStates = new Map();
    
    // Fixed timestep (should match physics)
    this.fixedDt = 1 / 60;
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
   * Set the fixed timestep (should match chronograph.fixedTimeStep)
   */
  setFixedTimestep(dt) {
    this.fixedDt = dt;
  }
  
  /**
   * Register a player for movement handling
   * @param {Player} player
   */
  registerPlayer(player) {
    this.playerStates.set(player.id, {
      // Ground state
      isGrounded: false,
      groundNormal: new THREE.Vector3(0, 1, 0),
      lastGroundedTime: 0,
      wasGroundedLastFrame: false,
      
      // Jump state
      lastJumpTime: -1,
      jumpBuffered: false,
      jumpBufferTimestamp: 0,
      hasJumpedSinceGrounded: false,
      
      // Velocity tracking (for smoothing)
      currentVelocity: new THREE.Vector3(),
      targetVelocity: new THREE.Vector3(),
      
      // Input state (cached for fixed update)
      inputDirection: new THREE.Vector3(),
      wantsJump: false,
      wantsSprint: false,
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
   * Set player input (call this from game update, before physics)
   * This caches the input for use in the fixed physics update
   */
  setPlayerInput(player, inputDirection, wantsJump, wantsSprint) {
    const state = this.playerStates.get(player.id);
    if (!state) return;
    
    state.inputDirection.copy(inputDirection);
    state.wantsSprint = wantsSprint;
    
    // Buffer jump input
    if (wantsJump && !state.jumpBuffered) {
      state.jumpBuffered = true;
      state.jumpBufferTimestamp = performance.now() / 1000;
    }
  }
  
  /**
   * Check if player is grounded using multiple raycasts
   * @param {Player} player
   * @returns {object} { grounded, normal }
   */
  checkGrounded(player) {
    if (!this.world || !player.physicsBody) {
      return { grounded: false, normal: new THREE.Vector3(0, 1, 0) };
    }
    
    const pos = player.physicsBody.translation();
    const halfHeight = player.height / 2;
    const radius = player.radius;
    
    // Cast from bottom of capsule
    const rayOrigin = { x: pos.x, y: pos.y - halfHeight + 0.05, z: pos.z };
    const rayDir = { x: 0, y: -1, z: 0 };
    const maxDist = MOVEMENT_CONFIG.groundCheckDistance + 0.05;
    
    const ray = new this.RAPIER.Ray(rayOrigin, rayDir);
    
    const hit = this.world.castRayAndGetNormal(
      ray,
      maxDist,
      true,           // solid
      undefined,      // flags  
      undefined,      // groups
      player.collider // exclude self
    );
    
    if (hit) {
      const normal = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z);
      
      // Check if slope is walkable
      const angle = Math.acos(Math.abs(normal.y)) * (180 / Math.PI);
      if (angle <= MOVEMENT_CONFIG.maxWalkableSlopeAngle) {
        return { grounded: true, normal };
      }
    }
    
    return { grounded: false, normal: new THREE.Vector3(0, 1, 0) };
  }
  
  /**
   * Update player physics (call this INSIDE the fixed timestep loop)
   * @param {Player} player
   */
  fixedUpdate(player) {
    if (!player.physicsBody || !player.isAlive) return;
    
    const state = this.playerStates.get(player.id);
    if (!state) return;
    
    const dt = this.fixedDt;
    const currentTime = performance.now() / 1000;
    
    // --- Ground Check ---
    const groundCheck = this.checkGrounded(player);
    state.wasGroundedLastFrame = state.isGrounded;
    state.isGrounded = groundCheck.grounded;
    state.groundNormal.copy(groundCheck.normal);
    player.isGrounded = state.isGrounded;
    
    // Track grounded time for coyote time
    if (state.isGrounded) {
      state.lastGroundedTime = currentTime;
      state.hasJumpedSinceGrounded = false;
    }
    
    // --- Get Current Velocity ---
    const linvel = player.physicsBody.linvel();
    let velX = linvel.x;
    let velY = linvel.y;
    let velZ = linvel.z;
    
    // --- Calculate Target Horizontal Velocity ---
    const inputDir = state.inputDirection;
    const hasInput = inputDir.lengthSq() > 0.001;
    
    // Determine speed
    let targetSpeed = player.speed || MOVEMENT_CONFIG.walkSpeed;
    if (state.wantsSprint && state.isGrounded) {
      targetSpeed *= (player.sprintMultiplier || MOVEMENT_CONFIG.sprintMultiplier);
    }
    
    // Target velocity from input
    const targetVelX = hasInput ? inputDir.x * targetSpeed : 0;
    const targetVelZ = hasInput ? inputDir.z * targetSpeed : 0;
    
    // --- Apply Acceleration/Deceleration ---
    let accel, decel;
    if (state.isGrounded) {
      accel = MOVEMENT_CONFIG.groundAcceleration;
      decel = MOVEMENT_CONFIG.groundDeceleration;
    } else {
      accel = MOVEMENT_CONFIG.airAcceleration;
      decel = MOVEMENT_CONFIG.airDeceleration;
    }
    
    // Accelerate toward target
    if (hasInput) {
      velX = this.moveToward(velX, targetVelX, accel * dt);
      velZ = this.moveToward(velZ, targetVelZ, accel * dt);
    } else {
      // Decelerate to stop
      velX = this.moveToward(velX, 0, decel * dt);
      velZ = this.moveToward(velZ, 0, decel * dt);
    }
    
    // Clamp horizontal speed
    const horizSpeed = Math.sqrt(velX * velX + velZ * velZ);
    if (horizSpeed > MOVEMENT_CONFIG.maxHorizontalSpeed) {
      const scale = MOVEMENT_CONFIG.maxHorizontalSpeed / horizSpeed;
      velX *= scale;
      velZ *= scale;
    }
    
    // --- Vertical Movement (Gravity & Jump) ---
    
    // Apply gravity when not grounded
    if (!state.isGrounded) {
      velY -= MOVEMENT_CONFIG.gravity * dt;
      velY = Math.max(velY, -MOVEMENT_CONFIG.maxFallSpeed);
    } else {
      // On ground - apply small downward force to stick to ground
      if (velY < 0) {
        velY = MOVEMENT_CONFIG.stickyGroundForce;
      }
    }
    
    // --- Jump Logic ---
    const canCoyoteJump = (currentTime - state.lastGroundedTime) < MOVEMENT_CONFIG.coyoteTime;
    const canJump = (state.isGrounded || canCoyoteJump) && !state.hasJumpedSinceGrounded;
    const jumpCooldownPassed = (currentTime - state.lastJumpTime) > MOVEMENT_CONFIG.jumpCooldown;
    
    // Clear expired jump buffer
    if (state.jumpBuffered && (currentTime - state.jumpBufferTimestamp) > MOVEMENT_CONFIG.jumpBufferTime) {
      state.jumpBuffered = false;
    }
    
    // Execute jump
    if (state.jumpBuffered && canJump && jumpCooldownPassed) {
      velY = player.jumpForce || MOVEMENT_CONFIG.jumpVelocity;
      state.lastJumpTime = currentTime;
      state.jumpBuffered = false;
      state.hasJumpedSinceGrounded = true;
      state.isGrounded = false;
      player.isGrounded = false;
    }
    
    // --- Apply Final Velocity ---
    player.physicsBody.setLinvel({ x: velX, y: velY, z: velZ }, true);
    
    // --- Update Player Rotation ---
    if (hasInput && state.isGrounded) {
      player.targetRotation = Math.atan2(inputDir.x, inputDir.z);
    }
    
    // Store current velocity for debugging/animation
    state.currentVelocity.set(velX, velY, velZ);
  }
  
  /**
   * Convenience method: Set input and run fixed update
   * Use this if calling from outside the physics loop
   */
  updatePlayer(player, cameraForward, cameraRight, dt) {
    if (!player.isAlive) return;
    
    const state = this.playerStates.get(player.id);
    if (!state) return;
    
    // Calculate movement direction from input
    const moveDirection = new THREE.Vector3();
    
    if (player.input.forward !== 0 || player.input.right !== 0) {
      moveDirection.addScaledVector(cameraForward, player.input.forward);
      moveDirection.addScaledVector(cameraRight, player.input.right);
      moveDirection.normalize();
    }
    
    // Set input for fixed update
    this.setPlayerInput(player, moveDirection, player.input.jump, player.input.sprint);
    
    // Run fixed update (in proper usage, this is called from physics loop)
    this.fixedUpdate(player);
  }
  
  /**
   * Move a value toward a target by maxDelta
   */
  moveToward(current, target, maxDelta) {
    const diff = target - current;
    if (Math.abs(diff) <= maxDelta) {
      return target;
    }
    return current + Math.sign(diff) * maxDelta;
  }
  
  /**
   * Apply an impulse to a player
   */
  applyImpulse(player, impulse) {
    if (player.physicsBody) {
      player.physicsBody.applyImpulse({ x: impulse.x, y: impulse.y, z: impulse.z }, true);
    }
  }
  
  /**
   * Teleport a player
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
    
    // Reset state
    const state = this.playerStates.get(player.id);
    if (state) {
      state.currentVelocity.set(0, 0, 0);
      state.isGrounded = false;
    }
  }
  
  /**
   * Get movement debug info
   */
  getDebugInfo(playerId) {
    const state = this.playerStates.get(playerId);
    if (!state) return null;
    
    return {
      grounded: state.isGrounded,
      velocity: `${state.currentVelocity.x.toFixed(1)}, ${state.currentVelocity.y.toFixed(1)}, ${state.currentVelocity.z.toFixed(1)}`,
      speed: Math.sqrt(state.currentVelocity.x ** 2 + state.currentVelocity.z ** 2).toFixed(1),
    };
  }
}

// Export singleton
const physicsMovements = new PhysicsMovements();
export default physicsMovements;
export { PhysicsMovements, MOVEMENT_CONFIG };