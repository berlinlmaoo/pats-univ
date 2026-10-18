"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Camera, Heart, MessageCircle, Pencil, Pin, PinOff, Plus, Trash2, VolumeX } from "lucide-react";
import {
  formatCount,
  formatDateTime,
  formatRupiah,
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
import { Table, Td, Th, Tr } from "@/components/dashboard/table";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { RupiahInput } from "@/components/ui/rupiah-input";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Tabs } from "@/components/ui/tabs";
import { postJson } from "@/lib/client/api";
import { useRealtime } from "@/lib/client/realtime";
import { cn } from "@/lib/cn";

const HUB_TABS = ["channels", "reservations", "roaming", "floorPlan", "screenshots"] as const;

/** Request and reservation statuses as badges (DESIGN.md §2: status colour is meaning). */
const STATUS_TONE: Record<string, BadgeTone> = {
  PENDING: "warning",
  CONFIRMED: "success",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
  EXPIRED: "neutral",
};

export default function HubPage() {
  const t = useT();
  const state = useLoyalty<HubResponse>("/api/social/hub");
  const [tab, setTab] = useState<string>("channels");
  const [selected, setSelected] = useState<HubChannel | null>(null);
  const [editing, setEditing] = useState<HubChannel | "new" | null>(null);
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
  const cityName = (id: string) => state.data?.cities.find((c) => c.id === id)?.name ?? "";
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("social.title")}
        description={t("social.operationsBody")}
        actions={
          state.data ? (
            <Button onClick={() => setEditing("new")}>
              <Plus aria-hidden="true" />
              {t("social.newChannel")}
            </Button>
          ) : undefined
        }
      />
      <Tabs
        label={t("social.title")}
        active={tab}
        onChange={setTab}
        items={HUB_TABS.map((key) => ({ value: key, label: t.loose(`social.${key}`) }))}
      />
      {!state.data ? (
        <DataState error={state.error} reload={state.reload} />
      ) : tab === "channels" ? (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <Card className="overflow-hidden">
            <CardHeader title={t("social.channels")} className="pb-3" />
            {!state.data.channels.length ? (
              <EmptyState
                icon={MessageCircle}
                title={t("social.noChannels")}
                body={t("social.noChannelsAdmin")}
                action={<Button onClick={() => setEditing("new")}>{t("social.newChannel")}</Button>}
              />
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {state.data.channels.map((channel) => {
                  const active = selected?.id === channel.id;
                  const editable = channel.kind !== "TIMELINE" || channel.canPostTimeline;
                  return (
                    <li key={channel.id} className={cn("flex items-center gap-2 pr-3 transition-colors", active ? "bg-accent-subtle" : "hover:bg-surface-hover")}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSelected(channel)}
                        className="min-w-0 flex-1 py-3 pl-5 text-left"
                      >
                        <span className={cn("block truncate text-body-sm font-bold", active ? "text-accent-subtle-fg" : "text-fg")}>{channel.name}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-caption text-muted">
                          <span>{cityName(channel.cityId)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{t.loose(`social.${channel.kind}`)}</span>
                          {channel.visibility === "ADMINS_ONLY" && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{t("social.ADMINS_ONLY")}</span>
                            </>
                          )}
                        </span>
                      </button>
                      {channel.archived && <Badge>{t("social.archived")}</Badge>}
                      {editable && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-control-sm shrink-0 px-0"
                          aria-label={`${t("social.editChannel")}: ${channel.name}`}
                          onClick={() => setEditing(channel)}
                        >
                          <Pencil aria-hidden="true" />
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <div ref={feedPanel} className="min-w-0 scroll-mt-16">
            {selected ? (
              <Feed key={selected.id} room={{ kind: "channel", id: selected.id }} channel={selected} />
            ) : (
              <Card>
                <EmptyState icon={MessageCircle} title={t("social.pickChannel")} body={t("social.pickChannelBody")} />
              </Card>
            )}
          </div>
        </div>
      ) : (
        <Operations tab={tab} />
      )}
      {editing && state.data && (
        <ChannelDialog
          key={editing === "new" ? "new" : editing.id}
          hub={state.data}
          channel={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void state.reload();
          }}
        />
      )}
    </div>
  );
}

function ChannelDialog({
  hub,
  channel,
  onClose,
  onSaved,
}: {
  hub: HubResponse;
  channel?: HubChannel;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const formId = `channel-form-${channel?.id ?? "new"}`;
  const fid = (key: string) => `${key}-${channel?.id ?? "new"}`;
  return (
    <Dialog
      open
      onClose={onClose}
      title={channel ? t("social.editChannel") : t("social.newChannel")}
      description={channel ? channel.name : t("social.newChannelBody")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form={formId} loading={busy}>
            {channel ? t("common.save") : t("social.createChannel")}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-4 pb-2"
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
              f.get("posting") === "default" ? null : f.get("posting") === "members",
            archived: f.get("archived") === "on",
          });
          setBusy(false);
          if (!result.ok) setError(result.error.messageKey);
          else onSaved();
        }}
      >
        <Field htmlFor={fid("name")} label={t("social.channelName")}>
          <Input id={fid("name")} name="name" required maxLength={80} defaultValue={channel?.name} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field htmlFor={fid("city")} label={t("social.city")}>
            <Select id={fid("city")} name="city" defaultValue={channel?.cityId ?? ""} required disabled={Boolean(channel)}>
              {!channel && (
                <option value="" disabled>
                  {t("social.chooseCity")}
                </option>
              )}
              {hub.cities
                .filter((c) => !channel || c.id === channel.cityId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
            {channel && <input type="hidden" name="city" value={channel.cityId} />}
          </Field>
          <Field htmlFor={fid("kind")} label={t("social.kind")}>
            <Select id={fid("kind")} name="kind" defaultValue={channel?.kind ?? "CHAT"} disabled={Boolean(channel)}>
              {["CHAT", "TIMELINE"]
                .filter((k) => !channel || k === channel.kind)
                .map((k) => (
                  <option key={k} value={k}>
                    {t.loose(`social.${k}`)}
                  </option>
                ))}
            </Select>
            {channel && <input type="hidden" name="kind" value={channel.kind} />}
          </Field>
          <Field htmlFor={fid("visibility")} label={t("social.visibility")}>
            <Select id={fid("visibility")} name="visibility" defaultValue={channel?.visibility ?? "MEMBERS"}>
              {["MEMBERS", "ADMINS_ONLY"].map((k) => (
                <option key={k} value={k}>
                  {t.loose(`social.${k}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field htmlFor={fid("posting")} label={t("social.posting")}>
            <Select
              id={fid("posting")}
              name="posting"
              defaultValue={channel?.memberPosting == null ? "default" : channel.memberPosting ? "members" : "admins"}
            >
              <option value="default">{t("social.defaultPosting")}</option>
              <option value="members">{t("social.membersPosting")}</option>
              <option value="admins">{t("social.adminsPosting")}</option>
            </Select>
          </Field>
        </div>
        {channel && (
          <Switch
            id={fid("archived")}
            name="archived"
            onValue="on"
            offValue={null}
            defaultChecked={channel.archived}
            label={t("social.archive")}
            description={t("social.archiveHint")}
          />
        )}
        {error && (
          <p role="alert" className="text-body-sm text-danger-fg">
            {t.loose(error)}
          </p>
        )}
      </form>
    </Dialog>
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
    <Card className="space-y-4 self-start p-5">
      <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
        <h2 className="min-w-0 break-words text-title3 text-fg">{channel?.name ?? t("social.chat")}</h2>
        <Badge tone={live ? "success" : "warning"} dot>
          {t(live ? "social.liveShort" : "social.offlineShort")}
        </Badge>
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
                // One aligned row: the like count on the left (a real toggle), moderation on the right.
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  {channel.kind === "TIMELINE" ? (
                    <button
                      type="button"
                      aria-pressed={Boolean(item.reacted)}
                      onClick={() => void mutate("react", { postId: item.id, active: !item.reacted })}
                      className={cn(
                        "inline-flex h-control-sm items-center gap-1.5 rounded-control px-1.5 text-caption tabular-nums transition-colors hover:bg-surface-hover",
                        item.reacted ? "font-bold text-fg" : "text-muted",
                      )}
                    >
                      <Heart className={cn("size-4", item.reacted && "fill-current")} aria-hidden="true" />
                      {t.loose(item.reacted ? "phase5.reacted" : "phase5.react")} · {formatCount(item.reactionCount ?? 0)}
                    </button>
                  ) : (
                    <span />
                  )}
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {channel.kind === "TIMELINE" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void mutate("moderate", { action: "pin", id: item.id, pinned: !item.pinned })}
                      >
                        {item.pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}
                        {t(item.pinned ? "social.unpin" : "social.pin")}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setConfirm({
                          title: t("social.mute"),
                          body: { action: "mute", cityId: channel.cityId, userId: item.author.id, muted: true },
                        })
                      }
                    >
                      <VolumeX aria-hidden="true" />
                      {t("social.mute")}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="text-danger-fg hover:border-danger hover:bg-danger-subtle"
                      onClick={() =>
                        setConfirm({
                          title: t("social.delete"),
                          body: { action: channel.kind === "TIMELINE" ? "deletePost" : "deleteMessage", id: item.id },
                        })
                      }
                    >
                      <Trash2 aria-hidden="true" />
                      {t("social.delete")}
                    </Button>
                  </div>
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
    label: string;
    destructive?: boolean;
  } | null>(null);
  if (!state.data)
    return <DataState error={state.error} reload={state.reload} />;
  const data = state.data;
  const list = tab === "reservations" ? data.reservations : data.roaming;
  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="text-body-sm text-danger-fg">
          {t.loose(error)}
        </p>
      )}
      {tab === "floorPlan" ? (
        !data.venues.length ? (
          <Card>
            <EmptyState icon={MessageCircle} title={t("social.noSlots")} body={t("social.noVenuesAdmin")} />
          </Card>
        ) : (
          data.venues.map((v) => <LayoutEditor key={v.id} venue={v} />)
        )
      ) : tab === "screenshots" ? (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Card className="overflow-hidden">
            <CardHeader title={t("social.screenshots")} description={t("social.secureHint")} className="pb-4" />
            {!data.screenshots.length ? (
              <EmptyState icon={Camera} title={t("social.noScreenshots")} body={t("social.noScreenshotsBody")} />
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {data.screenshots.map((s) => (
                  <li key={s.memberId} className="flex items-center justify-between gap-3 px-5 py-3 text-body-sm">
                    <span className="min-w-0 truncate font-semibold text-fg">{s.name}</span>
                    <Badge tone="warning">{t("social.count", { count: formatCount(s.count) })}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title={t("social.muted")} description={t("social.muteBody")} className="pb-4" />
            {!data.muted.length ? (
              <EmptyState icon={VolumeX} title={t("social.noMuted")} body={t("social.noMutedBody")} />
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {data.muted.map((m) => (
                  <li key={`${m.cityId}:${m.userId}`} className="flex items-center justify-between gap-3 px-5 py-3">
                    <span className="min-w-0 truncate text-body-sm font-semibold text-fg">{m.name}</span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setDecision({
                          action: "moderate",
                          label: t("social.unmute"),
                          body: { action: "mute", cityId: m.cityId, userId: m.userId, muted: false },
                        })
                      }
                    >
                      {t("social.unmute")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : !list.length ? (
        <Card>
          <EmptyState
            icon={MessageCircle}
            title={t("social.noRequests")}
            body={t(tab === "reservations" ? "social.noReservationsBody" : "social.noRoamingBody")}
          />
        </Card>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {tab === "reservations"
            ? data.reservations.map((r) => (
                <Card key={r.id} className="flex flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="break-words text-title3 text-fg">{r.member.fullName}</h2>
                      <p className="mt-0.5 break-words text-body-sm text-muted">
                        {r.event.title} · <span className="font-semibold text-fg">{r.slotCode}</span> ·{" "}
                        {t("social.paxCount", { count: formatCount(r.pax) })}
                      </p>
                    </div>
                    <Badge tone={STATUS_TONE[r.status] ?? "neutral"} dot>
                      {t.loose(`social.${r.status}`)}
                    </Badge>
                  </div>
                  {r.note && <p className="break-words rounded-control bg-surface-muted px-3 py-2 text-body-sm text-fg">{r.note}</p>}
                  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
                    {r.conversation && (
                      <Button variant="ghost" size="sm" onClick={() => setConversation(r.conversation!.id)}>
                        <MessageCircle aria-hidden="true" />
                        {t("social.chat")}
                      </Button>
                    )}
                    {r.canDecide && r.status === "PENDING" && (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            setDecision({
                              action: "reservation-decision",
                              label: t("social.reject"),
                              destructive: true,
                              body: { id: r.id, status: "REJECTED" },
                            })
                          }
                        >
                          {t("social.reject")}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            setDecision({
                              action: "reservation-decision",
                              label: t("social.confirm"),
                              body: { id: r.id, status: "CONFIRMED" },
                            })
                          }
                        >
                          {t("social.confirm")}
                        </Button>
                      </>
                    )}
                  </div>
                </Card>
              ))
            : data.roaming.map((r) => (
                <Card key={r.id} className="flex flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="break-words text-title3 text-fg">{r.member.fullName}</h2>
                      <p className="mt-0.5 break-words text-body-sm text-muted">
                        {t.loose(`social.${r.type}`)} · {r.event.title}
                      </p>
                    </div>
                    <Badge tone={STATUS_TONE[r.status] ?? "neutral"} dot>
                      {t.loose(`social.${r.status}`)}
                    </Badge>
                  </div>
                  {r.accessExpiresAt && (
                    <p className="text-caption text-muted">
                      {t("social.expires", { date: formatDateTime(new Date(r.accessExpiresAt), t.locale) })}
                    </p>
                  )}
                  {r.status === "PENDING" && r.type === "SOCIAL_HUB" && (
                    <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          setDecision({
                            action: "roaming-decision",
                            label: t("social.reject"),
                            destructive: true,
                            body: { id: r.id, decision: "REJECTED" },
                          })
                        }
                      >
                        {t("social.reject")}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          setDecision({
                            action: "roaming-decision",
                            label: t("social.approve"),
                            body: { id: r.id, decision: "APPROVED" },
                          })
                        }
                      >
                        {t("social.approve")}
                      </Button>
                    </div>
                  )}
                </Card>
              ))}
        </div>
      )}
      {conversation && <Feed key={conversation} room={{ kind: "conversation", id: conversation }} />}
      <ConfirmDialog
        open={Boolean(decision)}
        onClose={() => setDecision(null)}
        title={decision?.label ?? t("social.review")}
        body={t("social.decisionBody")}
        confirmLabel={decision?.label ?? t("social.confirm")}
        destructive={decision?.destructive}
        busy={busy}
        onConfirm={async () => {
          if (!decision) return;
          setBusy(true);
          const r = await postJson(`/api/social/${decision.action}`, decision.body);
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

const GRID = 12;

/** Rows the floor-plan preview shows: the plan's last used row, at least 4, at most the grid. */
function previewRows(slots: VenueSlot[]): number {
  return Math.min(GRID, Math.max(4, ...slots.map((s) => s.y + s.h)));
}
const NEW_SLOT: VenueSlot = { code: "", kind: "SOFA", x: 0, y: 0, w: 2, h: 2, pax: 4 };

function LayoutEditor({ venue }: { venue: SocialOperations["venues"][number] }) {
  const t = useT();
  const [minimumCharge, setMinimumCharge] = useState(String(venue.minimumCharge));
  const [slots, setSlots] = useState<VenueSlot[]>(venue.layout.slots),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState<{ index: number | null; slot: VenueSlot } | null>(null);
  const dirty = () => setSaved(false);
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={venue.name}
        description={venue.cityName ? `${venue.cityName} · ${t("social.layoutHint")}` : t("social.layoutHint")}
        className="pb-4"
      />
      <div className="grid gap-6 border-t border-border p-5 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="ktm-label mb-2 text-muted">{t("social.preview")}</p>
          {/* Only the rows the plan uses (at least 4), so the preview is sized to its content. */}
          <div
            className="grid w-full max-w-sm gap-1 rounded-control border border-border bg-surface-muted p-1.5"
            style={{ gridTemplateColumns: `repeat(${GRID}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${previewRows(slots)}, minmax(0, 1fr))`, aspectRatio: `${GRID} / ${previewRows(slots)}` }}
          >
            {slots.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setEditing({ index: i, slot: s })}
                aria-label={`${t("social.editSlot")}: ${s.code}`}
                className={cn(
                  "flex min-w-0 flex-col items-center justify-center overflow-hidden rounded-sm border px-0.5 text-center leading-tight transition-colors",
                  s.kind === "SOFA"
                    ? "border-secondary/40 bg-secondary-subtle text-secondary-subtle-fg hover:border-secondary"
                    : "border-accent/40 bg-accent-subtle text-accent-subtle-fg hover:border-accent",
                )}
                style={{ gridColumn: `${s.x + 1} / span ${s.w}`, gridRow: `${s.y + 1} / span ${s.h}` }}
              >
                <span className="max-w-full truncate text-caption font-black">{s.code}</span>
                {s.h > 1 && <span className="max-w-full truncate text-[11px]">{t("social.paxShort", { count: s.pax })}</span>}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-caption text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-sm border border-secondary/40 bg-secondary-subtle" aria-hidden="true" />
              {t("social.SOFA")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-sm border border-accent/40 bg-accent-subtle" aria-hidden="true" />
              {t("social.TABLE")}
            </span>
          </div>
        </div>
        <form
          className="flex min-w-0 flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setSaved(false);
            const r = await postJson("/api/social/layout", {
              venueId: venue.id,
              layout: { slots },
              minimumCharge: Number(minimumCharge || 0),
            });
            setBusy(false);
            setError(r.ok ? "" : r.error.messageKey);
            setSaved(r.ok);
          }}
        >
          <Field htmlFor={`minimum-${venue.id}`} label={t("phase5.minimumCharge")} hint={t("phase5.venueMinimum")}>
            <div className="sm:max-w-64">
              <RupiahInput
                id={`minimum-${venue.id}`}
                defaultValue={Number(minimumCharge) || null}
                onValueChange={(v) => {
                  setMinimumCharge(v === null ? "" : String(v));
                  dirty();
                }}
                aria-describedby={`minimum-${venue.id}-hint`}
              />
            </div>
          </Field>
          <div className="overflow-hidden rounded-control border border-border">
            {!slots.length ? (
              <EmptyState icon={Plus} title={t("social.noSlots")} body={t("social.noSlotsAdmin")} className="py-8 md:py-8" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>{t("social.slotCode")}</Th>
                    <Th>{t("social.position")}</Th>
                    <Th className="text-right">{t("social.pax")}</Th>
                    <Th className="text-right">{t("phase5.minimumCharge")}</Th>
                    <Th>
                      <span className="sr-only">{t("social.actions")}</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {slots.map((s, i) => (
                    <Tr key={i}>
                      <Td>
                        <span className="block font-bold">{s.code}</span>
                        <span className="block text-caption text-muted">{t.loose(`social.${s.kind}`)}</span>
                      </Td>
                      <Td className="whitespace-nowrap tabular-nums text-muted">
                        {t("social.positionValue", { x: s.x, y: s.y, w: s.w, h: s.h })}
                      </Td>
                      <Td className="text-right tabular-nums">{formatCount(s.pax)}</Td>
                      <Td className="text-right tabular-nums">
                        {s.minimumCharge == null ? <span className="text-muted">{t("social.venueDefault")}</span> : formatRupiah(s.minimumCharge)}
                      </Td>
                      <Td>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-control-sm px-0"
                            aria-label={`${t("social.editSlot")}: ${s.code}`}
                            onClick={() => setEditing({ index: i, slot: s })}
                          >
                            <Pencil aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-control-sm px-0 hover:text-danger-fg"
                            aria-label={`${t("social.removeSlot")}: ${s.code}`}
                            onClick={() => {
                              setSlots(slots.filter((_, n) => n !== i));
                              dirty();
                            }}
                          >
                            <Trash2 aria-hidden="true" />
                          </Button>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
          {error && (
            <p role="alert" className="text-body-sm text-danger-fg">
              {t.loose(error)}
            </p>
          )}
          {saved && (
            <p role="status" className="text-body-sm text-success-fg">
              {t("social.saved")}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing({ index: null, slot: { ...NEW_SLOT, code: `S${slots.length + 1}` } })}>
              <Plus aria-hidden="true" />
              {t("social.addSlot")}
            </Button>
            <Button type="submit" loading={busy}>
              {t("social.saveLayout")}
            </Button>
          </div>
        </form>
      </div>
      {editing && (
        <SlotDialog
          key={editing.index ?? "new"}
          venueId={venue.id}
          slot={editing.slot}
          isNew={editing.index === null}
          onClose={() => setEditing(null)}
          onDone={(slot) => {
            setSlots(editing.index === null ? [...slots, slot] : slots.map((s, n) => (n === editing.index ? slot : s)));
            setEditing(null);
            dirty();
          }}
        />
      )}
    </Card>
  );
}

function SlotDialog({
  venueId,
  slot,
  isNew,
  onClose,
  onDone,
}: {
  venueId: string;
  slot: VenueSlot;
  isNew: boolean;
  onClose: () => void;
  onDone: (slot: VenueSlot) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState(slot);
  const [charge, setCharge] = useState(slot.minimumCharge == null ? "" : String(slot.minimumCharge));
  const [invalid, setInvalid] = useState(false);
  const formId = `slot-${venueId}`;
  const id = (k: string) => `${venueId}-slot-${k}`;
  const num = (k: "x" | "y" | "w" | "h" | "pax", v: string) => setDraft({ ...draft, [k]: v === "" ? 0 : Number(v) });
  const valid =
    /^[A-Za-z0-9-]{1,20}$/.test(draft.code.trim()) &&
    draft.x >= 0 && draft.y >= 0 && draft.w >= 1 && draft.h >= 1 &&
    draft.x + draft.w <= GRID && draft.y + draft.h <= GRID && draft.pax >= 1;
  return (
    <Dialog
      open
      onClose={onClose}
      title={isNew ? t("social.addSlot") : t("social.editSlot")}
      description={t("social.layoutHint")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form={formId}>
            {isNew ? t("social.addSlot") : t("social.done")}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className="grid grid-cols-2 gap-4 pb-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) {
            setInvalid(true);
            return;
          }
          const minimumSpend = draft.minimumSpend?.trim();
          onDone({
            ...draft,
            code: draft.code.trim(),
            minimumCharge: charge === "" ? undefined : Number(charge),
            minimumSpend: minimumSpend ? minimumSpend : undefined,
          });
        }}
      >
        <Field htmlFor={id("code")} label={t("social.slotCode")}>
          <Input id={id("code")} value={draft.code} maxLength={20} onChange={(e) => setDraft({ ...draft, code: e.target.value })} required />
        </Field>
        <Field htmlFor={id("kind")} label={t("social.kind")}>
          <Select id={id("kind")} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as VenueSlot["kind"] })}>
            {["SOFA", "TABLE"].map((k) => (
              <option key={k} value={k}>
                {t.loose(`social.${k}`)}
              </option>
            ))}
          </Select>
        </Field>
        {(["x", "y", "w", "h"] as const).map((k) => (
          <Field key={k} htmlFor={id(k)} label={t.loose(`social.${({ w: "width", h: "height" } as Record<string, string>)[k] ?? k}`)}>
            <Input
              id={id(k)}
              type="number"
              inputMode="numeric"
              min={k === "x" || k === "y" ? 0 : 1}
              max={k === "x" || k === "y" ? GRID - 1 : GRID}
              value={draft[k]}
              onChange={(e) => num(k, e.target.value)}
              className="tabular-nums"
            />
          </Field>
        ))}
        <Field htmlFor={id("pax")} label={t("social.pax")}>
          <Input id={id("pax")} type="number" inputMode="numeric" min={1} max={100} value={draft.pax} onChange={(e) => num("pax", e.target.value)} className="tabular-nums" />
        </Field>
        <Field htmlFor={id("charge")} label={t("phase5.minimumCharge")} hint={t("social.chargeHint")}>
          <RupiahInput
            id={id("charge")}
            defaultValue={charge === "" ? null : Number(charge)}
            onValueChange={(v) => setCharge(v === null ? "" : String(v))}
            aria-describedby={`${id("charge")}-hint`}
          />
        </Field>
        <Field htmlFor={id("spend")} label={t("social.minimumSpend")} className="col-span-2">
          <Input id={id("spend")} value={draft.minimumSpend ?? ""} maxLength={200} onChange={(e) => setDraft({ ...draft, minimumSpend: e.target.value })} />
        </Field>
        {invalid && !valid && (
          <p role="alert" className="col-span-2 text-body-sm text-danger-fg">
            {t("social.slotInvalid")}
          </p>
        )}
      </form>
    </Dialog>
  );
}
