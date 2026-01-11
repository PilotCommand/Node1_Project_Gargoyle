/**
 * Camera - Simplified camera system
 * First-person, orbit, and free/developer modes
 */

import * as THREE from 'three';

// Camera modes
export const CameraMode = {
  FIRST_PERSON: 'first-person',
  ORBIT: 'orbit',
  FREE: 'free'  // Developer noclip camera
};

class GameCamera {
  constructor() {
    this.camera = null;
    this.target = null;
    
    // Mouse look
    this.yaw = 0;
    this.pitch = 0;
    this.sensitivity = 1.0;
    
    // Orbit settings
    this.orbitDistance = 8;
    this.minOrbitDistance = 2;
    this.maxOrbitDistance = 50;
    
    // Current mode
    this.mode = CameraMode.ORBIT;
    this.previousMode = CameraMode.ORBIT; // Store mode before entering free cam
    
    // Target offset (eye height)
    this.targetOffset = new THREE.Vector3(0, 1.6, 0);
    
    // Free camera settings
    this.freePosition = new THREE.Vector3(0, 10, 20);
    this.freeSpeed = 20;
    this.freeFastSpeed = 50;
  }
  
  /**
   * Initialize camera
   * @param {THREE.PerspectiveCamera} camera
   */
  init(camera) {
    this.camera = camera;
    this.freePosition.copy(camera.position);
    
    // Ensure camera uses YXZ rotation order (no roll)
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.z = 0;
    
    console.log('Camera system initialized');
  }
  
  /**
   * Set the target to follow
   * @param {THREE.Object3D} target
   */
  setTarget(target) {
    this.target = target;
  }
  
  /**
   * Set camera mode
   * @param {string} mode
   */
  setMode(mode) {
    // Map old mode names to new ones
    if (mode === 'thirdPerson') {
      this.mode = CameraMode.ORBIT;
      this.orbitDistance = 8;
    } else if (mode === 'firstPerson') {
      this.mode = CameraMode.FIRST_PERSON;
      this.orbitDistance = 0;
    } else {
      this.mode = mode;
    }
    console.log(`Camera mode: ${this.mode}`);
  }
  
  /**
   * Toggle free/developer camera mode
   */
  toggleFreeCamera() {
    if (this.mode === CameraMode.FREE) {
      // Return to previous mode
      this.mode = this.previousMode;
      console.log(`Camera mode: ${this.mode} (exited free cam)`);
    } else {
      // Enter free camera mode
      this.previousMode = this.mode;
      this.mode = CameraMode.FREE;
      // Start free cam at current camera position
      this.freePosition.copy(this.camera.position);
      // Sync yaw/pitch from current camera to avoid weird rotation
      // The camera rotation is already set by update(), so yaw/pitch are current
      console.log('Camera mode: FREE (developer)');
    }
  }
  
  /**
   * Handle mouse input for rotation
   * @param {number} deltaX
   * @param {number} deltaY
   */
  handleMouseInput(deltaX, deltaY) {
    this.yaw -= deltaX * this.sensitivity;
    this.pitch -= deltaY * this.sensitivity;
    
    // Clamp pitch to avoid flipping
    this.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.pitch));
  }
  
  /**
   * Zoom in/out (changes orbit distance)
   * @param {number} delta - Positive = zoom in, negative = zoom out
   */
  zoom(delta) {
    // Don't zoom in free camera mode
    if (this.mode === CameraMode.FREE) return;
    
    this.orbitDistance -= delta * 5;
    this.orbitDistance = Math.max(0, Math.min(this.maxOrbitDistance, this.orbitDistance));
    
    // Switch modes based on orbit distance
    if (this.orbitDistance <= this.minOrbitDistance) {
      this.mode = CameraMode.FIRST_PERSON;
    } else {
      this.mode = CameraMode.ORBIT;
    }
  }
  
  /**
   * Update camera position (call every frame)
   * @param {number} deltaTime
   * @param {object} movement - Movement input { forward, right, jump, sprint, crouch }
   */
  update(deltaTime, movement = null) {
    if (!this.camera) return;
    
    // Free camera mode - handle movement independently
    if (this.mode === CameraMode.FREE) {
      this.updateFreeCamera(deltaTime, movement);
      return;
    }
    
    // Normal modes require a target
    if (!this.target) return;
    
    // Get target position
    const targetPos = new THREE.Vector3();
    this.target.getWorldPosition(targetPos);
    targetPos.add(this.targetOffset);
    
    if (this.mode === CameraMode.FIRST_PERSON || this.orbitDistance <= this.minOrbitDistance) {
      // First person: camera at target position
      this.camera.position.copy(targetPos);
      
      // Apply rotation directly - YXZ order, no roll
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.set(this.pitch, this.yaw, 0);
      
    } else {
      // Orbit mode: camera orbits around target
      // Use -pitch to make vertical orbit feel natural
      const offsetX = Math.sin(this.yaw) * Math.cos(-this.pitch) * this.orbitDistance;
      const offsetY = Math.sin(-this.pitch) * this.orbitDistance;
      const offsetZ = Math.cos(this.yaw) * Math.cos(-this.pitch) * this.orbitDistance;
      
      this.camera.position.set(
        targetPos.x + offsetX,
        targetPos.y + offsetY,
        targetPos.z + offsetZ
      );
      
      // Look at target, then zero out roll
      this.camera.lookAt(targetPos);
      this.camera.rotation.z = 0;
    }
  }
  
  /**
   * Update free/developer camera
   * @param {number} deltaTime
   * @param {object} movement
   */
  updateFreeCamera(deltaTime, movement) {
    // Apply rotation - YXZ order, no roll
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    
    if (!movement) {
      this.camera.position.copy(this.freePosition);
      return;
    }
    
    // Constant speed for free cam (no sprint)
    const speed = this.freeSpeed;
    
    // Get direction vectors from camera
    const forward = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    ).normalize();
    
    const right = new THREE.Vector3(
      Math.cos(this.yaw),
      0,
      -Math.sin(this.yaw)
    ).normalize();
    
    const up = new THREE.Vector3(0, 1, 0);
    
    // Apply movement
    if (movement.forward !== 0) {
      this.freePosition.addScaledVector(forward, movement.forward * speed * deltaTime);
    }
    if (movement.right !== 0) {
      this.freePosition.addScaledVector(right, movement.right * speed * deltaTime);
    }
    
    // Space = up, Shift (sprint) = down
    if (movement.jump) {
      this.freePosition.addScaledVector(up, speed * deltaTime);
    }
    if (movement.sprint) {
      this.freePosition.addScaledVector(up, -speed * deltaTime);
    }
    
    // Apply position
    this.camera.position.copy(this.freePosition);
  }
  
  /**
   * Get the forward direction (horizontal only, for movement)
   * @returns {THREE.Vector3}
   */
  getForwardDirection() {
    return new THREE.Vector3(
      -Math.sin(this.yaw),
      0,
      -Math.cos(this.yaw)
    ).normalize();
  }
  
  /**
   * Get the right direction (for strafing)
   * @returns {THREE.Vector3}
   */
  getRightDirection() {
    return new THREE.Vector3(
      Math.cos(this.yaw),
      0,
      -Math.sin(this.yaw)
    ).normalize();
  }
  
  /**
   * Get current yaw
   * @returns {number}
   */
  getYaw() {
    return this.yaw;
  }
  
  /**
   * Get current pitch
   * @returns {number}
   */
  getPitch() {
    return this.pitch;
  }
  
  /**
   * Check if in first person mode
   * @returns {boolean}
   */
  isFirstPerson() {
    return this.mode === CameraMode.FIRST_PERSON || this.orbitDistance <= this.minOrbitDistance;
  }
  
  /**
   * Check if in free camera mode
   * @returns {boolean}
   */
  isFreeCam() {
    return this.mode === CameraMode.FREE;
  }
  
  /**
   * Set mouse sensitivity
   * @param {number} value
   */
  setSensitivity(value) {
    this.sensitivity = value;
  }
}

// Export singleton
const gameCamera = new GameCamera();
export default gameCamera;
export { GameCamera };