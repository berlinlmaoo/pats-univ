import type { ExpoConfig } from 'expo/config';
// Plain JSON: the config is loaded by Node, which can't import the TS token module.
import colors from '../../packages/shared/src/colors.json';

const config: ExpoConfig = {
  name: 'PATS University',
  slug: 'pats-university',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'patsuniv',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  ios: {
    bundleIdentifier: 'id.znetworks.patsuniv',
    supportsTablet: false,
    // Universal links for card URLs (Phase 2): https://patsuniv.znetworks.id/c/<token>
    associatedDomains: ['applinks:patsuniv.znetworks.id'],
  },
  android: {
    package: 'id.znetworks.patsuniv',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: colors.light.primary,
    },
  },
  web: {
    output: 'single',
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-localization',
    'expo-font',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 88,
        backgroundColor: colors.light.bg,
        dark: { image: './assets/splash-icon.png', backgroundColor: colors.dark.bg },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
  },
};

export default config;
