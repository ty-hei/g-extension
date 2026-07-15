(function initializeApiConfigurationHelpers(globalScope) {
    'use strict';

    const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';
    const GEMINI_API_ORIGIN = 'https://generativelanguage.googleapis.com';

    function createConfigError(code, message) {
        const error = new Error(message);
        error.code = code;
        return error;
    }

    function isLoopbackHostname(hostname) {
        const normalized = String(hostname || '').toLowerCase();
        return normalized === 'localhost'
            || normalized.endsWith('.localhost')
            || normalized === '127.0.0.1'
            || normalized === '[::1]'
            || normalized === '::1';
    }

    function normalizeOpenAiEndpoint(rawEndpoint, { allowLoopbackHttp = true } = {}) {
        const value = String(rawEndpoint || '').trim();
        if (!value) throw createConfigError('MISSING_ENDPOINT', 'An API endpoint is required.');

        let parsed;
        try {
            parsed = new URL(value);
        } catch (_) {
            throw createConfigError('INVALID_ENDPOINT', 'The API endpoint must be a valid absolute URL.');
        }

        if (parsed.username || parsed.password) {
            throw createConfigError('ENDPOINT_CREDENTIALS', 'API endpoints containing URL credentials are not allowed.');
        }
        if (parsed.protocol === 'https:') return parsed.href;
        if (parsed.protocol === 'http:' && allowLoopbackHttp && isLoopbackHostname(parsed.hostname)) {
            return parsed.href;
        }
        throw createConfigError('INSECURE_ENDPOINT', 'Remote API endpoints must use HTTPS. HTTP is allowed only for loopback development endpoints.');
    }

    function snapshotConfiguration(rawConfig, options = {}) {
        const apiType = String(rawConfig?.apiType || 'gemini').trim().toLowerCase();
        const apiKey = String(rawConfig?.apiKey || '').trim();
        const modelName = String(rawConfig?.modelName || '').trim();
        if (!apiKey) throw createConfigError('MISSING_API_KEY', 'An API key is required.');
        if (!modelName) throw createConfigError('MISSING_MODEL', 'A model name is required.');
        if (apiType !== 'gemini' && apiType !== 'openai') {
            throw createConfigError('UNSUPPORTED_API_TYPE', `Unsupported API type: ${apiType}`);
        }

        const apiEndpoint = apiType === 'openai'
            ? normalizeOpenAiEndpoint(rawConfig?.apiEndpoint, options)
            : '';
        return Object.freeze({ apiType, apiKey, apiEndpoint, modelName });
    }

    function buildGeminiRequest(apiKey, modelName, method, { stream = false } = {}) {
        const key = String(apiKey || '').trim();
        const model = String(modelName || '').trim();
        if (!key) throw createConfigError('MISSING_API_KEY', 'An API key is required.');
        if (!model) throw createConfigError('MISSING_MODEL', 'A model name is required.');
        if (!/^[A-Za-z0-9._-]+$/.test(model)) {
            throw createConfigError('INVALID_MODEL', 'The Gemini model name contains unsupported characters.');
        }
        if (!/^[A-Za-z]+$/.test(method)) {
            throw createConfigError('INVALID_METHOD', 'The Gemini API method is invalid.');
        }

        const suffix = stream ? '?alt=sse' : '';
        return {
            endpoint: `${GEMINI_API_ORIGIN}/v1beta/models/${encodeURIComponent(model)}:${method}${suffix}`,
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': key
            }
        };
    }

    const api = {
        DEFAULT_GEMINI_MODEL,
        buildGeminiRequest,
        isLoopbackHostname,
        normalizeOpenAiEndpoint,
        snapshotConfiguration
    };

    globalScope.GExtensionApi = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
