/**
 * Camera - Camera system with multiple modes
 * Handles third-person, first-person, and free camera
 */

import * as THREE from 'three';

// Camera modes
export const CameraMode = {
  THIRD_PERSON: 'thirdPerson',
  FIRST_PERSON: 'firstPerson',
  FREE: 'free',
  ORBIT: 'orbit'  // For debugging/spectating
};

class GameCamera {
  constructor() {
    this.camera = null;
    this.mode = CameraMode.THIRD_PERSON;
    
    // Target to follow
    this.target = null;
    this.targetOffset = new THREE.Vector3(0, 1.6, 0); // Eye height offset
    
    // Third person settings
    this.thirdPerson = {
      distance: 8,
      minDistance: 2,
      maxDistance: 20,
      height: 2,
      damping: 5,        // Camera smoothing
      currentDistance: 8
    };
    
    // Camera rotation (euler angles)
    this.rotation = {
      yaw: 0,            // Horizontal rotation (around Y axis)
      pitch: 0,          // Vertical rotation (around X axis)
      minPitch: -Math.PI / 2 + 0.1,
      maxPitch: Math.PI / 2 - 0.1
    };
    
    // Free camera settings
    this.freeCam = {
      speed: 20,
      fastSpeed: 50,
      position: new THREE.Vector3(0, 10, 20)
    };
    
    // Smooth camera position
    this.currentPosition = new THREE.Vector3();
    this.desiredPosition = new THREE.Vector3();
    
    // Collision detection
    this.collisionEnabled = true;
    this.raycaster = new THREE.Raycaster();
    this.collisionLayers = [];
  }
  
  /**
   * Initialize camera
   * @param {THREE.PerspectiveCamera} camera - The Three.js camera
   */
  init(camera) {
    this.camera = camera;
    this.currentPosition.copy(camera.position);
    console.log('Camera system initialized');
  }
  
  /**
   * Set the target to follow
   * @param {THREE.Object3D} target - Object to follow
   */
  setTarget(target) {
    this.target = target;
  }
  
  /**
   * Set camera mode
   * @param {string} mode - Mode from CameraMode
   */
  setMode(mode) {
    this.mode = mode;
    console.log(`Camera mode: ${mode}`);
    
    if (mode === CameraMode.FREE) {
      // Store current position for free cam
      this.freeCam.position.copy(this.camera.position);
    }
  }
  
  /**
   * Toggle between third person and free camera
   */
  toggleFreeCamera() {
    if (this.mode === CameraMode.FREE) {
      this.setMode(CameraMode.THIRD_PERSON);
    } else {
      this.setMode(CameraMode.FREE);
    }
  }
  
  /**
   * Handle mouse input for rotation
   * @param {number} deltaX - Mouse X movement
   * @param {number} deltaY - Mouse Y movement
   */
  handleMouseInput(deltaX, deltaY) {
    // Update yaw (horizontal)
    this.rotation.yaw -= deltaX;
    
    // Update pitch (vertical) with clamping
    // Invert for third person, normal for free cam
    if (this.mode === CameraMode.THIRD_PERSON || this.mode === CameraMode.ORBIT) {
        this.rotation.pitch += deltaY;
    } else {
        this.rotation.pitch -= deltaY;
    }
    
    this.rotation.pitch = Math.max(
        this.rotation.minPitch,
        Math.min(this.rotation.maxPitch, this.rotation.pitch)
    );
  }
  
  /**
   * Update camera (call every frame)
   * @param {number} deltaTime - Time since last frame
   * @param {object} movement - Movement input { forward, right, sprint }
   */
  update(deltaTime, movement = null) {
    if (!this.camera) return;
    
    switch (this.mode) {
      case CameraMode.THIRD_PERSON:
        this.updateThirdPerson(deltaTime);
        break;
      case CameraMode.FIRST_PERSON:
        this.updateFirstPerson(deltaTime);
        break;
      case CameraMode.FREE:
        this.updateFreeCamera(deltaTime, movement);
        break;
      case CameraMode.ORBIT:
        this.updateOrbit(deltaTime);
        break;
    }
  }
  
  /**
   * Update third-person camera
   */
  updateThirdPerson(deltaTime) {
    if (!this.target) return;
    
    // Get target position with offset
    const targetPos = new THREE.Vector3();
    this.target.getWorldPosition(targetPos);
    targetPos.add(this.targetOffset);
    
    // Calculate desired camera position based on rotation
    const spherical = new THREE.Spherical(
      this.thirdPerson.distance,
      Math.PI / 2 - this.rotation.pitch,  // Polar angle
      this.rotation.yaw                     // Azimuthal angle
    );
    
    const offset = new THREE.Vector3().setFromSpherical(spherical);
    this.desiredPosition.copy(targetPos).add(offset);
    
    // Optional: Camera collision
    if (this.collisionEnabled) {
      this.handleCameraCollision(targetPos);
    }
    
    // Smooth camera movement
    const lerpFactor = 1 - Math.exp(-this.thirdPerson.damping * deltaTime);
    this.currentPosition.lerp(this.desiredPosition, lerpFactor);
    
    // Apply position
    this.camera.position.copy(this.currentPosition);
    
    // Look at target
    this.camera.lookAt(targetPos);
  }
  
  /**
   * Update first-person camera
   */
  updateFirstPerson(deltaTime) {
    if (!this.target) return;
    
    // Position camera at target's head
    const targetPos = new THREE.Vector3();
    this.target.getWorldPosition(targetPos);
    targetPos.add(this.targetOffset);
    
    this.camera.position.copy(targetPos);
    
    // Apply rotation
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.rotation.yaw;
    this.camera.rotation.x = this.rotation.pitch;
  }
  
  /**
   * Update free camera (noclip style)
   */
  updateFreeCamera(deltaTime, movement) {
    if (!movement) return;
    
    const speed = movement.sprint 
      ? this.freeCam.fastSpeed 
      : this.freeCam.speed;
    
    // Get camera direction vectors
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    
    this.camera.getWorldDirection(forward);
    right.crossVectors(forward, this.camera.up).normalize();
    
    // Calculate movement
    const moveVector = new THREE.Vector3();
    
    if (movement.forward !== 0) {
      moveVector.addScaledVector(forward, movement.forward * speed * deltaTime);
    }
    if (movement.right !== 0) {
      moveVector.addScaledVector(right, movement.right * speed * deltaTime);
    }
    if (movement.jump) {
      moveVector.y += speed * deltaTime;
    }
    if (movement.crouch) {
      moveVector.y -= speed * deltaTime;
    }
    
    // Apply movement
    this.freeCam.position.add(moveVector);
    this.camera.position.copy(this.freeCam.position);
    
    // Apply rotation
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.rotation.yaw;
    this.camera.rotation.x = this.rotation.pitch;
  }
  
  /**
   * Update orbit camera (auto-rotate around origin)
   */
  updateOrbit(deltaTime) {
    // This is kept for testing/debugging
    this.rotation.yaw += deltaTime * 0.15;
    
    const radius = 60;
    this.camera.position.x = Math.sin(this.rotation.yaw) * radius;
    this.camera.position.z = Math.cos(this.rotation.yaw) * radius;
    this.camera.position.y = 30;
    this.camera.lookAt(0, 0, 0);
  }
  
  /**
   * Handle camera collision to prevent clipping through walls
   */
  handleCameraCollision(targetPos) {
    if (this.collisionLayers.length === 0) return;
    
    // Cast ray from target to desired camera position
    const direction = new THREE.Vector3()
      .subVectors(this.desiredPosition, targetPos)
      .normalize();
    
    const distance = targetPos.distanceTo(this.desiredPosition);
    
    this.raycaster.set(targetPos, direction);
    this.raycaster.far = distance;
    
    const intersects = this.raycaster.intersectObjects(this.collisionLayers, true);
    
    if (intersects.length > 0) {
      // Move camera closer to avoid collision
      const collisionDistance = intersects[0].distance - 0.5; // Buffer
      if (collisionDistance < distance) {
        this.desiredPosition.copy(targetPos).addScaledVector(
          direction,
          Math.max(this.thirdPerson.minDistance, collisionDistance)
        );
      }
    }
  }
  
  /**
   * Set objects for collision detection
   * @param {THREE.Object3D[]} objects
   */
  setCollisionLayers(objects) {
    this.collisionLayers = objects;
  }
  
  /**
   * Zoom camera in/out
   * @param {number} delta - Zoom amount (positive = zoom in)
   */
  zoom(delta) {
    if (this.mode === CameraMode.THIRD_PERSON) {
      this.thirdPerson.distance = Math.max(
        this.thirdPerson.minDistance,
        Math.min(
          this.thirdPerson.maxDistance,
          this.thirdPerson.distance - delta
        )
      );
    }
  }
  
  /**
   * Get the forward direction the camera is facing (horizontal only)
   * @returns {THREE.Vector3}
   */
  getForwardDirection() {
    const forward = new THREE.Vector3(
      -Math.sin(this.rotation.yaw),
      0,
      -Math.cos(this.rotation.yaw)
    );
    return forward.normalize();
  }
  
  /**
   * Get the right direction relative to camera
   * @returns {THREE.Vector3}
   */
  getRightDirection() {
    const right = new THREE.Vector3(
      Math.cos(this.rotation.yaw),
      0,
      -Math.sin(this.rotation.yaw)
    );
    return right.normalize();
  }
  
  /**
   * Get current yaw rotation
   * @returns {number}
   */
  getYaw() {
    return this.rotation.yaw;
  }
}

// Export singleton
const gameCamera = new GameCamera();
export default gameCamera;
export { GameCamera };