/**
 * ComputerPlayer - AI behavior system
 * Controls non-player characters (gargoyles) with chase/patrol logic
 */

import * as THREE from 'three';

// AI States
export const AIState = {
  IDLE: 'idle',
  PATROL: 'patrol',
  CHASE: 'chase',
  HUNT: 'hunt',       // Lost sight, searching
  FROZEN: 'frozen'
};

// AI Configuration
const AI_CONFIG = {
  // Detection
  sightRange: 60,           // How far AI can see target
  hearingRange: 20,         // Range to detect target by "sound" (movement)
  lostTargetTime: 3,        // Seconds before giving up chase
  
  // Movement
  patrolSpeed: 2,
  chaseSpeed: 6,
  huntSpeed: 4,
  turnSpeed: 5,             // How fast AI rotates
  
  // Patrol
  patrolRadius: 30,         // How far from spawn to patrol
  patrolWaitTime: 2,        // Seconds to wait at patrol point
  
  // Chase
  chaseUpdateInterval: 0.2, // How often to recalculate path (seconds)
  minChaseDistance: 2,      // Stop chasing when this close
  
  // Obstacle avoidance
  avoidanceDistance: 3,
  avoidanceStrength: 5
};

class ComputerPlayer {
  constructor() {
    // AI controlled players
    this.agents = new Map();
  }
  
  /**
   * Register an AI agent
   * @param {Player} player - The player to control
   * @param {object} options - AI options
   */
  registerAgent(player, options = {}) {
    const agent = {
      player: player,
      state: AIState.IDLE,
      previousState: AIState.IDLE,
      
      // Target tracking
      target: options.target || null,
      lastKnownTargetPos: new THREE.Vector3(),
      timeSinceSeenTarget: 0,
      canSeeTarget: false,
      
      // Patrol
      spawnPosition: player.position.clone(),
      patrolTarget: new THREE.Vector3(),
      patrolWaitTimer: 0,
      
      // Movement
      moveDirection: new THREE.Vector3(),
      currentSpeed: 0,
      
      // Pathfinding (simple)
      pathUpdateTimer: 0,
      
      // Configuration
      config: { ...AI_CONFIG, ...options.config }
    };
    
    // Set initial patrol target
    this.setNewPatrolTarget(agent);
    
    this.agents.set(player.id, agent);
    console.log(`AI agent registered: ${player.name}`);
    
    return agent;
  }
  
  /**
   * Unregister an AI agent
   * @param {string} playerId
   */
  unregisterAgent(playerId) {
    this.agents.delete(playerId);
  }
  
  /**
   * Set the target for an agent to chase
   * @param {string} playerId
   * @param {Player} target
   */
  setTarget(playerId, target) {
    const agent = this.agents.get(playerId);
    if (agent) {
      agent.target = target;
    }
  }
  
  /**
   * Update all AI agents
   * @param {number} deltaTime
   * @param {THREE.Object3D[]} obstacles - For obstacle avoidance
   */
  update(deltaTime, obstacles = []) {
    for (const agent of this.agents.values()) {
      this.updateAgent(agent, deltaTime, obstacles);
    }
  }
  
  /**
   * Update a single AI agent
   * @param {object} agent
   * @param {number} deltaTime
   * @param {THREE.Object3D[]} obstacles
   */
  updateAgent(agent, deltaTime, obstacles) {
    const player = agent.player;
    
    // Don't update if player is frozen or dead
    if (player.isFrozen) {
      agent.state = AIState.FROZEN;
      this.stopMovement(agent);
      return;
    }
    
    if (!player.isAlive) {
      agent.state = AIState.IDLE;
      this.stopMovement(agent);
      return;
    }
    
    // Update target visibility
    this.updateTargetVisibility(agent);
    
    // Update AI state
    this.updateState(agent, deltaTime);
    
    // Execute behavior based on state
    switch (agent.state) {
      case AIState.IDLE:
        this.behaviorIdle(agent, deltaTime);
        break;
      case AIState.PATROL:
        this.behaviorPatrol(agent, deltaTime, obstacles);
        break;
      case AIState.CHASE:
        this.behaviorChase(agent, deltaTime, obstacles);
        break;
      case AIState.HUNT:
        this.behaviorHunt(agent, deltaTime, obstacles);
        break;
    }
    
    // Apply movement to player
    this.applyMovement(agent, deltaTime);
  }
  
  /**
   * Check if agent can see target
   * @param {object} agent
   */
  updateTargetVisibility(agent) {
    if (!agent.target || !agent.target.isAlive) {
      agent.canSeeTarget = false;
      return;
    }
    
    const player = agent.player;
    const targetPos = agent.target.position;
    const distance = player.position.distanceTo(targetPos);
    
    // Check sight range
    if (distance <= agent.config.sightRange) {
      // Simple line-of-sight (could add raycast for occlusion)
      agent.canSeeTarget = true;
      agent.lastKnownTargetPos.copy(targetPos);
      agent.timeSinceSeenTarget = 0;
    } else {
      agent.canSeeTarget = false;
    }
  }
  
  /**
   * Update AI state machine
   * @param {object} agent
   * @param {number} deltaTime
   */
  updateState(agent, deltaTime) {
    agent.previousState = agent.state;
    
    // Track time since seeing target
    if (!agent.canSeeTarget) {
      agent.timeSinceSeenTarget += deltaTime;
    }
    
    // State transitions
    if (agent.canSeeTarget) {
      // Can see target - chase!
      agent.state = AIState.CHASE;
    } else if (agent.state === AIState.CHASE) {
      // Lost sight - switch to hunt
      agent.state = AIState.HUNT;
    } else if (agent.state === AIState.HUNT) {
      // Hunting - give up after timeout
      if (agent.timeSinceSeenTarget > agent.config.lostTargetTime) {
        agent.state = AIState.PATROL;
      }
    } else if (agent.state === AIState.IDLE) {
      // Start patrolling
      agent.state = AIState.PATROL;
    }
  }
  
  /**
   * Idle behavior - do nothing
   * @param {object} agent
   * @param {number} deltaTime
   */
  behaviorIdle(agent, deltaTime) {
    this.stopMovement(agent);
    
    // Transition to patrol after a moment
    agent.patrolWaitTimer += deltaTime;
    if (agent.patrolWaitTimer > 1) {
      agent.state = AIState.PATROL;
      agent.patrolWaitTimer = 0;
    }
  }
  
  /**
   * Patrol behavior - wander around spawn area
   * @param {object} agent
   * @param {number} deltaTime
   * @param {THREE.Object3D[]} obstacles
   */
  behaviorPatrol(agent, deltaTime, obstacles) {
    const player = agent.player;
    const distToTarget = player.position.distanceTo(agent.patrolTarget);
    
    // Reached patrol target?
    if (distToTarget < 2) {
      agent.patrolWaitTimer += deltaTime;
      this.stopMovement(agent);
      
      // Wait, then pick new target
      if (agent.patrolWaitTimer > agent.config.patrolWaitTime) {
        this.setNewPatrolTarget(agent);
        agent.patrolWaitTimer = 0;
      }
      return;
    }
    
    // Move toward patrol target
    agent.moveDirection.subVectors(agent.patrolTarget, player.position).normalize();
    agent.currentSpeed = agent.config.patrolSpeed;
    
    // Obstacle avoidance
    this.applyObstacleAvoidance(agent, obstacles);
  }
  
  /**
   * Chase behavior - pursue target
   * @param {object} agent
   * @param {number} deltaTime
   * @param {THREE.Object3D[]} obstacles
   */
  behaviorChase(agent, deltaTime, obstacles) {
    const player = agent.player;
    const targetPos = agent.target.position;
    const distToTarget = player.position.distanceTo(targetPos);
    
    // Close enough to attack (handled elsewhere)
    if (distToTarget < agent.config.minChaseDistance) {
      this.stopMovement(agent);
      return;
    }
    
    // Update path periodically
    agent.pathUpdateTimer += deltaTime;
    if (agent.pathUpdateTimer >= agent.config.chaseUpdateInterval) {
      agent.pathUpdateTimer = 0;
      agent.lastKnownTargetPos.copy(targetPos);
    }
    
    // Move toward target
    agent.moveDirection.subVectors(agent.lastKnownTargetPos, player.position);
    agent.moveDirection.y = 0; // Keep horizontal
    agent.moveDirection.normalize();
    
    agent.currentSpeed = agent.config.chaseSpeed;
    
    // Obstacle avoidance
    this.applyObstacleAvoidance(agent, obstacles);
  }
  
  /**
   * Hunt behavior - search last known position
   * @param {object} agent
   * @param {number} deltaTime
   * @param {THREE.Object3D[]} obstacles
   */
  behaviorHunt(agent, deltaTime, obstacles) {
    const player = agent.player;
    const distToLastKnown = player.position.distanceTo(agent.lastKnownTargetPos);
    
    // Reached last known position?
    if (distToLastKnown < 3) {
      // Look around (could add rotation search)
      agent.patrolWaitTimer += deltaTime;
      this.stopMovement(agent);
      
      if (agent.patrolWaitTimer > 1) {
        // Give up and go back to patrol
        agent.state = AIState.PATROL;
        agent.patrolWaitTimer = 0;
      }
      return;
    }
    
    // Move toward last known position
    agent.moveDirection.subVectors(agent.lastKnownTargetPos, player.position);
    agent.moveDirection.y = 0;
    agent.moveDirection.normalize();
    
    agent.currentSpeed = agent.config.huntSpeed;
    
    // Obstacle avoidance
    this.applyObstacleAvoidance(agent, obstacles);
  }
  
  /**
   * Set a new random patrol target
   * @param {object} agent
   */
  setNewPatrolTarget(agent) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * agent.config.patrolRadius;
    
    agent.patrolTarget.set(
      agent.spawnPosition.x + Math.cos(angle) * distance,
      agent.spawnPosition.y,
      agent.spawnPosition.z + Math.sin(angle) * distance
    );
  }
  
  /**
   * Simple obstacle avoidance using raycasts
   * @param {object} agent
   * @param {THREE.Object3D[]} obstacles
   */
  applyObstacleAvoidance(agent, obstacles) {
    if (obstacles.length === 0) return;
    
    const player = agent.player;
    const raycaster = new THREE.Raycaster();
    
    // Cast rays in movement direction and to sides
    const directions = [
      agent.moveDirection.clone(),
      agent.moveDirection.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4),
      agent.moveDirection.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 4)
    ];
    
    const avoidance = new THREE.Vector3();
    const origin = player.position.clone();
    origin.y += player.height / 2;
    
    for (const dir of directions) {
      raycaster.set(origin, dir);
      raycaster.far = agent.config.avoidanceDistance;
      
      const intersects = raycaster.intersectObjects(obstacles, true);
      
      if (intersects.length > 0) {
        const hit = intersects[0];
        const avoidDir = new THREE.Vector3()
          .subVectors(origin, hit.point)
          .normalize();
        
        const strength = 1 - (hit.distance / agent.config.avoidanceDistance);
        avoidance.addScaledVector(avoidDir, strength * agent.config.avoidanceStrength);
      }
    }
    
    // Apply avoidance to movement direction
    if (avoidance.lengthSq() > 0) {
      agent.moveDirection.add(avoidance);
      agent.moveDirection.y = 0;
      agent.moveDirection.normalize();
    }
  }
  
  /**
   * Stop agent movement
   * @param {object} agent
   */
  stopMovement(agent) {
    agent.currentSpeed = 0;
    agent.moveDirection.set(0, 0, 0);
    
    // Stop player input
    agent.player.input.forward = 0;
    agent.player.input.right = 0;
    agent.player.input.sprint = false;
  }
  
  /**
   * Apply calculated movement to player
   * @param {object} agent
   * @param {number} deltaTime
   */
  applyMovement(agent, deltaTime) {
    const player = agent.player;
    
    if (agent.currentSpeed <= 0 || agent.moveDirection.lengthSq() === 0) {
      player.input.forward = 0;
      player.input.right = 0;
      return;
    }
    
    // Convert world direction to player-relative input
    // We'll use forward = 1 and let the physics system handle it
    // First, rotate player to face movement direction
    const targetAngle = Math.atan2(agent.moveDirection.x, agent.moveDirection.z);
    player.targetRotation = targetAngle;
    
    // Set forward input based on speed ratio
    const speedRatio = agent.currentSpeed / player.speed;
    player.input.forward = Math.min(1, speedRatio);
    player.input.right = 0;
    
    // Sprint if chasing and speed is high
    player.input.sprint = agent.state === AIState.CHASE && agent.currentSpeed > player.speed;
  }
  
  /**
   * Get debug info for an agent
   * @param {string} playerId
   * @returns {object}
   */
  getDebugInfo(playerId) {
    const agent = this.agents.get(playerId);
    if (!agent) return null;
    
    return {
      state: agent.state,
      canSeeTarget: agent.canSeeTarget,
      timeSinceSeenTarget: agent.timeSinceSeenTarget.toFixed(1),
      speed: agent.currentSpeed.toFixed(1)
    };
  }
  
  /**
   * Clear all agents
   */
  clear() {
    this.agents.clear();
  }
}

// Export singleton
const computerPlayer = new ComputerPlayer();
export default computerPlayer;
export { ComputerPlayer };