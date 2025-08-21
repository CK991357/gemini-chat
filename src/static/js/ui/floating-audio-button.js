import { Logger } from '../utils/logger.js';

/**
 * @class FloatingAudioButton
 * @description A draggable floating button for mobile audio recording with slide-up to cancel functionality
 */
export class FloatingAudioButton {
    /**
     * @constructor
     * @param {Function} getAudioRecorder - Function that returns the current audio recorder instance
     * @param {Object} options - Configuration options
     */
    constructor(getAudioRecorder, client, options = {}) {
        this.getAudioRecorder = getAudioRecorder;
        this.client = client; // Store the client instance
        this.options = {
            cancelButtonThreshold: 100, // pixels to slide up to enter cancel state
            ...options
        };
        
        // State management
        this.states = {
            IDLE: 'idle',
            RECORDING: 'recording',
            CANCELING: 'canceling'
        };
        this.currentState = this.states.IDLE;
        
        // Position tracking
        this.startX = 0;
        this.startY = 0;
        this.currentX = 0;
        this.currentY = 0;
        this.lastX = 0;
        this.lastY = 0;
        
        // Throttling for touch events
        this.throttleTimer = null;
        
        // DOM elements
        this.button = null;
        this.container = null;
        this.statusIndicator = null;
        
        // Initialize the button
        this.init();
    }
    
    /**
     * Initialize the floating button
     */
    init() {
        // Create container
        this.container = document.createElement('div');
        this.container.className = 'floating-audio-button-container';
        
        // Create button
        this.button = document.createElement('button');
        this.button.className = 'floating-audio-button';
        this.button.type = 'button';
        this.button.textContent = 'mic'; // 使用textContent避免XSS风险
        this.button.setAttribute('aria-label', this.escapeHtml('录音按钮'));
        
        // Create status indicator
        this.statusIndicator = document.createElement('div');
        this.statusIndicator.className = 'floating-audio-status';
        this.statusIndicator.textContent = '';
        
        // Add to container
        this.container.appendChild(this.button);
        this.container.appendChild(this.statusIndicator);
        
        // 安全地添加到body
        document.body.appendChild(this.container);
        
        // Bind events
        this.bindEvents();
        
        Logger.info('FloatingAudioButton initialized');
    }
    
    /**
     * Bind touch events for dragging and recording
     */
    bindEvents() {
        // Touch events for mobile with proper options
        this.button.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        this.button.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.button.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });
        
        // Mouse events for desktop testing
        this.button.addEventListener('mousedown', this.handleMouseDown.bind(this));
        document.addEventListener('mousemove', this.handleMouseMove.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));
    }
    
    /**
     * Handle touch start event
     * @param {TouchEvent} e - Touch event
     */
    handleTouchStart(e) {
        e.preventDefault();
        e.stopPropagation();
        const touch = e.touches[0];
        this.startDrag(touch.clientX, touch.clientY);
    }
    
    /**
     * Handle mouse down event
     * @param {MouseEvent} e - Mouse event
     */
    handleMouseDown(e) {
        e.preventDefault();
        e.stopPropagation();
        this.startDrag(e.clientX, e.clientY);
    }
    
    /**
     * Start drag operation
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     */
    startDrag(x, y) {
        this.startX = x;
        this.startY = y;
        this.currentX = x;
        this.currentY = y;
        this.lastX = x;
        this.lastY = y;
        
        // Add dragging class
        this.button.classList.add('dragging');
        
        // If in idle state, start recording
        if (this.currentState === this.states.IDLE) {
            this.startRecording();
        }
    }
    
    /**
     * Handle touch move event with throttling
     * @param {TouchEvent} e - Touch event
     */
    handleTouchMove(e) {
        e.preventDefault();
        e.stopPropagation();
        
        // 节流处理，避免频繁更新
        if (this.throttleTimer) return;
        this.throttleTimer = setTimeout(() => {
            this.throttleTimer = null;
        }, 16); // 约60fps
        
        const touch = e.touches[0];
        this.updatePosition(touch.clientX, touch.clientY);
    }
    
    /**
     * Handle mouse move event
     * @param {MouseEvent} e - Mouse event
     */
    handleMouseMove(e) {
        if (this.button.classList.contains('dragging')) {
            this.updatePosition(e.clientX, e.clientY);
        }
    }
    
    /**
     * Update button position during drag
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     */
    updatePosition(x, y) {
        this.currentX = x;
        this.currentY = y;
        
        // Calculate distance from start position
        const deltaX = x - this.startX;
        const deltaY = y - this.startY;
        
        // Update button position
        this.button.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        
        // Check if we should enter cancel state
        if (this.currentState === this.states.RECORDING && deltaY < -this.options.cancelButtonThreshold) {
            this.enterCancelState();
        } else if (this.currentState === this.states.CANCELING && deltaY > -this.options.cancelButtonThreshold) {
            this.exitCancelState();
        }
        
        this.lastX = x;
        this.lastY = y;
    }
    
    /**
     * Handle touch end event
     * @param {TouchEvent} e - Touch event
     */
    handleTouchEnd(e) {
        e.preventDefault();
        e.stopPropagation();
        this.endDrag();
    }
    
    /**
     * Handle mouse up event
     * @param {MouseEvent} e - Mouse event
     */
    handleMouseUp(e) {
        if (this.button.classList.contains('dragging')) {
            this.endDrag();
        }
    }
    
    /**
     * End drag operation
     */
    endDrag() {
        // Remove dragging class
        this.button.classList.remove('dragging');
        
        // Reset button position
        this.button.style.transform = '';
        
        // Handle recording based on state
        if (this.currentState === this.states.RECORDING) {
            this.stopRecording(true); // Send recording
        } else if (this.currentState === this.states.CANCELING) {
            this.stopRecording(false); // Cancel recording
        }
        
        // Reset positions
        this.startX = 0;
        this.startY = 0;
        this.currentX = 0;
        this.currentY = 0;
        this.lastX = 0;
        this.lastY = 0;
    }
    
    /**
     * Start audio recording
     */
    async startRecording() {
        try {
            this.currentState = this.states.RECORDING;
            this.button.classList.add('recording');
            this.button.textContent = 'mic'; // Update icon
            
            // Show recording status
            this.showStatus('录音中...');
            
            // Get current audio recorder instance
            const audioRecorder = this.getAudioRecorder();
            if (!audioRecorder) {
                throw new Error('No audio recorder available');
            }
            
            Logger.info('Starting audio recording with floating button');
            
            // Start recording through audio recorder
            await audioRecorder.start((base64Data) => {
                if (this.client && this.client.isConnected()) {
                    this.client.sendRealtimeInput([{
                        mimeType: "audio/pcm;rate=16000",
                        data: base64Data
                    }]);
                }
            });
            
            Logger.info('Audio recording started via floating button');
        } catch (error) {
            Logger.error('Failed to start recording via floating button', error);
            this.resetState();
            this.hideStatus();
        }
    }
    
    /**
     * Stop audio recording
     * @param {boolean} shouldSend - Whether to send the recording or cancel it
     */
    async stopRecording(shouldSend) {
        try {
            // Get current audio recorder instance
            const audioRecorder = this.getAudioRecorder();
            if (!audioRecorder) {
                throw new Error('No audio recorder available');
            }
            
            Logger.info(`Stopping audio recording via floating button, shouldSend: ${shouldSend}`);
            
            // 传递shouldSend参数给audioRecorder.stop()
            audioRecorder.stop(shouldSend);
            if (shouldSend) {
                Logger.info('Audio recording stopped and will be sent via floating button');
                // Show sent status briefly
                this.showStatus('已发送');
                setTimeout(() => {
                    this.hideStatus();
                }, 1000);
            } else {
                Logger.info('Audio recording canceled via floating button');
                // Show canceled status briefly
                this.showStatus('已取消');
                setTimeout(() => {
                    this.hideStatus();
                }, 1000);
            }
        } catch (error) {
            Logger.error('Failed to stop recording via floating button', error);
            this.showStatus('错误');
            setTimeout(() => {
                this.hideStatus();
            }, 1000);
        } finally {
            this.resetState();
        }
    }
    
    /**
     * Enter cancel state
     */
    enterCancelState() {
        if (this.currentState === this.states.RECORDING) {
            this.currentState = this.states.CANCELING;
            this.button.classList.add('canceling');
            this.button.textContent = 'delete'; // Update icon to indicate cancel
            Logger.info('Entered cancel state via floating button');
            // Show cancel status
            this.showStatus('松开取消录音');
        }
    }
    
    /**
     * Exit cancel state
     */
    exitCancelState() {
        if (this.currentState === this.states.CANCELING) {
            this.currentState = this.states.RECORDING;
            this.button.classList.remove('canceling');
            this.button.textContent = 'mic'; // Restore recording icon
            Logger.info('Exited cancel state via floating button');
        }
    }
    
    /**
     * Show status message
     * @param {string} message - Status message to display
     */
    showStatus(message) {
        if (this.statusIndicator) {
            this.statusIndicator.textContent = message;
            this.statusIndicator.classList.add('show');
        }
    }
    
    /**
     * Hide status message
     */
    hideStatus() {
        if (this.statusIndicator) {
            this.statusIndicator.classList.remove('show');
        }
    }
    
    /**
     * Reset button state
     */
    resetState() {
        this.currentState = this.states.IDLE;
        this.button.classList.remove('recording', 'canceling');
        this.button.textContent = 'mic'; // Reset icon
    }
    
    /**
     * Escape HTML to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
    
    /**
     * Show the floating button
     */
    show() {
        if (this.container) {
            this.container.style.display = 'block';
        }
    }
    
    /**
     * Hide the floating button
     */
    hide() {
        if (this.container) {
            this.container.style.display = 'none';
        }
    }
    
    /**
     * Destroy the floating button and clean up
     */
    destroy() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        
        // Remove event listeners
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
        
        Logger.info('FloatingAudioButton destroyed');
    }
}