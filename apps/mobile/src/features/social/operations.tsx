import { useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { MessageCircle } from "lucide-react-native";
import {
  formatCount,
  formatDateTime,
  type EventListResponse,
  type ReservationOptions,
  type SocialOperations,
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
import { EmptyState } from "@/components/empty-state";
import { LoadError, Loading } from "@/components/load-state";
import { Notice } from "@/components/notice";
import { Choices } from "@/features/loyalty/ui";
import { radius, space, useColors } from "@/theme";

export function OperationsScreen() {
  const { t, locale } = useI18n();
  const { call, me } = useAuth();
  const state = useApi<SocialOperations>("/api/social/operations");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const admin = me?.user.role !== "MEMBER";
  function decide(action: string, body: unknown) {
    Alert.alert(t("social.review"), t("social.decisionBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("social.confirm"),
        onPress: () => {
          void (async () => {
            setBusy(true);
            try {
              await call("POST", `/api/social/${action}`, body);
              await state.reload();
              setError("");
            } catch (e) {
              setError(errorKey(e instanceof ApiFailure ? e.code : "INTERNAL"));
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  }
  return (
    <Screen
      title={t(admin ? "social.operations" : "social.reservations")}
      edges={[]}
      refreshing={state.refreshing}
      onRefresh={state.reload}
    >
      {error && <Notice tone="danger" text={t.loose(error)} />}
      {admin && (
        <Button
          variant="secondary"
          label={t("social.channels")}
          onPress={() => router.push("/social-hub")}
        />
      )}
      {state.loading ? (
        <Loading />
      ) : state.error ? (
        <LoadError error={state.error} onRetry={state.reload} />
      ) : (
        state.data && (
          <>
            <Text variant="title2">{t("social.reservations")}</Text>
            {!state.data.reservations.length && (
              <EmptyState
                icon={MessageCircle}
                title={t("social.noRequests")}
                body={t("social.noRequestsBody")}
              />
            )}
            {state.data.reservations.map((r) => (
              <Card key={r.id} style={styles.card}>
                <Text weight={600}>
                  {r.event.title} · {r.slotCode}
                </Text>
                <Text>
                  {r.member.fullName} · {formatCount(r.pax)} ·{" "}
                  {t.loose(`social.${r.status}`)}
                </Text>
                {r.note && <Text>{r.note}</Text>}
                {r.conversation && (
                  <Button
                    variant="secondary"
                    label={t("social.chat")}
                    onPress={() =>
                      router.push({
                        pathname: "/social-channel",
                        params: { conversationId: r.conversation!.id },
                      })
                    }
                  />
                )}
                {r.canDecide && r.status === "PENDING" && (
                  <>
                    <Button
                      disabled={busy}
                      label={t("social.confirm")}
                      onPress={() =>
                        decide("reservation-decision", {
                          id: r.id,
                          status: "CONFIRMED",
                        })
                      }
                    />
                    <Button
                      disabled={busy}
                      variant="secondary"
                      label={t("social.reject")}
                      onPress={() =>
                        decide("reservation-decision", {
                          id: r.id,
                          status: "REJECTED",
                        })
                      }
                    />
                  </>
                )}
                {(!admin || r.canDecide) &&
                  ["PENDING", "CONFIRMED"].includes(r.status) && (
                    <Button
                      disabled={busy}
                      variant="ghost"
                      label={t("social.cancelReservation")}
                      onPress={() =>
                        decide("reservation-decision", {
                          id: r.id,
                          status: "CANCELLED",
                        })
                      }
                    />
                  )}
              </Card>
            ))}
            <Text variant="title2">{t("social.roaming")}</Text>
            {!state.data.roaming.length && (
              <Text tone="textMuted">{t("social.noRequests")}</Text>
            )}
            {state.data.roaming.map((r) => (
              <Card key={r.id} style={styles.card}>
                <Text weight={600}>
                  {r.member.fullName} · {r.event.title}
                </Text>
                <Text>
                  {t.loose(`social.${r.type}`)} ·{" "}
                  {t.loose(`social.${r.status}`)}
                </Text>
                {r.accessExpiresAt && (
                  <Text tone="textMuted" variant="caption">
                    {t("social.expires", {
                      date: formatDateTime(new Date(r.accessExpiresAt), locale),
                    })}
                  </Text>
                )}
                {admin &&
                  r.status === "PENDING" &&
                  (r.type === "ATTENDANCE"
                    ? Boolean(me?.user.capabilities.includes("city.operations"))
                    : me?.user.role === "SUPER_ADMIN") && (
                    <>
                      <Button
                        disabled={busy}
                        label={t("social.approve")}
                        onPress={() =>
                          decide("roaming-decision", {
                            id: r.id,
                            decision: "APPROVED",
                          })
                        }
                      />
                      <Button
                        disabled={busy}
                        variant="secondary"
                        label={t("social.reject")}
                        onPress={() =>
                          decide("roaming-decision", {
                            id: r.id,
                            decision: "REJECTED",
                          })
                        }
                      />
                    </>
                  )}
              </Card>
            ))}
            {admin && (
              <>
                <Text variant="title2">{t("social.muted")}</Text>
                {!state.data.muted.length && (
                  <Text tone="textMuted">{t("social.noMuted")}</Text>
                )}
                {state.data.muted.map((m) => (
                  <Card style={styles.card} key={`${m.cityId}:${m.userId}`}>
                    <Text>{m.name}</Text>
                    <Button
                      label={t("social.unmute")}
                      disabled={busy}
                      onPress={() =>
                        decide("moderate", {
                          action: "mute",
                          cityId: m.cityId,
                          userId: m.userId,
                          muted: false,
                        })
                      }
                    />
                  </Card>
                ))}
                <Text variant="title2">{t("social.screenshots")}</Text>
                {!state.data.screenshots.length && (
                  <Text tone="textMuted">{t("social.noScreenshots")}</Text>
                )}
                {state.data.screenshots.map((s) => (
                  <Text key={s.memberId}>
                    {s.name} ·{" "}
                    {t("social.count", { count: formatCount(s.count) })}
                  </Text>
                ))}
              </>
            )}
          </>
        )
      )}
    </Screen>
  );
}
export function RoamingScreen() {
  const { t } = useI18n();
  const { call, me } = useAuth();
  const { eventId: initial } = useLocalSearchParams<{ eventId?: string }>();
  const events = useApi<EventListResponse>("/api/events?scope=all");
  const [eventId, setEventId] = useState(initial ?? ""),
    [type, setType] = useState("ATTENDANCE"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  return (
    <Screen
      title={t("social.roaming")}
      subtitle={t("social.roamingHint")}
      edges={[]}
    >
      {events.loading ? (
        <Loading />
      ) : events.error ? (
        <LoadError error={events.error} onRetry={events.reload} />
      ) : (
        <Choices
          label={t("social.event")}
          options={(events.data?.upcoming ?? [])
            .filter((e) => e.city.id !== me?.member?.city.id)
            .map((e) => ({ id: e.id, name: `${e.city.name} · ${e.title}` }))}
          value={eventId}
          onChange={setEventId}
        />
      )}
      <Choices
        label={t("social.kind")}
        options={["ATTENDANCE", "SOCIAL_HUB"].map((id) => ({
          id,
          name: t.loose(`social.${id}`),
        }))}
        value={type}
        onChange={setType}
      />
      {error && <Notice tone="danger" text={t.loose(error)} />}
      {saved && <Notice text={t("social.saved")} />}
      <Button
        label={t("social.requestRoaming")}
        loading={busy}
        disabled={!eventId}
        onPress={async () => {
          setBusy(true);
          setSaved(false);
          try {
            await call("POST", "/api/social/roaming", { eventId, type });
            setError("");
            setSaved(true);
          } catch (e) {
            setError(errorKey(e instanceof ApiFailure ? e.code : "INTERNAL"));
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button
        variant="secondary"
        label={t("social.review")}
        onPress={() => router.push("/social-operations")}
      />
    </Screen>
  );
}
export function ReservationScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { t } = useI18n();
  const { call } = useAuth();
  const c = useColors();
  const state = useApi<ReservationOptions>(
    `/api/social/slots?eventId=${eventId}`,
  );
  const [slotCode, setSlotCode] = useState(""),
    [pax, setPax] = useState("1"),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Screen
      title={t("social.reserve")}
      subtitle={t("social.floorHint")}
      edges={[]}
      refreshing={state.refreshing}
      onRefresh={state.reload}
    >
      {state.loading ? (
        <Loading />
      ) : state.error ? (
        <LoadError error={state.error} onRetry={state.reload} />
      ) : (
        state.data && (
          <>
            <Text variant="title2">{state.data.eventTitle}</Text>
            <Text>{state.data.venueName}</Text>
            {!state.data.slots.length ? (
              <EmptyState
                icon={MessageCircle}
                title={t("social.noSlots")}
                body={t("social.noSlotsBody")}
              />
            ) : (
              <>
                <View
                  style={[styles.plan, { backgroundColor: c.surfaceMuted }]}
                >
                  {state.data.slots.map((s) => {
                    const taken = state.data!.taken.includes(s.code);
                    return (
                      <Pressable
                        key={s.code}
                        accessibilityRole="button"
                        accessibilityLabel={`${s.code}, ${t.loose(`social.${s.kind}`)}, ${s.pax}${taken ? `, ${t("social.taken")}` : ""}`}
                        accessibilityState={{
                          selected: slotCode === s.code,
                          disabled: taken,
                        }}
                        disabled={taken}
                        onPress={() => {
                          setSlotCode(s.code);
                          setPax("1");
                        }}
                        style={[
                          styles.slot,
                          {
                            left: `${(s.x / 12) * 100}%`,
                            top: `${(s.y / 12) * 100}%`,
                            width: `${(s.w / 12) * 100}%`,
                            height: `${(s.h / 12) * 100}%`,
                            backgroundColor: taken
                              ? c.border
                              : slotCode === s.code
                                ? c.primary
                                : c.accentSubtle,
                            borderColor: c.borderStrong,
                          },
                        ]}
                      >
                        <Text
                          variant="caption"
                          style={{
                            color: slotCode === s.code ? c.primaryText : c.text,
                          }}
                        >
                          {s.code}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Choices
                  label={t("social.slot")}
                  options={state.data.slots
                    .filter((s) => !state.data!.taken.includes(s.code))
                    .map((s) => ({
                      id: s.code,
                      name: `${s.code} · ${t.loose(`social.${s.kind}`)} · ${formatCount(s.pax)}`,
                    }))}
                  value={slotCode}
                  onChange={setSlotCode}
                />
                {state.data.slots.find((s) => s.code === slotCode)
                  ?.minimumSpend && (
                  <Text tone="textMuted">
                    {t("social.minimumSpend")}:{" "}
                    {
                      state.data.slots.find((s) => s.code === slotCode)
                        ?.minimumSpend
                    }
                  </Text>
                )}
                <Field label={t("social.pax")}>
                  <Input
                    value={pax}
                    onChangeText={setPax}
                    keyboardType="number-pad"
                  />
                </Field>
                <Field label={t("social.note")}>
                  <Input value={note} onChangeText={setNote} maxLength={4000} />
                </Field>
                {error && <Notice tone="danger" text={t.loose(error)} />}
                <Button
                  loading={busy}
                  disabled={!slotCode}
                  label={t("social.reserve")}
                  onPress={async () => {
                    setBusy(true);
                    try {
                      const r = await call<{ conversationId: string }>(
                        "POST",
                        "/api/social/reserve",
                        { eventId, slotCode, pax: Number(pax), note },
                      );
                      router.replace({
                        pathname: "/social-channel",
                        params: { conversationId: r.conversationId },
                      });
                    } catch (e) {
                      setError(
                        errorKey(e instanceof ApiFailure ? e.code : "INTERNAL"),
                      );
                      await state.reload();
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </>
            )}
          </>
        )
      )}
    </Screen>
  );
}
const styles = StyleSheet.create({
  card: { padding: space[4], gap: space[3] },
  plan: { width: "100%", aspectRatio: 1, borderRadius: radius.control },
  slot: {
    position: "absolute",
    borderWidth: 1,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
});
