/**
 * HUD - Heads-Up Display system
 * Displays game information during gameplay
 */

class HUD {
  constructor() {
    this.container = null;
    this.elements = {};
    this.isVisible = true;
    
    // Configuration
    this.config = {
      showFPS: false,
      showDebug: false,
      showMinimap: false,
      warningFlashSpeed: 500 // ms
    };
    
    // Warning state
    this.warningActive = false;
    this.warningFlashTimer = 0;
  }
  
  /**
   * Initialize HUD
   * @param {object} options
   */
  init(options = {}) {
    this.config = { ...this.config, ...options };
    
    this.createContainer();
    this.createTrophyCounter();
    this.createWarningIndicator();
    this.createCrosshair();
    this.createStaminaBar();
    this.createFPSCounter();
    this.createDebugPanel();
    this.createInstructions();
    this.createDamageOverlay();
    
    console.log('HUD initialized');
  }
  
  /**
   * Create HUD container
   */
  createContainer() {
    this.container = document.createElement('div');
    this.container.id = 'game-hud';
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      font-family: 'Arial', sans-serif;
      z-index: 100;
    `;
    document.body.appendChild(this.container);
  }
  
  /**
   * Create trophy counter
   */
  createTrophyCounter() {
    const counter = document.createElement('div');
    counter.id = 'hud-trophies';
    counter.style.cssText = `
      position: absolute;
      top: 20px;
      left: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
    `;
    
    // Trophy icon
    const icon = document.createElement('div');
    icon.textContent = '🏆';
    icon.style.cssText = `
      font-size: 32px;
      filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.8));
    `;
    counter.appendChild(icon);
    
    // Count text
    const count = document.createElement('div');
    count.id = 'trophy-count';
    count.style.cssText = `
      font-size: 28px;
      font-weight: bold;
      color: #ffdd44;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
    `;
    count.textContent = '0/0';
    counter.appendChild(count);
    this.elements.trophyCount = count;
    
    this.container.appendChild(counter);
  }
  
  /**
   * Create warning indicator
   */
  createWarningIndicator() {
    const warning = document.createElement('div');
    warning.id = 'hud-warning';
    warning.style.cssText = `
      position: absolute;
      top: 70px;
      left: 20px;
      display: flex;
      align-items: center;
      gap: 8px;
      opacity: 0;
      transition: opacity 0.2s ease;
    `;
    
    // Warning icon
    const icon = document.createElement('div');
    icon.textContent = '⚠️';
    icon.style.cssText = `
      font-size: 24px;
    `;
    warning.appendChild(icon);
    
    // Warning text
    const text = document.createElement('div');
    text.style.cssText = `
      font-size: 18px;
      font-weight: bold;
      color: #ff4444;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
    `;
    text.textContent = 'GARGOYLE NEARBY!';
    warning.appendChild(text);
    
    this.elements.warning = warning;
    this.container.appendChild(warning);
  }
  
  /**
   * Create crosshair
   */
  createCrosshair() {
    const crosshair = document.createElement('div');
    crosshair.id = 'hud-crosshair';
    crosshair.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 24px;
      height: 24px;
      pointer-events: none;
    `;
    
    // Crosshair design
    crosshair.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="2"/>
        <circle cx="12" cy="12" r="2" fill="rgba(255,255,255,0.8)"/>
      </svg>
    `;
    
    this.elements.crosshair = crosshair;
    this.container.appendChild(crosshair);
  }
  
  /**
   * Create stamina bar (for gargoyle players)
   */
  createStaminaBar() {
    const container = document.createElement('div');
    container.id = 'hud-stamina';
    container.style.cssText = `
      position: absolute;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      width: 200px;
      height: 8px;
      background: rgba(0,0,0,0.5);
      border-radius: 4px;
      overflow: hidden;
      display: none;
    `;
    
    const bar = document.createElement('div');
    bar.id = 'stamina-bar';
    bar.style.cssText = `
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, #44aaff, #88ddff);
      border-radius: 4px;
      transition: width 0.1s ease;
    `;
    container.appendChild(bar);
    
    this.elements.staminaContainer = container;
    this.elements.staminaBar = bar;
    this.container.appendChild(container);
  }
  
  /**
   * Create FPS counter
   */
  createFPSCounter() {
    const fps = document.createElement('div');
    fps.id = 'hud-fps';
    fps.style.cssText = `
      position: absolute;
      top: 20px;
      right: 20px;
      font-size: 14px;
      font-family: monospace;
      color: rgba(255,255,255,0.6);
      text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
      display: ${this.config.showFPS ? 'block' : 'none'};
    `;
    fps.textContent = 'FPS: --';
    
    this.elements.fps = fps;
    this.container.appendChild(fps);
  }
  
  /**
   * Create debug panel
   */
  createDebugPanel() {
    const debug = document.createElement('div');
    debug.id = 'hud-debug';
    debug.style.cssText = `
      position: absolute;
      top: 50px;
      right: 20px;
      font-size: 12px;
      font-family: monospace;
      color: rgba(255,255,255,0.6);
      text-align: right;
      white-space: pre;
      text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
      display: ${this.config.showDebug ? 'block' : 'none'};
    `;
    
    this.elements.debug = debug;
    this.container.appendChild(debug);
  }
  
  /**
   * Create instructions
   */
  createInstructions() {
    const instructions = document.createElement('div');
    instructions.id = 'hud-instructions';
    instructions.style.cssText = `
      position: absolute;
      bottom: 20px;
      left: 20px;
      font-size: 14px;
      color: rgba(255,255,255,0.5);
      text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
    `;
    instructions.textContent = 'WASD: Move | Mouse: Look | Space: Jump | ESC: Pause';
    
    this.elements.instructions = instructions;
    this.container.appendChild(instructions);
  }
  
  /**
   * Create damage overlay
   */
  createDamageOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'hud-damage';
    overlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: radial-gradient(ellipse at center, transparent 0%, rgba(255,0,0,0.3) 100%);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s ease;
    `;
    
    this.elements.damageOverlay = overlay;
    this.container.appendChild(overlay);
  }
  
  /**
   * Update trophy display
   * @param {number} collected
   * @param {number} total
   */
  updateTrophies(collected, total) {
    if (this.elements.trophyCount) {
      this.elements.trophyCount.textContent = `${collected}/${total}`;
      
      // Pulse animation on collect
      this.elements.trophyCount.style.transform = 'scale(1.3)';
      setTimeout(() => {
        this.elements.trophyCount.style.transform = 'scale(1)';
      }, 200);
    }
  }
  
  /**
   * Show/hide warning
   * @param {boolean} show
   * @param {string} message
   */
  setWarning(show, message = 'GARGOYLE NEARBY!') {
    if (this.elements.warning) {
      this.warningActive = show;
      this.elements.warning.style.opacity = show ? '1' : '0';
      
      if (show && message) {
        this.elements.warning.querySelector('div:last-child').textContent = message;
      }
    }
  }
  
  /**
   * Update stamina bar
   * @param {number} current
   * @param {number} max
   */
  updateStamina(current, max) {
    if (this.elements.staminaBar && this.elements.staminaContainer) {
      const percent = (current / max) * 100;
      this.elements.staminaBar.style.width = `${percent}%`;
      
      // Show/hide based on whether stamina is full
      this.elements.staminaContainer.style.display = percent < 100 ? 'block' : 'none';
    }
  }
  
  /**
   * Update FPS display
   * @param {number} fps
   */
  updateFPS(fps) {
    if (this.elements.fps && this.config.showFPS) {
      this.elements.fps.textContent = `FPS: ${fps}`;
    }
  }
  
  /**
   * Update debug info
   * @param {object} info
   */
  updateDebug(info) {
    if (this.elements.debug && this.config.showDebug) {
      let text = '';
      for (const [key, value] of Object.entries(info)) {
        text += `${key}: ${value}\n`;
      }
      this.elements.debug.textContent = text;
    }
  }
  
  /**
   * Flash damage overlay
   */
  flashDamage() {
    if (this.elements.damageOverlay) {
      this.elements.damageOverlay.style.opacity = '1';
      setTimeout(() => {
        this.elements.damageOverlay.style.opacity = '0';
      }, 300);
    }
  }
  
  /**
   * Update crosshair style
   * @param {string} style - 'default', 'target', 'interact'
   */
  setCrosshairStyle(style) {
    if (!this.elements.crosshair) return;
    
    switch (style) {
      case 'target':
        this.elements.crosshair.innerHTML = `
          <svg width="24" height="24" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="8" fill="none" stroke="rgba(255,68,68,0.8)" stroke-width="2"/>
            <circle cx="12" cy="12" r="2" fill="rgba(255,68,68,1)"/>
          </svg>
        `;
        break;
      case 'interact':
        this.elements.crosshair.innerHTML = `
          <svg width="24" height="24" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="8" fill="none" stroke="rgba(68,255,68,0.8)" stroke-width="2"/>
            <circle cx="12" cy="12" r="2" fill="rgba(68,255,68,1)"/>
          </svg>
        `;
        break;
      default:
        this.elements.crosshair.innerHTML = `
          <svg width="24" height="24" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="8" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="2"/>
            <circle cx="12" cy="12" r="2" fill="rgba(255,255,255,0.8)"/>
          </svg>
        `;
    }
  }
  
  /**
   * Set configuration option
   * @param {string} key
   * @param {any} value
   */
  setConfig(key, value) {
    this.config[key] = value;
    
    // Apply config changes
    switch (key) {
      case 'showFPS':
        if (this.elements.fps) {
          this.elements.fps.style.display = value ? 'block' : 'none';
        }
        break;
      case 'showDebug':
        if (this.elements.debug) {
          this.elements.debug.style.display = value ? 'block' : 'none';
        }
        break;
    }
  }
  
  /**
   * Show HUD
   */
  show() {
    this.isVisible = true;
    this.container.style.display = 'block';
  }
  
  /**
   * Hide HUD
   */
  hide() {
    this.isVisible = false;
    this.container.style.display = 'none';
  }
  
  /**
   * Update HUD (call each frame)
   * @param {number} deltaTime
   */
  update(deltaTime) {
    // Warning flash effect
    if (this.warningActive) {
      this.warningFlashTimer += deltaTime * 1000;
      if (this.warningFlashTimer >= this.config.warningFlashSpeed) {
        this.warningFlashTimer = 0;
        const current = this.elements.warning.style.opacity;
        this.elements.warning.style.opacity = current === '1' ? '0.5' : '1';
      }
    }
  }
  
  /**
   * Clean up HUD
   */
  dispose() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.elements = {};
  }
}

// Export singleton
const hud = new HUD();
export default hud;
export { HUD };