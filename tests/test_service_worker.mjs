import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function worker() {
    const scope = 'https://example.org/pools/';
    const stores = new Map([['gliwice-pools-v1', new Map()], ['another-app', new Map()]]);
    const handlers = {};
    let network = async () => new Response('new version');
    let requests = 0;
    const key = req => req.url || String(req);
    const caches = {
        keys: async () => [...stores.keys()],
        delete: async name => stores.delete(name),
        open: async name => {
            if (!stores.has(name)) stores.set(name, new Map());
            const store = stores.get(name);
            return {
                addAll: async paths => paths.forEach(p => store.set(new URL(p, scope).href, new Response('installed'))),
                put: async (req, res) => store.set(key(req), res)
            };
        },
        match: async req => {
            for (const store of stores.values()) if (store.has(key(req))) return store.get(key(req)).clone();
        }
    };
    vm.runInNewContext(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), {
        URL, Response, console, caches,
        fetch: async (req, options) => { requests++; assert.equal(options.cache, 'no-cache'); return network(req); },
        self: { registration: { scope }, addEventListener: (event, fn) => handlers[event] = fn,
            skipWaiting: async () => {}, clients: { claim: async () => {} } }
    });
    return { stores, caches, handlers, setNetwork: fn => network = fn, requests: () => requests,
        lifecycle: name => new Promise(resolve => handlers[name]({ waitUntil: promise => resolve(promise) })),
        request: async (path, options = {}) => {
            let response;
            handlers.fetch({ request: { url: new URL(path, scope).href, method: 'GET', ...options },
                respondWith: promise => response = promise, waitUntil: () => {} });
            return response;
        }
    };
}

test('an online revisit refreshes an installed script and its offline copy', async () => {
    const w = worker();
    await w.lifecycle('install');
    await w.lifecycle('activate');
    assert.equal(await (await w.request('script.js')).text(), 'new version');
    assert.equal(w.requests(), 1);
    w.setNetwork(async () => { throw new Error('offline'); });
    assert.equal(await (await w.request('script.js')).text(), 'new version');
});

test('activation removes the old pool cache without deleting other apps', async () => {
    const w = worker();
    await w.lifecycle('install');
    await w.lifecycle('activate');
    assert.equal(w.stores.has('gliwice-pools-v1'), false);
    assert.equal(w.stores.has('another-app'), true);
});

test('schedule cache survives network errors and unsuccessful HTTP responses', async () => {
    const w = worker();
    w.setNetwork(async () => new Response('[{"name":"Mewa"}]'));
    await w.request('data.json');
    w.setNetwork(async () => new Response('failure', { status: 503 }));
    assert.equal(await (await w.request('data.json')).text(), '[{"name":"Mewa"}]');
    w.setNetwork(async () => { throw new Error('offline'); });
    assert.equal(await (await w.request('data.json')).text(), '[{"name":"Mewa"}]');
});

test('unrelated origins and non-GET requests are not intercepted', async () => {
    const w = worker();
    assert.equal(await w.request('https://other.org/data.json'), undefined);
    assert.equal(await w.request('data.json', { method: 'POST' }), undefined);
    assert.equal(w.requests(), 0);
});
