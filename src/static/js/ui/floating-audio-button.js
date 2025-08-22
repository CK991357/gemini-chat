/**
 * @class FloatingAudioButton
 * @description A UI component that acts as a state controller for audio recording.
 * It triggers start/stop callbacks and manages UI states for "press-to-record"
 * and "slide-up-to-cancel" without handling audio data directly.
 */
export class FloatingAudioButton {
    /**
     * @constructor
     * @param {object} callbacks - Callbacks for recording events.
     * @param {Function} callbacks.onStart - Called when recording should start.
     * @param {Function} callbacks.onStop - Called when recording should stop and send.
     * @param {Function} callbacks.onCancel - Called when recording should be cancelled.
     */
    constructor({ onStart, onStop, onCancel }) {
        this.onStart = onStart;
        this.onStop = onStop;
        this.onCancel = onCancel;

        this.button = null;
        this.cancelZone = null;
        this.recordingIndicator = null;
        this.state = 'idle';
        this.startY = 0;

        this.createButton();
    }

    /**
     * @function createButton
     * @description Creates the DOM elements for the button.
     * @returns {void}
     */
    createButton() {
        this.button = document.createElement('div');
        this.button.className = 'floating-audio-button';
        this.button.innerHTML = `<span class="material-icons">mic</span>`;

        this.recordingIndicator = document.createElement('div');
        this.recordingIndicator.className = 'recording-indicator';
        this.button.appendChild(this.recordingIndicator);

        this.cancelZone = document.createElement('div');
        this.cancelZone.className = 'cancel-zone';
        this.cancelZone.innerHTML = `<i class="fas fa-trash-alt"></i><span>Slide up to cancel</span>`;

        document.body.appendChild(this.button);
        document.body.appendChild(this.cancelZone);

        this.addEventListeners();
    }

    /**
     * @function addEventListeners
     * @description Adds touch event listeners to the button.
     * @returns {void}
     */
    addEventListeners() {
        this.button.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        this.button.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.button.addEventListener('touchend', this.handleTouchEnd.bind(this));
    }

    /**
     * @function handleTouchStart
     * @description Handles touchstart to begin recording.
     * @param {TouchEvent} e - The touch event.
     * @returns {void}
     */
    handleTouchStart(e) {
        e.preventDefault();
        this.state = 'recording';
        this.button.classList.add('recording');
        this.cancelZone.classList.add('visible');
        const touch = e.touches[0];
        this.startY = touch.clientY;
        this.onStart();
    }

    /**
     * @function handleTouchMove
     * @description Handles touchmove for slide-up-to-cancel gesture.
     * @param {TouchEvent} e - The touch event.
     * @returns {void}
     */
    handleTouchMove(e) {
        e.preventDefault();
        if (this.state === 'idle' || e.touches.length === 0) return;

        const touch = e.touches[0];
        const deltaY = this.startY - touch.clientY;

        if (deltaY > 50) { // 50px threshold
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
     * @description Handles touchend to stop or cancel recording.
     * @returns {void}
     */
    handleTouchEnd() {
        if (this.state === 'idle') return;

        this.button.classList.remove('recording', 'cancelling');
        this.cancelZone.classList.remove('visible', 'active');

        if (this.state === 'recording') {
            this.onStop();
        } else if (this.state === 'cancelling') {
            this.onCancel();
        }

        this.state = 'idle';
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