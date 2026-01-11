/**
 * Menu - Main menu system
 * Handles main menu, pause menu, and game over screens
 */

// Menu states
export const MenuState = {
  HIDDEN: 'hidden',
  MAIN: 'main',
  PAUSED: 'paused',
  SETTINGS: 'settings',
  GAME_OVER: 'gameOver',
  WIN: 'win'
};

// Default settings
const DEFAULT_SETTINGS = {
  mouseSensitivity: 0.002,
  musicVolume: 0.5,
  sfxVolume: 0.7,
  showFPS: false,
  showDebug: false
};

class Menu {
  constructor() {
    this.state = MenuState.MAIN;
    this.previousState = MenuState.HIDDEN;
    this.container = null;
    this.elements = {};
    this.settings = { ...DEFAULT_SETTINGS };
    
    // Callbacks
    this.onPlay = null;
    this.onRestart = null;
    this.onSettingsChange = null;
    this.onQuit = null;
    
    // Dev mode - skip menu
    this.devMode = false;
  }
  
  /**
   * Initialize menu system
   * @param {object} options
   */
  init(options = {}) {
    this.devMode = options.devMode || false;
    
    // Load saved settings
    this.loadSettings();
    
    // Create menu container
    this.createContainer();
    
    // Create all menu screens
    this.createMainMenu();
    this.createPauseMenu();
    this.createSettingsMenu();
    this.createGameOverScreen();
    this.createWinScreen();
    
    // Show main menu (unless dev mode)
    if (this.devMode) {
      this.hide();
    } else {
      this.show(MenuState.MAIN);
    }
    
    // Keyboard listener for pause
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.handleEscape();
      }
    });
    
    console.log('Menu system initialized');
  }
  
  /**
   * Create the menu container
   */
  createContainer() {
    this.container = document.createElement('div');
    this.container.id = 'game-menu';
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      background: rgba(0, 0, 0, 0.85);
      z-index: 1000;
      font-family: 'Arial', sans-serif;
    `;
    document.body.appendChild(this.container);
  }
  
  /**
   * Create styled button
   */
  createButton(text, onClick, primary = false) {
    const button = document.createElement('button');
    button.textContent = text;
    button.style.cssText = `
      display: block;
      width: 250px;
      padding: 15px 30px;
      margin: 10px auto;
      font-size: 18px;
      font-weight: bold;
      color: ${primary ? '#1a1a1a' : '#ffffff'};
      background: ${primary ? '#ffdd44' : 'transparent'};
      border: 2px solid ${primary ? '#ffdd44' : '#666666'};
      border-radius: 5px;
      cursor: pointer;
      transition: all 0.2s ease;
      pointer-events: auto;
    `;
    
    button.addEventListener('mouseenter', () => {
      button.style.background = primary ? '#ffee88' : 'rgba(255,255,255,0.1)';
      button.style.borderColor = primary ? '#ffee88' : '#ffffff';
      button.style.transform = 'scale(1.05)';
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.background = primary ? '#ffdd44' : 'transparent';
      button.style.borderColor = primary ? '#ffdd44' : '#666666';
      button.style.transform = 'scale(1)';
    });
    
    button.addEventListener('click', onClick);
    
    return button;
  }
  
  /**
   * Create main menu
   */
  createMainMenu() {
    const menu = document.createElement('div');
    menu.id = 'main-menu';
    menu.style.cssText = `
      text-align: center;
      display: none;
    `;
    
    // Title
    const title = document.createElement('h1');
    title.textContent = 'GARGOYLE';
    title.style.cssText = `
      font-size: 72px;
      color: #ffffff;
      text-shadow: 0 0 20px rgba(255,221,68,0.5);
      margin-bottom: 10px;
      letter-spacing: 10px;
    `;
    menu.appendChild(title);
    
    // Subtitle
    const subtitle = document.createElement('p');
    subtitle.textContent = "Don't look away...";
    subtitle.style.cssText = `
      font-size: 20px;
      color: #888888;
      margin-bottom: 50px;
      font-style: italic;
    `;
    menu.appendChild(subtitle);
    
    // Buttons
    menu.appendChild(this.createButton('PLAY', () => this.startGame(), true));
    menu.appendChild(this.createButton('SETTINGS', () => this.show(MenuState.SETTINGS)));
    menu.appendChild(this.createButton('CONTROLS', () => this.showControls()));
    
    // Controls info (hidden by default)
    const controlsInfo = document.createElement('div');
    controlsInfo.id = 'controls-info';
    controlsInfo.style.cssText = `
      margin-top: 30px;
      padding: 20px;
      background: rgba(255,255,255,0.05);
      border-radius: 10px;
      display: none;
      text-align: left;
      max-width: 300px;
      margin-left: auto;
      margin-right: auto;
    `;
    controlsInfo.innerHTML = `
      <h3 style="color: #ffdd44; margin-bottom: 15px;">Controls</h3>
      <p style="color: #aaa; line-height: 1.8;">
        <b style="color: #fff;">WASD</b> - Move<br>
        <b style="color: #fff;">Mouse</b> - Look around<br>
        <b style="color: #fff;">Space</b> - Jump<br>
        <b style="color: #fff;">Scroll</b> - Zoom<br>
        <b style="color: #fff;">ESC</b> - Pause<br>
        <b style="color: #fff;">R</b> - Restart
      </p>
    `;
    menu.appendChild(controlsInfo);
    this.elements.controlsInfo = controlsInfo;
    
    this.container.appendChild(menu);
    this.elements.mainMenu = menu;
  }
  
  /**
   * Create pause menu
   */
  createPauseMenu() {
    const menu = document.createElement('div');
    menu.id = 'pause-menu';
    menu.style.cssText = `
      text-align: center;
      display: none;
    `;
    
    const title = document.createElement('h1');
    title.textContent = 'PAUSED';
    title.style.cssText = `
      font-size: 48px;
      color: #ffffff;
      margin-bottom: 40px;
    `;
    menu.appendChild(title);
    
    menu.appendChild(this.createButton('RESUME', () => this.resume(), true));
    menu.appendChild(this.createButton('SETTINGS', () => this.show(MenuState.SETTINGS)));
    menu.appendChild(this.createButton('RESTART', () => this.restart()));
    menu.appendChild(this.createButton('MAIN MENU', () => this.show(MenuState.MAIN)));
    
    this.container.appendChild(menu);
    this.elements.pauseMenu = menu;
  }
  
  /**
   * Create settings menu
   */
  createSettingsMenu() {
    const menu = document.createElement('div');
    menu.id = 'settings-menu';
    menu.style.cssText = `
      text-align: center;
      display: none;
    `;
    
    const title = document.createElement('h1');
    title.textContent = 'SETTINGS';
    title.style.cssText = `
      font-size: 48px;
      color: #ffffff;
      margin-bottom: 40px;
    `;
    menu.appendChild(title);
    
    // Settings container
    const settingsContainer = document.createElement('div');
    settingsContainer.style.cssText = `
      max-width: 400px;
      margin: 0 auto 30px;
      text-align: left;
    `;
    
    // Mouse sensitivity
    settingsContainer.appendChild(this.createSlider(
      'Mouse Sensitivity',
      'mouseSensitivity',
      0.001,
      0.005,
      0.0005,
      this.settings.mouseSensitivity
    ));
    
    // Music volume
    settingsContainer.appendChild(this.createSlider(
      'Music Volume',
      'musicVolume',
      0,
      1,
      0.1,
      this.settings.musicVolume
    ));
    
    // SFX volume
    settingsContainer.appendChild(this.createSlider(
      'SFX Volume',
      'sfxVolume',
      0,
      1,
      0.1,
      this.settings.sfxVolume
    ));
    
    // Show FPS toggle
    settingsContainer.appendChild(this.createToggle(
      'Show FPS',
      'showFPS',
      this.settings.showFPS
    ));
    
    // Show Debug toggle
    settingsContainer.appendChild(this.createToggle(
      'Show Debug Info',
      'showDebug',
      this.settings.showDebug
    ));
    
    menu.appendChild(settingsContainer);
    
    // Back button
    menu.appendChild(this.createButton('BACK', () => this.goBack(), true));
    
    this.container.appendChild(menu);
    this.elements.settingsMenu = menu;
  }
  
  /**
   * Create a slider setting
   */
  createSlider(label, key, min, max, step, value) {
    const container = document.createElement('div');
    container.style.cssText = `
      margin-bottom: 20px;
    `;
    
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.style.cssText = `
      display: block;
      color: #aaa;
      margin-bottom: 5px;
    `;
    container.appendChild(labelEl);
    
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = min;
    slider.max = max;
    slider.step = step;
    slider.value = value;
    slider.style.cssText = `
      width: 100%;
      cursor: pointer;
    `;
    
    slider.addEventListener('input', () => {
      this.settings[key] = parseFloat(slider.value);
      this.saveSettings();
      if (this.onSettingsChange) {
        this.onSettingsChange(key, this.settings[key]);
      }
    });
    
    container.appendChild(slider);
    
    return container;
  }
  
  /**
   * Create a toggle setting
   */
  createToggle(label, key, value) {
    const container = document.createElement('div');
    container.style.cssText = `
      margin-bottom: 15px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.style.cssText = `
      color: #aaa;
    `;
    container.appendChild(labelEl);
    
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = value;
    toggle.style.cssText = `
      width: 20px;
      height: 20px;
      cursor: pointer;
    `;
    
    toggle.addEventListener('change', () => {
      this.settings[key] = toggle.checked;
      this.saveSettings();
      if (this.onSettingsChange) {
        this.onSettingsChange(key, this.settings[key]);
      }
    });
    
    container.appendChild(toggle);
    
    return container;
  }
  
  /**
   * Create game over screen
   */
  createGameOverScreen() {
    const screen = document.createElement('div');
    screen.id = 'gameover-screen';
    screen.style.cssText = `
      text-align: center;
      display: none;
    `;
    
    const title = document.createElement('h1');
    title.textContent = 'CAUGHT!';
    title.style.cssText = `
      font-size: 72px;
      color: #ff4444;
      text-shadow: 0 0 20px rgba(255,68,68,0.5);
      margin-bottom: 20px;
    `;
    screen.appendChild(title);
    
    const skull = document.createElement('div');
    skull.textContent = '💀';
    skull.style.cssText = `
      font-size: 100px;
      margin-bottom: 30px;
    `;
    screen.appendChild(skull);
    
    const message = document.createElement('p');
    message.textContent = 'The gargoyles got you!';
    message.style.cssText = `
      font-size: 24px;
      color: #888888;
      margin-bottom: 40px;
    `;
    screen.appendChild(message);
    
    screen.appendChild(this.createButton('TRY AGAIN', () => this.restart(), true));
    screen.appendChild(this.createButton('MAIN MENU', () => this.show(MenuState.MAIN)));
    
    this.container.appendChild(screen);
    this.elements.gameOverScreen = screen;
  }
  
  /**
   * Create win screen
   */
  createWinScreen() {
    const screen = document.createElement('div');
    screen.id = 'win-screen';
    screen.style.cssText = `
      text-align: center;
      display: none;
    `;
    
    const title = document.createElement('h1');
    title.textContent = 'YOU WIN!';
    title.style.cssText = `
      font-size: 72px;
      color: #44ff44;
      text-shadow: 0 0 20px rgba(68,255,68,0.5);
      margin-bottom: 20px;
    `;
    screen.appendChild(title);
    
    const trophy = document.createElement('div');
    trophy.textContent = '🏆';
    trophy.style.cssText = `
      font-size: 100px;
      margin-bottom: 30px;
    `;
    screen.appendChild(trophy);
    
    const message = document.createElement('p');
    message.id = 'win-message';
    message.textContent = 'All trophies collected!';
    message.style.cssText = `
      font-size: 24px;
      color: #888888;
      margin-bottom: 40px;
    `;
    screen.appendChild(message);
    this.elements.winMessage = message;
    
    screen.appendChild(this.createButton('PLAY AGAIN', () => this.restart(), true));
    screen.appendChild(this.createButton('MAIN MENU', () => this.show(MenuState.MAIN)));
    
    this.container.appendChild(screen);
    this.elements.winScreen = screen;
  }
  
  /**
   * Show a menu state
   * @param {string} state - MenuState
   */
  show(state) {
    this.previousState = this.state;
    this.state = state;
    
    // Hide all menus
    this.elements.mainMenu.style.display = 'none';
    this.elements.pauseMenu.style.display = 'none';
    this.elements.settingsMenu.style.display = 'none';
    this.elements.gameOverScreen.style.display = 'none';
    this.elements.winScreen.style.display = 'none';
    
    // Show container
    this.container.style.display = 'flex';
    
    // Show appropriate menu
    switch (state) {
      case MenuState.MAIN:
        this.elements.mainMenu.style.display = 'block';
        break;
      case MenuState.PAUSED:
        this.elements.pauseMenu.style.display = 'block';
        break;
      case MenuState.SETTINGS:
        this.elements.settingsMenu.style.display = 'block';
        break;
      case MenuState.GAME_OVER:
        this.elements.gameOverScreen.style.display = 'block';
        break;
      case MenuState.WIN:
        this.elements.winScreen.style.display = 'block';
        break;
    }
  }
  
  /**
   * Hide menu
   */
  hide() {
    this.previousState = this.state;
    this.state = MenuState.HIDDEN;
    this.container.style.display = 'none';
  }
  
  /**
   * Check if menu is visible
   * @returns {boolean}
   */
  isVisible() {
    return this.state !== MenuState.HIDDEN;
  }
  
  /**
   * Handle escape key
   */
  handleEscape() {
    if (this.state === MenuState.HIDDEN) {
      // Pause game
      this.show(MenuState.PAUSED);
      if (this.onPause) this.onPause();
    } else if (this.state === MenuState.PAUSED) {
      // Resume game
      this.resume();
    } else if (this.state === MenuState.SETTINGS) {
      // Go back
      this.goBack();
    }
  }
  
  /**
   * Go back to previous menu
   */
  goBack() {
    if (this.previousState === MenuState.HIDDEN) {
      this.show(MenuState.PAUSED);
    } else {
      this.show(this.previousState);
    }
  }
  
  /**
   * Show controls info
   */
  showControls() {
    const info = this.elements.controlsInfo;
    info.style.display = info.style.display === 'none' ? 'block' : 'none';
  }
  
  /**
   * Start the game
   */
  startGame() {
    this.hide();
    if (this.onPlay) this.onPlay();
  }
  
  /**
   * Resume game
   */
  resume() {
    this.hide();
    if (this.onResume) this.onResume();
  }
  
  /**
   * Restart game
   */
  restart() {
    this.hide();
    if (this.onRestart) this.onRestart();
  }
  
  /**
   * Show game over screen
   */
  showGameOver() {
    this.show(MenuState.GAME_OVER);
  }
  
  /**
   * Show win screen
   * @param {object} stats - Game stats to display
   */
  showWin(stats = {}) {
    if (stats.time) {
      this.elements.winMessage.textContent = `Completed in ${stats.time}!`;
    }
    this.show(MenuState.WIN);
  }
  
  /**
   * Save settings to localStorage
   */
  saveSettings() {
    try {
      localStorage.setItem('gargoyle_settings', JSON.stringify(this.settings));
    } catch (e) {
      console.warn('Could not save settings:', e);
    }
  }
  
  /**
   * Load settings from localStorage
   */
  loadSettings() {
    try {
      const saved = localStorage.getItem('gargoyle_settings');
      if (saved) {
        this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Could not load settings:', e);
    }
  }
  
  /**
   * Get current settings
   * @returns {object}
   */
  getSettings() {
    return { ...this.settings };
  }
}

// Export singleton
const menu = new Menu();
export default menu;
export { Menu, MenuState };