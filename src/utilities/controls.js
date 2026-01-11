/**
 * Controls - Input handling system
 * Manages keyboard, mouse input, and pointer lock
 */

// Key bindings - easily changeable
const KEY_BINDINGS = {
  // Movement
  forward: ['w', 'arrowup'],
  backward: ['s', 'arrowdown'],
  left: ['a', 'arrowleft'],
  right: ['d', 'arrowright'],
  jump: [' '],           // spacebar
  sprint: ['shift'],
  crouch: ['c', 'control'],
  
  // Actions
  interact: ['e'],
  attack: ['mouse0'],    // left click
  
  // Camera
  lookAround: ['mouse1'], // right click (hold)
  
  // Developer/Debug
  toggleDebug: ['g'],
  togglePause: ['p'],
  toggleFullscreen: ['f11'],
  freeCam: ['f'],
  resetPosition: ['r']
};

class Controls {
  constructor() {
    // Current input state
    this.keys = {};           // Currently pressed keys
    this.mouse = {
      x: 0,
      y: 0,
      deltaX: 0,
      deltaY: 0,
      buttons: {},
      locked: false
    };
    
    // Movement state (computed from inputs)
    this.movement = {
      forward: 0,    // -1, 0, or 1
      right: 0,      // -1, 0, or 1
      jump: false,
      sprint: false,
      crouch: false
    };
    
    // Mouse sensitivity
    this.sensitivity = {
      x: 0.002,
      y: 0.002
    };
    
    // Pointer lock element
    this.lockElement = null;
    
    // Callbacks
    this.onPointerLockChange = null;
    this.onAction = null;
    
    // Developer mode
    this.devMode = true;
    
    // Bound event handlers (for cleanup)
    this._onKeyDown = this.handleKeyDown.bind(this);
    this._onKeyUp = this.handleKeyUp.bind(this);
    this._onMouseMove = this.handleMouseMove.bind(this);
    this._onMouseDown = this.handleMouseDown.bind(this);
    this._onMouseUp = this.handleMouseUp.bind(this);
    this._onPointerLockChange = this.handlePointerLockChange.bind(this);
    this._onContextMenu = (e) => e.preventDefault();
  }
  
  /**
   * Initialize controls and attach event listeners
   * @param {HTMLElement} element - Element for pointer lock (usually canvas)
   */
  init(element) {
    this.lockElement = element;
    
    // Keyboard events
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    
    // Mouse events
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mouseup', this._onMouseUp);
    
    // Pointer lock events
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    
    // Prevent context menu on right-click
    element.addEventListener('contextmenu', this._onContextMenu);
    
    // Click to lock pointer
    element.addEventListener('click', () => {
      if (!this.mouse.locked) {
        this.requestPointerLock();
      }
    });
    
    console.log('Controls initialized');
    console.log('Click game to capture mouse. ESC to release.');
  }
  
  /**
   * Clean up event listeners
   */
  dispose() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mousedown', this._onMouseDown);
    document.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    
    if (this.lockElement) {
      this.lockElement.removeEventListener('contextmenu', this._onContextMenu);
    }
  }
  
  /**
   * Request pointer lock
   */
  requestPointerLock() {
    if (this.lockElement) {
      this.lockElement.requestPointerLock();
    }
  }
  
  /**
   * Exit pointer lock
   */
  exitPointerLock() {
    document.exitPointerLock();
  }
  
  /**
   * Handle key down
   */
  handleKeyDown(event) {
    const key = event.key.toLowerCase();
    
    // Prevent repeat events
    if (this.keys[key]) return;
    
    this.keys[key] = true;
    
    // Update movement state
    this.updateMovementState();
    
    // Check for action triggers
    this.checkActions(key, true);
  }
  
  /**
   * Handle key up
   */
  handleKeyUp(event) {
    const key = event.key.toLowerCase();
    this.keys[key] = false;
    
    // Update movement state
    this.updateMovementState();
    
    // Check for action triggers
    this.checkActions(key, false);
  }
  
  /**
   * Handle mouse move
   */
  handleMouseMove(event) {
    if (this.mouse.locked) {
      this.mouse.deltaX = event.movementX * this.sensitivity.x;
      this.mouse.deltaY = event.movementY * this.sensitivity.y;
    } else {
      this.mouse.deltaX = 0;
      this.mouse.deltaY = 0;
    }
    
    this.mouse.x = event.clientX;
    this.mouse.y = event.clientY;
  }
  
  /**
   * Handle mouse down
   */
  handleMouseDown(event) {
    this.mouse.buttons[`mouse${event.button}`] = true;
  }
  
  /**
   * Handle mouse up
   */
  handleMouseUp(event) {
    this.mouse.buttons[`mouse${event.button}`] = false;
  }
  
  /**
   * Handle pointer lock change
   */
  handlePointerLockChange() {
    this.mouse.locked = document.pointerLockElement === this.lockElement;
    
    if (this.onPointerLockChange) {
      this.onPointerLockChange(this.mouse.locked);
    }
    
    console.log(`Pointer lock: ${this.mouse.locked ? 'LOCKED' : 'UNLOCKED'}`);
  }
  
  /**
   * Update movement state from current inputs
   */
  updateMovementState() {
    // Forward/backward
    const forward = this.isActionPressed('forward');
    const backward = this.isActionPressed('backward');
    this.movement.forward = (forward ? 1 : 0) - (backward ? 1 : 0);
    
    // Left/right
    const left = this.isActionPressed('left');
    const right = this.isActionPressed('right');
    this.movement.right = (right ? 1 : 0) - (left ? 1 : 0);
    
    // Other movement
    this.movement.jump = this.isActionPressed('jump');
    this.movement.sprint = this.isActionPressed('sprint');
    this.movement.crouch = this.isActionPressed('crouch');
  }
  
  /**
   * Check if a bound action is currently pressed
   * @param {string} action - Action name from KEY_BINDINGS
   * @returns {boolean}
   */
  isActionPressed(action) {
    const bindings = KEY_BINDINGS[action];
    if (!bindings) return false;
    
    for (const binding of bindings) {
      if (binding.startsWith('mouse')) {
        if (this.mouse.buttons[binding]) return true;
      } else {
        if (this.keys[binding]) return true;
      }
    }
    return false;
  }
  
  /**
   * Check for one-shot action triggers (like toggle keys)
   */
  checkActions(key, pressed) {
    if (!pressed) return; // Only trigger on key down
    
    // Developer controls
    if (this.devMode) {
      if (this.isKeyInBinding(key, 'toggleDebug')) {
        if (this.onAction) this.onAction('toggleDebug');
      }
      if (this.isKeyInBinding(key, 'togglePause')) {
        if (this.onAction) this.onAction('togglePause');
      }
      if (this.isKeyInBinding(key, 'freeCam')) {
        if (this.onAction) this.onAction('freeCam');
      }
      if (this.isKeyInBinding(key, 'resetPosition')) {
        if (this.onAction) this.onAction('resetPosition');
      }
    }
  }
  
  /**
   * Check if a key is in a binding
   */
  isKeyInBinding(key, action) {
    const bindings = KEY_BINDINGS[action];
    return bindings && bindings.includes(key);
  }
  
  /**
   * Get mouse delta and reset it (call once per frame)
   * @returns {object} { x, y }
   */
  getMouseDelta() {
    const delta = {
      x: this.mouse.deltaX,
      y: this.mouse.deltaY
    };
    // Reset delta after reading
    this.mouse.deltaX = 0;
    this.mouse.deltaY = 0;
    return delta;
  }
  
  /**
   * Check if any movement input is active
   * @returns {boolean}
   */
  isMoving() {
    return this.movement.forward !== 0 || this.movement.right !== 0;
  }
  
  /**
   * Set mouse sensitivity
   * @param {number} x - Horizontal sensitivity
   * @param {number} y - Vertical sensitivity
   */
  setSensitivity(x, y) {
    this.sensitivity.x = x;
    this.sensitivity.y = y ?? x;
  }
}

// Export singleton
const controls = new Controls();
export default controls;
export { Controls, KEY_BINDINGS };