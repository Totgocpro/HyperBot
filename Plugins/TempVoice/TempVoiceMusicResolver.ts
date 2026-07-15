import { youtubeDl as YoutubeDl, type Flags as YoutubeDlFlags, type Payload as YoutubeDlPayload } from "youtube-dl-exec";
import type { PluginLoggerContract } from "../../src/Core/Types.js";

export type TempVoiceMusicTrack = {
  Author?: string;
  DirectUrl?: string;
  DurationSeconds?: number | null;
  Source?: string;
  ThumbnailUrl?: string;
  Title: string;
  Url: string;
  VideoId?: string;
};

type YoutubeDlPlaylistPayload = YoutubeDlPayload & {
  entries?: Array<YoutubeDlPlaylistEntry | null>;
};

type YoutubeDlPlaylistEntry = {
  artist?: string;
  channel?: string;
  duration?: number | string | null;
  id?: string;
  thumbnail?: string;
  title?: string;
  uploader?: string;
  url?: string;
  webpage_url?: string;
};

export const Source = {
  YOUTUBE: "youtube",
  SPOTIFY: "spotify",
  SOUNDCLOUD: "soundcloud",
  BANDCAMP: "bandcamp",
  APPLE_MUSIC: "apple_music",
  DEEZER: "deezer",
  TIDAL: "tidal",
  DIRECT: "direct",
  UNKNOWN: "unknown",
} as const;

export const SourceInfo: Record<string, { label: string; logoUrl: string; color: string; name: string }> = {
  [Source.YOUTUBE]: { label: "YT", logoUrl: "https://www.youtube.com/favicon.ico", color: "#FF0000", name: "YouTube" },
  [Source.SPOTIFY]: { label: "SP", logoUrl: "https://open.spotifycdn.com/cdn/images/favicon32.b64ecc03.png", color: "#1DB954", name: "Spotify" },
  [Source.SOUNDCLOUD]: { label: "SC", logoUrl: "https://soundcloud.com/favicon.ico", color: "#FF7700", name: "SoundCloud" },
  [Source.BANDCAMP]: { label: "BC", logoUrl: "https://bandcamp.com/favicon.ico", color: "#629AA9", name: "Bandcamp" },
  [Source.APPLE_MUSIC]: { label: "AM", logoUrl: "https://music.apple.com/favicon.ico", color: "#FA243C", name: "Apple Music" },
  [Source.DEEZER]: { label: "DZ", logoUrl: "https://www.deezer.com/favicon.ico", color: "#A238FF", name: "Deezer" },
  [Source.TIDAL]: { label: "TD", logoUrl: "https://www.tidal.com/favicon.ico", color: "#000000", name: "Tidal" },
  [Source.DIRECT]: { label: "URL", logoUrl: "", color: "#64748B", name: "Direct Link" },
};

const URL_PATTERNS: Record<string, RegExp> = {
  youtube: /(?:youtube\.com|youtu\.be|music\.youtube\.com)/i,
  spotify: /(?:open\.spotify\.com|spotify:)/i,
  soundcloud: /soundcloud\.com/i,
  bandcamp: /bandcamp\.com/i,
  appleMusic: /music\.apple\.com/i,
  deezer: /(?:deezer\.com|deezer\.page\.link|link\.deezer\.com)/i,
  tidal: /(?:tidal\.com|listen\.tidal\.com)/i,
  directAudio: /\.(mp3|wav|ogg|flac|m4a|aac|opus|webm)(\?.*)?$/i,
};

const MaxPlaylistTracks = 100;
const LazyBatchSize = 4;

export type LazyResolveResult = {
  initialBatch: TempVoiceMusicTrack[];
  resolveNextBatch: () => Promise<TempVoiceMusicTrack[] | null>;
};

export class TempVoiceMusicResolver {
  public constructor(private readonly Logger: PluginLoggerContract) {}

  public detectSource(input: string): string {
    if (input.startsWith("http://") || input.startsWith("https://")) {
      if (URL_PATTERNS.youtube.test(input)) return Source.YOUTUBE;
      if (URL_PATTERNS.spotify.test(input)) return Source.SPOTIFY;
      if (URL_PATTERNS.soundcloud.test(input)) return Source.SOUNDCLOUD;
      if (URL_PATTERNS.bandcamp.test(input)) return Source.BANDCAMP;
      if (URL_PATTERNS.appleMusic.test(input)) return Source.APPLE_MUSIC;
      if (URL_PATTERNS.deezer.test(input)) return Source.DEEZER;
      if (URL_PATTERNS.tidal.test(input)) return Source.TIDAL;
      if (URL_PATTERNS.directAudio.test(input)) return Source.DIRECT;
      return Source.UNKNOWN;
    }
    if (input.startsWith("spotify:")) return Source.SPOTIFY;
    return Source.YOUTUBE;
  }

  public async resolveTracks(
    url: string,
    youtubeCookiesPath?: string | null,
    spotifyClientId?: string,
    spotifyClientSecret?: string,
  ): Promise<TempVoiceMusicTrack[]> {
    const source = this.detectSource(url);
    this.Logger.Info(`Resolving track from source: ${source}`, { url });

    switch (source) {
      case Source.YOUTUBE:
        return await this.resolveYouTube(url, youtubeCookiesPath);

      case Source.SPOTIFY:
        return await this.resolveSpotify(url, youtubeCookiesPath, spotifyClientId, spotifyClientSecret);

      case Source.SOUNDCLOUD:
      case Source.BANDCAMP:
      case Source.TIDAL:
      case Source.UNKNOWN:
        return await this.resolveViaYtDlp(url, source, youtubeCookiesPath);

      case Source.APPLE_MUSIC:
        return await this.resolveAppleMusic(url, youtubeCookiesPath);

      case Source.DEEZER:
        return await this.resolveDeezer(url, youtubeCookiesPath);

      case Source.DIRECT:
        return [this.resolveDirectUrl(url)];

      default:
        throw new Error(`Unsupported source: ${source}`);
    }
  }

  public async resolveTracksLazy(
    url: string,
    youtubeCookiesPath?: string | null,
    spotifyClientId?: string,
    spotifyClientSecret?: string,
  ): Promise<LazyResolveResult> {
    const source = this.detectSource(url);
    this.Logger.Info(`Resolving track from source (lazy): ${source}`, { url });

    switch (source) {
      case Source.YOUTUBE:
        return await this.resolveYouTubeLazy(url, youtubeCookiesPath);

      case Source.SPOTIFY:
        return await this.resolveSpotifyLazy(url, youtubeCookiesPath, spotifyClientId, spotifyClientSecret);

      case Source.SOUNDCLOUD:
      case Source.BANDCAMP:
      case Source.TIDAL:
      case Source.UNKNOWN:
        return await this.resolveViaYtDlpLazy(url, source, youtubeCookiesPath);

      case Source.APPLE_MUSIC:
        return await this.resolveAppleMusicLazy(url, youtubeCookiesPath);

      case Source.DEEZER:
        return await this.resolveDeezerLazy(url, youtubeCookiesPath);

      case Source.DIRECT:
        return { initialBatch: [this.resolveDirectUrl(url)], resolveNextBatch: async () => null };

      default:
        throw new Error(`Unsupported source: ${source}`);
    }
  }

  private async resolveYouTube(url: string, youtubeCookiesPath?: string | null): Promise<TempVoiceMusicTrack[]> {
    const normalizedUrl = this.normalizeYouTubeUrl(url);
    const videoId = this.extractYouTubeVideoId(normalizedUrl);
    const playlistId = this.extractYouTubePlaylistId(normalizedUrl);
    const isPlaylist = Boolean(playlistId && !videoId);

    if (isPlaylist) {
      return await this.loadPlaylistTracks(`https://www.youtube.com/playlist?list=${playlistId}`, youtubeCookiesPath, Source.YOUTUBE);
    }

    const trackUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : normalizedUrl;
    const info = await this.loadYoutubeInfo(trackUrl, youtubeCookiesPath);
    return [{
      Author: this.extractAuthor(info),
      DurationSeconds: this.parseDurationSeconds(info.duration),
      Source: Source.YOUTUBE,
      ThumbnailUrl: typeof info.thumbnail === "string" ? info.thumbnail : this.buildYoutubeThumbnailUrl(videoId ?? ""),
      Title: info.title ?? `YouTube ${videoId ?? "track"}`,
      Url: trackUrl,
      VideoId: videoId ?? undefined,
    }];
  }

  private async resolveSpotify(
    url: string,
    youtubeCookiesPath?: string | null,
    clientId?: string,
    clientSecret?: string,
  ): Promise<TempVoiceMusicTrack[]> {
    const isPlaylist = url.includes("/playlist/") || url.includes("/album/");
    const isTrack = url.includes("/track/") || url.startsWith("spotify:track:");

    if (isPlaylist) {
      return await this.resolveSpotifyPlaylist(url, youtubeCookiesPath, clientId, clientSecret);
    }

    if (!isTrack) {
      throw new Error("Only Spotify tracks, albums, and playlists are supported.");
    }

    if (clientId && clientSecret) {
      return await this.resolveSpotifyWithApi(url, youtubeCookiesPath, clientId, clientSecret);
    }

    return await this.resolveSpotifyViaPlayDl(url, youtubeCookiesPath);
  }

  private async resolveSpotifyWithApi(
    url: string,
    youtubeCookiesPath?: string | null,
    clientId?: string,
    clientSecret?: string,
  ): Promise<TempVoiceMusicTrack[]> {
    const trackId = this.extractSpotifyId(url);
    if (!trackId) throw new Error("Could not extract Spotify track ID.");

    const token = await this.fetchSpotifyToken(clientId!, clientSecret!);
    const metadata = await this.fetchSpotifyTrack(token, trackId);

    const searchQuery = `${metadata.name} ${metadata.artists?.map((a: { name: string }) => a.name).join(" ") || ""}`;
    const tracks = await this.searchYouTubeFirst(searchQuery, youtubeCookiesPath);
    if (tracks.length > 0) {
      tracks[0].Source = Source.SPOTIFY;
    }
    return tracks;
  }

  private async resolveSpotifyViaPlayDl(
    url: string,
    youtubeCookiesPath?: string | null,
  ): Promise<TempVoiceMusicTrack[]> {
    const { default: play } = await import("play-dl");
    const info = await play.spotify(url).catch(() => null);
    if (!info) throw new Error("Could not resolve Spotify track.");

    const name = "name" in info ? (info as { name: string }).name : "";
    const artists = "artists" in info ? (info as { artists: Array<{ name: string }> }).artists : [];
    const artistNames = Array.isArray(artists) ? artists.map((a) => a.name).join(" ") : "";
    const searchQuery = `${name} ${artistNames}`.trim() || name;

    const tracks = await this.searchYouTubeFirst(searchQuery, youtubeCookiesPath);
    if (tracks.length > 0) {
      tracks[0].Source = Source.SPOTIFY;
    }
    return tracks;
  }

  private async resolveSpotifyPlaylist(
    url: string,
    youtubeCookiesPath?: string | null,
    clientId?: string,
    clientSecret?: string,
  ): Promise<TempVoiceMusicTrack[]> {
    if (clientId && clientSecret) {
      return await this.resolveSpotifyPlaylistWithApi(url, youtubeCookiesPath, clientId, clientSecret);
    }
    return await this.resolveSpotifyPlaylistViaPlayDl(url, youtubeCookiesPath);
  }

  private async resolveSpotifyPlaylistWithApi(
    url: string,
    youtubeCookiesPath?: string | null,
    clientId?: string,
    clientSecret?: string,
  ): Promise<TempVoiceMusicTrack[]> {
    const playlistId = url.includes("/playlist/")
      ? url.split("/playlist/")[1]?.split("?")[0]?.split("?")[0] ?? ""
      : url.includes("/album/")
        ? url.split("/album/")[1]?.split("?")[0] ?? ""
        : "";

    if (!playlistId) throw new Error("Could not extract Spotify playlist/album ID.");

    const token = await this.fetchSpotifyToken(clientId!, clientSecret!);
    const isAlbum = url.includes("/album/");
    const items = isAlbum
      ? await this.fetchSpotifyAlbumTracks(token, playlistId)
      : await this.fetchSpotifyPlaylistTracks(token, playlistId);

    const tracks: TempVoiceMusicTrack[] = [];
    for (const item of items) {
      const searchQuery = `${item.name} ${item.artists}`;
      try {
        const found = await this.searchYouTubeFirst(searchQuery, youtubeCookiesPath);
        if (found.length > 0) {
          found[0].Source = Source.SPOTIFY;
          tracks.push(found[0]);
        }
      } catch {
        // skip failed tracks
      }
      if (tracks.length >= MaxPlaylistTracks) break;
    }

    if (tracks.length === 0) throw new Error("No playable tracks found in the Spotify playlist.");
    return tracks;
  }

  private async resolveSpotifyPlaylistViaPlayDl(
    url: string,
    youtubeCookiesPath?: string | null,
  ): Promise<TempVoiceMusicTrack[]> {
    const { default: play } = await import("play-dl");
    const isAlbum = url.includes("/album/");
    const items = isAlbum ? await play.spotify(url).catch(() => null) : null;

    if (items && "name" in items) {
      const albumInfo = items as { name: string; tracks?: Array<{ name: string; artists?: Array<{ name: string }> }> };
      const tracksList = albumInfo.tracks ?? [];
      const tracks: TempVoiceMusicTrack[] = [];
      for (const t of tracksList) {
        const artistNames = t.artists?.map((a) => a.name).join(" ") ?? "";
        try {
          const found = await this.searchYouTubeFirst(`${t.name} ${artistNames}`, youtubeCookiesPath);
          if (found.length > 0) {
            found[0].Source = Source.SPOTIFY;
            tracks.push(found[0]);
          }
        } catch {
          // skip
        }
        if (tracks.length >= MaxPlaylistTracks) break;
      }
      if (tracks.length > 0) return tracks;
    }

    throw new Error("This Spotify album/playlist could not be resolved. Configure Spotify API credentials in settings for full playlist support.");
  }

  private async resolveAppleMusic(url: string, youtubeCookiesPath?: string | null): Promise<TempVoiceMusicTrack[]> {
    const isPlaylist = url.includes("/playlist/") || url.includes("/album/");
    const isSongPath = url.includes("/song/");
    const trackIdMatch = url.match(/[?&]i=(\d+)/);
    const songPathIdMatch = isSongPath ? url.match(/\/(\d+)(?:\?|$)/) : null;
    const songId = trackIdMatch?.[1] ?? songPathIdMatch?.[1];
    const isTrack = Boolean(songId);

    if (isPlaylist && !isTrack) {
      return await this.resolveAppleMusicPlaylist(url, youtubeCookiesPath);
    }

    if (!isTrack) {
      throw new Error("Apple Music playlists and albums require a specific track link with a song ID.");
    }

    const resolvedSongId = songId!;
    const metadata = await this.fetchAppleMusicMetadata(resolvedSongId);
    if (!metadata) throw new Error("Could not fetch Apple Music track metadata.");

    const searchQuery = `${metadata.trackName} ${metadata.artistName}`;
    const tracks = await this.searchYouTubeFirst(searchQuery, youtubeCookiesPath);
    if (tracks.length > 0) {
      tracks[0].Source = Source.APPLE_MUSIC;
    }
    return tracks;
  }

  private async resolveAppleMusicPlaylist(url: string, youtubeCookiesPath?: string | null): Promise<TempVoiceMusicTrack[]> {
    const albumId = url.match(/\/album\/(?:[^/]+\/)?(\d+)(?:\?|$)/)?.[1];
    const playlistId = url.match(/\/playlist\/(?:[^/]+\/)?([a-zA-Z0-9._-]+)(?:\?|$)/)?.[1];
    const lookupId = albumId || playlistId;
    if (!lookupId) throw new Error("Could not extract Apple Music album/playlist ID.");

    if (albumId) {
      return await this.resolveAppleMusicAlbum(albumId, youtubeCookiesPath);
    }

    return await this.resolveAppleMusicPlaylistWeb(playlistId!, url, youtubeCookiesPath);
  }

  private async resolveAppleMusicAlbum(albumId: string, youtubeCookiesPath?: string | null): Promise<TempVoiceMusicTrack[]> {
    const tracks: TempVoiceMusicTrack[] = [];
    const data = await this.fetchAppleMusicCollection(albumId, "album", 0);
    const allTracks: Array<{ trackName: string; artistName: string }> = data ?? [];

    for (const t of allTracks.slice(0, MaxPlaylistTracks)) {
      try {
        const found = await this.searchYouTubeFirst(`${t.trackName} ${t.artistName}`, youtubeCookiesPath);
        if (found.length > 0) {
          found[0].Source = Source.APPLE_MUSIC;
          tracks.push(found[0]);
        }
      } catch {
        // skip failed
      }
    }

    if (tracks.length === 0) throw new Error("No playable tracks found in the Apple Music album.");
    return tracks;
  }

  private async resolveAppleMusicPlaylistWeb(playlistId: string, originalUrl: string, youtubeCookiesPath?: string | null): Promise<TempVoiceMusicTrack[]> {
    const tracks: TempVoiceMusicTrack[] = [];

    try {
      const response = await fetch(originalUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(15000),
      });
      const html = await response.text();

      const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
      const trackList: Array<{ name: string; author?: string }> = [];

      if (jsonLdMatch) {
        try {
          const jsonLd = JSON.parse(jsonLdMatch[1]);
          const tracksData = Array.isArray(jsonLd.track) ? jsonLd.track
            : jsonLd.itemListElement?.map((e: { item?: { name?: string; byArtist?: { name?: string } } }) => ({
                name: e.item?.name,
                author: e.item?.byArtist?.name,
              })) ?? [];
          for (const t of tracksData) {
            if (t.name) {
              trackList.push({ name: t.name, author: t.author ?? (typeof t.byArtist === "string" ? t.byArtist : undefined) });
            }
          }
        } catch { /* ignore parse errors */ }
      }

      if (trackList.length === 0) {
        const nameMatch = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
        const playlistName = nameMatch?.[1] ?? "Apple Music Playlist";
        const searchResults = await this.searchYouTubeFirst(playlistName, youtubeCookiesPath);
        if (searchResults.length > 0) {
          searchResults[0].Source = Source.APPLE_MUSIC;
          return searchResults;
        }
        throw new Error("Could not retrieve Apple Music playlist track list.");
      }

      for (const t of trackList.slice(0, MaxPlaylistTracks)) {
        try {
          const query = `${t.name}${t.author ? ` ${t.author}` : ""}`;
          const found = await this.searchYouTubeFirst(query, youtubeCookiesPath);
          if (found.length > 0) {
            found[0].Source = Source.APPLE_MUSIC;
            tracks.push(found[0]);
          }
        } catch {
          // skip
        }
      }
    } catch (err) {
      if (tracks.length === 0) {
        throw new Error("Could not retrieve Apple Music playlist: fetch failed.");
      }
    }

    if (tracks.length === 0) throw new Error("No playable tracks found in the Apple Music playlist.");
    return tracks;
  }

  private async resolveDeezer(url: string, youtubeCookiesPath?: string | null): Promise<TempVoiceMusicTrack[]> {
    const isPlaylist = url.includes("/playlist/") || url.includes("/album/");
    if (isPlaylist) {
      return await this.resolveDeezerPlaylist(url, youtubeCookiesPath);
    }

    const trackId = this.extractDeezerTrackId(url);
    if (!trackId) throw new Error("Could not extract Deezer track ID.");

    const metadata = await this.fetchDeezerTrack(trackId);
    if (!metadata) throw new Error("Could not fetch Deezer track metadata.");

    const searchQuery = `${metadata.title} ${metadata.artist?.name || ""}`;
    const tracks = await this.searchYouTubeFirst(searchQuery, youtubeCookiesPath);
    if (tracks.length > 0) {
      tracks[0].Source = Source.DEEZER;
    }
    return tracks;
  }

  private async resolveDeezerPlaylist(url: string, youtubeCookiesPath?: string | null): Promise<TempVoiceMusicTrack[]> {
    const id = this.extractDeezerCollectionId(url);
    if (!id) throw new Error("Could not extract Deezer collection ID.");

    const isAlbum = url.includes("/album/");
    const data = isAlbum ? await this.fetchDeezerAlbum(id) : await this.fetchDeezerPlaylist(id);
    const entries = data?.tracks?.data ?? [];
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new Error("No tracks found in this Deezer collection.");
    }

    const tracks: TempVoiceMusicTrack[] = [];
    for (const entry of entries.slice(0, MaxPlaylistTracks)) {
      try {
        const searchQuery = `${entry.title} ${entry.artist?.name || ""}`;
        const found = await this.searchYouTubeFirst(searchQuery, youtubeCookiesPath);
        if (found.length > 0) {
          found[0].Source = Source.DEEZER;
          tracks.push(found[0]);
        }
      } catch {
        // skip
      }
    }

    if (tracks.length === 0) throw new Error("No playable tracks found in the Deezer collection.");
    return tracks;
  }

  private async resolveViaYtDlp(url: string, source: string, youtubeCookiesPath?: string | null): Promise<TempVoiceMusicTrack[]> {
    const normalizedUrl = this.normalizeYouTubeUrl(url);
    const videoId = this.extractYouTubeVideoId(normalizedUrl);
    const playlistId = this.extractYouTubePlaylistId(normalizedUrl);
    const isPlaylist = Boolean(playlistId && !videoId);

    if (isPlaylist) {
      const tracks = await this.loadPlaylistTracks(`https://www.youtube.com/playlist?list=${playlistId}`, youtubeCookiesPath, source);
      return tracks.map((t) => ({ ...t, Source: source }));
    }

    try {
      const info = await this.loadYoutubeInfo(normalizedUrl, youtubeCookiesPath);
      const resolvedSource = source === Source.UNKNOWN ? Source.YOUTUBE : source;
      return [{
        Author: this.extractAuthor(info),
        DurationSeconds: this.parseDurationSeconds(info.duration),
        Source: resolvedSource,
        ThumbnailUrl: typeof info.thumbnail === "string" ? info.thumbnail : undefined,
        Title: info.title ?? "Unknown Title",
        Url: info.webpage_url ?? normalizedUrl,
        VideoId: info.id && /^[a-z0-9_-]{11}$/iu.test(info.id) ? info.id : undefined,
      }];
    } catch {
      return this.resolveViaYtDlpGeneric(normalizedUrl, source, youtubeCookiesPath);
    }
  }

  private async resolveViaYtDlpGeneric(url: string, source: string, youtubeCookiesPath?: string | null): Promise<TempVoiceMusicTrack[]> {
    const info = await this.loadYoutubeInfo(url, youtubeCookiesPath);
    const resolvedSource = source === Source.UNKNOWN ? Source.YOUTUBE : source;
    return [{
      Author: this.extractAuthor(info),
      DurationSeconds: this.parseDurationSeconds(info.duration),
      Source: resolvedSource,
      ThumbnailUrl: typeof info.thumbnail === "string" ? info.thumbnail : undefined,
      Title: info.title ?? "Unknown Title",
      Url: info.webpage_url ?? url,
      VideoId: info.id && /^[a-z0-9_-]{11}$/iu.test(info.id) ? info.id : undefined,
    }];
  }

  // ── Lazy resolution methods ────────────────────────────────────

  private async resolveYouTubeLazy(url: string, youtubeCookiesPath?: string | null): Promise<LazyResolveResult> {
    const normalizedUrl = this.normalizeYouTubeUrl(url);
    const videoId = this.extractYouTubeVideoId(normalizedUrl);
    const playlistId = this.extractYouTubePlaylistId(normalizedUrl);
    const isPlaylist = Boolean(playlistId && !videoId);

    if (!isPlaylist) {
      const tracks = await this.resolveYouTube(url, youtubeCookiesPath);
      return { initialBatch: tracks, resolveNextBatch: async () => null };
    }

    const playlistUrl = `https://www.youtube.com/playlist?list=${playlistId}`;
    const output = await YoutubeDl(playlistUrl, this.buildYoutubeDlFlags({
      dumpSingleJson: true,
      flatPlaylist: true,
      ignoreErrors: true,
      playlistEnd: MaxPlaylistTracks,
      skipDownload: true,
    }, youtubeCookiesPath)) as YoutubeDlPlaylistPayload;

    const entries = (Array.isArray(output.entries) ? output.entries : [])
      .filter((e): e is YoutubeDlPlaylistEntry => Boolean(e))
      .slice(0, MaxPlaylistTracks);

    let currentIndex = 0;

    const resolveBatch = async (start: number, count: number): Promise<TempVoiceMusicTrack[]> => {
      const batch = entries.slice(start, start + count);
      const results: TempVoiceMusicTrack[] = [];
      for (const entry of batch) {
        const trackUrl = this.buildPlaylistEntryUrl(entry);
        const entryVideoId = entry.id && /^[a-z0-9_-]{11}$/iu.test(entry.id) ? entry.id : null;
        if (trackUrl) {
          results.push({
            Author: this.extractAuthor(entry),
            DurationSeconds: this.parseDurationSeconds(entry.duration),
            Source: Source.YOUTUBE,
            ThumbnailUrl: entry.thumbnail ?? (entryVideoId ? this.buildYoutubeThumbnailUrl(entryVideoId) : undefined),
            Title: entry.title?.trim() || `YouTube ${entry.id ?? "track"}`,
            Url: trackUrl,
            VideoId: entryVideoId ?? undefined,
          });
        }
      }
      return results;
    };

    const initial = await resolveBatch(0, LazyBatchSize);
    currentIndex = LazyBatchSize;

    return {
      initialBatch: initial,
      resolveNextBatch: async () => {
        if (currentIndex >= entries.length) return null;
        const batch = await resolveBatch(currentIndex, LazyBatchSize);
        currentIndex += LazyBatchSize;
        return batch.length > 0 ? batch : null;
      },
    };
  }

  private async resolveSpotifyLazy(
    url: string,
    youtubeCookiesPath?: string | null,
    clientId?: string,
    clientSecret?: string,
  ): Promise<LazyResolveResult> {
    const isPlaylist = url.includes("/playlist/") || url.includes("/album/");
    const isTrack = url.includes("/track/") || url.startsWith("spotify:track:");

    if (!isPlaylist) {
      const tracks = await this.resolveSpotify(url, youtubeCookiesPath, clientId, clientSecret);
      return { initialBatch: tracks, resolveNextBatch: async () => null };
    }

    if (!isTrack && !isPlaylist) {
      throw new Error("Only Spotify tracks, albums, and playlists are supported.");
    }

    const metadata = await this.resolveSpotifyPlaylistMetadata(url, clientId, clientSecret);
    let currentIndex = 0;

    const resolveBatch = async (start: number, count: number): Promise<TempVoiceMusicTrack[]> => {
      const batch = metadata.slice(start, start + count);
      const results: TempVoiceMusicTrack[] = [];
      for (const item of batch) {
        try {
          const query = `${item.name} ${item.artists}`;
          const found = await this.searchYouTubeFirst(query, youtubeCookiesPath);
          if (found.length > 0) {
            found[0].Source = Source.SPOTIFY;
            results.push(found[0]);
          }
        } catch {
          // skip
        }
      }
      return results;
    };

    const initial = await resolveBatch(0, LazyBatchSize);
    currentIndex = LazyBatchSize;

    return {
      initialBatch: initial,
      resolveNextBatch: async () => {
        if (currentIndex >= metadata.length) return null;
        const batch = await resolveBatch(currentIndex, LazyBatchSize);
        currentIndex += LazyBatchSize;
        return batch.length > 0 ? batch : null;
      },
    };
  }

  private async resolveSpotifyPlaylistMetadata(
    url: string,
    clientId?: string,
    clientSecret?: string,
  ): Promise<Array<{ name: string; artists: string }>> {
    if (clientId && clientSecret) {
      const token = await this.fetchSpotifyToken(clientId, clientSecret);
      const isAlbum = url.includes("/album/");
      const playlistId = url.includes("/playlist/")
        ? url.split("/playlist/")[1]?.split("?")[0] ?? ""
        : url.includes("/album/")
          ? url.split("/album/")[1]?.split("?")[0] ?? ""
          : "";

      if (!playlistId) throw new Error("Could not extract Spotify playlist/album ID.");

      return isAlbum
        ? await this.fetchSpotifyAlbumTracks(token, playlistId)
        : await this.fetchSpotifyPlaylistTracks(token, playlistId);
    }

    // Fallback to play-dl
    const { default: play } = await import("play-dl");
    const isAlbum = url.includes("/album/");
    if (isAlbum) {
      const items = await play.spotify(url).catch(() => null);
      if (items && "tracks" in items) {
        const albumInfo = items as { tracks?: Array<{ name: string; artists?: Array<{ name: string }> }> };
        return (albumInfo.tracks ?? []).map((t) => ({
          name: t.name,
          artists: t.artists?.map((a) => a.name).join(", ") ?? "",
        }));
      }
    }

    throw new Error("This Spotify album/playlist could not be resolved. Configure Spotify API credentials in settings for full playlist support.");
  }

  private async resolveViaYtDlpLazy(url: string, source: string, youtubeCookiesPath?: string | null): Promise<LazyResolveResult> {
    // For SoundCloud, Bandcamp, Tidal, Unknown: try to detect playlist, otherwise single
    const normalizedUrl = this.normalizeYouTubeUrl(url);
    const videoId = this.extractYouTubeVideoId(normalizedUrl);
    const playlistId = this.extractYouTubePlaylistId(normalizedUrl);
    const isPlaylist = Boolean(playlistId && !videoId);

    if (isPlaylist) {
      // Use the YouTube lazy resolver for playlist
      return await this.resolveYouTubeLazy(url, youtubeCookiesPath);
    }

    try {
      const info = await this.loadYoutubeInfo(normalizedUrl, youtubeCookiesPath);
      const resolvedSource = source === Source.UNKNOWN ? Source.YOUTUBE : source;
      return {
        initialBatch: [{
          Author: this.extractAuthor(info),
          DurationSeconds: this.parseDurationSeconds(info.duration),
          Source: resolvedSource,
          ThumbnailUrl: typeof info.thumbnail === "string" ? info.thumbnail : undefined,
          Title: info.title ?? "Unknown Title",
          Url: info.webpage_url ?? normalizedUrl,
          VideoId: info.id && /^[a-z0-9_-]{11}$/iu.test(info.id) ? info.id : undefined,
        }],
        resolveNextBatch: async () => null,
      };
    } catch {
      const info = await this.loadYoutubeInfo(normalizedUrl, youtubeCookiesPath);
      const resolvedSource = source === Source.UNKNOWN ? Source.YOUTUBE : source;
      return {
        initialBatch: [{
          Author: this.extractAuthor(info),
          DurationSeconds: this.parseDurationSeconds(info.duration),
          Source: resolvedSource,
          ThumbnailUrl: typeof info.thumbnail === "string" ? info.thumbnail : undefined,
          Title: info.title ?? "Unknown Title",
          Url: info.webpage_url ?? normalizedUrl,
          VideoId: info.id && /^[a-z0-9_-]{11}$/iu.test(info.id) ? info.id : undefined,
        }],
        resolveNextBatch: async () => null,
      };
    }
  }

  private async resolveAppleMusicLazy(url: string, youtubeCookiesPath?: string | null): Promise<LazyResolveResult> {
    const isPlaylist = url.includes("/playlist/") || url.includes("/album/");
    const isSongPath = url.includes("/song/");
    const trackIdMatch = url.match(/[?&]i=(\d+)/);
    const songPathIdMatch = isSongPath ? url.match(/\/(\d+)(?:\?|$)/) : null;
    const songId = trackIdMatch?.[1] ?? songPathIdMatch?.[1];
    const isTrack = Boolean(songId);

    if (isTrack) {
      const tracks = await this.resolveAppleMusic(url, youtubeCookiesPath);
      return { initialBatch: tracks, resolveNextBatch: async () => null };
    }

    if (!isPlaylist) {
      throw new Error("Apple Music playlists and albums require a specific track link with a song ID.");
    }

    const albumId = url.match(/\/album\/(?:[^/]+\/)?(\d+)(?:\?|$)/)?.[1];
    const playlistId = url.match(/\/playlist\/(?:[^/]+\/)?([a-zA-Z0-9._-]+)(?:\?|$)/)?.[1];
    const lookupId = albumId || playlistId;
    if (!lookupId) throw new Error("Could not extract Apple Music album/playlist ID.");

    let allTracks: Array<{ name: string; author?: string }> = [];

    if (albumId) {
      const data = await this.fetchAppleMusicCollection(albumId, "album", 0);
      allTracks = (data ?? []).map((t) => ({ name: t.trackName, author: t.artistName }));
    } else {
      const data = await this.fetchAppleMusicPlaylistWebData(url);
      allTracks = data ?? [];
    }

    if (allTracks.length === 0) throw new Error("No tracks found in the Apple Music collection.");
    allTracks = allTracks.slice(0, MaxPlaylistTracks);

    let currentIndex = 0;

    const resolveBatch = async (start: number, count: number): Promise<TempVoiceMusicTrack[]> => {
      const batch = allTracks.slice(start, start + count);
      const results: TempVoiceMusicTrack[] = [];
      for (const t of batch) {
        try {
          const query = `${t.name}${t.author ? ` ${t.author}` : ""}`;
          const found = await this.searchYouTubeFirst(query, youtubeCookiesPath);
          if (found.length > 0) {
            found[0].Source = Source.APPLE_MUSIC;
            results.push(found[0]);
          }
        } catch {
          // skip
        }
      }
      return results;
    };

    const initial = await resolveBatch(0, LazyBatchSize);
    currentIndex = LazyBatchSize;

    return {
      initialBatch: initial,
      resolveNextBatch: async () => {
        if (currentIndex >= allTracks.length) return null;
        const batch = await resolveBatch(currentIndex, LazyBatchSize);
        currentIndex += LazyBatchSize;
        return batch.length > 0 ? batch : null;
      },
    };
  }

  private async resolveDeezerLazy(url: string, youtubeCookiesPath?: string | null): Promise<LazyResolveResult> {
    const isPlaylist = url.includes("/playlist/") || url.includes("/album/");
    const isTrack = Boolean(url.match(/track[/:](\d+)/));

    if (!isPlaylist) {
      const tracks = await this.resolveDeezer(url, youtubeCookiesPath);
      return { initialBatch: tracks, resolveNextBatch: async () => null };
    }

    const id = this.extractDeezerCollectionId(url);
    if (!id) throw new Error("Could not extract Deezer collection ID.");

    const isAlbum = url.includes("/album/");
    const data = isAlbum ? await this.fetchDeezerAlbum(id) : await this.fetchDeezerPlaylist(id);
    const entries = (data?.tracks?.data ?? []).slice(0, MaxPlaylistTracks);
    if (entries.length === 0) throw new Error("No tracks found in this Deezer collection.");

    let currentIndex = 0;

    const resolveBatch = async (start: number, count: number): Promise<TempVoiceMusicTrack[]> => {
      const batch = entries.slice(start, start + count);
      const results: TempVoiceMusicTrack[] = [];
      for (const entry of batch) {
        try {
          const query = `${entry.title} ${entry.artist?.name || ""}`;
          const found = await this.searchYouTubeFirst(query, youtubeCookiesPath);
          if (found.length > 0) {
            found[0].Source = Source.DEEZER;
            results.push(found[0]);
          }
        } catch {
          // skip
        }
      }
      return results;
    };

    const initial = await resolveBatch(0, LazyBatchSize);
    currentIndex = LazyBatchSize;

    return {
      initialBatch: initial,
      resolveNextBatch: async () => {
        if (currentIndex >= entries.length) return null;
        const batch = await resolveBatch(currentIndex, LazyBatchSize);
        currentIndex += LazyBatchSize;
        return batch.length > 0 ? batch : null;
      },
    };
  }

  private async fetchAppleMusicPlaylistWebData(url: string): Promise<Array<{ name: string; author?: string }> | null> {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(15000),
      });
      const html = await response.text();

      const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
      if (jsonLdMatch) {
        try {
          const jsonLd = JSON.parse(jsonLdMatch[1]);
          const tracksData = Array.isArray(jsonLd.track) ? jsonLd.track
            : jsonLd.itemListElement?.map((e: { item?: { name?: string; byArtist?: { name?: string } } }) => ({
                name: e.item?.name,
                author: e.item?.byArtist?.name,
              })) ?? [];
          const result: Array<{ name: string; author?: string }> = [];
          for (const t of tracksData) {
            if (t.name) {
              result.push({ name: t.name, author: t.author ?? (typeof t.byArtist === "string" ? t.byArtist : undefined) });
            }
          }
          if (result.length > 0) return result;
        } catch { /* ignore */ }
      }

      const scripts = html.match(/<script[^>]*>[\s\S]*?window\.__INITIAL_STATE__[\s\S]*?<\/script>/i);
      if (scripts) {
        try {
          const content = scripts[0].replace(/<script[^>]*>/, "").replace(/<\/script>/, "");
          const parsed = JSON.parse(content.substring(content.indexOf("{")));
          const sections = parsed?.store?.sections?.items ?? [];
          for (const section of sections) {
            if (section.itemList?.items) {
              const items = section.itemList.items.map((i: { title?: string; subtitle?: string }) => ({
                name: i.title ?? "",
                author: i.subtitle ?? undefined,
              })).filter((i: { name: string }) => i.name);
              if (items.length > 0) return items;
            }
          }
        } catch { /* ignore */ }
      }

      return null;
    } catch {
      return null;
    }
  }

  private resolveDirectUrl(url: string): TempVoiceMusicTrack {
    const urlObj = new URL(url);
    const filename = urlObj.pathname.split("/").pop() || "Unknown Track";
    const title = decodeURIComponent(filename.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
    return {
      Author: urlObj.hostname,
      DirectUrl: url,
      DurationSeconds: 0,
      Source: Source.DIRECT,
      ThumbnailUrl: undefined,
      Title: title,
      Url: url,
    };
  }

  private async searchYouTubeFirst(query: string, youtubeCookiesPath?: string | null): Promise<TempVoiceMusicTrack[]> {
    const { default: play } = await import("play-dl");
    const results = await play.search(query, { limit: 1, source: { youtube: "video" } });
    if (!results || results.length === 0) throw new Error(`No YouTube results for: ${query}`);

    const video = results[0];
    return [{
      Author: video.channel?.name || "Unknown Artist",
      DurationSeconds: video.durationInSec || 0,
      ThumbnailUrl: video.thumbnails?.[0]?.url || undefined,
      Title: video.title || "Unknown Title",
      Url: video.url,
      VideoId: this.extractYouTubeVideoId(video.url) ?? undefined,
    }];
  }

  public async resolveDirectStreamUrl(url: string, youtubeCookiesPath?: string | null): Promise<string> {
    let output: YoutubeDlPayload | string;
    try {
      output = await YoutubeDl(url, this.buildYoutubeDlFlags({
        format: "bestaudio/best",
        getUrl: true,
      }, youtubeCookiesPath));
    } catch (err) {
      throw new Error(`Stream URL could not be resolved: ${err instanceof Error ? err.message : String(err)}`);
    }

    const directUrl = String(output).trim().split(/\r?\n/u).find(Boolean);
    if (!directUrl) throw new Error("Stream URL could not be resolved.");
    return directUrl;
  }

  private async loadYoutubeInfo(url: string, youtubeCookiesPath?: string | null): Promise<YoutubeDlPayload> {
    const output = await YoutubeDl(url, this.buildYoutubeDlFlags({
      dumpSingleJson: true,
      skipDownload: true,
    }, youtubeCookiesPath));
    return output as YoutubeDlPayload;
  }

  private async loadPlaylistTracks(url: string, youtubeCookiesPath?: string | null, source?: string): Promise<TempVoiceMusicTrack[]> {
    const output = await YoutubeDl(url, this.buildYoutubeDlFlags({
      dumpSingleJson: true,
      flatPlaylist: true,
      ignoreErrors: true,
      playlistEnd: MaxPlaylistTracks,
      skipDownload: true,
    }, youtubeCookiesPath)) as YoutubeDlPlaylistPayload;

    const entries = Array.isArray(output.entries) ? output.entries : [];
    return entries
      .filter((entry): entry is NonNullable<(typeof entries)[number]> => Boolean(entry))
      .map((entry): TempVoiceMusicTrack | null => {
        const trackUrl = this.buildPlaylistEntryUrl(entry);
        const videoId = entry.id && /^[a-z0-9_-]{11}$/iu.test(entry.id) ? entry.id : null;
        return trackUrl
          ? {
              Author: this.extractAuthor(entry),
              DurationSeconds: this.parseDurationSeconds(entry.duration),
              Source: source,
              ThumbnailUrl: entry.thumbnail ?? (videoId ? this.buildYoutubeThumbnailUrl(videoId) : undefined),
              Title: entry.title?.trim() || `Track ${entry.id ?? "unknown"}`,
              Url: trackUrl,
              VideoId: videoId ?? undefined,
            }
          : null;
      })
      .filter((track): track is TempVoiceMusicTrack => track !== null)
      .slice(0, MaxPlaylistTracks);
  }

  private buildPlaylistEntryUrl(entry: YoutubeDlPlaylistEntry): string | null {
    if (entry.webpage_url) return this.normalizeYouTubeUrl(entry.webpage_url);
    if (entry.id && /^[a-z0-9_-]{11}$/iu.test(entry.id)) return `https://www.youtube.com/watch?v=${entry.id}`;
    if (entry.url) return this.normalizeYouTubeUrl(entry.url);
    return null;
  }

  // ── Spotify API helpers ─────────────────────────────────────────

  private async fetchSpotifyToken(clientId: string, clientSecret: string): Promise<string> {
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
    });
    const data = await response.json() as { access_token?: string };
    if (!data.access_token) throw new Error("Could not obtain Spotify access token.");
    return data.access_token;
  }

  private async fetchSpotifyTrack(token: string, trackId: string): Promise<{ name: string; artists?: Array<{ name: string }> }> {
    const response = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return await response.json() as { name: string; artists?: Array<{ name: string }> };
  }

  private async fetchSpotifyPlaylistTracks(
    token: string, playlistId: string,
  ): Promise<Array<{ name: string; artists: string }>> {
    const results: Array<{ name: string; artists: string }> = [];
    let url: string | null = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50`;

    while (url && results.length < MaxPlaylistTracks) {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json() as {
        items?: Array<{ track?: { name: string; artists?: Array<{ name: string }> } | null }>;
        next?: string | null;
      };
      for (const item of data.items ?? []) {
        if (item.track) {
          results.push({
            name: item.track.name,
            artists: item.track.artists?.map((a) => a.name).join(", ") ?? "",
          });
        }
      }
      url = data.next ?? null;
    }

    return results.slice(0, MaxPlaylistTracks);
  }

  private async fetchSpotifyAlbumTracks(
    token: string, albumId: string,
  ): Promise<Array<{ name: string; artists: string }>> {
    const response = await fetch(`https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json() as {
      items?: Array<{ name: string; artists?: Array<{ name: string }> }>;
    };
    return (data.items ?? []).map((item) => ({
      name: item.name,
      artists: item.artists?.map((a) => a.name).join(", ") ?? "",
    })).slice(0, MaxPlaylistTracks);
  }

  private extractSpotifyId(url: string): string | null {
    const match = url.match(/track[/:]([a-zA-Z0-9]+)/);
    return match?.[1] ?? null;
  }

  // ── Apple Music API helpers ─────────────────────────────────────

  private async fetchAppleMusicMetadata(songId: string): Promise<{ trackName: string; artistName: string } | null> {
    try {
      const response = await fetch(`https://itunes.apple.com/lookup?id=${songId}`);
      const data = await response.json() as {
        results?: Array<{ trackName?: string; artistName?: string }>;
      };
      const result = data.results?.[0];
      if (!result) return null;
      return {
        trackName: result.trackName ?? "Unknown Track",
        artistName: result.artistName ?? "Unknown Artist",
      };
    } catch {
      return null;
    }
  }

  private async fetchAppleMusicCollection(
    collectionId: string,
    type: "album" | "playlist",
    page: number,
  ): Promise<Array<{ trackName: string; artistName: string }> | null> {
    try {
      if (type === "album") {
        const response = await fetch(`https://itunes.apple.com/lookup?id=${collectionId}&entity=song&limit=100`);
        const data = await response.json() as {
          results?: Array<{ tracks?: Array<{ trackName?: string; artistName?: string }> }>;
        };
        const album = data.results?.[0];
        if (album?.tracks) {
          return album.tracks.map((t) => ({
            trackName: t.trackName ?? "Unknown Track",
            artistName: t.artistName ?? "Unknown Artist",
          }));
        }
        return null;
      }
      return null;
    } catch {
      return null;
    }
  }

  // ── Deezer API helpers ──────────────────────────────────────────

  private extractDeezerTrackId(url: string): string | null {
    const match = url.match(/track[/:](\d+)/);
    return match?.[1] ?? null;
  }

  private extractDeezerCollectionId(url: string): string | null {
    const match = url.match(/\/(album|playlist)[/](\d+)/);
    return match?.[2] ?? null;
  }

  private async fetchDeezerTrack(trackId: string): Promise<{ title: string; artist?: { name: string } } | null> {
    try {
      const response = await fetch(`https://api.deezer.com/track/${trackId}`);
      const data = await response.json() as { title?: string; artist?: { name?: string } };
      if (!data.title) return null;
      return {
        title: data.title,
        artist: data.artist ? { name: data.artist.name ?? "Unknown Artist" } : undefined,
      };
    } catch {
      return null;
    }
  }

  private async fetchDeezerAlbum(albumId: string): Promise<{ tracks?: { data?: Array<{ title: string; artist?: { name: string } }> } } | null> {
    try {
      const response = await fetch(`https://api.deezer.com/album/${albumId}`);
      return await response.json() as { tracks?: { data?: Array<{ title: string; artist?: { name: string } }> } };
    } catch {
      return null;
    }
  }

  private async fetchDeezerPlaylist(playlistId: string): Promise<{ tracks?: { data?: Array<{ title: string; artist?: { name: string } }> } } | null> {
    try {
      const response = await fetch(`https://api.deezer.com/playlist/${playlistId}`);
      return await response.json() as { tracks?: { data?: Array<{ title: string; artist?: { name: string } }> } };
    } catch {
      return null;
    }
  }

  // ── YouTube URL helpers ─────────────────────────────────────────

  private normalizeYouTubeUrl(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return "";

    try {
      const urlValue = new URL(trimmed);
      const hostname = urlValue.hostname.replace(/^www\./u, "");

      if (hostname === "youtu.be") {
        const videoId = urlValue.pathname.split("/").filter(Boolean)[0] ?? "";
        return videoId ? `https://www.youtube.com/watch?v=${videoId}` : trimmed;
      }

      if (hostname === "youtube.com" || hostname === "music.youtube.com") {
        const playlistId = urlValue.searchParams.get("list");
        const videoId = urlValue.searchParams.get("v")
          ?? (urlValue.pathname.startsWith("/shorts/") ? urlValue.pathname.split("/")[2] : "");

        if (playlistId && !videoId) return `https://www.youtube.com/playlist?list=${playlistId}`;
        if (videoId) return `https://www.youtube.com/watch?v=${videoId}${playlistId ? `&list=${playlistId}` : ""}`;
      }
    } catch {
      return trimmed;
    }

    return trimmed;
  }

  private extractYouTubeVideoId(value: string): string | null {
    try {
      const urlValue = new URL(value.trim());
      const hostname = urlValue.hostname.replace(/^www\./u, "");
      if (hostname === "youtu.be") return this.normalizeVideoId(urlValue.pathname.split("/").filter(Boolean)[0] ?? "");
      if (hostname === "youtube.com" || hostname === "music.youtube.com") {
        if (urlValue.pathname === "/watch") return this.normalizeVideoId(urlValue.searchParams.get("v") ?? "");
        if (urlValue.pathname.startsWith("/shorts/") || urlValue.pathname.startsWith("/embed/")) {
          return this.normalizeVideoId(urlValue.pathname.split("/")[2] ?? "");
        }
      }
    } catch {
      return this.normalizeVideoId(value);
    }
    return this.normalizeVideoId(value);
  }

  private extractYouTubePlaylistId(value: string): string | null {
    try {
      const urlValue = new URL(value.trim());
      const playlistId = urlValue.searchParams.get("list") ?? "";
      return /^[a-z0-9_-]{10,80}$/iu.test(playlistId) ? playlistId : null;
    } catch {
      return null;
    }
  }

  private normalizeVideoId(value: string): string | null {
    return /^[a-z0-9_-]{11}$/iu.test(value.trim()) ? value.trim() : null;
  }

  private buildYoutubeThumbnailUrl(videoId: string): string {
    return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "";
  }

  private extractAuthor(value: unknown): string {
    const source = value as Record<string, unknown> | null;
    for (const key of ["artist", "uploader", "channel", "creator"] as const) {
      const candidate = source?.[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
    return "";
  }

  private parseDurationSeconds(value: unknown): number | null {
    const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
  }

  private buildYoutubeDlFlags(flags: YoutubeDlFlags, youtubeCookiesPath?: string | null): YoutubeDlFlags {
    const cookiesPath = this.getReadableYoutubeCookiesPath(youtubeCookiesPath);
    return { noWarnings: true, ...flags, ...(cookiesPath ? { cookies: cookiesPath } : {}) };
  }

  private getReadableYoutubeCookiesPath(youtubeCookiesPath?: string | null): string {
    const cookiesPath = (youtubeCookiesPath === undefined
      ? process.env.TEMPVOICE_YOUTUBE_COOKIES_PATH ?? process.env.YOUTUBE_COOKIES_PATH ?? ""
      : youtubeCookiesPath ?? "").trim();
    return cookiesPath;
  }
}
