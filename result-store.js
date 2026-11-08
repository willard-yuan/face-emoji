/**
 * Local-only hand-off of a processed photo from index.html to result.html.
 *
 * Images never leave the device. Blobs are kept in IndexedDB under a
 * per-tab sessionId and expire after RESULT_TTL_MS. Both pages load this
 * file so the storage schema has exactly one definition.
 */
(function (global) {
    'use strict';

    var DB_NAME = 'emojiface-results';
    var STORE = 'results';
    var KEY = 'latest';
    var SESSION_KEY = 'emojifaceResultSession';
    var RESULT_TTL_MS = 10 * 60 * 1000;

    function getSessionId() {
        var id = sessionStorage.getItem(SESSION_KEY);
        if (!id) {
            id = (global.crypto && global.crypto.randomUUID)
                ? global.crypto.randomUUID()
                : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
            sessionStorage.setItem(SESSION_KEY, id);
        }
        return id;
    }

    function openDb() {
        return new Promise(function (resolve, reject) {
            if (!global.indexedDB) {
                reject(new Error('IndexedDB unavailable'));
                return;
            }
            var req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = function () {
                var db = req.result;
                if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error || new Error('IndexedDB open failed')); };
        });
    }

    function run(db, mode, fn) {
        return new Promise(function (resolve, reject) {
            var transaction = db.transaction(STORE, mode);
            var store = transaction.objectStore(STORE);
            var request = fn(store);
            transaction.oncomplete = function () { resolve(request ? request.result : undefined); };
            transaction.onerror = function () { reject(transaction.error || new Error('IndexedDB write failed')); };
            transaction.onabort = function () { reject(transaction.error || new Error('IndexedDB aborted')); };
        });
    }

    async function saveResult(data) {
        var db = await openDb();
        try {
            await run(db, 'readwrite', function (store) {
                return store.put({
                    sessionId: getSessionId(),
                    resultBlob: data.resultBlob,
                    originalBlob: data.originalBlob || null,
                    style: data.style || '',
                    // Human-readable chooser label + exact preset filename keep
                    // result.html in sync with the new compact emoji picker.
                    styleLabel: data.styleLabel || '',
                    preset: data.preset || '',
                    faces: data.faces || 0,
                    width: data.width || 0,
                    height: data.height || 0,
                    // Structured emoji layers let result.html rebuild an editable
                    // canvas instead of showing a flattened PNG. Old records
                    // simply have no emojis and fall back to the static image.
                    emojis: data.emojis || [],
                    ts: Date.now()
                }, KEY);
            });
        } finally {
            db.close();
        }
    }

    async function loadResult() {
        var db = await openDb();
        try {
            var record = await run(db, 'readonly', function (store) { return store.get(KEY); });
            if (!record) return null;
            // sessionStorage is per tab, so another tab cannot read this photo.
            if (record.sessionId !== getSessionId()) return null;
            if (Date.now() - record.ts > RESULT_TTL_MS) return null;
            if (!record.resultBlob) return null;
            return record;
        } finally {
            db.close();
        }
    }

    async function clearResult() {
        try {
            var db = await openDb();
            try {
                await run(db, 'readwrite', function (store) { return store.delete(KEY); });
            } finally {
                db.close();
            }
        } catch (e) { /* best effort only */ }
    }

    global.EmojiResultStore = {
        saveResult: saveResult,
        loadResult: loadResult,
        clearResult: clearResult,
        getSessionId: getSessionId
    };
})(window);
