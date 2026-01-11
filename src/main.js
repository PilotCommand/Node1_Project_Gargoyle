/**
 * Gargoyle - Main Entry Point
 * Initializes Three.js, Rapier physics, and runs the game loop
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import chronograph from './utilities/chronograph.js';
import controls from './utilities/controls.js';
import gameCamera, { CameraMode } from './utilities/camera.js';
import menu, { MenuState } from './utilities/menu.js';
import hud from './utilities/hud.js';
import meshRegistry, { MeshCategory } from './registries/meshregistry.js';
import playerRegistry from './registries/playerregistry.js';
import physicsMeshers from './physics/physicsmeshers.js';
import physicsMovements from './physics/physicsmovements.js';
import gameMap from './world/map.js';
import trophies from './world/trophies.js';
import { PlayerType } from './players/player.js';
import TargetPlayer from './players/targetplayer.js';
import GargoylePlayer from './players/gargoyleplayer.js';
import computerPlayer from './players/computerplayer.js';

// ============================================
// GAME STATES
// ============================================
const GameState = {
  LOADING: 'loading',
  MENU: 'menu',
  PLAYING: 'playing',
  PAUSED: 'paused',
  WON: 'won',
  LOST: 'lost'
};

// ============================================
// GLOBAL GAME STATE
// ============================================
const GAME = {
  scene: null,
  camera: null,
  renderer: null,
  physics: {
    world: null,
    RAPIER: null,
    initialized: false
  },
  isRunning: false,
  state: GameState.LOADING,
  startTime: 0,
  
  // Obstacle meshes for line-of-sight checks
  obstacles: [],
  
  // Dev mode (skip menu)
  devMode: false
};

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
  colors: {
    background: 0x1a1a1a,
    fog: 0x2a2a2a,
    ambient: 0x404040,
    directional: 0xffffff
  },
  fog: {
    near: 20,
    far: 200
  },
  shadows: {
    enabled: true,
    mapSize: 2048,
    cameraSize: 100
  },
  physics: {
    gravity: { x: 0, y: 0, z: 0 }  // Disabled - custom gravity in physicsmovements.js
  },
  game: {
    numGargoyles: 3,
    numTrophies: 7
  }
};

// ============================================
// GAME STATE FUNCTIONS
// ============================================

function startGame() {
  GAME.state = GameState.PLAYING;
  GAME.startTime = chronograph.elapsedTime;
  
  // Reset game
  resetGame();
  
  // Show HUD
  hud.show();
  
  // Request pointer lock
  GAME.renderer.domElement.requestPointerLock();
  
  console.log('Game started!');
}

function pauseGame() {
  if (GAME.state !== GameState.PLAYING) return;
  
  GAME.state = GameState.PAUSED;
  chronograph.pause();
  
  // Release pointer lock
  document.exitPointerLock();
  
  // Show pause menu
  menu.show(MenuState.PAUSED);
}

function resumeGame() {
  if (GAME.state !== GameState.PAUSED) return;
  
  GAME.state = GameState.PLAYING;
  chronograph.resume();
  
  // Request pointer lock
  GAME.renderer.domElement.requestPointerLock();
}

function resetGame() {
  // Reset player
  const localPlayer = playerRegistry.getLocalPlayer();
  if (localPlayer) {
    localPlayer.respawn(new THREE.Vector3(0, 1, 0));
    localPlayer.trophiesCollected = 0;
  }
  
  // Reset gargoyles
  const gargoyles = playerRegistry.getGargoyles();
  const spawnPoints = gameMap.mapData.spawnPoints.filter(s => s.type === 'gargoyle');
  gargoyles.forEach((gargoyle, i) => {
    const spawn = spawnPoints[i % spawnPoints.length];
    gargoyle.respawn(new THREE.Vector3(spawn.x, spawn.y, spawn.z));
    gargoyle.isFrozen = false;
    gargoyle.isBeingObserved = false;
    gargoyle.applyFrozenVisual(false);
    
    // Reset AI agent
    const agent = computerPlayer.agents.get(gargoyle.id);
    if (agent) {
      agent.spawnPosition.copy(gargoyle.position);
      agent.state = 'patrol';
    }
  });
  
  // Reset trophies
  trophies.reset();
  
  // Update HUD
  hud.updateTrophies(0, trophies.totalCount);
}

function onWin() {
  GAME.state = GameState.WON;
  
  // Calculate time
  const playTime = chronograph.elapsedTime - GAME.startTime;
  const minutes = Math.floor(playTime / 60);
  const seconds = Math.floor(playTime % 60);
  const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  
  // Release pointer lock
  document.exitPointerLock();
  
  // Show win screen
  menu.showWin({ time: timeString });
  
  console.log(`GAME WON! Time: ${timeString}`);
}

function onLose() {
  GAME.state = GameState.LOST;
  
  // Release pointer lock
  document.exitPointerLock();
  
  // Flash damage
  hud.flashDamage();
  
  // Show game over screen
  setTimeout(() => {
    menu.showGameOver();
  }, 500);
  
  console.log('GAME LOST!');
}

function restartGame() {
  GAME.state = GameState.PLAYING;
  GAME.startTime = chronograph.elapsedTime;
  
  resetGame();
  
  // Ensure not paused
  if (chronograph.paused) {
    chronograph.resume();
  }
  
  // Show HUD
  hud.show();
  
  // Request pointer lock
  GAME.renderer.domElement.requestPointerLock();
  
  console.log('Game restarted');
}

function goToMainMenu() {
  GAME.state = GameState.MENU;
  
  // Release pointer lock
  document.exitPointerLock();
  
  // Show main menu
  menu.show(MenuState.MAIN);
}

// ============================================
// INITIALIZATION
// ============================================

function initThreeJS() {
  GAME.scene = new THREE.Scene();
  GAME.scene.background = new THREE.Color(CONFIG.colors.background);
  GAME.scene.fog = new THREE.Fog(CONFIG.colors.fog, CONFIG.fog.near, CONFIG.fog.far);
  
  GAME.camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  GAME.camera.position.set(0, 10, 20);
  GAME.camera.lookAt(0, 0, 0);
  
  GAME.renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    powerPreference: 'high-performance'
  });
  GAME.renderer.setSize(window.innerWidth, window.innerHeight);
  GAME.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  
  if (CONFIG.shadows.enabled) {
    GAME.renderer.shadowMap.enabled = true;
    GAME.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  
  const container = document.getElementById('game-container');
  container.appendChild(GAME.renderer.domElement);
  
  window.addEventListener('resize', onWindowResize);
  
  console.log('Three.js initialized');
}

function initLighting() {
  const ambientLight = new THREE.AmbientLight(CONFIG.colors.ambient, 0.4);
  GAME.scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(CONFIG.colors.directional, 0.8);
  directionalLight.position.set(50, 100, 50);
  directionalLight.target.position.set(0, 0, 0);
  
  if (CONFIG.shadows.enabled) {
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = CONFIG.shadows.mapSize;
    directionalLight.shadow.mapSize.height = CONFIG.shadows.mapSize;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -CONFIG.shadows.cameraSize;
    directionalLight.shadow.camera.right = CONFIG.shadows.cameraSize;
    directionalLight.shadow.camera.top = CONFIG.shadows.cameraSize;
    directionalLight.shadow.camera.bottom = -CONFIG.shadows.cameraSize;
    directionalLight.shadow.bias = -0.0001;
  }
  
  GAME.scene.add(directionalLight);
  GAME.scene.add(directionalLight.target);
  
  const hemisphereLight = new THREE.HemisphereLight(0x606060, 0x202020, 0.3);
  GAME.scene.add(hemisphereLight);
  
  console.log('Lighting initialized');
}

async function initPhysics() {
  await RAPIER.init();
  
  GAME.physics.RAPIER = RAPIER;
  GAME.physics.world = new RAPIER.World(CONFIG.physics.gravity);
  GAME.physics.initialized = true;
  
  physicsMeshers.setWorld(GAME.physics.world);
  physicsMeshers.setScene(GAME.scene);
  physicsMovements.init(GAME.physics.world, RAPIER);
  
  console.log('Rapier physics initialized');
}

function initControls() {
  controls.init(GAME.renderer.domElement);
  
  controls.onAction = (action) => {
    switch (action) {
      case 'toggleDebug':
        if (GAME.state === GameState.PLAYING) {
          gameMap.toggleDebug();
          physicsMeshers.setDebugVisible(!physicsMeshers.debugVisible);
          const showDebug = !hud.config.showDebug;
          hud.setConfig('showDebug', showDebug);
        }
        break;
      case 'togglePause':
        if (GAME.state === GameState.PLAYING) {
          pauseGame();
        }
        break;
      case 'freeCam':
        if (GAME.state === GameState.PLAYING) {
          gameCamera.toggleFreeCamera();
        }
        break;
      case 'resetPosition':
        if (GAME.state === GameState.PLAYING) {
          const localPlayer = playerRegistry.getLocalPlayer();
          if (localPlayer) {
            physicsMovements.teleport(localPlayer, new THREE.Vector3(0, 1, 0));
          }
        }
        break;
    }
  };
  
  GAME.renderer.domElement.addEventListener('wheel', (e) => {
    if (GAME.state === GameState.PLAYING) {
      // Scroll up = zoom in (negative deltaY), scroll down = zoom out (positive deltaY)
      gameCamera.zoom(-e.deltaY * 0.01);
    }
  });
  
  console.log('Controls initialized');
}

function initMenu() {
  menu.init({ devMode: GAME.devMode });
  
  // Menu callbacks
  menu.onPlay = startGame;
  menu.onResume = resumeGame;
  menu.onRestart = restartGame;
  menu.onPause = pauseGame;
  
  menu.onSettingsChange = (key, value) => {
    switch (key) {
      case 'mouseSensitivity':
        controls.setSensitivity(value);
        break;
      case 'showFPS':
        hud.setConfig('showFPS', value);
        break;
      case 'showDebug':
        hud.setConfig('showDebug', value);
        break;
    }
  };
  
  console.log('Menu initialized');
}

function initHUD() {
  const settings = menu.getSettings();
  
  hud.init({
    showFPS: settings.showFPS,
    showDebug: settings.showDebug
  });
  
  // Initially hidden until game starts
  if (!GAME.devMode) {
    hud.hide();
  }
  
  console.log('HUD initialized');
}

function initCamera() {
  gameCamera.init(GAME.camera);
  gameCamera.setMode(CameraMode.ORBIT);
  console.log('Camera system initialized');
}

function initWorld() {
  gameMap.init(GAME.scene);
  
  trophies.init(GAME.scene);
  
  const bounds = gameMap.getBounds();
  trophies.spawnTrophies(bounds, gameMap.mapData.occupiedCells, CONFIG.game.numTrophies);
  
  trophies.onCollect = (trophy, collected, total) => {
    hud.updateTrophies(collected, total);
    
    const localPlayer = playerRegistry.getLocalPlayer();
    if (localPlayer) {
      localPlayer.trophiesCollected = collected;
    }
  };
  
  trophies.onAllCollected = () => {
    onWin();
  };
  
  collectObstacles();
  
  console.log('World initialized');
  meshRegistry.debug();
}

function collectObstacles() {
  GAME.obstacles = [];
  
  const buildingEntries = meshRegistry.getByCategory(MeshCategory.BUILDING);
  for (const entry of buildingEntries) {
    GAME.obstacles.push(entry.mesh);
  }
  
  console.log(`Collected ${GAME.obstacles.length} obstacles for FOV checks`);
}

async function createLocalPlayer() {
  const player = new TargetPlayer({
    name: 'Player',
    modelPath: '/GladpolyE.glb',
    height: 1.8,
    radius: 0.4,
    speed: 4,
    jumpForce: 7,
    fovAngle: 90,
    fovDistance: 50
  });
  
  await player.init(GAME.scene, GAME.physics.world, GAME.physics.RAPIER);
  
  const spawn = gameMap.getSpawnPoint('target');
  player.setPosition(spawn.x, spawn.y, spawn.z);
  
  player.setCamera(GAME.camera);
  player.trophiesToWin = trophies.totalCount;
  
  player.onWin = onWin;
  player.onCaught = onLose;
  
  playerRegistry.register(player, { isLocal: true });
  physicsMovements.registerPlayer(player);
  
  gameCamera.setTarget(player.group);
  
  console.log('Target player created');
  
  return player;
}

async function createGargoyles() {
  const gargoyles = [];
  const targetPlayer = playerRegistry.getTargetPlayer();
  
  for (let i = 0; i < CONFIG.game.numGargoyles; i++) {
    const gargoyle = new GargoylePlayer({
      name: `Gargoyle_${i + 1}`,
      modelPath: '/GladpolyE.glb',
      height: 2.0,
      radius: 0.5,
      speed: 5,
      jumpForce: 10
    });
    
    await gargoyle.init(GAME.scene, GAME.physics.world, GAME.physics.RAPIER);
    
    const spawnPoints = gameMap.mapData.spawnPoints.filter(s => s.type === 'gargoyle');
    const spawn = spawnPoints[i % spawnPoints.length] || { x: 20 + i * 10, y: 1, z: 20 };
    gargoyle.setPosition(spawn.x, spawn.y, spawn.z);
    
    gargoyle.targetPlayer = targetPlayer;
    
    playerRegistry.register(gargoyle);
    physicsMovements.registerPlayer(gargoyle);
    
    computerPlayer.registerAgent(gargoyle, {
      target: targetPlayer,
      config: {
        sightRange: 80,
        patrolRadius: 40,
        chaseSpeed: 7
      }
    });
    
    gargoyles.push(gargoyle);
  }
  
  console.log(`Created ${gargoyles.length} AI-controlled gargoyles`);
  playerRegistry.debug();
  
  return gargoyles;
}

// ============================================
// GAME LOOP - Simple like Swimming.js
// ============================================

function gameLoop() {
  if (!GAME.isRunning) return;
  
  requestAnimationFrame(gameLoop);
  
  chronograph.update();
  const dt = chronograph.deltaTime;
  
  // Simple: movement + physics once per frame (like Swimming.js)
  if (GAME.state === GameState.PLAYING && GAME.physics.initialized) {
    updateLocalPlayerMovement(dt);
    updateAIMovement(dt);
    GAME.physics.world.step();
  }
  
  update(dt);
  render();
}

/**
 * Update local player movement
 */
function updateLocalPlayerMovement(dt) {
  const localPlayer = playerRegistry.getLocalPlayer();
  const isFreeCam = gameCamera.isFreeCam();
  
  if (!localPlayer || isFreeCam || !controls.mouse.locked) return;
  
  // Get movement direction from camera + input
  const moveDirection = new THREE.Vector3();
  if (controls.movement.forward !== 0 || controls.movement.right !== 0) {
    const camForward = gameCamera.getForwardDirection();
    const camRight = gameCamera.getRightDirection();
    moveDirection.addScaledVector(camForward, controls.movement.forward);
    moveDirection.addScaledVector(camRight, controls.movement.right);
    moveDirection.normalize();
  }
  
  // Update movement
  physicsMovements.updatePlayer(
    localPlayer,
    moveDirection,
    controls.movement.jump,
    controls.movement.sprint,
    dt
  );
}

/**
 * Update AI gargoyles
 */
function updateAIMovement(dt) {
  // Let AI decide what to do
  computerPlayer.update(dt, GAME.obstacles);
  
  // Apply movement to each gargoyle
  const gargoyles = playerRegistry.getGargoyles();
  for (const gargoyle of gargoyles) {
    if (gargoyle.isFrozen || !gargoyle.isAlive) continue;
    
    // AI movement direction (forward in the direction they're facing)
    const moveDirection = new THREE.Vector3();
    if (gargoyle.input.forward !== 0) {
      moveDirection.set(
        Math.sin(gargoyle.targetRotation) * gargoyle.input.forward,
        0,
        Math.cos(gargoyle.targetRotation) * gargoyle.input.forward
      ).normalize();
    }
    
    physicsMovements.updatePlayer(
      gargoyle,
      moveDirection,
      gargoyle.input.jump,
      gargoyle.input.sprint,
      dt
    );
  }
}

function update(dt) {
  // Update HUD
  hud.update(dt);
  
  // Menu state - just update camera
  if (GAME.state !== GameState.PLAYING) {
    const mouseDelta = controls.getMouseDelta();
    gameCamera.update(dt, { forward: 0, right: 0, sprint: false });
    return;
  }
  
  // FIRST: Sync all player visuals from physics (before camera!)
  playerRegistry.updateAll(dt);
  
  // THEN: Camera follows the updated player position
  const mouseDelta = controls.getMouseDelta();
  gameCamera.handleMouseInput(mouseDelta.x, mouseDelta.y);
  gameCamera.update(dt, controls.movement);
  
  const isFreeCam = gameCamera.isFreeCam();
  hud.setCameraMode(isFreeCam);
  
  const localPlayer = playerRegistry.getLocalPlayer();
  
  // Gameplay updates (only when not in free cam)
  if (localPlayer && controls.mouse.locked && !isFreeCam) {
    // Check trophy collection
    trophies.checkCollection(localPlayer.position);
    
    // Update FOV detection
    const gargoyles = playerRegistry.getGargoyles();
    localPlayer.updateVisibleGargoyles(gargoyles, GAME.obstacles);
    
    // Track nearest unfrozen gargoyle for warning
    let nearestThreatDist = Infinity;
    
    // Update gargoyle observed states and check for attack
    for (const gargoyle of gargoyles) {
      const isVisible = localPlayer.visibleGargoyles.has(gargoyle.id);
      gargoyle.setObserved(isVisible);
      
      // Check if gargoyle catches player
      if (!gargoyle.isFrozen && gargoyle.isAlive) {
        const distance = gargoyle.position.distanceTo(localPlayer.position);
        
        if (distance < nearestThreatDist) {
          nearestThreatDist = distance;
        }
        
        if (distance < gargoyle.attackRange) {
          gargoyle.attemptAttack();
        }
      }
    }
    
    // Update warning indicator
    hud.setWarning(nearestThreatDist < 15);
    
    // Update crosshair based on what we're looking at
    if (localPlayer.visibleGargoyles.size > 0) {
      hud.setCrosshairStyle('target');
    } else {
      hud.setCrosshairStyle('default');
    }
  }
  
  // Update trophies animation
  trophies.update(dt, chronograph.elapsedTime);
  
  // Update debug info
  if (hud.config.showDebug) {
    const allGargoyles = playerRegistry.getGargoyles();
    const movementInfo = localPlayer ? physicsMovements.getDebugInfo(localPlayer.id) : null;
    
    // Get physics body position for comparison
    let physicsY = 'N/A';
    let feetY = 'N/A';
    let distFromGround = 'N/A';
    if (localPlayer?.physicsBody) {
      const trans = localPlayer.physicsBody.translation();
      physicsY = trans.y.toFixed(3);
      // Feet position = physics center - height/2
      const feet = trans.y - localPlayer.height / 2;
      feetY = feet.toFixed(3);
      // Ground is at Y=0, so distance = feetY - 0
      distFromGround = feet.toFixed(3);
    }
    
    const debugInfo = {
      'Pos (feet)': `${localPlayer?.position.x.toFixed(2)}, ${localPlayer?.position.y.toFixed(3)}, ${localPlayer?.position.z.toFixed(2)}`,
      'Physics Y': physicsY,
      'Feet Y': feetY,
      'Dist from ground': distFromGround,
      'Ground Gap': movementInfo?.groundGap || 'N/A',
      'Ground Hit': movementInfo?.groundHitDist || 'N/A',
      'Velocity': movementInfo?.velocity || 'N/A',
      'Speed': movementInfo?.speed || 'N/A',
      'Grounded': movementInfo?.grounded ?? localPlayer?.isGrounded,
      'State': localPlayer?.state,
      'Height': localPlayer?.height?.toFixed(2) || 'N/A',
      'Radius': localPlayer?.radius?.toFixed(2) || 'N/A',
      'Gargoyles Frozen': allGargoyles.filter(g => g.isFrozen).length + '/' + allGargoyles.length
    };
    
    for (const gargoyle of allGargoyles) {
      const aiInfo = computerPlayer.getDebugInfo(gargoyle.id);
      if (aiInfo) {
        debugInfo[gargoyle.name] = `${aiInfo.state}${gargoyle.isFrozen ? ' [FROZEN]' : ''}`;
      }
    }
    
    hud.updateDebug(debugInfo);
  }
}

function render() {
  GAME.renderer.render(GAME.scene, GAME.camera);
}

// ============================================
// EVENT HANDLERS
// ============================================

function onWindowResize() {
  GAME.camera.aspect = window.innerWidth / window.innerHeight;
  GAME.camera.updateProjectionMatrix();
  GAME.renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================
// START GAME
// ============================================

async function init() {
  console.log('=========================================');
  console.log('        GARGOYLE - Loading...           ');
  console.log('=========================================');
  
  // Check for dev mode (skip menu)
  const urlParams = new URLSearchParams(window.location.search);
  GAME.devMode = urlParams.has('dev');
  
  initThreeJS();
  initLighting();
  await initPhysics();
  initControls();
  initCamera();
  initWorld();
  
  await createLocalPlayer();
  await createGargoyles();
  
  // Initialize UI systems
  initMenu();
  initHUD();
  
  // Initial HUD update
  hud.updateTrophies(0, trophies.totalCount);
  
  // Set initial state
  if (GAME.devMode) {
    GAME.state = GameState.PLAYING;
    hud.show();
    console.log('DEV MODE: Skipping menu');
  } else {
    GAME.state = GameState.MENU;
  }
  
  GAME.isRunning = true;
  gameLoop();
  
  console.log('=========================================');
  console.log('        GARGOYLE - Ready!               ');
  console.log('=========================================');
  console.log('TIP: Add ?dev to URL to skip menu');
}

init().catch(console.error);

// Export for debugging
window.GAME = GAME;
window.chronograph = chronograph;
window.controls = controls;
window.gameCamera = gameCamera;
window.menu = menu;
window.hud = hud;
window.meshRegistry = meshRegistry;
window.playerRegistry = playerRegistry;
window.physicsMovements = physicsMovements;
window.computerPlayer = computerPlayer;
window.gameMap = gameMap;
window.trophies = trophies;
window.restartGame = restartGame;