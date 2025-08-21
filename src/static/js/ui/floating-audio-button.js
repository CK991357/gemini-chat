import { Logger } from '../utils/logger.js';

/**
 * @class FloatingAudioButton
 * @description A draggable floating button for mobile audio recording with slide-up to cancel functionality.
 * It manages the recording state and interacts with the AudioRecorder and WebSocket client.
 */
export class FloatingAudioButton {
    /**
     * @constructor
     * @param {Function} getAudioRecorder - A function that returns the singleton AudioRecorder instance.
     * @param {object} client - The WebSocket client instance for sending audio data.
     * @param {object} [options={}] - Configuration options for the button's behavior.
     */
    constructor(getAudioRecorder, client, options = {}) {
        this.getAudioRecorder = getAudioRecorder;
        this.client = client;
        this.options = {
            cancelThreshold: 80, // Pixels to slide up to enter the cancel state.
            ...options,
        };

        this.state = 'IDLE'; // Possible states: IDLE, RECORDING, CANCELING
        this.touchData = { startX: 0, startY: 0, currentY: 0 };
        this.isDragging = false;

        this.initUI();
        this.bindEvents();
    }

    /**
     * @method initUI
     * @description Creates and appends the necessary DOM elements for the button to the document body.
     */
    initUI() {
        this.container = document.createElement('div');
        this.container.className = 'floating-audio-button-container';

        this.button = document.createElement('button');
        this.button.className = 'floating-audio-button';
        this.button.type = 'button';
        this.button.setAttribute('aria-label', 'Hold to record, release to send, slide up to cancel');
        
        const icon = document.createElement('span');
        icon.className = 'material-icons';
        icon.textContent = 'mic';
        this.button.appendChild(icon);

        this.statusIndicator = document.createElement('div');
        this.statusIndicator.className = 'floating-audio-status';

        this.container.append(this.button, this.statusIndicator);
        document.body.appendChild(this.container);
    }

    /**
     * @method bindEvents
     * @description Binds touch and mouse events to the button for recording and dragging.
     */
    bindEvents() {
        this.button.addEventListener('touchstart', this.handlePress.bind(this), { passive: false });
        this.button.addEventListener('touchmove', this.handleMove.bind(this), { passive: false });
        this.button.addEventListener('touchend', this.handleRelease.bind(this));
        this.button.addEventListener('touchcancel', this.handleRelease.bind(this));

        // Fallback for desktop testing
        this.button.addEventListener('mousedown', this.handlePress.bind(this));
        document.addEventListener('mousemove', this.handleMove.bind(this));
        document.addEventListener('mouseup', this.handleRelease.bind(this));
    }

    /**
     * @method handlePress
     * @description Handles the start of a touch or mouse press, initiating the recording process.
     * @param {Event} e - The touch or mouse event.
     */
    handlePress(e) {
        e.preventDefault();
        this.isDragging = true;
        const touch = e.touches ? e.touches[0] : e;
        this.touchData.startX = touch.clientX;
        this.touchData.startY = touch.clientY;

        this.startRecording();
    }

    /**
     * @method handleMove
     * @description Handles the movement during a touch or mouse drag, checking for the cancel gesture.
     * @param {Event} e - The touch or mouse event.
     */
    handleMove(e) {
        if (!this.isDragging || this.state !== 'RECORDING') return;
        e.preventDefault();
        const touch = e.touches ? e.touches[0] : e;
        this.touchData.currentY = touch.clientY;

        const deltaY = this.touchData.startY - this.touchData.currentY;
        if (deltaY > this.options.cancelThreshold) {
            this.enterCancelState();
        } else {
            this.exitCancelState();
        }
    }

    /**
     * @method handleRelease
     * @description Handles the end of a touch or mouse press, stopping or canceling the recording.
     */
    handleRelease() {
        if (!this.isDragging) return;
        this.isDragging = false;

        if (this.state === 'RECORDING') {
            this.stopRecording(true); // Send the recording
        } else if (this.state === 'CANCELING') {
            this.stopRecording(false); // Cancel the recording
        }
    }

    /**
     * @method startRecording
     * @description Transitions to the RECORDING state and starts the audio recorder.
     * @returns {Promise<void>}
     */
    async startRecording() {
        const audioRecorder = this.getAudioRecorder();
        if (!audioRecorder || this.state !== 'IDLE') {
            Logger.warn('Cannot start recording. Recorder not available or already recording.');
            return;
        }

        this.state = 'RECORDING';
        this.updateAppearance('recording');
        this.showStatus('Recording...');

        try {
            await audioRecorder.start((base64Data) => {
                if (this.client && this.client.ws) {
                    this.client.sendRealtimeInput([{
                        mimeType: `audio/pcm;rate=${CONFIG.AUDIO.SAMPLE_RATE}`,
                        data: base64Data,
                    }]);
                }
            });
            Logger.info('Floating button started recording.');
        } catch (error) {
            Logger.error('Floating button failed to start recording:', error);
            // 将详细错误信息展示给用户，便于调试
            const errorMessage = error.message || 'Unknown error';
            this.showStatus(`Error: ${errorMessage}`, 4000);
            this.resetState();
        }
    }

    /**
     * @method stopRecording
     * @description Stops the audio recorder and handles sending or canceling the data.
     * @param {boolean} shouldSend - Whether to send the recorded data.
     */
    stopRecording(shouldSend) {
        const audioRecorder = this.getAudioRecorder();
        if (!audioRecorder || this.state === 'IDLE') return;

        audioRecorder.stop();
        Logger.info(`Floating button stopped recording. Should send: ${shouldSend}`);
        
        if (shouldSend) {
            this.showStatus('Sent!', 1000);
        } else {
            this.showStatus('Canceled', 1000);
        }
        
        this.resetState();
    }

    /**
     * @method enterCancelState
     * @description Transitions to the CANCELING state.
     */
    enterCancelState() {
        if (this.state !== 'RECORDING') return;
        this.state = 'CANCELING';
        this.updateAppearance('canceling');
        this.showStatus('Release to cancel');
    }

    /**
     * @method exitCancelState
     * @description Transitions back to the RECORDING state from CANCELING.
     */
    exitCancelState() {
        if (this.state !== 'CANCELING') return;
        this.state = 'RECORDING';
        this.updateAppearance('recording');
        this.showStatus('Recording...');
    }

    /**
     * @method resetState
     * @description Resets the button to its initial IDLE state.
     */
    resetState() {
        this.state = 'IDLE';
        this.isDragging = false;
        this.touchData = { startX: 0, startY: 0, currentY: 0 };
        this.updateAppearance('idle');
    }

    /**
     * @method updateAppearance
     * @description Updates the button's visual style based on its current state.
     * @param {'idle'|'recording'|'canceling'} appearance - The visual state to apply.
     */
    updateAppearance(appearance) {
        this.button.classList.remove('recording', 'canceling');
        const icon = this.button.querySelector('.material-icons');
        if (appearance === 'recording') {
            this.button.classList.add('recording');
            icon.textContent = 'mic';
        } else if (appearance === 'canceling') {
            this.button.classList.add('canceling');
            icon.textContent = 'delete';
        } else {
            icon.textContent = 'mic';
        }
    }

    /**
     * @method showStatus
     * @description Displays a status message near the button.
     * @param {string} message - The message to display.
     * @param {number|null} [duration=null] - How long to show the message in ms. If null, it persists.
     */
    showStatus(message, duration = null) {
        this.statusIndicator.textContent = message;
        this.statusIndicator.classList.add('show');
        if (duration) {
            setTimeout(() => this.hideStatus(), duration);
        }
    }

    /**
     * @method hideStatus
     * @description Hides the status message.
     */
    hideStatus() {
        this.statusIndicator.classList.remove('show');
    }

    /**
     * @method show
     * @description Makes the button container visible.
     */
    show() {
        this.container.style.display = 'block';
    }

    /**
     * @method hide
     * @description Hides the button container.
     */
    hide() {
        this.container.style.display = 'none';
    }
}