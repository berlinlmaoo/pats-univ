import { useCallback, useRef } from "react";
import { Alert, Image, Platform, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import * as ScreenCapture from "expo-screen-capture";
import * as ImagePicker from "expo-image-picker";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useVideoPlayer, VideoView } from "expo-video";
import { useAuth } from "@/auth";
import { useT } from "@/i18n";
import { Button } from "@/components/button";
import { Text } from "@/components/text";
import { space, radius, size } from "@/theme";

export function useScreenshotGuard(channelId?: string) {
  const { call, me } = useAuth();
  const t = useT();
  const focus = useRef(0);
  useFocusEffect(
    useCallback(() => {
      if (!channelId) return;
      const key = `hub:${channelId}:${++focus.current}`;
      const protection =
        Platform.OS === "android"
          ? ScreenCapture.preventScreenCaptureAsync(key).catch(() => null)
          : Promise.resolve();
      const listener =
        Platform.OS === "ios"
          ? ScreenCapture.addScreenshotListener(() => {
              Alert.alert(
                t("social.screenshotTitle"),
                t("social.screenshotBody"),
              );
              if (me?.member)
                void call("POST", "/api/social/screenshot", {
                  channelId,
                  platform: "IOS",
                }).catch(() => null);
            })
          : null;
      return () => {
        listener?.remove();
        if (Platform.OS === "android")
          void protection
            .then(() => ScreenCapture.allowScreenCaptureAsync(key))
            .catch(() => null);
      };
    }, [call, channelId, me?.member, t]),
  );
}
export interface CapturedMedia {
  uri: string;
  contentType: string;
  mediaType: "IMAGE" | "VOICE" | "VIDEO";
}
export function Capture({
  imageOnly,
  seconds,
  busy,
  onCapture,
  onError,
}: {
  imageOnly: boolean;
  seconds: number;
  busy: boolean;
  onCapture: (media: CapturedMedia) => void;
  onError: () => void;
}) {
  const t = useT();
  const active = useRef(true);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY, (status) => {
    if (!active.current) return;
    if (status.hasError) onError();
    else if (status.isFinished && status.url) {
      void setAudioModeAsync({ allowsRecording: false });
      onCapture({
        uri: status.url,
        contentType: "audio/mp4",
        mediaType: "VOICE",
      });
    }
  });
  const state = useAudioRecorderState(recorder);
  async function stop() {
    try {
      await recorder.stop();
    } catch {
      onError();
    }
  }
  useFocusEffect(
    useCallback(() => {
      active.current = true;
      return () => {
        active.current = false;
        if (recorder.isRecording) void recorder.stop().catch(() => null);
        void setAudioModeAsync({ allowsRecording: false }).catch(() => null);
      };
    }, [recorder]),
  );
  async function capture(video: boolean) {
    try {
      if (!(await ImagePicker.requestCameraPermissionsAsync()).granted) {
        Alert.alert(t("social.permission"));
        return;
      }
      if (
        video &&
        !(await AudioModule.requestRecordingPermissionsAsync()).granted
      ) {
        Alert.alert(t("social.permission"));
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: video ? ["videos"] : ["images"],
        videoMaxDuration: seconds,
        quality: 0.7,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      });
      if (!result.canceled) {
        const a = result.assets[0]!;
        onCapture({
          uri: a.uri,
          contentType: video
            ? a.uri.toLowerCase().endsWith(".mov")
              ? "video/quicktime"
              : "video/mp4"
            : "image/jpeg",
          mediaType: video ? "VIDEO" : "IMAGE",
        });
      }
    } catch {
      onError();
    }
  }
  return (
    <View style={styles.group}>
      <Button
        variant="secondary"
        label={t("social.photo")}
        disabled={busy || state.isRecording}
        onPress={() => void capture(false)}
      />
      {!imageOnly && (
        <>
          <Button
            variant="secondary"
            label={t("social.video")}
            disabled={busy || state.isRecording}
            onPress={() => void capture(true)}
          />
          <Button
            variant="secondary"
            disabled={busy}
            label={t(state.isRecording ? "social.stop" : "social.record")}
            onPress={() => {
              if (state.isRecording) {
                void stop();
                return;
              }
              void (async () => {
                try {
                  if (
                    !(await AudioModule.requestRecordingPermissionsAsync())
                      .granted
                  ) {
                    Alert.alert(t("social.permission"));
                    return;
                  }
                  await setAudioModeAsync({
                    allowsRecording: true,
                    playsInSilentMode: true,
                  });
                  await recorder.prepareToRecordAsync();
                  recorder.record({ forDuration: seconds });
                } catch {
                  onError();
                }
              })();
            }}
          />
          {state.isRecording && (
            <Text tone="textMuted">
              {Math.ceil(state.durationMillis / 1000)} / {seconds}
            </Text>
          )}
        </>
      )}
    </View>
  );
}
function Voice({ uri }: { uri: string }) {
  const t = useT();
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  useFocusEffect(useCallback(() => () => player.pause(), [player]));
  return (
    <Button
      variant="secondary"
      label={t(status.playing ? "social.pause" : "social.play")}
      onPress={() => {
        if (status.playing) player.pause();
        else {
          if (status.didJustFinish) void player.seekTo(0);
          player.play();
        }
      }}
    />
  );
}
function Video({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  useFocusEffect(useCallback(() => () => player.pause(), [player]));
  return (
    <VideoView
      player={player}
      style={styles.video}
      nativeControls
      fullscreenOptions={{ enable: false }}
    />
  );
}
export function Media({ uri, type }: { uri: string; type: string }) {
  const t = useT();
  return type === "VOICE" ? (
    <Voice uri={uri} />
  ) : type === "VIDEO" ? (
    <Video uri={uri} />
  ) : (
    <Image
      source={{ uri }}
      style={styles.image}
      accessibilityLabel={t("social.photo")}
      resizeMode="contain"
    />
  );
}
const styles = StyleSheet.create({
  group: { gap: space[2] },
  image: {
    width: "100%",
    height: size.scanFrame,
    borderRadius: radius.control,
  },
  video: {
    width: "100%",
    height: size.scanFrame,
    borderRadius: radius.control,
  },
});
