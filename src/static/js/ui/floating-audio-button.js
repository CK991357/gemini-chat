/**
 * @fileoverview Implements the FloatingAudioButton class, a UI component for mobile audio input.
 * This component provides a "press and hold to record, release to send, slide up to cancel" functionality.
 */

/**
 * @class FloatingAudioButton
 * @description Manages the UI and interaction logic for a floating audio recording button on mobile devices.
 * It acts as a pure UI controller, delegating audio recording logic to external callbacks.
 */
export class FloatingAudioButton {
    /**
     * @constructor
     * @param {object} options - Configuration options for the button.
     * @param {HTMLElement} [options.container=document.body] - The container element to which the button will be appended.
     * @param {function} options.onStart - Callback function to be invoked when recording starts (press and hold).
     * @param {function} options.onStop - Callback function to be invoked when recording stops and the audio should be sent (release).
     * @param {function} options.onCancel - Callback function to be invoked when recording is canceled (slide up and release).
     * @param {function} options.showToast - Callback function to display toast notifications.
     */
    constructor({ container = document.body, onStart, onStop, onCancel, showToast }) {
        this.container = container;
        this.onStart = onStart;
        this.onStop = onStop;
        this.onCancel = onCancel;
        this.showToast = showToast;

        this.state = 'idle'; // 'idle', 'recording', 'cancelling'
        this.touchStartY = 0;
        this.cancelThreshold = 80; // 上滑取消的阈值（像素）
        this.minRecordingTime = 500; // 最小录音时间（毫秒）
        this.recordingStartTime = 0;

        this.buttonElement = null;
        this.iconElement = null;
        this.tooltipElement = null;

        this.init();
    }

    /**
     * @function init
     * @description Creates and appends the button's DOM elements and attaches event listeners.
     * @private
     */
    init() {
        this.buttonElement = document.createElement('div');
        this.buttonElement.className = 'floating-audio-button';
        this.buttonElement.style.cssText = 'display: none;';
        
        this.iconElement = document.createElement('span');
        this.iconElement.className = 'material-icons';
        this.iconElement.textContent = 'mic';
        this.iconElement.style.cssText = `
            color: white;
            font-size: 28px;
        `;
        
        this.tooltipElement = document.createElement('div');
        this.tooltipElement.className = 'floating-audio-tooltip';
        this.tooltipElement.textContent = '按住说话';
        this.tooltipElement.style.cssText = 'display: none;';

        this.buttonElement.appendChild(this.iconElement);
        this.container.appendChild(this.buttonElement);
        this.container.appendChild(this.tooltipElement);

        this.addEventListeners();
    }

    /**
     * @function addEventListeners
     * @description Attaches touch event listeners to the button element.
     * @private
     */
    addEventListeners() {
        this.buttonElement.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        this.buttonElement.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.buttonElement.addEventListener('touchend', this.handleTouchEnd.bind(this));
        this.buttonElement.addEventListener('touchcancel', this.handleTouchEnd.bind(this));
    }

    /**
     * @function handleTouchStart
     * @description Handles the touchstart event to begin the recording process.
     * @param {TouchEvent} e - The touch event object.
     * @private
     */
    handleTouchStart(e) {
        e.preventDefault();
        this.touchStartY = e.touches[0].clientY;
        this.recordingStartTime = Date.now();
        this.setState('recording');
        if (this.onStart) {
            this.onStart();
        }
    }

    /**
     * @function handleTouchMove
     * @description Handles the touchmove event to detect slide-up-to-cancel gestures.
     * @param {TouchEvent} e - The touch event object.
     * @private
     */
    handleTouchMove(e) {
        e.preventDefault();
        if (this.state !== 'recording' && this.state !== 'cancelling') return;

        const currentY = e.touches[0].clientY;
        const deltaY = this.touchStartY - currentY;

        if (deltaY > this.cancelThreshold) {
            this.setState('cancelling');
        } else {
            this.setState('recording');
        }
    }

    /**
     * @function handleTouchEnd
     * @description Handles the touchend event to stop or cancel the recording.
     * @param {TouchEvent} e - The touch event object.
     * @private
     */
    handleTouchEnd(e) {
        e.preventDefault();
        
        // 检查录音时间是否过短
        const recordingDuration = Date.now() - this.recordingStartTime;
        
        if (this.state === 'recording' && recordingDuration < this.minRecordingTime) {
            // 录音时间过短，自动取消
            if (this.onCancel) {
                this.onCancel();
            }
            if (this.showToast) {
                this.showToast('录音时间太短，已取消');
            }
        } else if (this.state === 'recording') {
            // 正常停止录音
            if (this.onStop) {
                this.onStop();
            }
        } else if (this.state === 'cancelling') {
            // 用户手动取消
            if (this.onCancel) {
                this.onCancel();
            }
            if (this.showToast) {
                this.showToast('录音已取消');
            }
        }
        
        this.setState('idle');
    }

    /**
     * @function setState
     * @description Manages the visual state of the button and tooltip.
     * @param {'idle' | 'recording' | 'cancelling'} newState - The new state to set.
     * @private
     */
    setState(newState) {
        if (this.state === newState) return;
        this.state = newState;

        // 移除所有状态类
        this.buttonElement.classList.remove('recording', 'cancelling');
        this.iconElement.textContent = 'mic';
        
        switch (newState) {
            case 'idle':
                this.buttonElement.classList.remove('recording', 'cancelling');
                this.tooltipElement.style.display = 'none';
                break;
            case 'recording':
                this.buttonElement.classList.add('recording');
                this.buttonElement.classList.remove('cancelling');
                this.tooltipElement.textContent = '松开 发送';
                this.tooltipElement.style.display = 'block';
                break;
            case 'cancelling':
                this.buttonElement.classList.add('cancelling');
                this.buttonElement.classList.remove('recording');
                this.iconElement.textContent = 'close';
                this.tooltipElement.textContent = '松开 取消';
                this.tooltipElement.style.display = 'block';
                break;
        }
    }

    /**
     * @function destroy
     * @description Removes the button and its event listeners from the DOM.
     */
    destroy() {
        if (this.buttonElement) {
            this.buttonElement.remove();
            this.buttonElement = null;
        }
        if (this.tooltipElement) {
            this.tooltipElement.remove();
            this.tooltipElement = null;
        }
    }
}