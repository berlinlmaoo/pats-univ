import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { MessageCircle } from "lucide-react-native";
import {
  formatDateTime,
  orderHubItems,
  type FeedResponse,
  type HubChannel,
  type HubResponse,
  type SocialRoom,
} from "@pats/shared";
import { useAuth } from "@/auth";
import { useI18n } from "@/i18n";
import { useApi } from "@/lib/use-api";
import { ApiFailure, errorKey } from "@/lib/api";
import { Screen } from "@/components/screen";
import { Card } from "@/components/card";
import { Text } from "@/components/text";
import { Button } from "@/components/button";
import { Field, Input } from "@/components/field";
import { ListRow } from "@/components/list-row";
import { EmptyState } from "@/components/empty-state";
import { LoadError, Loading } from "@/components/load-state";
import { Notice } from "@/components/notice";
import { Choices } from "@/features/loyalty/ui";
import { space } from "@/theme";
import {
  Capture,
  Media,
  useScreenshotGuard,
  type CapturedMedia,
} from "./media";
import { useSocialRoom } from "./realtime";

export function HubScreen() {
  const { t } = useI18n();
  const { me } = useAuth();
  const state = useApi<HubResponse>("/api/social/hub");
  const [city, setCity] = useState("");
  const [create, setCreate] = useState(false);
  const selected = state.data?.cities.some((c) => c.id === city)
    ? city
    : (state.data?.homeCityId ?? state.data?.cities[0]?.id);
  const admin = me?.user.role !== "MEMBER";
  return (
    <Screen
      title={t("social.title")}
      subtitle={t("social.subtitle")}
      refreshing={state.refreshing}
      onRefresh={state.reload}
    >
      <Button
        variant="secondary"
        label={t(admin ? "social.operations" : "social.reservations")}
        onPress={() => router.push("/social-operations")}
      />
      {!admin && (
        <Button
          variant="secondary"
          label={t("social.roaming")}
          onPress={() => router.push("/roaming")}
        />
      )}
      {state.loading ? (
        <Loading />
      ) : state.error ? (
        <LoadError error={state.error} onRetry={state.reload} />
      ) : (
        state.data && (
          <>
            <Choices
              label={t("social.city")}
              options={state.data.cities}
              value={selected ?? ""}
              onChange={setCity}
            />
            {admin && (
              <Button
                label={t("social.newChannel")}
                onPress={() => setCreate(!create)}
              />
            )}
            {create && selected && (
              <ChannelEditor
                cityId={selected}
                onSaved={() => {
                  setCreate(false);
                  void state.reload();
                }}
              />
            )}
            {!state.data.channels.filter((c) => c.cityId === selected)
              .length && (
              <EmptyState
                icon={MessageCircle}
                title={t("social.noChannels")}
                body={t("social.noChannelsBody")}
              />
            )}
            {state.data.channels
              .filter((c) => c.cityId === selected)
              .map((c) => (
                <Card key={c.id}>
                  <ListRow
                    first
                    title={c.name}
                    subtitle={`${t.loose(`social.${c.kind}`)}${c.archived ? ` · ${t("social.archived")}` : ""}`}
                    onPress={() =>
                      router.push({
                        pathname: "/social-channel",
                        params: { id: c.id },
                      })
                    }
                  />
                </Card>
              ))}
          </>
        )
      )}
    </Screen>
  );
}
export function ChannelScreen() {
  const { id, conversationId } = useLocalSearchParams<{
    id?: string;
    conversationId?: string;
  }>();
  const { t } = useI18n();
  const hub = useApi<HubResponse>("/api/social/hub");
  if (conversationId)
    return (
      <FeedScreen
        room={{ kind: "conversation", id: conversationId }}
        rules={hub.data?.rules}
      />
    );
  const channel = hub.data?.channels.find((c) => c.id === id);
  if (hub.loading)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  if (!channel)
    return (
      <Screen>
        <Notice text={t("social.accessLost")} />
        <Button label={t("social.backHub")} onPress={() => router.back()} />
      </Screen>
    );
  return (
    <FeedScreen
      key={channel.id}
      room={{ kind: "channel", id: channel.id }}
      channel={channel}
      rules={hub.data?.rules}
    />
  );
}
function FeedScreen({
  room,
  channel,
  rules,
}: {
  room: SocialRoom;
  channel?: HubChannel;
  rules?: HubResponse["rules"];
}) {
  const { t, locale } = useI18n();
  const { call, me } = useAuth();
  const state = useApi<FeedResponse>(
    `/api/social/feed?kind=${room.kind}&id=${room.id}`,
  );
  const [body, setBody] = useState(""),
    [attachment, setAttachment] = useState<{
      key: string;
      mediaType: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState<ApiFailure | null>(null),
    [lost, setLost] = useState(false),
    [edit, setEdit] = useState(false);
  const live = useSocialRoom(room, state.reload, () => setLost(true));
  useScreenshotGuard(channel?.id);
  const admin = me?.user.role !== "MEMBER";
  async function run(action: string, data: unknown) {
    setBusy(true);
    setFailure(null);
    try {
      await call("POST", `/api/social/${action}`, data);
      await state.reload();
      return true;
    } catch (e) {
      setFailure(e instanceof ApiFailure ? e : new ApiFailure("INTERNAL"));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function upload(media: CapturedMedia) {
    setBusy(true);
    setFailure(null);
    try {
      const file = await (await fetch(media.uri)).blob();
      const signed = await call<{ key: string; url: string; maxBytes: number }>(
        "POST",
        "/api/social/upload",
        { room, contentType: media.contentType },
      );
      if (file.size > signed.maxBytes) throw new ApiFailure("MEDIA_INVALID");
      const res = await fetch(signed.url, {
        method: "PUT",
        headers: { "Content-Type": media.contentType },
        body: file,
      });
      if (!res.ok) throw new ApiFailure("MEDIA_INVALID");
      setAttachment({ key: signed.key, mediaType: media.mediaType });
    } catch (e) {
      setFailure(e instanceof ApiFailure ? e : new ApiFailure("NETWORK"));
    } finally {
      setBusy(false);
    }
  }
  const confirm = (title: string, data: unknown, hint = "social.deleteBody") =>
    Alert.alert(title, t.loose(hint), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: title,
        style: "destructive",
        onPress: () => void run("moderate", data),
      },
    ]);
  if (lost || state.error?.code === "FORBIDDEN")
    return (
      <Screen>
        <Notice text={t("social.accessLost")} />
        <Button label={t("social.backHub")} onPress={() => router.back()} />
      </Screen>
    );
  return (
    <Screen
      title={channel?.name ?? t("social.chat")}
      edges={[]}
      refreshing={state.refreshing}
      onRefresh={state.reload}
    >
      <Text tone="textMuted" variant="caption">
        {t(live.connected ? "social.live" : "social.offline")}
      </Text>
      {channel && <Notice text={t("social.secureHint")} />}
      {admin && channel && (
        <>
          <Button
            variant="secondary"
            label={t("common.edit")}
            onPress={() => setEdit(!edit)}
          />
          {edit && (
            <ChannelEditor
              cityId={channel.cityId}
              channel={channel}
              onSaved={() => {
                setEdit(false);
                router.back();
              }}
            />
          )}
        </>
      )}
      {state.loading ? (
        <Loading />
      ) : state.error ? (
        <LoadError error={state.error} onRetry={state.reload} />
      ) : !state.data?.items.length ? (
        <EmptyState
          icon={MessageCircle}
          title={t("social.emptyTitle")}
          body={t("social.emptyBody")}
        />
      ) : (
        orderHubItems(state.data.items, channel?.kind === "TIMELINE").map(
          (item) => (
            <Card key={item.id} style={styles.card}>
              <Text weight={600}>
                {item.author.name}
                {item.pinned ? ` · ${t("social.pinned")}` : ""}
              </Text>
              <Text variant="caption" tone="textMuted">
                {formatDateTime(new Date(item.createdAt), locale)}
              </Text>
              {Boolean(item.body) && <Text>{item.body}</Text>}
              {item.mediaUrl && (
                <Media uri={item.mediaUrl} type={item.mediaType} />
              )}
              {channel?.kind === 'TIMELINE' && <Button variant="ghost" label={`${t.loose(item.reacted ? 'phase5.reacted' : 'phase5.react')} · ${item.reactionCount ?? 0}`} onPress={() => void run('react', { postId: item.id, active: !item.reacted })} />}
              {admin && channel && (
                <View style={styles.group}>
                  {channel.kind === "TIMELINE" && (
                    <Button
                      variant="ghost"
                      label={t(item.pinned ? "social.unpin" : "social.pin")}
                      onPress={() =>
                        void run("moderate", {
                          action: "pin",
                          id: item.id,
                          pinned: !item.pinned,
                        })
                      }
                    />
                  )}
                  <Button
                    variant="ghost"
                    label={t("social.delete")}
                    onPress={() =>
                      confirm(t("social.delete"), {
                        action:
                          channel.kind === "TIMELINE"
                            ? "deletePost"
                            : "deleteMessage",
                        id: item.id,
                      })
                    }
                  />
                  {item.author.id !== me?.user.id && (
                    <Button
                      variant="ghost"
                      label={t("social.mute")}
                      onPress={() =>
                        confirm(
                          t("social.mute"),
                          {
                            action: "mute",
                            cityId: channel.cityId,
                            userId: item.author.id,
                            muted: true,
                          },
                          "social.muteBody",
                        )
                      }
                    />
                  )}
                </View>
              )}
            </Card>
          ),
        )
      )}
      {state.data?.nextCursor && (
        <Button
          variant="secondary"
          label={t("social.more")}
          onPress={async () => {
            try {
              const next = await call<FeedResponse>(
                "GET",
                `/api/social/feed?kind=${room.kind}&id=${room.id}&cursor=${encodeURIComponent(state.data!.nextCursor!)}`,
              );
              state.setData({
                items: [...state.data!.items, ...next.items],
                nextCursor: next.nextCursor,
              });
            } catch (e) {
              setFailure(
                e instanceof ApiFailure ? e : new ApiFailure("NETWORK"),
              );
            }
          }}
        />
      )}
      {(channel?.kind !== "TIMELINE" || channel.canPostTimeline) && <>
      <Field label={t("social.message")}>
        <Input
          value={body}
          onChangeText={setBody}
          multiline
          maxLength={4000}
          style={styles.composer}
          accessibilityLabel={t("social.message")}
        />
      </Field>
      {rules && (
        <>
          <Text variant="caption" tone="textMuted">
            {t("social.mediaHint", {
              seconds: rules.mediaMaxSeconds,
              mb: rules.mediaMaxMb,
            })}
          </Text>
          <Capture
            imageOnly={channel?.kind === "TIMELINE"}
            seconds={rules.mediaMaxSeconds}
            busy={busy}
            onCapture={(media) => void upload(media)}
            onError={() => setFailure(new ApiFailure("MEDIA_INVALID"))}
          />
        </>
      )}
      {attachment && (
        <>
          <Notice text={t("social.attachment")} />
          <Button
            variant="ghost"
            label={t("social.removeAttachment")}
            onPress={() => setAttachment(null)}
          />
        </>
      )}
      {failure && (
        <Notice tone="danger" text={t.loose(errorKey(failure.code))} />
      )}
      <Button
        label={t(channel?.kind === "TIMELINE" ? "social.post" : "social.send")}
        loading={busy}
        disabled={!body.trim() && !attachment}
        onPress={async () => {
          const data = {
            body,
            ...(room.kind === "channel"
              ? { channelId: room.id }
              : { conversationId: room.id }),
            ...(attachment
              ? { mediaKey: attachment.key, mediaType: attachment.mediaType }
              : {}),
          };
          if (channel?.kind === "TIMELINE") {
            if (await run("posts", data)) {
              setBody("");
              setAttachment(null);
            }
          } else {
            setBusy(true);
            try {
              await live.send(data);
              setBody("");
              setAttachment(null);
              setFailure(null);
              await state.reload();
            } catch (e) {
              setFailure(
                e instanceof ApiFailure ? e : new ApiFailure("NETWORK"),
              );
            } finally {
              setBusy(false);
            }
          }
        }}
      />
      </>}
    </Screen>
  );
}
function ChannelEditor({
  cityId,
  channel,
  onSaved,
}: {
  cityId: string;
  channel?: HubChannel;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const { call } = useAuth();
  const [name, setName] = useState(channel?.name ?? ""),
    [kind, setKind] = useState(channel?.kind ?? "CHAT"),
    [visibility, setVisibility] = useState(channel?.visibility ?? "MEMBERS"),
    [posting, setPosting] = useState(
      channel?.memberPosting == null
        ? "default"
        : channel.memberPosting
          ? "members"
          : "admins",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(archived: boolean) {
    setBusy(true);
    try {
      await call("POST", "/api/social/channels", {
        id: channel?.id,
        cityId,
        name,
        kind,
        visibility,
        memberPosting: posting === "default" ? null : posting === "members",
        archived,
      });
      onSaved();
    } catch (e) {
      setError(errorKey(e instanceof ApiFailure ? e.code : "INTERNAL"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card style={styles.card}>
      <Field label={t("social.channelName")}>
        <Input value={name} onChangeText={setName} maxLength={80} />
      </Field>
      {!channel && (
        <Choices
          label={t("social.kind")}
          options={["CHAT", "TIMELINE"].map((id) => ({
            id,
            name: t.loose(`social.${id}`),
          }))}
          value={kind}
          onChange={(v) => setKind(v as "CHAT" | "TIMELINE")}
        />
      )}
      <Choices
        label={t("social.visibility")}
        options={["MEMBERS", "ADMINS_ONLY"].map((id) => ({
          id,
          name: t.loose(`social.${id}`),
        }))}
        value={visibility}
        onChange={(v) => setVisibility(v as "MEMBERS" | "ADMINS_ONLY")}
      />
      <Choices
        label={t("social.posting")}
        options={[
          { id: "default", name: t("social.defaultPosting") },
          { id: "members", name: t("social.membersPosting") },
          { id: "admins", name: t("social.adminsPosting") },
        ]}
        value={posting}
        onChange={setPosting}
      />
      {error && <Notice tone="danger" text={t.loose(error)} />}
      <Button
        label={t("common.save")}
        loading={busy}
        onPress={() => void save(channel?.archived ?? false)}
      />
      {channel && (
        <Button
          variant="secondary"
          label={t(channel.archived ? "social.restore" : "social.archive")}
          onPress={() =>
            Alert.alert(t("social.archive"), channel.name, [
              { text: t("common.cancel"), style: "cancel" },
              {
                text: t("social.confirm"),
                onPress: () => void save(!channel.archived),
              },
            ])
          }
        />
      )}
    </Card>
  );
}
const styles = StyleSheet.create({
  card: { padding: space[4], gap: space[3] },
  group: { gap: space[2] },
  composer: {
    height: space[16] * 2,
    textAlignVertical: "top",
    paddingTop: space[3],
  },
});
