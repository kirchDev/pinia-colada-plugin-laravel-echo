import { PiniaColada, useQueryCache } from '@pinia/colada';
import type { UseQueryEntry } from '@pinia/colada';
import type { ConnectionStatus } from 'laravel-echo';
import { createPinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, effectScope } from 'vue';
import { PiniaColadaLaravelEcho } from './index';
import type { EchoChannelLike, EchoLike } from './index';

/**
 * A test double for Echo. The suite must never need a running server, so this
 * is what every test talks to — and the fact that it is a plain object is also
 * the argument for the structural {@link EchoLike} the plugin accepts.
 */
function createEchoDouble() {
  const listeners = new Map<
    string,
    Map<string, Set<(payload: never) => void>>
  >();
  /** Channels Echo was asked to open, by their prefixed name and in order. */
  const opened: string[] = [];
  /** Channels the plugin left, by their prefixed name and in order. */
  const left: string[] = [];
  const statusListeners = new Set<(status: ConnectionStatus) => void>();
  let status: ConnectionStatus = 'connected';

  function channelFor(prefixedName: string): EchoChannelLike {
    opened.push(prefixedName);
    const events = listeners.get(prefixedName) ?? new Map();
    listeners.set(prefixedName, events);
    return {
      listen(event, callback) {
        const set = events.get(event) ?? new Set();
        events.set(event, set);
        set.add(callback);
        return this;
      },
      stopListening(event, callback) {
        if (callback) events.get(event)?.delete(callback);
        else events.delete(event);
        return this;
      }
    };
  }

  const echo: EchoLike = {
    channel: (name) => channelFor(name),
    private: (name) => channelFor(`private-${name}`),
    encryptedPrivate: (name) => channelFor(`private-encrypted-${name}`),
    join: (name) => channelFor(`presence-${name}`),
    leaveChannel(name) {
      left.push(name);
      listeners.delete(name);
    },
    connectionStatus: () => status,
    connector: {
      onConnectionChange(callback) {
        statusListeners.add(callback);
        return () => statusListeners.delete(callback);
      }
    }
  };

  return {
    echo,
    opened,
    left,
    /** How many handlers are registered for an event on a channel. */
    handlerCount: (prefixedName: string, event: string) =>
      listeners.get(prefixedName)?.get(event)?.size ?? 0,
    /** Deliver a broadcast to everything listening for it. */
    emit(prefixedName: string, event: string, payload: unknown) {
      // Snapshot, like a real broadcaster: a handler may stop listening.
      const callbacks = new Set(listeners.get(prefixedName)?.get(event));
      for (const callback of callbacks) callback(payload as never);
    },
    setStatus(next: ConnectionStatus) {
      status = next;
      for (const callback of new Set(statusListeners)) callback(next);
    }
  };
}

type EchoDouble = ReturnType<typeof createEchoDouble>;

/**
 * A Colada cache with the plugin installed the way an app installs it — through
 * `app.use(PiniaColada)`, so the tests exercise the real plugin context rather
 * than a hand-built one.
 */
function createHarness(
  echoOption: EchoLike | (() => EchoLike | null | undefined)
) {
  const app = createApp({});
  const pinia = createPinia();
  app.use(pinia);
  app.use(PiniaColada, {
    plugins: [PiniaColadaLaravelEcho({ echo: echoOption })]
  });
  return { app, queryCache: useQueryCache(pinia) };
}

const noopQuery = async () => 'data';

describe('PiniaColadaLaravelEcho', () => {
  let double: EchoDouble;
  let queryCache: ReturnType<typeof useQueryCache>;

  beforeEach(() => {
    double = createEchoDouble();
    queryCache = createHarness(() => double.echo).queryCache;
  });

  describe('subscription lifecycle', () => {
    it('subscribes a private channel on extend and leaves it on remove', () => {
      const entry = queryCache.ensure({
        key: ['notifications'],
        query: noopQuery,
        echo: {
          channel: 'App.Models.User.1',
          listen: { '.NotificationBroadcasted': () => {} }
        }
      });

      expect(double.opened).toEqual(['private-App.Models.User.1']);
      expect(
        double.handlerCount(
          'private-App.Models.User.1',
          '.NotificationBroadcasted'
        )
      ).toBe(1);

      queryCache.remove(entry);

      expect(double.left).toEqual(['private-App.Models.User.1']);
      expect(
        double.handlerCount(
          'private-App.Models.User.1',
          '.NotificationBroadcasted'
        )
      ).toBe(0);
    });

    it('resolves a channel getter', () => {
      queryCache.ensure({
        key: ['notifications', 7],
        query: noopQuery,
        echo: { channel: () => `App.Models.User.${7}`, listen: {} }
      });

      expect(double.opened).toEqual(['private-App.Models.User.7']);
    });

    it.each([
      ['public', 'orders'],
      ['private', 'private-orders'],
      ['encryptedPrivate', 'private-encrypted-orders'],
      ['presence', 'presence-orders']
    ] as const)('opens and leaves a %s channel', (visibility, prefixed) => {
      const entry = queryCache.ensure({
        key: ['orders', visibility],
        query: noopQuery,
        echo: { channel: 'orders', visibility, listen: {} }
      });
      queryCache.remove(entry);

      expect(double.opened).toEqual([prefixed]);
      expect(double.left).toEqual([prefixed]);
    });

    it('leaves the channel only once both entries on it are gone', () => {
      const listA = queryCache.ensure({
        key: ['orders', 'list'],
        query: noopQuery,
        echo: { channel: 'orders', listen: { '.OrderUpdated': () => {} } }
      });
      const listB = queryCache.ensure({
        key: ['orders', 'count'],
        query: noopQuery,
        echo: { channel: 'orders', listen: { '.OrderUpdated': () => {} } }
      });

      expect(double.opened).toEqual(['private-orders']);
      expect(double.handlerCount('private-orders', '.OrderUpdated')).toBe(2);

      queryCache.remove(listA);

      expect(double.left).toEqual([]);
      expect(double.handlerCount('private-orders', '.OrderUpdated')).toBe(1);

      queryCache.remove(listB);

      expect(double.left).toEqual(['private-orders']);
    });

    it('leaves a query without an echo option alone', () => {
      const entry = queryCache.ensure({
        key: ['plain'],
        query: noopQuery
      });
      queryCache.remove(entry);

      expect(double.opened).toEqual([]);
      expect(double.left).toEqual([]);
    });

    it('does nothing when no Echo instance can be resolved', () => {
      const cache = createHarness(() => null).queryCache;

      expect(() =>
        cache.ensure({
          key: ['notifications'],
          query: noopQuery,
          echo: { channel: 'orders', listen: { '.OrderUpdated': () => {} } }
        })
      ).not.toThrow();
    });
  });

  /**
   * A plugin has no business making the library it extends stricter. The
   * `echo` option augments `UseQueryOptions`, so a type parameter reachable
   * from it decides whether a typed entry still fits the plain `UseQueryEntry`
   * that half of the cache's own methods take — which is a thing consumers do
   * constantly, and would have no way to connect back to this package.
   */
  describe('type surface', () => {
    it("leaves a typed entry assignable to the cache's own signatures", () => {
      const entry = queryCache.ensure({ key: ['a'], query: noopQuery });

      queryCache.invalidate(entry);
      queryCache.cancel(entry);
      queryCache.track(entry, null);
      queryCache.remove(entry);

      expect(queryCache.getEntries({ key: ['a'], exact: true })).toEqual([]);
    });
  });

  describe('event handlers', () => {
    it('hands the payload and a working cache handle to the listener', () => {
      queryCache.ensure({
        key: ['notifications'],
        query: async () => [] as Array<{ id: number }>,
        echo: {
          channel: 'orders',
          listen: {
            '.NotificationBroadcasted': (
              payload: { id: number },
              { setQueryData }
            ) => {
              setQueryData<Array<{ id: number }>>((old) => [
                ...(old ?? []),
                payload
              ]);
            }
          }
        }
      });
      queryCache.setQueryData(['notifications'], []);

      double.emit('private-orders', '.NotificationBroadcasted', { id: 1 });
      double.emit('private-orders', '.NotificationBroadcasted', { id: 2 });

      expect(queryCache.getQueryData(['notifications'])).toEqual([
        { id: 1 },
        { id: 2 }
      ]);
    });

    it('names the event and the entry in the context', () => {
      const handler = vi.fn();
      queryCache.ensure({
        key: ['notifications'],
        query: noopQuery,
        echo: { channel: 'orders', listen: { '.OrderUpdated': handler } }
      });

      double.emit('private-orders', '.OrderUpdated', { id: 3 });

      expect(handler).toHaveBeenCalledOnce();
      const [payload, context] = handler.mock.calls[0]!;
      expect(payload).toEqual({ id: 3 });
      expect(context.event).toBe('.OrderUpdated');
      expect(context.key).toEqual(['notifications']);
      expect(context.queryCache).toBe(queryCache);
      expect(context.entry.key).toEqual(['notifications']);
      expect(context.getQueryData()).toBeUndefined();
    });

    it('delivers only to the entry that registered the handler', () => {
      const onList = vi.fn();
      const onCount = vi.fn();
      const list = queryCache.ensure({
        key: ['orders', 'list'],
        query: noopQuery,
        echo: { channel: 'orders', listen: { '.OrderUpdated': onList } }
      });
      queryCache.ensure({
        key: ['orders', 'count'],
        query: noopQuery,
        echo: { channel: 'orders', listen: { '.OrderUpdated': onCount } }
      });

      queryCache.remove(list);
      double.emit('private-orders', '.OrderUpdated', {});

      expect(onList).not.toHaveBeenCalled();
      expect(onCount).toHaveBeenCalledOnce();
    });
  });

  describe('connection awareness', () => {
    /** An entry a component is using, so `invalidateQueries` refetches it. */
    function trackedEntry(
      query: () => Promise<unknown>,
      echo: { channel: string; invalidateOnReconnect?: boolean }
    ): UseQueryEntry<unknown> {
      const entry = queryCache.ensure({
        key: ['orders'],
        query,
        echo: { ...echo, listen: {} }
      });
      queryCache.track(entry, effectScope(true));
      return entry;
    }

    it('invalidates once when the connection comes back', async () => {
      const query = vi.fn(async () => 'data');
      const entry = trackedEntry(query, { channel: 'orders' });
      await queryCache.fetch(entry);
      expect(query).toHaveBeenCalledTimes(1);

      double.setStatus('disconnected');
      double.setStatus('connecting');
      double.setStatus('connected');
      await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(2));

      // A second turn is a second reconnect, not a repeat of the first.
      double.setStatus('disconnected');
      double.setStatus('connected');
      await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(3));
    });

    it('does not invalidate on the first connection', async () => {
      const query = vi.fn(async () => 'data');
      const entry = trackedEntry(query, { channel: 'orders' });
      await queryCache.fetch(entry);

      // Already connected when the entry was created; re-announcing it is not
      // a reconnect.
      double.setStatus('connected');
      await Promise.resolve();

      expect(query).toHaveBeenCalledTimes(1);
    });

    it('honours invalidateOnReconnect: false', async () => {
      const query = vi.fn(async () => 'data');
      const entry = trackedEntry(query, {
        channel: 'orders',
        invalidateOnReconnect: false
      });
      await queryCache.fetch(entry);

      double.setStatus('disconnected');
      double.setStatus('connected');
      await Promise.resolve();

      expect(query).toHaveBeenCalledTimes(1);
    });

    it('does not invalidate an entry that was already removed', async () => {
      const query = vi.fn(async () => 'data');
      const entry = trackedEntry(query, { channel: 'orders' });
      await queryCache.fetch(entry);
      queryCache.remove(entry);

      double.setStatus('disconnected');
      double.setStatus('connected');
      await Promise.resolve();

      expect(query).toHaveBeenCalledTimes(1);
    });
  });

  describe('connection-dependent staleness', () => {
    const echoOptions = {
      channel: 'orders',
      listen: {},
      staleTime: Number.POSITIVE_INFINITY
    };

    it('relaxes staleTime while connected and restores it when the connection drops', () => {
      const entry = queryCache.ensure({
        key: ['orders'],
        query: noopQuery,
        staleTime: 5000,
        echo: echoOptions
      });

      expect(entry.options?.staleTime).toBe(Number.POSITIVE_INFINITY);

      double.setStatus('disconnected');
      expect(entry.options?.staleTime).toBe(5000);

      double.setStatus('connected');
      expect(entry.options?.staleTime).toBe(Number.POSITIVE_INFINITY);
    });

    it('re-applies the relaxed staleTime onto the options ensure rebuilds', () => {
      queryCache.ensure({
        key: ['orders'],
        query: noopQuery,
        staleTime: 5000,
        echo: echoOptions
      });
      // A re-render calls `ensure` again, which assigns a fresh options object.
      const entry = queryCache.ensure({
        key: ['orders'],
        query: noopQuery,
        staleTime: 5000,
        echo: echoOptions
      });

      expect(entry.options?.staleTime).toBe(Number.POSITIVE_INFINITY);

      // The query's own value has to survive that round trip, or the fallback
      // on disconnect would restore a value the plugin itself wrote.
      double.setStatus('disconnected');
      expect(entry.options?.staleTime).toBe(5000);
    });

    it('leaves staleTime alone when the option is not set', () => {
      const entry = queryCache.ensure({
        key: ['orders'],
        query: noopQuery,
        staleTime: 5000,
        echo: { channel: 'orders', listen: {} }
      });

      expect(entry.options?.staleTime).toBe(5000);
      double.setStatus('disconnected');
      expect(entry.options?.staleTime).toBe(5000);
    });

    it('falls back to normal refetch behaviour while disconnected', async () => {
      const query = vi.fn(async () => 'data');
      const entry = queryCache.ensure({
        key: ['orders'],
        query,
        staleTime: 0,
        echo: echoOptions
      });
      await queryCache.fetch(entry);

      // Connected, the cache is kept current by events — nothing to refetch.
      await queryCache.refresh(entry);
      expect(query).toHaveBeenCalledTimes(1);

      double.setStatus('disconnected');
      await queryCache.refresh(entry);
      expect(query).toHaveBeenCalledTimes(2);
    });
  });
});
