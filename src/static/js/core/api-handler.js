import { Logger } from '../utils/logger.js';

/**
 * @fileoverview Provides a centralized handler for making HTTP API requests.
 * This class is designed to be a reusable component for handling standard JSON API calls.
 */
export class ApiHandler {
    /**
     * Sends a JSON POST request to a specified URL.
     * This method standardizes API calls by handling JSON stringification,
     * headers, and error responses.
     *
     * @param {string} url - The endpoint URL for the API request.
     * @param {object} body - The request payload, which will be serialized into a JSON string.
     * @param {object} [options={}] - Optional parameters.
     * @param {string} [options.apiKey] - An optional API key for authorization. If provided, an 'Authorization' header will be added.
     * @returns {Promise<object>} A promise that resolves to the JSON response from the server.
     * @throws {Error} Throws an error if the network request fails or if the server returns a non-successful status code (not in the 200-299 range).
     */
    async fetchJson(url, body, options = {}) {
        Logger.info(`[ApiHandler] Sending request to ${url}`);

        const headers = {};
        let requestBody = body;

        if (options.isBlob) {
            headers['Content-Type'] = 'audio/wav';
            // For Blob, the body is already in the correct format, no stringification needed
        } else {
            headers['Content-Type'] = 'application/json';
            requestBody = JSON.stringify(body);
        }

        if (options.apiKey) {
            headers['Authorization'] = `Bearer ${options.apiKey}`;
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: requestBody
            });

            if (!response.ok) {
                // Try to parse error details from the response body
                const errorData = await response.json().catch(() => ({
                    error: { message: `Request failed with status: ${response.status}` }
                }));
                Logger.error(`[ApiHandler] API request failed: ${response.status}`, errorData);
                throw new Error(errorData.error?.message || JSON.stringify(errorData));
            }

            return response.json();

        } catch (error) {
            Logger.error(`[ApiHandler] Network or fetch error for ${url}:`, error);
            // Re-throw the error to be handled by the caller
            throw error;
        }
    }

    /**
     * Sends a streaming POST request to a specified URL.
     * This method is for APIs that return Server-Sent Events (SSE).
     *
     * @param {string} url - The endpoint URL for the API request.
     * @param {object} body - The request payload, which will be serialized into a JSON string.
     * @param {object} [options={}] - Optional parameters.
     * @param {string} [options.apiKey] - An optional API key for authorization.
     * @returns {Promise<ReadableStreamDefaultReader<Uint8Array>>} A promise that resolves to the stream reader.
     * @throws {Error} Throws an error if the network request fails or returns a non-successful status code.
     */
    async fetchStream(url, body, options = {}) {
        Logger.info(`[ApiHandler] Sending stream request to ${url}`);

        const headers = {
            'Content-Type': 'application/json',
        };

        if (options.apiKey) {
            headers['Authorization'] = `Bearer ${options.apiKey}`;
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({
                    error: { message: `Request failed with status: ${response.status}` }
                }));
                Logger.error(`[ApiHandler] API stream request failed: ${response.status}`, errorData);
                throw new Error(errorData.error?.message || JSON.stringify(errorData));
            }

            return response.body.getReader();

        } catch (error) {
            Logger.error(`[ApiHandler] Network or fetch stream error for ${url}:`, error);
            throw error;
        }
    }
}