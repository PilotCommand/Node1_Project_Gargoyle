/**
 * PlayerRegistry - Central registry for all players
 * Tracks local player, remote players, and AI players
 */

import { PlayerType } from '../players/player.js';

class PlayerRegistry {
  constructor() {
    // All players by ID
    this.players = new Map();
    
    // Quick references
    this.localPlayer = null;      // The player controlled by this client
    this.targetPlayer = null;     // The target player (human being chased)
    
    // Indexed by type
    this.byType = {
      [PlayerType.TARGET]: new Set(),
      [PlayerType.GARGOYLE]: new Set(),
      [PlayerType.COMPUTER]: new Set()
    };
    
    // Auto-incrementing ID
    this.nextId = 1;
  }
  
  /**
   * Register a player
   * @param {Player} player
   * @param {object} options
   * @returns {string} Player ID
   */
  register(player, options = {}) {
    // Assign ID if not set
    if (!player.id || this.players.has(player.id)) {
      player.id = `player_${this.nextId++}`;
    }
    
    // Store player
    this.players.set(player.id, player);
    
    // Add to type index
    if (this.byType[player.type]) {
      this.byType[player.type].add(player.id);
    }
    
    // Set as local player if specified
    if (options.isLocal) {
      this.localPlayer = player;
    }
    
    // Track target player
    if (player.type === PlayerType.TARGET) {
      this.targetPlayer = player;
    }
    
    console.log(`Registered player: ${player.name} (${player.id}) as ${player.type}`);
    
    return player.id;
  }
  
  /**
   * Unregister a player
   * @param {string} playerId
   */
  unregister(playerId) {
    const player = this.players.get(playerId);
    if (!player) return;
    
    // Remove from type index
    if (this.byType[player.type]) {
      this.byType[player.type].delete(playerId);
    }
    
    // Clear references
    if (this.localPlayer === player) {
      this.localPlayer = null;
    }
    if (this.targetPlayer === player) {
      this.targetPlayer = null;
    }
    
    // Remove from main registry
    this.players.delete(playerId);
    
    console.log(`Unregistered player: ${playerId}`);
  }
  
  /**
   * Get a player by ID
   * @param {string} playerId
   * @returns {Player|null}
   */
  get(playerId) {
    return this.players.get(playerId) || null;
  }
  
  /**
   * Get all players
   * @returns {Player[]}
   */
  getAll() {
    return Array.from(this.players.values());
  }
  
  /**
   * Get players by type
   * @param {string} type - PlayerType
   * @returns {Player[]}
   */
  getByType(type) {
    const ids = this.byType[type];
    if (!ids) return [];
    
    const players = [];
    for (const id of ids) {
      const player = this.players.get(id);
      if (player) players.push(player);
    }
    return players;
  }
  
  /**
   * Get all gargoyle players
   * @returns {Player[]}
   */
  getGargoyles() {
    return this.getByType(PlayerType.GARGOYLE);
  }
  
  /**
   * Get all computer-controlled players
   * @returns {Player[]}
   */
  getComputerPlayers() {
    return this.getByType(PlayerType.COMPUTER);
  }
  
  /**
   * Get the local player
   * @returns {Player|null}
   */
  getLocalPlayer() {
    return this.localPlayer;
  }
  
  /**
   * Get the target player
   * @returns {Player|null}
   */
  getTargetPlayer() {
    return this.targetPlayer;
  }
  
  /**
   * Get all alive players
   * @returns {Player[]}
   */
  getAlivePlayers() {
    return this.getAll().filter(p => p.isAlive);
  }
  
  /**
   * Get count of all players
   * @returns {number}
   */
  get count() {
    return this.players.size;
  }
  
  /**
   * Get count by type
   * @param {string} type
   * @returns {number}
   */
  countByType(type) {
    return this.byType[type]?.size || 0;
  }
  
  /**
   * Find nearest player to a position
   * @param {THREE.Vector3} position
   * @param {object} options - { excludeId, type, aliveOnly }
   * @returns {Player|null}
   */
  findNearest(position, options = {}) {
    let nearest = null;
    let nearestDistance = Infinity;
    
    for (const player of this.players.values()) {
      // Skip excluded player
      if (options.excludeId && player.id === options.excludeId) continue;
      
      // Filter by type
      if (options.type && player.type !== options.type) continue;
      
      // Filter by alive
      if (options.aliveOnly && !player.isAlive) continue;
      
      const distance = position.distanceTo(player.position);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = player;
      }
    }
    
    return nearest;
  }
  
  /**
   * Find all players within radius
   * @param {THREE.Vector3} position
   * @param {number} radius
   * @param {object} options - { excludeId, type, aliveOnly }
   * @returns {Player[]}
   */
  findInRadius(position, radius, options = {}) {
    const results = [];
    
    for (const player of this.players.values()) {
      if (options.excludeId && player.id === options.excludeId) continue;
      if (options.type && player.type !== options.type) continue;
      if (options.aliveOnly && !player.isAlive) continue;
      
      const distance = position.distanceTo(player.position);
      if (distance <= radius) {
        results.push(player);
      }
    }
    
    return results;
  }
  
  /**
   * Update all players
   * @param {number} deltaTime
   */
  updateAll(deltaTime) {
    for (const player of this.players.values()) {
      player.update(deltaTime);
    }
  }
  
  /**
   * Clear all players
   */
  clear() {
    // Dispose all players
    for (const player of this.players.values()) {
      player.dispose();
    }
    
    this.players.clear();
    this.localPlayer = null;
    this.targetPlayer = null;
    
    for (const type in this.byType) {
      this.byType[type].clear();
    }
    
    this.nextId = 1;
  }
  
  /**
   * Debug: print registry contents
   */
  debug() {
    console.log('=== Player Registry ===');
    console.log(`Total players: ${this.count}`);
    console.log(`  Targets: ${this.countByType(PlayerType.TARGET)}`);
    console.log(`  Gargoyles: ${this.countByType(PlayerType.GARGOYLE)}`);
    console.log(`  Computer: ${this.countByType(PlayerType.COMPUTER)}`);
    console.log(`Local player: ${this.localPlayer?.name || 'none'}`);
    console.log(`Target player: ${this.targetPlayer?.name || 'none'}`);
  }
}

// Export singleton
const playerRegistry = new PlayerRegistry();
export default playerRegistry;
export { PlayerRegistry };