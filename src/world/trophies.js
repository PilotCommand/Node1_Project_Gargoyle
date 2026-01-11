/**
 * Trophies - Collectible trophy system
 * Spawns trophies around the city for the target player to collect
 */

import * as THREE from 'three';
import meshRegistry, { MeshCategory } from '../registries/meshregistry.js';
import { ACCENTS } from '../utilities/palette.js';

// Trophy configuration
const TROPHY_CONFIG = {
  // Spawn settings
  minTrophies: 5,
  maxTrophies: 10,
  minDistanceFromCenter: 20,
  minDistanceBetween: 15,
  spawnHeight: 1,
  
  // Visual settings - from palette
  baseColor: ACCENTS.gold,
  glowColor: ACCENTS.goldGlow,
  size: 0.5,
  
  // Animation
  rotationSpeed: 1.5,       // Radians per second
  bobSpeed: 2,              // Bob frequency
  bobHeight: 0.3,           // Bob amplitude
  
  // Collection
  collectRadius: 2          // How close player needs to be
};

class Trophies {
  constructor() {
    this.scene = null;
    this.trophies = [];
    this.collectedCount = 0;
    this.totalCount = 0;
    
    // Callbacks
    this.onCollect = null;
    this.onAllCollected = null;
  }
  
  /**
   * Initialize with scene reference
   * @param {THREE.Scene} scene
   */
  init(scene) {
    this.scene = scene;
    console.log('Trophies system initialized');
  }
  
  /**
   * Create a single trophy mesh
   * @returns {THREE.Group}
   */
  createTrophyMesh() {
    const group = new THREE.Group();
    
    // Trophy base (cylinder)
    const baseGeometry = new THREE.CylinderGeometry(
      TROPHY_CONFIG.size * 0.6,
      TROPHY_CONFIG.size * 0.8,
      TROPHY_CONFIG.size * 0.4,
      8
    );
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: TROPHY_CONFIG.baseColor,
      roughness: 0.3,
      metalness: 0.8
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = TROPHY_CONFIG.size * 0.2;
    base.castShadow = true;
    group.add(base);
    
    // Trophy stem (cylinder)
    const stemGeometry = new THREE.CylinderGeometry(
      TROPHY_CONFIG.size * 0.15,
      TROPHY_CONFIG.size * 0.2,
      TROPHY_CONFIG.size * 0.8,
      8
    );
    const stem = new THREE.Mesh(stemGeometry, baseMaterial);
    stem.position.y = TROPHY_CONFIG.size * 0.8;
    stem.castShadow = true;
    group.add(stem);
    
    // Trophy cup (sphere or custom shape)
    const cupGeometry = new THREE.SphereGeometry(
      TROPHY_CONFIG.size * 0.5,
      16,
      12,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.6
    );
    const cupMaterial = new THREE.MeshStandardMaterial({
      color: TROPHY_CONFIG.baseColor,
      roughness: 0.2,
      metalness: 0.9,
      side: THREE.DoubleSide
    });
    const cup = new THREE.Mesh(cupGeometry, cupMaterial);
    cup.position.y = TROPHY_CONFIG.size * 1.3;
    cup.rotation.x = Math.PI;
    cup.castShadow = true;
    group.add(cup);
    
    // Glow effect (point light)
    const glow = new THREE.PointLight(TROPHY_CONFIG.glowColor, 0.5, 5);
    glow.position.y = TROPHY_CONFIG.size;
    group.add(glow);
    
    // Star on top
    const starGeometry = new THREE.OctahedronGeometry(TROPHY_CONFIG.size * 0.25);
    const starMaterial = new THREE.MeshStandardMaterial({
      color: ACCENTS.white,
      roughness: 0.1,
      metalness: 1.0,
      emissive: ACCENTS.star,
      emissiveIntensity: 0.3
    });
    const star = new THREE.Mesh(starGeometry, starMaterial);
    star.position.y = TROPHY_CONFIG.size * 1.8;
    star.castShadow = true;
    group.add(star);
    group.userData.star = star;
    
    return group;
  }
  
  /**
   * Spawn trophies around the map
   * @param {object} mapBounds - { minX, maxX, minZ, maxZ }
   * @param {Set} occupiedCells - Cells occupied by buildings
   * @param {number} count - Number of trophies (optional)
   */
  spawnTrophies(mapBounds, occupiedCells, count = null) {
    const numTrophies = count || this.randomInt(
      TROPHY_CONFIG.minTrophies,
      TROPHY_CONFIG.maxTrophies
    );
    
    const positions = [];
    let attempts = 0;
    const maxAttempts = numTrophies * 20;
    
    while (positions.length < numTrophies && attempts < maxAttempts) {
      attempts++;
      
      // Random position within bounds
      const x = this.randomRange(mapBounds.minX + 10, mapBounds.maxX - 10);
      const z = this.randomRange(mapBounds.minZ + 10, mapBounds.maxZ - 10);
      
      // Check distance from center
      const distFromCenter = Math.sqrt(x * x + z * z);
      if (distFromCenter < TROPHY_CONFIG.minDistanceFromCenter) {
        continue;
      }
      
      // Check distance from other trophies
      let tooClose = false;
      for (const pos of positions) {
        const dist = Math.sqrt((x - pos.x) ** 2 + (z - pos.z) ** 2);
        if (dist < TROPHY_CONFIG.minDistanceBetween) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;
      
      // Check if position is in occupied cell (building)
      const cellKey = `${Math.floor(x / 5)},${Math.floor(z / 5)}`;
      if (occupiedCells.has(cellKey)) {
        continue;
      }
      
      positions.push({ x, z });
    }
    
    // Create trophies at positions
    for (const pos of positions) {
      this.createTrophy(pos.x, pos.z);
    }
    
    this.totalCount = this.trophies.length;
    console.log(`Spawned ${this.totalCount} trophies`);
    
    return this.totalCount;
  }
  
  /**
   * Create a trophy at position
   * @param {number} x
   * @param {number} z
   */
  createTrophy(x, z) {
    const trophy = this.createTrophyMesh();
    trophy.position.set(x, TROPHY_CONFIG.spawnHeight, z);
    
    // Store spawn position for bobbing animation
    trophy.userData.spawnY = TROPHY_CONFIG.spawnHeight;
    trophy.userData.collected = false;
    trophy.userData.id = `trophy_${this.trophies.length}`;
    
    this.scene.add(trophy);
    
    // Register with mesh registry
    const id = meshRegistry.register(trophy, MeshCategory.TROPHY, {
      name: trophy.userData.id,
      needsPhysics: false,
      isStatic: true
    });
    
    trophy.userData.registryId = id;
    
    this.trophies.push(trophy);
    
    return trophy;
  }
  
  /**
   * Check if player can collect any trophies
   * @param {THREE.Vector3} playerPosition
   * @returns {THREE.Group|null} Collected trophy or null
   */
  checkCollection(playerPosition) {
    for (const trophy of this.trophies) {
      if (trophy.userData.collected) continue;
      
      const distance = playerPosition.distanceTo(trophy.position);
      
      if (distance <= TROPHY_CONFIG.collectRadius) {
        return this.collectTrophy(trophy);
      }
    }
    
    return null;
  }
  
  /**
   * Collect a trophy
   * @param {THREE.Group} trophy
   * @returns {THREE.Group}
   */
  collectTrophy(trophy) {
    if (trophy.userData.collected) return null;
    
    trophy.userData.collected = true;
    this.collectedCount++;
    
    // Animate collection (scale down and fade)
    this.animateCollection(trophy);
    
    console.log(`Trophy collected! ${this.collectedCount}/${this.totalCount}`);
    
    // Callback
    if (this.onCollect) {
      this.onCollect(trophy, this.collectedCount, this.totalCount);
    }
    
    // Check if all collected
    if (this.collectedCount >= this.totalCount) {
      console.log('ALL TROPHIES COLLECTED!');
      if (this.onAllCollected) {
        this.onAllCollected();
      }
    }
    
    return trophy;
  }
  
  /**
   * Animate trophy collection
   * @param {THREE.Group} trophy
   */
  animateCollection(trophy) {
    // Simple removal after short delay
    // Could be enhanced with GSAP or custom animation
    const startScale = trophy.scale.x;
    const duration = 0.3;
    const startTime = performance.now();
    
    const animate = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      const progress = Math.min(elapsed / duration, 1);
      
      // Scale down
      const scale = startScale * (1 - progress);
      trophy.scale.setScalar(scale);
      
      // Move up
      trophy.position.y = trophy.userData.spawnY + progress * 2;
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Remove from scene
        this.scene.remove(trophy);
        
        // Dispose
        trophy.traverse((child) => {
          if (child.isMesh) {
            child.geometry?.dispose();
            child.material?.dispose();
          }
        });
      }
    };
    
    animate();
  }
  
  /**
   * Update trophies (animation)
   * @param {number} deltaTime
   * @param {number} elapsedTime
   */
  update(deltaTime, elapsedTime) {
    for (const trophy of this.trophies) {
      if (trophy.userData.collected) continue;
      
      // Rotate
      trophy.rotation.y += TROPHY_CONFIG.rotationSpeed * deltaTime;
      
      // Bob up and down
      const bobOffset = Math.sin(elapsedTime * TROPHY_CONFIG.bobSpeed) * TROPHY_CONFIG.bobHeight;
      trophy.position.y = trophy.userData.spawnY + bobOffset;
      
      // Rotate star independently
      if (trophy.userData.star) {
        trophy.userData.star.rotation.y += deltaTime * 3;
        trophy.userData.star.rotation.x += deltaTime * 2;
      }
    }
  }
  
  /**
   * Get remaining trophy count
   * @returns {number}
   */
  getRemaining() {
    return this.totalCount - this.collectedCount;
  }
  
  /**
   * Get progress string
   * @returns {string}
   */
  getProgressString() {
    return `${this.collectedCount}/${this.totalCount}`;
  }
  
  /**
   * Get positions of uncollected trophies
   * @returns {THREE.Vector3[]}
   */
  getUncollectedPositions() {
    return this.trophies
      .filter(t => !t.userData.collected)
      .map(t => t.position.clone());
  }
  
  /**
   * Random number in range
   */
  randomRange(min, max) {
    return Math.random() * (max - min) + min;
  }
  
  /**
   * Random integer in range
   */
  randomInt(min, max) {
    return Math.floor(this.randomRange(min, max + 1));
  }
  
  /**
   * Clear all trophies
   */
  clear() {
    for (const trophy of this.trophies) {
      this.scene.remove(trophy);
      
      meshRegistry.unregister(trophy.userData.registryId);
      
      trophy.traverse((child) => {
        if (child.isMesh) {
          child.geometry?.dispose();
          child.material?.dispose();
        }
      });
    }
    
    this.trophies = [];
    this.collectedCount = 0;
    this.totalCount = 0;
  }
  
  /**
   * Reset trophies (uncollect all)
   */
  reset() {
    for (const trophy of this.trophies) {
      trophy.userData.collected = false;
      trophy.scale.setScalar(1);
      trophy.position.y = trophy.userData.spawnY;
      trophy.visible = true;
    }
    
    this.collectedCount = 0;
  }
}

// Export singleton
const trophies = new Trophies();
export default trophies;
export { Trophies, TROPHY_CONFIG };