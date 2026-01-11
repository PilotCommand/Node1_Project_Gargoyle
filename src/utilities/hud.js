/**
 * HUD - Heads-Up Display system
 * Displays game information during gameplay
 * 
 * Layout:
 * - Lower Left: FPS Stats panel (like Three.js Stats)
 * - Lower Right: Trophy counter
 * - Upper Right: Controls panel
 * - Center: Crosshair
 * - Top Center: Warning indicator
 */

/**
 * Custom Stats panel that mimics Three.js Stats
 * Shows FPS with a graph like the standard Stats module
 */
class StatsPanel {
  constructor() {
    this.dom = document.createElement('div');
    this.dom.style.cssText = `
      width: 80px;
      opacity: 0.9;
      cursor: pointer;
      font-family: Helvetica, Arial, sans-serif;
      font-size: 9px;
      font-weight: bold;
      text-align: left;
      line-height: 15px;
      user-select: none;
      -webkit-user-select: none;
    `;
    
    // FPS Panel
    this.fpsPanel = document.createElement('div');
    this.fpsPanel.style.cssText = `
      padding: 0 0 3px 3px;
      background-color: #002;
    `;
    this.dom.appendChild(this.fpsPanel);
    
    // FPS Text
    this.fpsText = document.createElement('div');
    this.fpsText.style.cssText = `
      color: #0ff;
      margin-bottom: 1px;
    `;
    this.fpsText.textContent = 'FPS';
    this.fpsPanel.appendChild(this.fpsText);
    
    // Graph canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = 74;
    this.canvas.height = 30;
    this.canvas.style.cssText = `
      display: block;
      width: 74px;
      height: 30px;
    `;
    this.fpsPanel.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    
    // Initialize canvas background
    this.ctx.fillStyle = '#002';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // FPS tracking
    this.frames = 0;
    this.prevTime = performance.now();
    this.fps = 0;
    this.fpsMin = Infinity;
    this.fpsMax = 0;
    this.fpsHistory = [];
    
    // Click to toggle (like original Stats)
    this.dom.addEventListener('click', () => {
      // Could add panel switching here
    });
  }
  
  update() {
    this.frames++;
    const time = performance.now();
    
    if (time >= this.prevTime + 1000) {
      this.fps = Math.round((this.frames * 1000) / (time - this.prevTime));
      this.fpsMin = Math.min(this.fpsMin, this.fps);
      this.fpsMax = Math.max(this.fpsMax, this.fps);
      
      // Update text
      this.fpsText.textContent = `${this.fps} FPS (${this.fpsMin}-${this.fpsMax})`;
      
      // Update graph
      this.updateGraph(this.fps);
      
      this.prevTime = time;
      this.frames = 0;
    }
  }
  
  updateGraph(fps) {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    
    // Shift graph left
    ctx.drawImage(this.canvas, 1, 0, width - 1, height, 0, 0, width - 1, height);
    
    // Clear rightmost column
    ctx.fillStyle = '#002';
    ctx.fillRect(width - 1, 0, 1, height);
    
    // Draw new bar
    const barHeight = Math.min(height, (fps / 120) * height);
    
    // Gradient from red (low) to cyan (high)
    if (fps < 30) {
      ctx.fillStyle = '#f00';
    } else if (fps < 50) {
      ctx.fillStyle = '#ff0';
    } else {
      ctx.fillStyle = '#0ff';
    }
    
    ctx.fillRect(width - 1, height - barHeight, 1, barHeight);
  }
  
  showPanel(id) {
    // Compatibility method
  }
}

class HUD {
  constructor() {
    this.container = null;
    this.elements = {};
    this.stats = null;
    this.isVisible = true;
    
    // Configuration
    this.config = {
      showFPS: true,
      showDebug: false,
      showControls: true,
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
    this.createStatsPanel();
    this.createTrophyCounter();
    this.createControlsPanel();
    this.createWarningIndicator();
    this.createCrosshair();
    this.createDamageOverlay();
    this.createDebugPanel();
    this.createCameraModeIndicator();
    
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
      font-family: 'Consolas', 'Monaco', monospace;
      z-index: 100;
    `;
    document.body.appendChild(this.container);
  }
  
  /**
   * Create Stats panel (FPS counter) - Lower Left
   */
  createStatsPanel() {
    this.stats = new StatsPanel();
    
    // Style the stats panel
    this.stats.dom.style.cssText += `
      position: absolute !important;
      bottom: 16px !important;
      left: 16px !important;
      top: auto !important;
      cursor: pointer;
      pointer-events: auto;
      z-index: 101;
    `;
    
    this.container.appendChild(this.stats.dom);
    this.elements.stats = this.stats.dom;
    
    // Hide if config says so
    if (!this.config.showFPS) {
      this.stats.dom.style.display = 'none';
    }
  }
  
  /**
   * Create trophy counter - Lower Right
   */
  createTrophyCounter() {
    const counter = document.createElement('div');
    counter.id = 'hud-trophies';
    counter.style.cssText = `
      position: absolute;
      bottom: 16px;
      right: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      background: rgba(0, 0, 0, 0.7);
      padding: 12px 20px;
      border-radius: 8px;
      border: 1px solid rgba(255, 221, 68, 0.3);
    `;
    
    // Trophy icon
    const icon = document.createElement('div');
    icon.textContent = '🏆';
    icon.style.cssText = `
      font-size: 28px;
      filter: drop-shadow(0 0 4px rgba(255, 221, 68, 0.5));
    `;
    counter.appendChild(icon);
    
    // Count text
    const count = document.createElement('div');
    count.id = 'trophy-count';
    count.style.cssText = `
      font-size: 24px;
      font-weight: bold;
      color: #ffdd44;
      text-shadow: 0 0 10px rgba(255, 221, 68, 0.5);
      transition: transform 0.2s ease;
    `;
    count.textContent = '0 / 0';
    counter.appendChild(count);
    this.elements.trophyCount = count;
    
    this.container.appendChild(counter);
    this.elements.trophyContainer = counter;
  }
  
  /**
   * Create controls panel - Upper Right
   */
  createControlsPanel() {
    const panel = document.createElement('div');
    panel.id = 'hud-controls';
    panel.style.cssText = `
      position: absolute;
      top: 16px;
      right: 16px;
      background: rgba(0, 0, 0, 0.75);
      padding: 16px 20px;
      border-radius: 8px;
      border: 1px solid rgba(100, 200, 255, 0.3);
      min-width: 180px;
    `;
    
    // Title
    const title = document.createElement('div');
    title.style.cssText = `
      font-size: 14px;
      font-weight: bold;
      color: #64c8ff;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 2px;
      border-bottom: 1px solid rgba(100, 200, 255, 0.3);
      padding-bottom: 8px;
    `;
    title.textContent = 'Controls';
    panel.appendChild(title);
    
    // Control list
    const controls = [
      { key: 'W A S D', action: 'Move' },
      { key: 'Mouse', action: 'Look' },
      { key: 'Space', action: 'Jump / Up' },
      { key: 'Shift', action: 'Down (FreeCam)' },
      { key: 'Scroll', action: 'Zoom' },
      { key: 'Ctrl', action: 'Free Cam' },
      { key: 'ESC', action: 'Pause' },
      { key: 'P', action: 'Debug' },
      { key: 'R', action: 'Respawn' }
    ];
    
    const list = document.createElement('div');
    list.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 6px;
    `;
    
    controls.forEach(ctrl => {
      const row = document.createElement('div');
      row.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
      `;
      
      const key = document.createElement('span');
      key.style.cssText = `
        color: #ffffff;
        background: rgba(100, 200, 255, 0.2);
        padding: 2px 8px;
        border-radius: 4px;
        font-weight: bold;
        min-width: 60px;
        text-align: center;
      `;
      key.textContent = ctrl.key;
      
      const action = document.createElement('span');
      action.style.cssText = `
        color: rgba(255, 255, 255, 0.7);
        margin-left: 12px;
      `;
      action.textContent = ctrl.action;
      
      row.appendChild(key);
      row.appendChild(action);
      list.appendChild(row);
    });
    
    panel.appendChild(list);
    
    this.container.appendChild(panel);
    this.elements.controlsPanel = panel;
    
    // Hide if config says so
    if (!this.config.showControls) {
      panel.style.display = 'none';
    }
  }
  
  /**
   * Create warning indicator - Top Center
   */
  createWarningIndicator() {
    const warning = document.createElement('div');
    warning.id = 'hud-warning';
    warning.style.cssText = `
      position: absolute;
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 10px;
      background: rgba(255, 0, 0, 0.3);
      padding: 12px 24px;
      border-radius: 8px;
      border: 2px solid rgba(255, 68, 68, 0.8);
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
      text-shadow: 0 0 10px rgba(255, 68, 68, 0.8);
      text-transform: uppercase;
      letter-spacing: 2px;
    `;
    text.textContent = 'GARGOYLE NEARBY!';
    warning.appendChild(text);
    
    this.elements.warning = warning;
    this.elements.warningText = text;
    this.container.appendChild(warning);
  }
  
  /**
   * Create crosshair - Center
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
      background: radial-gradient(ellipse at center, transparent 0%, rgba(255,0,0,0.4) 100%);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s ease;
    `;
    
    this.elements.damageOverlay = overlay;
    this.container.appendChild(overlay);
  }
  
  /**
   * Create debug panel - Below controls panel
   */
  createDebugPanel() {
    const debug = document.createElement('div');
    debug.id = 'hud-debug';
    debug.style.cssText = `
      position: absolute;
      top: 320px;
      right: 16px;
      font-size: 11px;
      font-family: 'Consolas', 'Monaco', monospace;
      color: rgba(100, 255, 100, 0.8);
      background: rgba(0, 0, 0, 0.75);
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px solid rgba(100, 255, 100, 0.3);
      text-align: left;
      white-space: pre;
      display: ${this.config.showDebug ? 'block' : 'none'};
      min-width: 180px;
    `;
    
    this.elements.debug = debug;
    this.container.appendChild(debug);
  }
  
  /**
   * Create camera mode indicator - Upper Left
   */
  createCameraModeIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'hud-camera-mode';
    indicator.style.cssText = `
      position: absolute;
      top: 16px;
      left: 16px;
      font-size: 14px;
      font-family: 'Consolas', 'Monaco', monospace;
      color: #ff6600;
      background: rgba(0, 0, 0, 0.75);
      padding: 8px 16px;
      border-radius: 8px;
      border: 1px solid rgba(255, 102, 0, 0.5);
      text-transform: uppercase;
      letter-spacing: 2px;
      display: none;
    `;
    indicator.textContent = '📷 FREE CAM';
    
    this.elements.cameraModeIndicator = indicator;
    this.container.appendChild(indicator);
  }
  
  /**
   * Set camera mode indicator visibility
   * @param {boolean} isFreeCam
   */
  setCameraMode(isFreeCam) {
    if (this.elements.cameraModeIndicator) {
      this.elements.cameraModeIndicator.style.display = isFreeCam ? 'block' : 'none';
    }
  }
  
  /**
   * Update trophy display
   * @param {number} collected
   * @param {number} total
   */
  updateTrophies(collected, total) {
    if (this.elements.trophyCount) {
      this.elements.trophyCount.textContent = `${collected} / ${total}`;
      
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
      
      if (show && message && this.elements.warningText) {
        this.elements.warningText.textContent = message;
      }
    }
  }
  
  /**
   * Update FPS display (called each frame)
   * Stats panel updates automatically when we call stats.update()
   */
  updateFPS() {
    if (this.stats && this.config.showFPS) {
      this.stats.update();
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
            <line x1="12" y1="2" x2="12" y2="6" stroke="rgba(255,68,68,0.8)" stroke-width="2"/>
            <line x1="12" y1="18" x2="12" y2="22" stroke="rgba(255,68,68,0.8)" stroke-width="2"/>
            <line x1="2" y1="12" x2="6" y2="12" stroke="rgba(255,68,68,0.8)" stroke-width="2"/>
            <line x1="18" y1="12" x2="22" y2="12" stroke="rgba(255,68,68,0.8)" stroke-width="2"/>
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
        if (this.stats) {
          this.stats.dom.style.display = value ? 'block' : 'none';
        }
        break;
      case 'showDebug':
        if (this.elements.debug) {
          this.elements.debug.style.display = value ? 'block' : 'none';
        }
        break;
      case 'showControls':
        if (this.elements.controlsPanel) {
          this.elements.controlsPanel.style.display = value ? 'block' : 'none';
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
    // Update Stats panel
    this.updateFPS();
    
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
    this.stats = null;
    this.elements = {};
  }
}

// Export singleton
const hud = new HUD();
export default hud;
export { HUD };