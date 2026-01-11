/**
 * TargetPlayer - The human player being chased
 * Can only walk, collects trophies, and has FOV detection for gargoyles
 */

import * as THREE from 'three';
import Player, { PlayerState, PlayerType } from './player.js';

class TargetPlayer extends Player {
  constructor(options = {}) {
    // Force target type
    super({
      ...options,
      type: PlayerType.TARGET,
      name: options.name || 'Target',
      speed: options.speed || 4,           // Slower than gargoyles
      sprintMultiplier: 1,                  // No sprinting
      jumpForce: options.jumpForce || 6     // Can still jump
    });
    
    // FOV Detection settings
    this.fov = {
      angle: options.fovAngle || 90,        // Degrees - field of view angle
      distance: options.fovDistance || 50,   // How far can see
      enabled: true
    };
    
    // Camera reference for FOV calculations
    this.camera = null;
    
    // Trophies collected
    this.trophiesCollected = 0;
    this.trophiesToWin = 0;
    
    // Frustum for FOV checks
    this.frustum = new THREE.Frustum();
    this.projScreenMatrix = new THREE.Matrix4();
    
    // Visible gargoyles (updated each frame)
    this.visibleGargoyles = new Set();
    
    // Raycaster for line-of-sight checks
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = this.fov.distance;
  }
  
  /**
   * Set camera reference for FOV calculations
   * @param {THREE.PerspectiveCamera} camera
   */
  setCamera(camera) {
    this.camera = camera;
  }
  
  /**
   * Check if a point is within the player's field of view
   * @param {THREE.Vector3} point - World position to check
   * @returns {boolean}
   */
  isInFieldOfView(point) {
    if (!this.camera || !this.fov.enabled) return false;
    
    // Update frustum from camera
    this.projScreenMatrix.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    );
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
    
    // Check if point is in frustum
    if (!this.frustum.containsPoint(point)) {
      return false;
    }
    
    // Check distance
    const distance = this.position.distanceTo(point);
    if (distance > this.fov.distance) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Check if a gargoyle is visible (in FOV and not occluded)
   * @param {Player} gargoyle - The gargoyle player
   * @param {THREE.Object3D[]} obstacles - Objects that can block line of sight
   * @returns {boolean}
   */
  canSeeGargoyle(gargoyle, obstacles = []) {
    if (!this.camera || !this.fov.enabled) return false;
    
    // Get gargoyle position (at chest height)
    const gargoylePos = gargoyle.position.clone();
    gargoylePos.y += gargoyle.height * 0.6;
    
    // First check: is gargoyle in field of view?
    if (!this.isInFieldOfView(gargoylePos)) {
      return false;
    }
    
    // Second check: line of sight (raycast for occlusion)
    const eyePosition = this.position.clone();
    eyePosition.y += this.height * 0.8; // Eye level
    
    const direction = new THREE.Vector3()
      .subVectors(gargoylePos, eyePosition)
      .normalize();
    
    const distance = eyePosition.distanceTo(gargoylePos);
    
    this.raycaster.set(eyePosition, direction);
    this.raycaster.far = distance;
    
    // Check for obstacles between player and gargoyle
    if (obstacles.length > 0) {
      const intersects = this.raycaster.intersectObjects(obstacles, true);
      
      // If something is hit before the gargoyle, line of sight is blocked
      if (intersects.length > 0 && intersects[0].distance < distance - 0.5) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Update visible gargoyles list
   * @param {Player[]} gargoyles - Array of gargoyle players
   * @param {THREE.Object3D[]} obstacles - Objects that can block line of sight
   * @returns {Set} Set of visible gargoyle IDs
   */
  updateVisibleGargoyles(gargoyles, obstacles = []) {
    this.visibleGargoyles.clear();
    
    for (const gargoyle of gargoyles) {
      if (!gargoyle.isAlive) continue;
      
      if (this.canSeeGargoyle(gargoyle, obstacles)) {
        this.visibleGargoyles.add(gargoyle.id);
      }
    }
    
    return this.visibleGargoyles;
  }
  
  /**
   * Collect a trophy
   */
  collectTrophy() {
    this.trophiesCollected++;
    console.log(`Trophy collected! ${this.trophiesCollected}/${this.trophiesToWin}`);
    
    // Check win condition
    if (this.trophiesToWin > 0 && this.trophiesCollected >= this.trophiesToWin) {
      this.onWin();
    }
  }
  
  /**
   * Called when player wins
   */
  onWin() {
    console.log('TARGET PLAYER WINS!');
    // Can be overridden or use event system
  }
  
  /**
   * Called when caught by gargoyle
   */
  onCaught() {
    console.log('TARGET PLAYER CAUGHT!');
    this.die();
  }
  
  /**
   * Override update to enforce no sprinting
   * @param {number} deltaTime
   */
  update(deltaTime) {
    // Force sprint off for target player
    this.input.sprint = false;
    
    // Call parent update
    super.update(deltaTime);
  }
  
  /**
   * Get debug info for HUD
   * @returns {object}
   */
  getDebugInfo() {
    return {
      trophies: `${this.trophiesCollected}/${this.trophiesToWin}`,
      visibleGargoyles: this.visibleGargoyles.size,
      position: `${this.position.x.toFixed(1)}, ${this.position.y.toFixed(1)}, ${this.position.z.toFixed(1)}`,
      state: this.state
    };
  }
}

export default TargetPlayer;
export { TargetPlayer };