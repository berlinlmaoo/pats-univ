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
    // Universal links for card URLs: a tapped card (https://patsuniv.znetworks.id/c/<token>)
    // opens the app. The domain serves /.well-known/apple-app-site-association.
    associatedDomains: ['applinks:patsuniv.znetworks.id'],
    infoPlist: {
      // Core NFC asks with this text the first time crew tap a card.
      NFCReaderUsageDescription: 'PATS University reads member cards for check-in and hand-over, and HQ encodes new cards. / PATS University membaca kartu member untuk check-in dan serah terima, dan HQ meng-encode kartu baru.',
    },
  },
  android: {
    package: 'id.znetworks.patsuniv',
    permissions: ['android.permission.NFC'],
    intentFilters: [
      {
        // App link: card URLs open the app (verified with /.well-known/assetlinks.json).
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: 'patsuniv.znetworks.id', pathPrefix: '/c/' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
      {
        // A member's own card tapped on an Android phone opens the app directly.
        action: 'android.nfc.action.NDEF_DISCOVERED',
        data: [{ scheme: 'https', host: 'patsuniv.znetworks.id', pathPrefix: '/c/' }],
        category: ['DEFAULT'],
      },
    ],
    adaptiveIcon: {
      // The shield, inside the safe zone; the launcher draws the brand cream behind it.
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: colors.brand.cream,
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
      'expo-camera',
      {
        // Crew scan member QR codes at the door. The member app never opens the camera.
        cameraPermission: 'PATS University uses the camera to scan member check-in QR codes. / PATS University memakai kamera untuk memindai QR check-in member.',
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    '@react-native-community/datetimepicker',
    [
      // NFC needs the development build (Expo Go has no NFC): docs/NFC-DEV-BUILD.md.
      'react-native-nfc-manager',
      {
        nfcPermission:
          'PATS University reads member cards for check-in and hand-over, and HQ encodes new cards. / PATS University membaca kartu member untuk check-in dan serah terima, dan HQ meng-encode kartu baru.',
        // NDEF + TAG: TAG gives the NTAG (MIFARE) commands for UID reads and encoding.
        includeNdefEntitlement: true,
      },
    ],
    ['expo-notifications', { color: colors.brand.navy, defaultChannel: 'default' }],
    'expo-dev-client',
    [
      'expo-splash-screen',
      {
        // The full crest; the same art sits on the light and the dark background.
        image: './assets/splash-icon.png',
        imageWidth: 200,
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
    // EAS project id (from `eas init`): needed for push tokens. See docs/NFC-DEV-BUILD.md.
    eas: process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : undefined,
  },
};

export default config;
