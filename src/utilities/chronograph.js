/**
 * Chronograph - Time management utility
 * Handles delta time, fixed timestep physics, and game clock
 */

class Chronograph {
  constructor() {
    // Delta time tracking
    this.lastTime = performance.now();
    this.deltaTime = 0;           // Time since last frame (seconds)
    this.rawDeltaTime = 0;        // Unscaled delta time
    
    // Fixed timestep for physics
    this.fixedTimeStep = 1 / 60;  // 60 physics updates per second
    this.accumulator = 0;         // Accumulated time for physics
    this.maxAccumulator = 0.1;    // Cap to prevent spiral of death
    
    // Game clock
    this.elapsedTime = 0;         // Total game time (seconds)
    this.frameCount = 0;          // Total frames rendered
    
    // Time scale (for slow-mo effects, pause, etc.)
    this.timeScale = 1.0;
    this.paused = false;
    
    // FPS tracking
    this.fps = 0;
    this.fpsUpdateInterval = 0.5; // Update FPS every 0.5 seconds
    this.fpsAccumulator = 0;
    this.fpsFrameCount = 0;
  }
  
  /**
   * Call at the start of each frame
   * Returns the delta time in seconds
   */
  update() {
    const currentTime = performance.now();
    this.rawDeltaTime = (currentTime - this.lastTime) / 1000; // Convert to seconds
    this.lastTime = currentTime;
    
    // Apply time scale and pause
    if (this.paused) {
      this.deltaTime = 0;
    } else {
      this.deltaTime = this.rawDeltaTime * this.timeScale;
    }
    
    // Update game clock
    this.elapsedTime += this.deltaTime;
    this.frameCount++;
    
    // Update FPS counter
    this.fpsAccumulator += this.rawDeltaTime;
    this.fpsFrameCount++;
    if (this.fpsAccumulator >= this.fpsUpdateInterval) {
      this.fps = Math.round(this.fpsFrameCount / this.fpsAccumulator);
      this.fpsAccumulator = 0;
      this.fpsFrameCount = 0;
    }
    
    // Accumulate time for fixed timestep physics
    this.accumulator += this.deltaTime;
    // Cap accumulator to prevent spiral of death on slow frames
    if (this.accumulator > this.maxAccumulator) {
      this.accumulator = this.maxAccumulator;
    }
    
    return this.deltaTime;
  }
  
  /**
   * Check if physics should update (fixed timestep)
   * Call in a while loop: while (chronograph.shouldUpdatePhysics()) { ... }
   */
  shouldUpdatePhysics() {
    if (this.accumulator >= this.fixedTimeStep) {
      this.accumulator -= this.fixedTimeStep;
      return true;
    }
    return false;
  }
  
  /**
   * Get interpolation alpha for smooth rendering between physics steps
   */
  getInterpolationAlpha() {
    return this.accumulator / this.fixedTimeStep;
  }
  
  /**
   * Pause the game clock
   */
  pause() {
    this.paused = true;
  }
  
  /**
   * Resume the game clock
   */
  resume() {
    this.paused = false;
    // Reset lastTime to prevent huge delta after unpause
    this.lastTime = performance.now();
  }
  
  /**
   * Toggle pause state
   */
  togglePause() {
    if (this.paused) {
      this.resume();
    } else {
      this.pause();
    }
  }
  
  /**
   * Set time scale (1.0 = normal, 0.5 = half speed, 2.0 = double speed)
   */
  setTimeScale(scale) {
    this.timeScale = Math.max(0, scale);
  }
  
  /**
   * Get formatted time string (MM:SS)
   */
  getFormattedTime() {
    const minutes = Math.floor(this.elapsedTime / 60);
    const seconds = Math.floor(this.elapsedTime % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  
  /**
   * Reset the chronograph
   */
  reset() {
    this.elapsedTime = 0;
    this.frameCount = 0;
    this.accumulator = 0;
    this.lastTime = performance.now();
  }
}

// Export singleton instance
const chronograph = new Chronograph();
export default chronograph;
export { Chronograph };