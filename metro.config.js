const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Keep Windows builds within one worker to avoid pnpm/Metro worker contention.
// Linux build servers retain Expo's normal parallel worker count.
if (process.platform === 'win32') config.maxWorkers = 1;

module.exports = config;
