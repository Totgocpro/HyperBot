import {
  ChannelType,
  EmbedBuilder,
  type GuildBasedChannel,
  type NewsChannel,
  type TextChannel,
  type VoiceChannel
} from "discord.js";
import { BasePlugin } from "../../src/Core/BasePlugin.js";

type NotificationSourceType = "RSS" | "YouTube" | "Twitch" | "Kick" | "X" | "Reddit" | "Instagram";

type NotificationSource = {
  Id: string;
  Name: string;
  Type: NotificationSourceType;
  Enabled: boolean;
  ChannelId: string;
  Url: string;
  ExternalId: string;
  ApiKey: string;
  ApiSecret: string;
  AccessToken: string;
  IntervalSeconds: number;
  IntervalMinutes: number;
  LastCheckedAt: string | null;
  Embed: EditableEmbed;
};

type EditableEmbed = {
  Title?: string;
  Description?: string;
  Color?: string;
  Url?: string;
  AuthorName?: string;
  AuthorIconUrl?: string;
  ThumbnailUrl?: string;
  ImageUrl?: string;
  FooterText?: string;
  FooterIconUrl?: string;
  Timestamp?: boolean;
  Fields?: Array<{ Name: string; Value: string; Inline: boolean }>;
  ImageDataUrl?: string;
  ImageName?: string;
};

type FeedItem = {
  Id: string;
  Title: string;
  Url: string;
  Author: string;
  PublishedAt: string;
  Summary: string;
  ImageUrl: string;
};

type TwitchToken = {
  AccessToken: string;
  ExpiresAt: number;
};

type XMedia = {
  media_key: string;
  preview_image_url?: string;
  url?: string;
};

const SourcesStorageKey = "Sources";
const SeenItemsStorageKey = "SeenItems";
const TwitchTokenStorageKey = "TwitchToken";
const MinimumIntervalSeconds = process.env.NODE_ENV === "production" ? 300 : 5;

const DefaultEmbed: EditableEmbed = {
  Title: "%source%: %title%",
  Description: "%summary%",
  Color: "#5865f2",
  Url: "%url%",
  AuthorName: "%author%",
  ThumbnailUrl: "%image%",
  FooterText: "%type% notification",
  Timestamp: true,
  Fields: []
};

export default class NotificationsPlugin extends BasePlugin {
  public async OnEnable(): Promise<void> {
    this.Logger.Info("Notifications plugin enabled.");
  }

  public async OnDisable(): Promise<void> {
    this.Logger.Info("Notifications plugin disabled.");
  }

  public async OnTick(): Promise<void> {
    const Now = Date.now();

    for (const Guild of this.DiscordClient.guilds.cache.values()) {
      const Sources = await this.GetSources(Guild.id);
      let SourcesChanged = false;

      for (const Source of Sources) {
        if (!Source.Enabled || !Source.ChannelId) {
          continue;
        }

        const LastCheckedAt = Source.LastCheckedAt ? new Date(Source.LastCheckedAt).getTime() : 0;
        const IntervalMs = Math.max(MinimumIntervalSeconds, Source.IntervalSeconds || (Source.IntervalMinutes || 10) * 60) * 1000;

        if (LastCheckedAt && Now - LastCheckedAt < IntervalMs) {
          continue;
        }

        await this.ProcessSource(Guild.id, Source);
        Source.LastCheckedAt = new Date(Now).toISOString();
        SourcesChanged = true;
      }

      if (SourcesChanged) {
        await this.SetSources(Guild.id, Sources);
      }
    }
  }

  private async ProcessSource(GuildId: string, Source: NotificationSource): Promise<void> {
    const Channel = await this.ResolveWritableChannel(GuildId, Source.ChannelId);

    if (!Channel) {
      this.Logger.Warn("Notification channel is missing or not writable.", { GuildId, SourceId: Source.Id, ChannelId: Source.ChannelId });
      return;
    }

    const Items = await this.FetchSourceItems(Source).catch((ErrorValue: unknown) => {
      this.Logger.Warn("Notification source fetch failed.", { Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue), SourceId: Source.Id, Type: Source.Type });
      return [];
    });

    if (Items.length === 0) {
      return;
    }

    const SeenItems = await this.GetSeenItems(GuildId);
    const SeenForSource = new Set(SeenItems[Source.Id] ?? []);
    const NewItems = Items.filter((Item) => !SeenForSource.has(Item.Id)).slice(0, 5).reverse();

    if (SeenForSource.size === 0) {
      SeenItems[Source.Id] = Items.map((Item) => Item.Id).slice(0, 100);
      await this.SetSeenItems(GuildId, SeenItems);
      return;
    }

    for (const Item of NewItems) {
      const BuiltEmbed = this.BuildEmbed(Source, Item);
      await Channel.send({ embeds: [BuiltEmbed.Embed], files: BuiltEmbed.Files }).catch((ErrorValue: unknown) => {
        this.Logger.Warn("Notification send failed.", { Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue), SourceId: Source.Id });
      });
    }

    SeenItems[Source.Id] = [...Items.map((Item) => Item.Id), ...(SeenItems[Source.Id] ?? [])].filter((Value, Index, Values) => Values.indexOf(Value) === Index).slice(0, 100);
    await this.SetSeenItems(GuildId, SeenItems);
  }

  private async FetchSourceItems(Source: NotificationSource): Promise<FeedItem[]> {
    if (Source.Type === "YouTube") {
      const ChannelId = Source.ExternalId.trim();
      const Url = Source.Url.trim() || `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(ChannelId)}`;
      return this.FetchRssItems(Url);
    }

    if (Source.Type === "Twitch") {
      return this.FetchTwitchItems(Source);
    }

    if (Source.Type === "Kick") {
      return this.FetchKickItems(Source);
    }

    if (Source.Type === "X") {
      return this.FetchXItems(Source);
    }

    if (Source.Type === "Reddit") {
      return this.FetchRedditItems(Source);
    }

    if (Source.Type === "Instagram") {
      return this.FetchInstagramItems(Source);
    }

    return this.FetchRssItems(Source.Url.trim());
  }

  private async FetchRssItems(Url: string): Promise<FeedItem[]> {
    if (!/^https?:\/\//iu.test(Url)) {
      return [];
    }

    const Response = await fetch(Url, {
      headers: {
        "User-Agent": "HyperBot Notifications/1.0"
      }
    });

    if (!Response.ok) {
      throw new Error(`RSS request failed with ${Response.status}`);
    }

    const Xml = await Response.text();
    const EntryMatches = [...Xml.matchAll(/<(entry|item)\b[\s\S]*?<\/\1>/giu)].map((Match) => Match[0]).slice(0, 20);

    return EntryMatches.map((Entry) => ({
      Id: this.DecodeXml(this.ReadXmlValue(Entry, "id") || this.ReadXmlValue(Entry, "guid") || this.ReadXmlValue(Entry, "link")),
      Title: this.DecodeXml(this.ReadXmlValue(Entry, "title") || "New update"),
      Url: this.DecodeXml(this.ReadXmlLink(Entry) || this.ReadXmlValue(Entry, "link") || Url),
      Author: this.DecodeXml(this.ReadXmlValue(Entry, "name") || this.ReadXmlValue(Entry, "author") || ""),
      PublishedAt: this.DecodeXml(this.ReadXmlValue(Entry, "published") || this.ReadXmlValue(Entry, "pubDate") || this.ReadXmlValue(Entry, "updated") || new Date().toISOString()),
      Summary: this.DecodeXml(this.StripHtml(this.ReadXmlValue(Entry, "summary") || this.ReadXmlValue(Entry, "description") || "")),
      ImageUrl: this.DecodeXml(this.ReadXmlMediaUrl(Entry))
    })).filter((Item) => Item.Id || Item.Url);
  }

  private async FetchTwitchItems(Source: NotificationSource): Promise<FeedItem[]> {
    const Login = Source.ExternalId.trim() || Source.Url.trim();

    if (!Login) {
      return [];
    }

    const ClientId = Source.ApiKey || process.env.TWITCH_CLIENT_ID;
    const ClientSecret = Source.ApiSecret || process.env.TWITCH_CLIENT_SECRET;

    if (!ClientId || !ClientSecret) {
      this.Logger.Warn("Twitch notifications require TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET.");
      return [];
    }

    const Token = await this.GetTwitchToken(ClientId, ClientSecret);
    const UserResponse = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(Login)}`, {
      headers: {
        "Client-ID": ClientId,
        Authorization: `Bearer ${Token}`
      }
    });

    if (!UserResponse.ok) {
      throw new Error(`Twitch user request failed with ${UserResponse.status}`);
    }

    const UserPayload = await UserResponse.json() as { data?: Array<{ id: string; display_name: string; profile_image_url: string; login: string }> };
    const User = UserPayload.data?.[0];

    if (!User) {
      return [];
    }

    const StreamResponse = await fetch(`https://api.twitch.tv/helix/streams?user_id=${encodeURIComponent(User.id)}`, {
      headers: {
        "Client-ID": ClientId,
        Authorization: `Bearer ${Token}`
      }
    });

    if (!StreamResponse.ok) {
      throw new Error(`Twitch stream request failed with ${StreamResponse.status}`);
    }

    const StreamPayload = await StreamResponse.json() as { data?: Array<{ id: string; title: string; game_name: string; started_at: string; thumbnail_url: string }> };
    const Stream = StreamPayload.data?.[0];

    if (!Stream) {
      return [];
    }

    return [{
      Id: Stream.id,
      Title: Stream.title || `${User.display_name} is live`,
      Url: `https://www.twitch.tv/${User.login}`,
      Author: User.display_name,
      PublishedAt: Stream.started_at,
      Summary: Stream.game_name ? `Streaming ${Stream.game_name}` : "Live on Twitch",
      ImageUrl: Stream.thumbnail_url.replace("{width}", "640").replace("{height}", "360") || User.profile_image_url
    }];
  }

  private async FetchKickItems(Source: NotificationSource): Promise<FeedItem[]> {
    const Login = Source.ExternalId.trim() || Source.Url.trim();

    if (!Login) {
      return [];
    }

    const Headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "HyperBot Notifications/1.0"
    };

    if (Source.AccessToken) {
      Headers.Authorization = `Bearer ${Source.AccessToken}`;
    }

    const Response = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(Login)}`, { headers: Headers });

    if (!Response.ok) {
      throw new Error(`Kick request failed with ${Response.status}`);
    }

    const Payload = await Response.json() as {
      user?: { username?: string };
      slug?: string;
      livestream?: {
        id?: number | string;
        session_title?: string;
        created_at?: string;
        thumbnail?: { url?: string };
        categories?: Array<{ name?: string }>;
      } | null;
    };
    const Live = Payload.livestream;

    if (!Live?.id) {
      return [];
    }

    return [{
      Id: String(Live.id),
      Title: Live.session_title || `${Payload.user?.username || Payload.slug || Login} is live`,
      Url: `https://kick.com/${Payload.slug || Login}`,
      Author: Payload.user?.username || Payload.slug || Login,
      PublishedAt: Live.created_at || new Date().toISOString(),
      Summary: Live.categories?.map((Category) => Category.name).filter(Boolean).join(", ") || "Live on Kick",
      ImageUrl: Live.thumbnail?.url || ""
    }];
  }

  private async FetchXItems(Source: NotificationSource): Promise<FeedItem[]> {
    const Username = Source.ExternalId.trim().replace(/^@/u, "");
    const BearerToken = Source.AccessToken || Source.ApiKey;

    if (!Username || !BearerToken) {
      this.Logger.Warn("X notifications require a username and a bearer token in Access token.");
      return [];
    }

    const UserResponse = await fetch(`https://api.x.com/2/users/by/username/${encodeURIComponent(Username)}`, {
      headers: { Authorization: `Bearer ${BearerToken}` }
    });

    if (!UserResponse.ok) {
      throw new Error(`X user request failed with ${UserResponse.status}`);
    }

    const UserPayload = await UserResponse.json() as { data?: { id: string; name: string; username: string } };
    const User = UserPayload.data;

    if (!User) {
      return [];
    }

    const TweetsResponse = await fetch(`https://api.x.com/2/users/${encodeURIComponent(User.id)}/tweets?max_results=10&tweet.fields=created_at,attachments&expansions=attachments.media_keys&media.fields=url,preview_image_url`, {
      headers: { Authorization: `Bearer ${BearerToken}` }
    });

    if (!TweetsResponse.ok) {
      throw new Error(`X tweets request failed with ${TweetsResponse.status}`);
    }

    const TweetsPayload = await TweetsResponse.json() as {
      data?: Array<{ id: string; text: string; created_at?: string; attachments?: { media_keys?: string[] } }>;
      includes?: { media?: XMedia[] };
    };
    const MediaByKey = new Map((TweetsPayload.includes?.media ?? []).map((Media) => [Media.media_key, Media]));

    return (TweetsPayload.data ?? []).map((Tweet) => {
      const Media = Tweet.attachments?.media_keys?.map((Key) => MediaByKey.get(Key)).find(Boolean);
      return {
        Id: Tweet.id,
        Title: `${User.name} on X`,
        Url: `https://x.com/${User.username}/status/${Tweet.id}`,
        Author: User.name,
        PublishedAt: Tweet.created_at || new Date().toISOString(),
        Summary: Tweet.text,
        ImageUrl: Media?.url || Media?.preview_image_url || ""
      };
    });
  }

  private async FetchRedditItems(Source: NotificationSource): Promise<FeedItem[]> {
    const Subreddit = Source.ExternalId.trim().replace(/^r\//iu, "");

    if (!Subreddit) {
      return [];
    }

    const Headers: Record<string, string> = {
      "User-Agent": "HyperBot Notifications/1.0"
    };
    let Url = `https://www.reddit.com/r/${encodeURIComponent(Subreddit)}/new.json?limit=10`;

    if (Source.AccessToken) {
      Headers.Authorization = `Bearer ${Source.AccessToken}`;
      Url = `https://oauth.reddit.com/r/${encodeURIComponent(Subreddit)}/new?limit=10`;
    } else if (Source.ApiKey && Source.ApiSecret) {
      Headers.Authorization = `Bearer ${await this.GetRedditToken(Source)}`;
      Url = `https://oauth.reddit.com/r/${encodeURIComponent(Subreddit)}/new?limit=10`;
    }

    const Response = await fetch(Url, { headers: Headers });

    if (!Response.ok) {
      throw new Error(`Reddit request failed with ${Response.status}`);
    }

    const Payload = await Response.json() as { data?: { children?: Array<{ data?: Record<string, unknown> }> } };
    return (Payload.data?.children ?? []).map((Child) => {
      const Data = Child.data ?? {};
      const Permalink = this.GetString(Data.permalink);
      return {
        Id: this.GetString(Data.id),
        Title: this.GetString(Data.title) || "New Reddit post",
        Url: Permalink ? `https://www.reddit.com${Permalink}` : this.GetString(Data.url),
        Author: this.GetString(Data.author),
        PublishedAt: new Date((Number(Data.created_utc) || Date.now() / 1000) * 1000).toISOString(),
        Summary: this.GetString(Data.selftext).slice(0, 1000),
        ImageUrl: this.GetString(Data.thumbnail).startsWith("http") ? this.GetString(Data.thumbnail) : ""
      };
    }).filter((Item) => Item.Id);
  }

  private async FetchInstagramItems(Source: NotificationSource): Promise<FeedItem[]> {
    const UserId = Source.ExternalId.trim();
    const AccessToken = Source.AccessToken || Source.ApiKey;

    if (!UserId || !AccessToken) {
      this.Logger.Warn("Instagram notifications require an Instagram user ID and access token.");
      return [];
    }

    const Response = await fetch(`https://graph.instagram.com/${encodeURIComponent(UserId)}/media?fields=id,caption,media_url,permalink,timestamp,username,media_type&access_token=${encodeURIComponent(AccessToken)}`);

    if (!Response.ok) {
      throw new Error(`Instagram request failed with ${Response.status}`);
    }

    const Payload = await Response.json() as { data?: Array<{ id: string; caption?: string; media_url?: string; permalink?: string; timestamp?: string; username?: string; media_type?: string }> };
    return (Payload.data ?? []).slice(0, 10).map((Post) => ({
      Id: Post.id,
      Title: `${Post.username || Source.Name} posted on Instagram`,
      Url: Post.permalink || "",
      Author: Post.username || Source.Name,
      PublishedAt: Post.timestamp || new Date().toISOString(),
      Summary: Post.caption || Post.media_type || "New Instagram post",
      ImageUrl: Post.media_url || ""
    }));
  }

  private async GetTwitchToken(ClientId: string, ClientSecret: string): Promise<string> {
    const TokenKey = `${TwitchTokenStorageKey}:${ClientId}`;
    const StoredToken = await this.Storage.GetGlobalConfig<TwitchToken>("Global", TokenKey);

    if (StoredToken?.AccessToken && StoredToken.ExpiresAt > Date.now() + 60_000) {
      return StoredToken.AccessToken;
    }

    const Response = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: ClientId,
        client_secret: ClientSecret,
        grant_type: "client_credentials"
      })
    });

    if (!Response.ok) {
      throw new Error(`Twitch token request failed with ${Response.status}`);
    }

    const Payload = await Response.json() as { access_token: string; expires_in: number };
    const Token = {
      AccessToken: Payload.access_token,
      ExpiresAt: Date.now() + Math.max(60, Payload.expires_in - 60) * 1000
    };

    await this.Storage.SetGlobalConfig("Global", TokenKey, Token);
    return Token.AccessToken;
  }

  private async GetRedditToken(Source: NotificationSource): Promise<string> {
    const Response = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${Source.ApiKey}:${Source.ApiSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "HyperBot Notifications/1.0"
      },
      body: new URLSearchParams({ grant_type: "client_credentials" })
    });

    if (!Response.ok) {
      throw new Error(`Reddit token request failed with ${Response.status}`);
    }

    const Payload = await Response.json() as { access_token: string };
    return Payload.access_token;
  }

  private BuildEmbed(Source: NotificationSource, Item: FeedItem): { Embed: EmbedBuilder; Files: Array<{ attachment: Buffer; name: string }> } {
    const Files: Array<{ attachment: Buffer; name: string }> = [];
    const Template = Source.Embed || DefaultEmbed;
    const Embed = new EmbedBuilder().setColor(this.ParseColor(Template.Color || DefaultEmbed.Color || "#5865f2"));

    this.SetEmbedText(Embed, "Title", Template.Title, Source, Item);
    this.SetEmbedText(Embed, "Description", Template.Description, Source, Item);

    const Url = this.ApplyTemplate(Template.Url || "%url%", Source, Item);
    if (Url.trim()) {
      Embed.setURL(Url);
    }

    if (Template.AuthorName?.trim()) {
      const AuthorName = this.ApplyTemplate(Template.AuthorName, Source, Item).slice(0, 256);

      if (AuthorName.trim()) {
        Embed.setAuthor({
          name: AuthorName,
          iconURL: Template.AuthorIconUrl?.trim() ? this.ApplyTemplate(Template.AuthorIconUrl, Source, Item) : undefined
        });
      }
    }

    const ThumbnailUrl = this.ApplyTemplate(Template.ThumbnailUrl || "%image%", Source, Item);
    if (ThumbnailUrl.trim()) {
      Embed.setThumbnail(ThumbnailUrl);
    }

    const UploadedImage = this.ParseDataImage(Template.ImageDataUrl, Template.ImageName || "notification-image.png");
    if (UploadedImage) {
      Files.push(UploadedImage);
      Embed.setImage(`attachment://${UploadedImage.name}`);
    } else {
      const ImageUrl = this.ApplyTemplate(Template.ImageUrl || "", Source, Item);
      if (ImageUrl.trim()) {
        Embed.setImage(ImageUrl);
      }
    }

    if (Template.FooterText?.trim()) {
      Embed.setFooter({
        text: this.ApplyTemplate(Template.FooterText, Source, Item).slice(0, 2048),
        iconURL: Template.FooterIconUrl?.trim() ? this.ApplyTemplate(Template.FooterIconUrl, Source, Item) : undefined
      });
    }

    if (Template.Timestamp !== false) {
      Embed.setTimestamp(new Date(Item.PublishedAt));
    }

    for (const Field of Template.Fields ?? []) {
      if (Field.Name.trim() && Field.Value.trim()) {
        Embed.addFields({
          name: this.ApplyTemplate(Field.Name, Source, Item).slice(0, 256),
          value: this.ApplyTemplate(Field.Value, Source, Item).slice(0, 1024),
          inline: Field.Inline
        });
      }
    }

    return { Embed, Files };
  }

  private SetEmbedText(Embed: EmbedBuilder, Kind: "Title" | "Description", Template: string | undefined, Source: NotificationSource, Item: FeedItem): void {
    const Value = this.ApplyTemplate(Template || (Kind === "Title" ? DefaultEmbed.Title || "" : DefaultEmbed.Description || ""), Source, Item);

    if (!Value.trim()) {
      return;
    }

    if (Kind === "Title") {
      Embed.setTitle(Value.slice(0, 256));
      return;
    }

    Embed.setDescription(Value.slice(0, 4096));
  }

  private ApplyTemplate(Template: string, Source: NotificationSource, Item: FeedItem): string {
    return Template
      .replaceAll("%source%", Source.Name)
      .replaceAll("%type%", Source.Type)
      .replaceAll("%title%", Item.Title)
      .replaceAll("%url%", Item.Url)
      .replaceAll("%author%", Item.Author)
      .replaceAll("%publishedAt%", Item.PublishedAt)
      .replaceAll("%summary%", Item.Summary)
      .replaceAll("%image%", Item.ImageUrl);
  }

  private async ResolveWritableChannel(GuildId: string, ChannelId: string): Promise<TextChannel | NewsChannel | VoiceChannel | null> {
    const Guild = await this.DiscordClient.guilds.fetch(GuildId).catch(() => null);
    const Channel = (await Guild?.channels.fetch(ChannelId).catch(() => null)) as GuildBasedChannel | null;

    if (!Channel) {
      return null;
    }

    if (Channel.type === ChannelType.GuildText || Channel.type === ChannelType.GuildAnnouncement || Channel.type === ChannelType.GuildVoice) {
      return Channel as TextChannel | NewsChannel | VoiceChannel;
    }

    return null;
  }

  private async GetSources(GuildId: string): Promise<NotificationSource[]> {
    const Value = await this.Storage.GetGlobalConfig<unknown>(GuildId, SourcesStorageKey);
    return Array.isArray(Value) ? Value.filter(this.IsRecord).map((Source) => this.ParseSource(Source)).filter((Source): Source is NotificationSource => Boolean(Source)) : [];
  }

  private async SetSources(GuildId: string, Sources: NotificationSource[]): Promise<void> {
    await this.Storage.SetGlobalConfig(GuildId, SourcesStorageKey, Sources);
  }

  private async GetSeenItems(GuildId: string): Promise<Record<string, string[]>> {
    const Value = await this.Storage.GetGlobalConfig<unknown>(GuildId, SeenItemsStorageKey);

    if (!this.IsRecord(Value)) {
      return {};
    }

    return Object.fromEntries(Object.entries(Value).map(([Key, Items]) => [Key, Array.isArray(Items) ? Items.map(String) : []]));
  }

  private async SetSeenItems(GuildId: string, SeenItems: Record<string, string[]>): Promise<void> {
    await this.Storage.SetGlobalConfig(GuildId, SeenItemsStorageKey, SeenItems);
  }

  private ParseSource(Value: Record<string, unknown>): NotificationSource | null {
    const Type = this.ParseSourceType(Value.Type);
    const Id = this.GetString(Value.Id);

    if (!Id) {
      return null;
    }

    return {
      Id,
      Name: this.GetString(Value.Name) || Type,
      Type,
      Enabled: Value.Enabled !== false,
      ChannelId: this.GetString(Value.ChannelId),
      Url: this.GetString(Value.Url),
      ExternalId: this.GetString(Value.ExternalId),
      ApiKey: this.GetString(Value.ApiKey),
      ApiSecret: this.GetString(Value.ApiSecret),
      AccessToken: this.GetString(Value.AccessToken),
      IntervalSeconds: Math.max(MinimumIntervalSeconds, Number(Value.IntervalSeconds) || (Number(Value.IntervalMinutes) || 10) * 60),
      IntervalMinutes: Math.max(5, Number(Value.IntervalMinutes) || 10),
      LastCheckedAt: typeof Value.LastCheckedAt === "string" ? Value.LastCheckedAt : null,
      Embed: this.ParseEditableEmbed(Value.Embed)
    };
  }

  private ParseEditableEmbed(Value: unknown): EditableEmbed {
    if (!this.IsRecord(Value)) {
      return DefaultEmbed;
    }

    return {
      Title: this.GetString(Value.Title) || DefaultEmbed.Title,
      Description: this.GetString(Value.Description) || DefaultEmbed.Description,
      Color: this.GetString(Value.Color) || DefaultEmbed.Color,
      Url: this.GetString(Value.Url),
      AuthorName: this.GetString(Value.AuthorName),
      AuthorIconUrl: this.GetString(Value.AuthorIconUrl),
      ThumbnailUrl: this.GetString(Value.ThumbnailUrl),
      ImageUrl: this.GetString(Value.ImageUrl),
      FooterText: this.GetString(Value.FooterText) || DefaultEmbed.FooterText,
      FooterIconUrl: this.GetString(Value.FooterIconUrl),
      Timestamp: typeof Value.Timestamp === "boolean" ? Value.Timestamp : DefaultEmbed.Timestamp,
      Fields: Array.isArray(Value.Fields) ? Value.Fields.filter(this.IsRecord).map((Field) => ({
        Name: this.GetString(Field.Name),
        Value: this.GetString(Field.Value),
        Inline: Boolean(Field.Inline)
      })) : DefaultEmbed.Fields,
      ImageDataUrl: this.GetString(Value.ImageDataUrl),
      ImageName: this.GetString(Value.ImageName)
    };
  }

  private ParseSourceType(Value: unknown): NotificationSourceType {
    return Value === "YouTube" || Value === "Twitch" || Value === "Kick" || Value === "X" || Value === "Reddit" || Value === "Instagram" ? Value : "RSS";
  }

  private ReadXmlValue(Xml: string, TagName: string): string {
    const Match = Xml.match(new RegExp(`<(?:[a-z0-9_-]+:)?${TagName}[^>]*>([\\s\\S]*?)<\\/(?:[a-z0-9_-]+:)?${TagName}>`, "iu"));
    return Match?.[1]?.trim() ?? "";
  }

  private ReadXmlLink(Xml: string): string {
    const HrefMatch = Xml.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/iu);
    return HrefMatch?.[1] ?? "";
  }

  private ReadXmlMediaUrl(Xml: string): string {
    const MediaMatch = Xml.match(/<(?:media:)?thumbnail\b[^>]*url=["']([^"']+)["'][^>]*>/iu) ?? Xml.match(/<(?:media:)?content\b[^>]*url=["']([^"']+)["'][^>]*>/iu);
    return MediaMatch?.[1] ?? "";
  }

  private DecodeXml(Value: string): string {
    return Value
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, "$1")
      .replaceAll("&amp;", "&")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&quot;", "\"")
      .replaceAll("&#39;", "'")
      .trim();
  }

  private StripHtml(Value: string): string {
    return Value.replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ").trim();
  }

  private ParseColor(ColorValue: string): number {
    const SafeColor = /^#[0-9a-f]{6}$/iu.test(ColorValue) ? ColorValue : "#5865f2";
    return Number.parseInt(SafeColor.slice(1), 16);
  }

  private ParseDataImage(Value: string | undefined, Name: string): { attachment: Buffer; name: string } | null {
    const Match = Value?.match(/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,(.+)$/iu);

    if (!Match?.[1]) {
      return null;
    }

    return {
      attachment: Buffer.from(Match[1], "base64"),
      name: Name.replace(/[^a-z0-9._-]/giu, "-") || "notification-image.png"
    };
  }

  private GetString(Value: unknown): string {
    return typeof Value === "string" ? Value : "";
  }

  private IsRecord(Value: unknown): Value is Record<string, unknown> {
    return typeof Value === "object" && Value !== null && !Array.isArray(Value);
  }
}
