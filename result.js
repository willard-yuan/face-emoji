/**
 * result.html behaviour.
 *
 * Deliberately kept separate from app.js: this page is indexed by Google and
 * must load fast, so it never loads face-api.js or the detection models.
 * The default state is complete, crawlable HTML; this script only swaps in
 * the visitor's own photo when a local result is available. When the record
 * carries emoji layers, emoji-editor.js rebuilds an editable canvas so the
 * result keeps the editor capabilities of the homepage.
 */
(function () {
    'use strict';

    var state = {
        record: null,
        resultUrl: null,
        beforeUrl: null,
        afterUrl: null,
        originalUrl: null,
        editor: null
    };
    var compareTimer = null;
    var editTracked = false;

    function el(id) { return document.getElementById(id); }

    function track(name, data) {
        var payload = data || {};
        try {
            if (typeof window.va === 'function') window.va('event', { name: name, data: payload });
            if (typeof window.gtag === 'function') window.gtag('event', name, payload);
        } catch (e) { /* analytics must never break the page */ }
    }

    // Keys match the data-style values emitted by the Plan A emoji chooser.
    // The extra *_emoji keys keep labels readable for records saved by older tabs.
    var STYLE_LABELS = {
        'random_labubu': 'Auto Labubu',
        'auto': 'Auto Emoji',
        'labubu': 'Happy Labubu',
        'preset': 'Custom emoji',
        'auto_emoji': 'Auto Emoji',
        'happy_labubu': 'Happy Labubu',
        'happy_emoji': 'Happy Emoji',
        'funny_emoji': 'Funny Emoji',
        'cool_emoji': 'Cool Emoji',
        'mask_gaussian': 'Gaussian blur',
        'mask_mosaic': 'Pixelation',
        'mask_solid': 'Solid block'
    };

    function isMaskRecord(r) {
        return Boolean(r && (r.mode === 'mask' || r.maskKind));
    }

    function styleLabelFor(record) {
        if (record.styleLabel) return record.styleLabel;
        if (record.mode === 'mask' && record.maskKind) {
            return STYLE_LABELS['mask_' + record.maskKind] || 'Face mask';
        }
        if (record.style === 'preset' && record.preset) {
            return String(record.preset)
                .replace(/_256x256$/, '')
                .replace(/[_-]+/g, ' ')
                .replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); });
        }
        return STYLE_LABELS[record.style] || record.style || '';
    }

    function showHint(message) {
        var hint = el('shareHint');
        if (!hint) return;
        hint.textContent = message;
        hint.hidden = false;
        setTimeout(function () { hint.hidden = true; }, 4000);
    }

    function buildMeta(count) {
        if (!state.record) return '';
        var r = state.record;
        var bits = [];
        if (r.width && r.height) bits.push(r.width + ' × ' + r.height + ' px');
        var faces = typeof count === 'number' ? count : (r.faces || 0);
        if (faces) bits.push(faces + (faces === 1 ? ' face' : ' faces') + ' masked');
        var label = styleLabelFor(r);
        if (label) bits.push(label);
        return bits.join('  ·  ');
    }

    function exampleState() {
        // Nothing to change in the DOM: the static example, guide and FAQ are
        // already in the HTML and visible to crawlers with JS disabled.
        var cta = el('primaryCta');
        cta.textContent = 'Try the emoji face tool';
        cta.href = 'index.html';
        track('Result Empty State');
    }

    // Edits must be reflected in the download, the share sheet and the
    // before/after comparison. Debounce the heavier comparison refresh.
    function onEditorChange(count) {
        var meta = el('resultMeta');
        if (meta) {
            meta.textContent = buildMeta(count);
            meta.hidden = false;
        }
        if (!editTracked) {
            editTracked = true;
            track('Result Edit');
        }
        clearTimeout(compareTimer);
        compareTimer = setTimeout(async function () {
            if (!state.editor) return;
            try {
                var blob = await state.editor.exportBlob();
                if (!blob) return;
                if (state.afterUrl) URL.revokeObjectURL(state.afterUrl);
                state.afterUrl = URL.createObjectURL(blob);
                var after = el('afterImage');
                if (after) after.src = state.afterUrl;
            } catch (e) { /* the download path will still export on demand */ }
        }, 400);
    }

    async function initEditor(record) {
        if (!window.EmojiEditor || !record.originalBlob || !record.emojis || !record.emojis.length) {
            return false;
        }
        // Mask layers have no image URL; MaskEngine rebuilds their patch from
        // the original photo. Only emoji layers need an Image object.
        var hasMask = record.emojis.some(function (e) { return e.mask; });
        if (hasMask && !window.MaskEngine) return false;

        state.originalUrl = URL.createObjectURL(record.originalBlob);
        var images = await Promise.all(
            [window.EmojiEditor.loadImage(state.originalUrl)].concat(
                record.emojis.map(function (e) {
                    return e.mask ? Promise.resolve(null) : window.EmojiEditor.loadImage(e.src);
                })
            )
        );
        var baseImage = images[0];
        var editor = window.EmojiEditor.create({
            canvas: el('resultCanvas'),
            baseImage: baseImage,
            width: record.width,
            height: record.height,
            onChange: onEditorChange
        });
        editor.setEmojis(record.emojis.map(function (e, i) {
            var layer = {
                img: images[i + 1],
                x: e.x, y: e.y,
                width: e.width, height: e.height,
                angle: e.angle || 0
            };
            if (e.mask) layer.mask = e.mask;
            return layer;
        }));
        state.editor = editor;
        el('resultImage').hidden = true;
        el('resultCanvas').hidden = false;
        el('editHint').hidden = false;
        return true;
    }

    async function renderResult(record) {
        state.record = record;
        state.resultUrl = URL.createObjectURL(record.resultBlob);

        var img = el('resultImage');
        img.src = state.resultUrl;
        img.alt = isMaskRecord(record)
            ? 'Your photo with face masks applied'
            : 'Your photo with emoji faces applied';
        if (record.width) img.width = record.width;
        if (record.height) img.height = record.height;

        el('exampleNote').hidden = true;

        var meta = el('resultMeta');
        meta.textContent = buildMeta();
        meta.hidden = !meta.textContent;

        el('primaryCta').hidden = true;
        el('downloadBtn').hidden = false;
        el('shareBtn').hidden = false;

        if (record.originalBlob) {
            state.beforeUrl = URL.createObjectURL(record.originalBlob);
            el('beforeImage').src = state.beforeUrl;
            el('afterImage').src = state.resultUrl;
            el('compareSection').hidden = false;
        }

        var editable = false;
        try {
            editable = await initEditor(record);
        } catch (error) {
            console.warn('Could not restore the editable result, showing the flattened image.', error);
        }

        track('Result View', {
            emojiStyle: record.style || '',
            emojiPreset: record.preset || '',
            maskKind: record.maskKind || '',
            facesDetected: record.faces || 0,
            hasBeforeAfter: Boolean(record.originalBlob),
            editable: editable
        });
    }

    // Always export the CURRENT canvas, not the flattened PNG from the tool.
    async function currentBlob() {
        if (state.editor) {
            var blob = await state.editor.exportBlob();
            if (blob) return blob;
        }
        return state.record ? state.record.resultBlob : null;
    }

    async function downloadResult() {
        if (!state.record) return;
        try {
            var blob = await currentBlob();
            if (!blob) return;
            var url = URL.createObjectURL(blob);
            var link = document.createElement('a');
            link.href = url;
            link.download = isMaskRecord(state.record) ? 'masked-photo.png' : 'emojified-photo.png';
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
            track('Result Download', {
                emojiStyle: state.record.style || '',
                emojiPreset: state.record.preset || '',
                maskKind: state.record.maskKind || '',
                facesDetected: state.editor ? state.editor.count : (state.record.faces || 0),
                edited: Boolean(state.editor) && editTracked
            });
        } catch (error) {
            console.warn('Download failed.', error);
            showHint('Could not export the image. Please try again.');
        }
    }

    async function shareResult() {
        // Shares the image FILE only. No public result URL is ever created.
        if (!state.record) return;
        try {
            var blob = await currentBlob();
            if (!blob) return;
            var masked = isMaskRecord(state.record);
            var file = new File([blob], masked ? 'masked-photo.png' : 'emojified-photo.png', { type: 'image/png' });
            track('Result Share');
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                navigator.share({ files: [file], title: masked ? 'My masked photo' : 'My emoji face photo' })
                    .catch(function () { /* user cancelled */ });
            } else {
                showHint('Sharing an image is not supported in this browser. Use Download emoji photo instead.');
            }
        } catch (error) {
            console.warn('Share failed.', error);
            showHint('Could not prepare the image for sharing. Use Download emoji photo instead.');
        }
    }

    function bind() {
        var download = el('downloadBtn');
        if (download) download.addEventListener('click', downloadResult);

        var share = el('shareBtn');
        if (share) share.addEventListener('click', shareResult);

        document.querySelectorAll('[data-result-link]').forEach(function (link) {
            link.addEventListener('click', function () {
                track('Result Related Click', { target: link.getAttribute('href') || '' });
            });
        });

        document.querySelectorAll('.faq-details').forEach(function (details) {
            details.addEventListener('toggle', function () {
                if (details.open) {
                    var q = details.querySelector('summary');
                    track('Result FAQ Open', { question: q ? q.textContent.trim() : '' });
                }
            });
        });

        window.addEventListener('pagehide', function () {
            [state.resultUrl, state.beforeUrl, state.afterUrl, state.originalUrl].forEach(function (url) {
                if (url) URL.revokeObjectURL(url);
            });
        });
    }

    document.addEventListener('DOMContentLoaded', async function () {
        bind();
        try {
            var record = await window.EmojiResultStore.loadResult();
            if (record) await renderResult(record);
            else exampleState();
        } catch (error) {
            console.warn('Could not read the local result, showing the example page.', error);
            exampleState();
        }
    });
})();
