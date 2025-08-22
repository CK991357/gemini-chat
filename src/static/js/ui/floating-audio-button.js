import { AudioRecorder } from '../audio/audio-recorder.js';

/**
 * @class FloatingAudioButton
 * @description Manages a draggable floating audio button for mobile devices.
 * This component handles its own UI, state, and audio recording logic,
 * buffering audio chunks from AudioRecorder for send-on-release functionality.
 */
export class FloatingAudioButton {
    /**
     * @constructor
     * @param {object} client - The WebSocket client instance for sending data.
     */
    constructor(client) {
        /**
         * The WebSocket client instance.
         * @type {object}
         */
        this.client = client;
        /**
         * The AudioRecorder instance, initialized on first use.
         * @type {AudioRecorder|null}
         */
        this.audioRecorder = null;
        /**
         * The main floating button element.
         * @type {HTMLElement|null}
         */
        this.button = null;
        /**
         * The cancel zone element that appears on drag.
         * @type {HTMLElement|null}
         */
        this.cancelZone = null;
        /**
         * The recording indicator element.
         * @type {HTMLElement|null}
         */
        this.recordingIndicator = null;

        /**
         * The current recording state.
         * @type {'idle' | 'recording' | 'cancelling'}
         */
        this.state = 'idle';
        /**
         * Flag to track if the button is being dragged.
         * @type {boolean}
         */
        this.isDragging = false;
        /**
         * The initial X coordinate on touch start.
         * @type {number}
         */
        this.startX = 0;
        /**
         * The initial Y coordinate on touch start.
         * @type {number}
         */
        this.startY = 0;
        /**
         * The initial X offset of the button on touch start.
         * @type {number}
         */
        this.initialButtonX = 0;
        /**
         * The initial Y offset of the button on touch start.
         * @type {number}
         */
        this.initialButtonY = 0;
        /**
         * Buffer to store audio chunks (as Base64 strings) during recording.
         * @type {string[]}
         */
        this.audioBuffer = [];

        this.createButton();
    }

    /**
     * @function createButton
     * @description Creates the DOM elements for the button and appends them to the body.
     * @returns {void}
     */
    createButton() {
        this.button = document.createElement('div');
        this.button.className = 'floating-audio-button';
        this.button.innerHTML = `<i class="fas fa-microphone"></i>`;

        this.recordingIndicator = document.createElement('div');
        this.recordingIndicator.className = 'recording-indicator';
        this.button.appendChild(this.recordingIndicator);

        this.cancelZone = document.createElement('div');
        this.cancelZone.className = 'cancel-zone';
        this.cancelZone.innerHTML = `<i class="fas fa-trash-alt"></i><span>Release to cancel</span>`;

        document.body.appendChild(this.button);
        document.body.appendChild(this.cancelZone);

        this.addEventListeners();
    }

    /**
     * @function addEventListeners
     * @description Adds touch event listeners to the button for interaction.
     * @returns {void}
     */
    addEventListeners() {
        this.button.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        this.button.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.button.addEventListener('touchend', this.handleTouchEnd.bind(this));
    }

    /**
     * @function handleTouchStart
     * @description Handles the touchstart event to begin recording or dragging.
     * @param {TouchEvent} e - The touch event object.
     * @returns {Promise<void>}
     */
    async handleTouchStart(e) {
        e.preventDefault();
        this.isDragging = false;
        const touch = e.touches[0];
        this.startX = touch.clientX;
        this.startY = touch.clientY;
        this.initialButtonX = this.button.offsetLeft;
        this.initialButtonY = this.button.offsetTop;

        this.state = 'recording';
        this.button.classList.add('recording');
        this.cancelZone.classList.add('visible');
        
        const audioReady = await this.ensureAudioRecorder();
        if (audioReady) {
            this.audioBuffer = []; // Clear buffer before starting
            this.audioRecorder.start((base64Data) => {
                // Buffer data while recording is active
                if (this.state === 'recording' || this.state === 'cancelling') {
                    this.audioBuffer.push(base64Data);
                }
            });
        }
    }

    /**
     * @function handleTouchMove
     * @description Handles the touchmove event to drag the button or enter the cancel state.
     * @param {TouchEvent} e - The touch event object.
     * @returns {void}
     */
    handleTouchMove(e) {
        e.preventDefault();
        if (e.touches.length === 0) return;
        const touch = e.touches[0];
        const deltaX = touch.clientX - this.startX;
        const deltaY = touch.clientY - this.startY;

        if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
            this.isDragging = true;
        }

        if (this.isDragging) {
            const newX = this.initialButtonX + deltaX;
            const newY = this.initialButtonY + deltaY;
            this.button.style.left = `${newX}px`;
            this.button.style.top = `${newY}px`;
        }

        const buttonRect = this.button.getBoundingClientRect();
        const cancelRect = this.cancelZone.getBoundingClientRect();

        if (
            buttonRect.left < cancelRect.right &&
            buttonRect.right > cancelRect.left &&
            buttonRect.top < cancelRect.bottom &&
            buttonRect.bottom > cancelRect.top
        ) {
            if (this.state !== 'cancelling') {
                this.state = 'cancelling';
                this.button.classList.add('cancelling');
                this.cancelZone.classList.add('active');
            }
        } else {
            if (this.state === 'cancelling') {
                this.state = 'recording';
                this.button.classList.remove('cancelling');
                this.cancelZone.classList.remove('active');
            }
        }
    }

    /**
     * @function handleTouchEnd
     * @description Handles the touchend event to stop recording and either send or discard the audio.
     * @returns {void}
     */
    handleTouchEnd() {
        this.button.classList.remove('recording', 'cancelling');
        this.cancelZone.classList.remove('visible', 'active');

        if (this.audioRecorder) {
            this.audioRecorder.stop();
        }

        if (this.state === 'recording' && this.audioBuffer.length > 0) {
            const parts = this.audioBuffer.map(data => ({
                mimeType: "audio/pcm;rate=16000",
                data: data
            }));
            this.client.sendRealtimeInput(parts);
        }
        
        this.audioBuffer = []; // Always clear buffer after operation
        this.state = 'idle';
        this.isDragging = false;
    }

    /**
     * @function ensureAudioRecorder
     * @description Ensures an AudioRecorder instance is ready to be used.
     * @returns {Promise<boolean>} - True if the recorder is ready, false otherwise.
     */
    async ensureAudioRecorder() {
        if (this.audioRecorder) {
            if (this.audioRecorder.isRecording) {
                this.audioRecorder.stop();
            }
        }
        try {
            // The AudioRecorder's start() method handles permissions.
            // We just need a fresh instance to ensure a clean state.
            this.audioRecorder = new AudioRecorder();
            return true;
        } catch (error) {
            console.error('Error creating AudioRecorder instance:', error);
            alert('Could not create audio recorder.');
            return false;
        }
    }

    /**
     * @function show
     * @description Makes the button visible.
     * @returns {void}
     */
    show() {
        if (this.button) {
            this.button.style.display = 'flex';
        }
    }

    /**
     * @function hide
     * @description Hides the button.
     * @returns {void}
     */
    hide() {
        if (this.button) {
            this.button.style.display = 'none';
        }
    }
}