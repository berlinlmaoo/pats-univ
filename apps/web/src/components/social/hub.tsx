"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import {
  formatCount,
  formatDateTime,
  orderHubItems,
  type FeedResponse,
  type HubChannel,
  type HubResponse,
  type SocialOperations,
  type SocialRoom,
  type VenueSlot,
} from "@pats/shared";
import { useT } from "@/components/i18n/provider";
import { useLoyalty, DataState } from "@/components/loyalty/state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/dialog";
import { postJson } from "@/lib/client/api";
import { useRealtime } from "@/lib/client/realtime";

export default function HubPage() {
  const t = useT();
  const state = useLoyalty<HubResponse>("/api/social/hub");
  const [tab, setTab] = useState("channels");
  const [selected, setSelected] = useState<HubChannel | null>(null);
  const feedPanel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected && window.matchMedia("(max-width: 1023px)").matches)
      feedPanel.current?.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }, [selected]);
  return (
    <>
      <PageHeader
        title={t("social.title")}
        description={t("social.operationsBody")}
      />
      <div className="my-5 flex flex-wrap gap-2">
        {[
          "channels",
          "reservations",
          "roaming",
          "floorPlan",
          "screenshots",
        ].map((key) => (
          <Button
            key={key}
            variant={tab === key ? "primary" : "secondary"}
            onClick={() => setTab(key)}
          >
            {t.loose(`social.${key}`)}
          </Button>
        ))}
      </div>
      {!state.data ? (
        <DataState error={state.error} reload={state.reload} />
      ) : tab === "channels" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <ChannelForm hub={state.data} onSaved={state.reload} />
            {state.data.channels.map((channel) => (
              <Card key={channel.id} className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">{channel.name}</h2>
                    <p className="text-caption text-muted">
                      {
                        state.data!.cities.find((c) => c.id === channel.cityId)
                          ?.name
                      }{" "}
                      · {t.loose(`social.${channel.kind}`)}
                      {channel.archived ? ` · ${t("social.archived")}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => setSelected(channel)}
                  >
                    {t("social.openChannel")}
                  </Button>
                </div>
                <ChannelForm
                  hub={state.data!}
                  channel={channel}
                  onSaved={state.reload}
                />
              </Card>
            ))}
          </div>
          {selected ? (
            <div ref={feedPanel} className="min-w-0 scroll-mt-16">
              <Feed
                key={selected.id}
                room={{ kind: "channel", id: selected.id }}
                channel={selected}
              />
            </div>
          ) : (
            <EmptyState
              icon={MessageCircle}
              title={t("social.channels")}
              body={t("social.emptyBody")}
            />
          )}
        </div>
      ) : (
        <Operations tab={tab} />
      )}
    </>
  );
}
function ChannelForm({
  hub,
  channel,
  onSaved,
}: {
  hub: HubResponse;
  channel?: HubChannel;
  onSaved: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(!channel);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open)
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {t("common.edit")}
      </Button>
    );
  return (
    <Card className="p-4">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          const result = await postJson("/api/social/channels", {
            id: channel?.id,
            name: f.get("name"),
            cityId: f.get("city"),
            kind: f.get("kind"),
            visibility: f.get("visibility"),
            memberPosting:
              f.get("posting") === "default"
                ? null
                : f.get("posting") === "members",
            archived: f.get("archived") === "on",
          });
          setBusy(false);
          if (!result.ok) setError(result.error.messageKey);
          else {
            onSaved();
            if (channel) setOpen(false);
          }
        }}
      >
        <h2 className="text-title3">
          {channel ? t("common.edit") : t("social.newChannel")}
        </h2>
        <Field htmlFor={`name-${channel?.id}`} label={t("social.channelName")}>
          <Input
            id={`name-${channel?.id}`}
            name="name"
            required
            maxLength={80}
            defaultValue={channel?.name}
          />
        </Field>
        <Field htmlFor={`city-${channel?.id}`} label={t("social.city")}>
          <Select
            id={`city-${channel?.id}`}
            name="city"
            defaultValue={channel?.cityId}
          >
            {hub.cities
              .filter((c) => !channel || c.id === channel.cityId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field htmlFor={`kind-${channel?.id}`} label={t("social.kind")}>
          <Select
            id={`kind-${channel?.id}`}
            name="kind"
            defaultValue={channel?.kind}
          >
            {["TIMELINE", "CHAT"]
              .filter((k) => !channel || k === channel.kind)
              .map((k) => (
                <option key={k} value={k}>
                  {t.loose(`social.${k}`)}
                </option>
              ))}
          </Select>
        </Field>
        <Field
          htmlFor={`visibility-${channel?.id}`}
          label={t("social.visibility")}
        >
          <Select
            id={`visibility-${channel?.id}`}
            name="visibility"
            defaultValue={channel?.visibility}
          >
            {["MEMBERS", "ADMINS_ONLY"].map((k) => (
              <option key={k} value={k}>
                {t.loose(`social.${k}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field htmlFor={`posting-${channel?.id}`} label={t("social.posting")}>
          <Select
            id={`posting-${channel?.id}`}
            name="posting"
            defaultValue={
              channel?.memberPosting == null
                ? "default"
                : channel.memberPosting
                  ? "members"
                  : "admins"
            }
          >
            <option value="default">{t("social.defaultPosting")}</option>
            <option value="members">{t("social.membersPosting")}</option>
            <option value="admins">{t("social.adminsPosting")}</option>
          </Select>
        </Field>
        {channel && (
          <label className="flex gap-2 text-body-sm">
            <input
              type="checkbox"
              name="archived"
              defaultChecked={channel.archived}
            />
            {t("social.archive")}
          </label>
        )}
        {error && (
          <p role="alert" className="text-danger-fg">
            {t.loose(error)}
          </p>
        )}
        <Button loading={busy} type="submit">
          {t("common.save")}
        </Button>
      </form>
    </Card>
  );
}
export function Feed({
  room,
  channel,
}: {
  room: SocialRoom;
  channel?: HubChannel;
}) {
  const t = useT();
  const state = useLoyalty<FeedResponse>(
    `/api/social/feed?kind=${room.kind}&id=${room.id}`,
  );
  const [body, setBody] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [lost, setLost] = useState(false);
  const [confirm, setConfirm] = useState<{
    body: unknown;
    title: string;
  } | null>(null);
  const live = useRealtime(room, state.reload, () => setLost(true));
  async function mutate(action: string, data: unknown) {
    setBusy(true);
    const r = await postJson(`/api/social/${action}`, data);
    setBusy(false);
    if (!r.ok) setError(r.error.messageKey);
    else {
      setError("");
      await state.reload();
    }
    return r.ok;
  }
  if (lost || state.error === "errors.forbidden")
    return <p className="text-muted">{t("social.accessLost")}</p>;
  return (
    <Card className="space-y-4 self-start p-4">
      <div>
        <h2 className="text-title3">{channel?.name ?? t("social.chat")}</h2>
        <p className="text-caption text-muted">
          {t(live ? "social.live" : "social.offline")}
        </p>
      </div>
      {!state.data ? (
        <DataState error={state.error} reload={state.reload} />
      ) : !state.data.items.length ? (
        <EmptyState
          icon={MessageCircle}
          title={t("social.emptyTitle")}
          body={t("social.emptyBody")}
        />
      ) : (
        orderHubItems(state.data.items, channel?.kind === "TIMELINE").map(
          (item) => (
            <article
              key={item.id}
              className="space-y-2 border-b border-border pb-4"
            >
              <div className="text-caption text-muted">
                {item.author.name} ·{" "}
                {formatDateTime(new Date(item.createdAt), t.locale)}
                {item.pinned ? ` · ${t("social.pinned")}` : ""}
              </div>
              <p className="whitespace-pre-wrap break-words text-body">
                {item.body}
              </p>
              {item.mediaUrl &&
                (item.mediaType === "IMAGE" ? (
                  <Image
                    src={item.mediaUrl}
                    alt={t("social.photo")}
                    width={640}
                    height={480}
                    unoptimized
                    className="h-auto w-full rounded-control object-contain"
                  />
                ) : item.mediaType === "VOICE" ? (
                  <audio controls src={item.mediaUrl} className="w-full" />
                ) : (
                  <video
                    controls
                    src={item.mediaUrl}
                    className="w-full rounded-control"
                  />
                ))}
              {channel && (
                <div className="flex flex-wrap gap-1">
                  {channel.kind === "TIMELINE" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void mutate("moderate", {
                          action: "pin",
                          id: item.id,
                          pinned: !item.pinned,
                        })
                      }
                    >
                      {t(item.pinned ? "social.unpin" : "social.pin")}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setConfirm({
                        title: t("social.delete"),
                        body: {
                          action:
                            channel.kind === "TIMELINE"
                              ? "deletePost"
                              : "deleteMessage",
                          id: item.id,
                        },
                      })
                    }
                  >
                    {t("social.delete")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setConfirm({
                        title: t("social.mute"),
                        body: {
                          action: "mute",
                          cityId: channel.cityId,
                          userId: item.author.id,
                          muted: true,
                        },
                      })
                    }
                  >
                    {t("social.mute")}
                  </Button>
                </div>
              )}
            </article>
          ),
        )
      )}
      {state.data?.nextCursor && (
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              const res = await fetch(
                `/api/social/feed?kind=${room.kind}&id=${room.id}&cursor=${encodeURIComponent(state.data!.nextCursor!)}`,
              );
              if (!res.ok) throw new Error();
              const next: FeedResponse = await res.json();
              state.setData({
                items: [...state.data!.items, ...next.items],
                nextCursor: next.nextCursor,
              });
            } catch {
              setError("errors.network");
            }
          }}
        >
          {t("social.more")}
        </Button>
      )}
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await mutate(channel?.kind === "TIMELINE" ? "posts" : "messages", {
              body,
              ...(room.kind === "channel"
                ? { channelId: room.id }
                : { conversationId: room.id }),
            })
          )
            setBody("");
        }}
      >
        <Field htmlFor={`message-${room.id}`} label={t("social.message")}>
          <Textarea
            id={`message-${room.id}`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            maxLength={4000}
          />
        </Field>
        {error && (
          <p role="alert" className="text-danger-fg">
            {t.loose(error)}
          </p>
        )}
        <Button type="submit" loading={busy}>
          {t("social.send")}
        </Button>
      </form>
      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={confirm?.title ?? ""}
        body={t("social.deleteBody")}
        confirmLabel={confirm?.title ?? ""}
        destructive
        busy={busy}
        onConfirm={() => {
          void mutate("moderate", confirm?.body).then((ok) => {
            if (ok) setConfirm(null);
          });
        }}
      />
    </Card>
  );
}
function Operations({ tab }: { tab: string }) {
  const t = useT();
  const state = useLoyalty<SocialOperations>("/api/social/operations");
  const [conversation, setConversation] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState<{
    action: string;
    body: unknown;
  } | null>(null);
  if (!state.data)
    return <DataState error={state.error} reload={state.reload} />;
  const data = state.data;
  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-danger-fg">
          {t.loose(error)}
        </p>
      )}
      {tab === "floorPlan" ? (
        data.venues.map((v) => <LayoutEditor key={v.id} venue={v} />)
      ) : tab === "screenshots" ? (
        <>
          <Card className="space-y-3 p-4">
            <h2 className="text-title3">{t("social.screenshots")}</h2>
            {!data.screenshots.length && <p>{t("social.noScreenshots")}</p>}
            {data.screenshots.map((s) => (
              <p key={s.memberId}>
                {s.name} · {t("social.count", { count: formatCount(s.count) })}
              </p>
            ))}
          </Card>
          <Card className="space-y-3 p-4">
            <h2 className="text-title3">{t("social.muted")}</h2>
            {!data.muted.length && <p>{t("social.noMuted")}</p>}
            {data.muted.map((m) => (
              <div
                key={`${m.cityId}:${m.userId}`}
                className="flex flex-wrap justify-between gap-2"
              >
                <span>{m.name}</span>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setDecision({
                      action: "moderate",
                      body: {
                        action: "mute",
                        cityId: m.cityId,
                        userId: m.userId,
                        muted: false,
                      },
                    })
                  }
                >
                  {t("social.unmute")}
                </Button>
              </div>
            ))}
          </Card>
        </>
      ) : (
        <>
          {!(tab === "reservations" ? data.reservations : data.roaming)
            .length && (
            <EmptyState
              icon={MessageCircle}
              title={t("social.noRequests")}
              body={t("social.noRequestsBody")}
            />
          )}
          {tab === "reservations"
            ? data.reservations.map((r) => (
                <Card key={r.id} className="space-y-3 p-4">
                  <h2 className="font-semibold">
                    {r.event.title} · {r.slotCode}
                  </h2>
                  <p>
                    {r.member.fullName} · {formatCount(r.pax)} ·{" "}
                    {t.loose(`social.${r.status}`)}
                  </p>
                  {r.note && <p>{r.note}</p>}
                  <div className="flex flex-wrap gap-2">
                    {r.canDecide &&
                      r.status === "PENDING" &&
                      ["CONFIRMED", "REJECTED"].map((status) => (
                        <Button
                          key={status}
                          variant="secondary"
                          onClick={() =>
                            setDecision({
                              action: "reservation-decision",
                              body: { id: r.id, status },
                            })
                          }
                        >
                          {t(
                            status === "CONFIRMED"
                              ? "social.confirm"
                              : "social.reject",
                          )}
                        </Button>
                      ))}
                    {r.conversation && (
                      <Button
                        variant="ghost"
                        onClick={() => setConversation(r.conversation!.id)}
                      >
                        {t("social.chat")}
                      </Button>
                    )}
                  </div>
                </Card>
              ))
            : data.roaming.map((r) => (
                <Card key={r.id} className="space-y-3 p-4">
                  <h2 className="font-semibold">
                    {r.member.fullName} · {r.event.title}
                  </h2>
                  <p>
                    {t.loose(`social.${r.type}`)} ·{" "}
                    {t.loose(`social.${r.status}`)}
                  </p>
                  {r.accessExpiresAt && (
                    <p className="text-caption text-muted">
                      {t("social.expires", {
                        date: formatDateTime(
                          new Date(r.accessExpiresAt),
                          t.locale,
                        ),
                      })}
                    </p>
                  )}
                  {r.status === "PENDING" && r.type === "SOCIAL_HUB" && (
                    <div className="flex gap-2">
                      {["APPROVED", "REJECTED"].map((value) => (
                        <Button
                          key={value}
                          variant="secondary"
                          onClick={() =>
                            setDecision({
                              action: "roaming-decision",
                              body: { id: r.id, decision: value },
                            })
                          }
                        >
                          {t(
                            value === "APPROVED"
                              ? "social.approve"
                              : "social.reject",
                          )}
                        </Button>
                      ))}
                    </div>
                  )}
                </Card>
              ))}
          {conversation && (
            <Feed
              key={conversation}
              room={{ kind: "conversation", id: conversation }}
            />
          )}
        </>
      )}
      <ConfirmDialog
        open={Boolean(decision)}
        onClose={() => setDecision(null)}
        title={t("social.review")}
        body={t("social.decisionBody")}
        confirmLabel={t("social.confirm")}
        busy={busy}
        onConfirm={async () => {
          if (!decision) return;
          setBusy(true);
          const r = await postJson(
            `/api/social/${decision.action}`,
            decision.body,
          );
          setBusy(false);
          if (r.ok) {
            setDecision(null);
            await state.reload();
          } else setError(r.error.messageKey);
        }}
      />
    </div>
  );
}
function LayoutEditor({
  venue,
}: {
  venue: SocialOperations["venues"][number];
}) {
  const t = useT();
  const [slots, setSlots] = useState<VenueSlot[]>(venue.layout.slots),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  const update = (index: number, key: keyof VenueSlot, value: string) =>
    setSlots((old) =>
      old.map((s, i) =>
        i === index
          ? {
              ...s,
              [key]: ["code", "kind", "minimumSpend"].includes(key)
                ? value
                : Number(value),
            }
          : s,
      ),
    );
  return (
    <Card className="space-y-4 p-5">
      <h2 className="text-title3">{venue.name}</h2>
      <p className="text-caption text-muted">{t("social.layoutHint")}</p>
      <div className="grid aspect-square w-full max-w-md grid-cols-12 grid-rows-12 gap-1 rounded-control bg-surface-muted p-2">
        {slots.map((s, i) => (
          <div
            key={i}
            className="flex items-center justify-center overflow-hidden rounded-sm bg-accent-subtle text-caption text-accent-subtle-fg"
            style={{
              gridColumn: `${s.x + 1} / span ${s.w}`,
              gridRow: `${s.y + 1} / span ${s.h}`,
            }}
          >
            {s.code}
          </div>
        ))}
      </div>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setSaved(false);
          const r = await postJson("/api/social/layout", {
            venueId: venue.id,
            layout: { slots },
          });
          setBusy(false);
          setError(r.ok ? "" : r.error.messageKey);
          setSaved(r.ok);
        }}
      >
        {slots.map((s, i) => (
          <fieldset
            key={i}
            className="grid grid-cols-2 gap-3 rounded-control border border-border p-3 sm:grid-cols-4"
          >
            <legend className="px-2 text-caption">
              {s.code || t("social.slot")}
            </legend>
            {(
              [
                "code",
                "kind",
                "x",
                "y",
                "w",
                "h",
                "pax",
                "minimumSpend",
              ] as const
            ).map((key) => (
              <Field
                key={key}
                htmlFor={`${venue.id}-${i}-${key}`}
                label={t.loose(
                  `social.${({ code: "slotCode", kind: "kind", w: "width", h: "height" } as Record<string, string>)[key] ?? key}`,
                )}
              >
                {key === "kind" ? (
                  <Select
                    id={`${venue.id}-${i}-${key}`}
                    value={s.kind}
                    onChange={(e) => update(i, key, e.target.value)}
                  >
                    {["SOFA", "TABLE"].map((k) => (
                      <option key={k} value={k}>
                        {t.loose(`social.${k}`)}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    id={`${venue.id}-${i}-${key}`}
                    value={s[key] ?? ""}
                    type={
                      ["code", "minimumSpend"].includes(key) ? "text" : "number"
                    }
                    min={["x", "y"].includes(key) ? 0 : 1}
                    onChange={(e) => update(i, key, e.target.value)}
                    required={key !== "minimumSpend"}
                  />
                )}
              </Field>
            ))}
            <Button
              variant="ghost"
              onClick={() => setSlots(slots.filter((_, n) => n !== i))}
            >
              {t("social.removeSlot")}
            </Button>
          </fieldset>
        ))}
        {error && (
          <p role="alert" className="text-danger-fg">
            {t.loose(error)}
          </p>
        )}
        {saved && (
          <p role="status" className="text-success-fg">
            {t("social.saved")}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              setSlots([
                ...slots,
                {
                  code: `S${slots.length + 1}`,
                  kind: "SOFA",
                  x: 0,
                  y: 0,
                  w: 2,
                  h: 2,
                  pax: 4,
                },
              ])
            }
          >
            {t("social.addSlot")}
          </Button>
          <Button type="submit" loading={busy}>
            {t("common.save")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
