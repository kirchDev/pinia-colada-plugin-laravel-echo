import type {
  EntryKey,
  PiniaColadaPlugin,
  QueryCache,
  UseQueryEntry
} from '@pinia/colada';
import type { ConnectionStatus } from 'laravel-echo';
import { onScopeDispose, toValue } from 'vue';

/**
 * The parts of a Laravel Echo channel this plugin uses.
 *
 * Structural on purpose: Echo's own channel types are generic over the
 * broadcaster, and the plugin has no business knowing which one is in use — the
 * whole point of talking to Echo rather than to Reverb is that Pusher, Ably and
 * Socket.io come along for free.
 */
export interface EchoChannelLike {
  listen(event: string, callback: (payload: never) => void): unknown;
  stopListening(event: string, callback?: (payload: never) => void): unknown;
}

/**
 * The parts of a Laravel Echo instance this plugin uses.
 *
 * A real `Echo<'reverb' | 'pusher' | 'ably' | 'socket.io'>` satisfies this, and
 * so does a hand-written test double — which is why the suite never needs a
 * running websocket server.
 */
export interface EchoLike {
  channel(name: string): EchoChannelLike;
  private(name: string): EchoChannelLike;
  encryptedPrivate(name: string): EchoChannelLike;
  join(name: string): EchoChannelLike;
  leaveChannel(name: string): void;
  connectionStatus(): ConnectionStatus;
  connector: {
    onConnectionChange(
      callback: (status: ConnectionStatus) => void
    ): () => void;
  };
}

/** How a channel name is scoped, mirroring Echo's four channel constructors. */
export type EchoChannelVisibility =
  | 'public'
  | 'private'
  | 'encryptedPrivate'
  | 'presence';

/**
 * What a listener is handed besides the broadcast payload.
 *
 * The plugin has no opinion about the payload — how a row is inserted, replaced
 * or counted is the caller's business — so the handler gets a cache handle
 * already bound to the entry that declared the listener instead.
 *
 * Deliberately **not** generic over the query's data type, and the cache
 * handles carry their own type parameter instead. Reaching `TData` in here
 * would put it in a contravariant position of `UseQueryOptions`, and merely
 * installing this plugin would then make `UseQueryEntry<Notification[]>` stop
 * being assignable to the plain `UseQueryEntry` that `queryCache.invalidate()`,
 * `cancel()`, `track()` and `remove()` all take. A plugin has no business
 * making the library it extends stricter, so the type argument moves to the
 * call site: `setQueryData<Notification[]>(…)`.
 */
export interface EchoEventContext {
  /** The event name that fired, as written in `listen`. */
  event: string;
  /** The key of the entry this listener belongs to. */
  key: EntryKey;
  /** The entry itself, for the rare case the handles below are not enough. */
  entry: UseQueryEntry;
  /** The whole cache, for touching entries other than this one. */
  queryCache: QueryCache;
  /** Write this entry's data, from a value or from the previous data. */
  setQueryData<TData = unknown>(
    data: TData | ((oldData: TData | undefined) => TData)
  ): void;
  /** Read this entry's current data. */
  getQueryData<TData = unknown>(): TData | undefined;
  /** Mark this entry stale and refetch it if anything is using it. */
  invalidate(): Promise<unknown>;
}

/**
 * A broadcast listener. The payload is `any` deliberately: guessing its shape
 * would make the plugin useless for the second consumer.
 */
export type EchoEventHandler = (
  // oxlint-disable-next-line no-explicit-any
  payload: any,
  context: EchoEventContext
) => void;

/** The `echo` query option. */
export interface UseQueryEchoOptions {
  /**
   * Channel name *without* the visibility prefix — `private-`, `presence-` and
   * `private-encrypted-` are Echo's to add, exactly as with `echo.private()`.
   *
   * A getter is resolved once, when the cache entry is created. Anything the
   * name depends on therefore belongs in the query `key` too, so that a change
   * produces a new entry rather than a stale subscription.
   */
  channel: string | (() => string);
  /** @default 'private' */
  visibility?: EchoChannelVisibility;
  /** Event name to handler. Names starting with `.` skip Laravel's namespace. */
  listen: Record<string, EchoEventHandler>;
  /**
   * `staleTime` to use *while the connection is up*, in milliseconds.
   *
   * Events keep the cache current as long as they arrive, so a live query
   * usually does not need to refetch on mount or on focus at all — `Infinity`
   * says exactly that. The moment the connection drops, the query's normal
   * `staleTime` is restored, because from then on nothing is keeping it
   * current.
   *
   * Left unset, the query's `staleTime` is never touched.
   */
  staleTime?: number;
  /**
   * Invalidate this entry once when the connection comes back, to pick up
   * whatever was missed while it was down.
   *
   * @default true
   */
  invalidateOnReconnect?: boolean;
}

/** Options for {@link PiniaColadaLaravelEcho}. */
export interface PiniaColadaLaravelEchoOptions {
  /**
   * The Echo instance, or a getter returning it.
   *
   * A getter covers the lazily configured instance `@laravel/echo-vue` hands
   * out (`echo: () => echo()`) and the server, where there is no instance at
   * all: return `null` there and every `echo` query is simply left alone.
   */
  echo: EchoLike | (() => EchoLike | null | undefined);
}

declare module '@pinia/colada' {
  interface UseQueryOptions<
    TData,
    TError,
    TDataInitial extends TData | undefined
  > {
    /**
     * Keep this query's cache current from Laravel Echo broadcasts, and
     * invalidate it when the connection drops and comes back.
     */
    echo?: UseQueryEchoOptions;
  }
}

/** One live channel, shared by every entry that named it. */
interface ChannelSubscription {
  channel: EchoChannelLike;
  /** Echo's own name for the channel, prefix included — what `leaveChannel` wants. */
  prefixedName: string;
  /** How many entries are on this channel. The channel is left at zero. */
  entryCount: number;
}

/** What one cache entry added, and what has to be undone when it is removed. */
interface EntryBinding {
  entry: UseQueryEntry;
  echoOptions: UseQueryEchoOptions;
  channelId: string;
  listeners: Array<[event: string, handler: (payload: never) => void]>;
  /**
   * The options object whose `staleTime` this plugin overwrote, and the value
   * it held first.
   *
   * `queryCache.ensure()` builds a *fresh* options object on every call and
   * assigns it to the entry, so an overwritten `staleTime` does not survive the
   * next render. Holding the object identity is what lets the plugin notice
   * that and re-apply, without ever restoring a value onto the wrong object.
   */
  patched?: { options: object; baseStaleTime: number };
}

const CHANNEL_PREFIX: Record<EchoChannelVisibility, string> = {
  public: '',
  private: 'private-',
  encryptedPrivate: 'private-encrypted-',
  presence: 'presence-'
};

function openChannel(
  echo: EchoLike,
  visibility: EchoChannelVisibility,
  name: string
): EchoChannelLike {
  switch (visibility) {
    case 'public':
      return echo.channel(name);
    case 'encryptedPrivate':
      return echo.encryptedPrivate(name);
    case 'presence':
      return echo.join(name);
    default:
      return echo.private(name);
  }
}

/**
 * Pinia Colada plugin that ties a query's cache to Laravel Echo.
 *
 * It does two things, and the second is the reason it is a plugin rather than a
 * composable: it subscribes a channel for as long as the cache entry lives, and
 * it treats the connection itself as part of the cache's validity. A websocket
 * drops — tunnel, standby, a wifi handover — and from that moment the client
 * silently misses events while the cache still looks fresh. Here, connection
 * loss falls back to the query's normal refetch behaviour and reconnection
 * invalidates once.
 *
 * @example
 * ```ts
 * createApp(App).use(PiniaColada, {
 *   plugins: [PiniaColadaLaravelEcho({ echo: () => echo() })]
 * })
 * ```
 */
export function PiniaColadaLaravelEcho(
  options: PiniaColadaLaravelEchoOptions
): PiniaColadaPlugin {
  return ({ queryCache, scope }) => {
    const subscriptions = new Map<string, ChannelSubscription>();
    const bindings = new Map<string, EntryBinding>();

    let echo: EchoLike | null = null;
    let stopConnectionListener: (() => void) | undefined;
    let connected = false;
    /** Whether a connection was ever up, so the first connect is not a *re*connect. */
    let everConnected = false;

    function resolveEcho(): EchoLike | null {
      if (echo) return echo;
      const resolved =
        typeof options.echo === 'function' ? options.echo() : options.echo;
      if (!resolved) return null;
      echo = resolved;
      connected = resolved.connectionStatus() === 'connected';
      everConnected = connected;
      stopConnectionListener = resolved.connector.onConnectionChange(
        handleConnectionChange
      );
      return echo;
    }

    /**
     * The connection turned over. This is where the plugin earns its place, so
     * the whole rule lives in one function: relax or restore staleness for
     * every live query, and on a *re*connect invalidate each one exactly once.
     */
    function handleConnectionChange(status: ConnectionStatus): void {
      const isConnected = status === 'connected';
      if (isConnected === connected) return;
      connected = isConnected;

      for (const binding of bindings.values()) applyStaleTime(binding);

      if (!isConnected) return;
      const isReconnect = everConnected;
      everConnected = true;
      if (!isReconnect) return;

      for (const binding of bindings.values()) {
        if (binding.echoOptions.invalidateOnReconnect === false) continue;
        void queryCache.invalidateQueries({
          key: binding.entry.key,
          exact: true
        });
      }
    }

    /**
     * Push the connection-dependent `staleTime` onto the entry's current
     * options, or put the query's own value back.
     *
     * Called both on a connection turn and after every `ensure`, because
     * `ensure` replaces the options object and would otherwise silently drop
     * the relaxed value on the next render.
     */
    function applyStaleTime(binding: EntryBinding): void {
      const { staleTime } = binding.echoOptions;
      const entryOptions = binding.entry.options;
      if (staleTime === undefined || !entryOptions) return;

      if (connected) {
        if (binding.patched?.options !== entryOptions) {
          binding.patched = {
            options: entryOptions,
            baseStaleTime: entryOptions.staleTime
          };
        }
        entryOptions.staleTime = staleTime;
      } else if (binding.patched?.options === entryOptions) {
        entryOptions.staleTime = binding.patched.baseStaleTime;
        binding.patched = undefined;
      }
    }

    function contextFor(entry: UseQueryEntry, event: string): EchoEventContext {
      return {
        event,
        key: entry.key,
        entry,
        queryCache,
        setQueryData: (data) => queryCache.setQueryData(entry.key, data),
        getQueryData: () => queryCache.getQueryData(entry.key),
        invalidate: () =>
          queryCache.invalidateQueries({ key: entry.key, exact: true })
      };
    }

    function bind(entry: UseQueryEntry): void {
      const echoOptions = entry.options?.echo;
      if (!echoOptions || bindings.has(entry.keyHash)) return;

      const instance = resolveEcho();
      if (!instance) return;

      const visibility = echoOptions.visibility ?? 'private';
      const name = toValue(echoOptions.channel);
      const channelId = `${visibility}:${name}`;

      let subscription = subscriptions.get(channelId);
      if (!subscription) {
        subscription = {
          channel: openChannel(instance, visibility, name),
          prefixedName: CHANNEL_PREFIX[visibility] + name,
          entryCount: 0
        };
        subscriptions.set(channelId, subscription);
      }
      subscription.entryCount++;

      const binding: EntryBinding = {
        entry,
        echoOptions,
        channelId,
        listeners: []
      };

      for (const [event, handler] of Object.entries(echoOptions.listen)) {
        const listener = (payload: never): void => {
          handler(payload, contextFor(entry, event));
        };
        subscription.channel.listen(event, listener);
        binding.listeners.push([event, listener]);
      }

      bindings.set(entry.keyHash, binding);
      applyStaleTime(binding);
    }

    function unbind(entry: UseQueryEntry): void {
      const binding = bindings.get(entry.keyHash);
      if (!binding) return;
      bindings.delete(entry.keyHash);

      const subscription = subscriptions.get(binding.channelId);
      if (!subscription) return;

      for (const [event, listener] of binding.listeners) {
        subscription.channel.stopListening(event, listener);
      }

      // Two entries may name the same channel. Leaving it the moment one of
      // them is removed would make the other one go deaf.
      if (--subscription.entryCount > 0) return;
      subscriptions.delete(binding.channelId);
      echo?.leaveChannel(subscription.prefixedName);
    }

    queryCache.$onAction(({ name, args, after }) => {
      if (name === 'extend') {
        after(() => bind(args[0]));
      } else if (name === 'remove') {
        after(() => unbind(args[0]));
      } else if (name === 'ensure') {
        after((entry) => {
          const binding = bindings.get(entry.keyHash);
          if (binding) applyStaleTime(binding);
        });
      }
    });

    scope.run(() => {
      onScopeDispose(() => {
        stopConnectionListener?.();
        // Snapshot: `unbind` deletes from `bindings` as it goes.
        // oxlint-disable-next-line unicorn/no-useless-spread
        for (const binding of [...bindings.values()]) unbind(binding.entry);
        echo = null;
      });
    });
  };
}
