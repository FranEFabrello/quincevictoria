'use strict';

const provider = (process.env.AI_PROVIDER || '').trim() || 'openai';
const apiKey = (process.env.AI_API_KEY || '').trim();
const model = (process.env.AI_MODEL || '').trim();
const endpoint = (process.env.AI_ENDPOINT || '').trim();
const defaultLocale = (process.env.AI_LOCALE || '').trim() || 'es-AR';

const requiredFields = [
    { key: 'apiKey', env: 'AI_API_KEY' },
    { key: 'model', env: 'AI_MODEL' }
];

const missing = requiredFields
    .filter((field) => {
        if (field.key === 'apiKey') return !apiKey;
        if (field.key === 'model') return !model;
        return false;
    })
    .map((field) => field.env);

const isConfigured = missing.length === 0;

function getPublicConfig() {
    return {
        provider,
        model,
        endpoint,
        defaultLocale,
        isConfigured,
        missing
    };
}

module.exports = {
    provider,
    apiKey,
    model,
    endpoint,
    defaultLocale,
    isConfigured,
    missing,
    getPublicConfig
};
