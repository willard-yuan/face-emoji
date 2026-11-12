/**
 * Face masking engine — shared by index.html and result.html.
 *
 * Everything runs locally in the browser. A mask is a fully opaque canvas
 * patch sized to the layer's rectangle; drawing that patch over the original
 * image replaces (never blends with) the underlying face pixels.
 *
 * Design notes:
 *  - Gaussian uses three separable box-blur passes (central limit theorem)
 *    instead of ctx.filter, which has patchy Safari / iOS support.
 *  - Mosaic downscales into a tiny canvas and upscales with smoothing off.
 *  - Only the small face rectangle is ever read via getImageData; the full
 *    image is never scanned, so 4000x3000 photos stay fast.
 *  - Edge pixels are clamped (not wrapped) and alpha is forced to 255, so a
 *    mask can never become translucent and leak the face underneath.
 */
(function (global) {
    'use strict';

    var MASK_KINDS = ['gaussian', 'mosaic', 'solid'];
    var DEFAULT_STRENGTH = 6;

    function isMaskKind(kind) {
        return MASK_KINDS.indexOf(kind) !== -1;
    }

    function clampStrength(value) {
        var n = Number(value);
        if (!isFinite(n) || n <= 0) return DEFAULT_STRENGTH;
        return Math.max(1, Math.min(10, Math.round(n)));
    }

    function clampInt(v, lo, hi) {
        return v < lo ? lo : (v > hi ? hi : v);
    }

    function makeCanvas(w, h) {
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w));
        c.height = Math.max(1, Math.round(h));
        return c;
    }

    function sourceSize(src) {
        return {
            w: src.naturalWidth || src.width || 0,
            h: src.naturalHeight || src.height || 0
        };
    }

    // Clip a layer rectangle to the source bounds. Anything outside is filled
    // by the opaque base colour, so exporting always stays alpha = 255.
    function clampRect(rect, src) {
        var s = sourceSize(src);
        if (!s.w || !s.h) return null;
        var x0 = clampInt(Math.round(rect.x), 0, s.w);
        var y0 = clampInt(Math.round(rect.y), 0, s.h);
        var x1 = clampInt(Math.round(rect.x + rect.w), 0, s.w);
        var y1 = clampInt(Math.round(rect.y + rect.h), 0, s.h);
        if (x1 <= x0 || y1 <= y0) return null;
        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }

    // Strength is relative to the face size: a 200px-wide face is the baseline.
    // Fixed pixel radii would over-blur small photos and under-blur large ones.
    function dimensionScale(rect) {
        return Math.max(rect.w, rect.h) / 200;
    }

    function gaussianRadius(rect, strength) {
        return Math.max(2, Math.round(dimensionScale(rect) * (3 + clampStrength(strength) * 2.7)));
    }

    function mosaicBlock(rect, strength) {
        return Math.max(4, Math.round(dimensionScale(rect) * (4 + clampStrength(strength) * 2)));
    }

    // One separable box-blur pass. Boundary samples use clamp-to-edge, and the
    // output alpha is always 255 (a translucent mask would leak the face).
    function boxBlurPass(src, dst, w, h, radius, horizontal) {
        var win = radius * 2 + 1;
        var outer = horizontal ? h : w;
        var inner = horizontal ? w : h;
        for (var o = 0; o < outer; o++) {
            var accR = 0, accG = 0, accB = 0;
            for (var k = -radius; k <= radius; k++) {
                var i = clampInt(k, 0, inner - 1);
                var p = (horizontal ? (o * w + i) : (i * w + o)) * 4;
                accR += src[p]; accG += src[p + 1]; accB += src[p + 2];
            }
            for (var j = 0; j < inner; j++) {
                var out = (horizontal ? (o * w + j) : (j * w + o)) * 4;
                dst[out] = accR / win;
                dst[out + 1] = accG / win;
                dst[out + 2] = accB / win;
                dst[out + 3] = 255;
                var addI = clampInt(j + radius + 1, 0, inner - 1);
                var subI = clampInt(j - radius, 0, inner - 1);
                var add = (horizontal ? (o * w + addI) : (addI * w + o)) * 4;
                var sub = (horizontal ? (o * w + subI) : (subI * w + o)) * 4;
                accR += src[add] - src[sub];
                accG += src[add + 1] - src[sub + 1];
                accB += src[add + 2] - src[sub + 2];
            }
        }
    }

    function boxBlur3(imageData, radius) {
        var w = imageData.width, h = imageData.height;
        var a = new Uint8ClampedArray(imageData.data);
        var b = new Uint8ClampedArray(a.length);
        for (var pass = 0; pass < 3; pass++) {
            boxBlurPass(a, b, w, h, radius, true);
            boxBlurPass(b, a, w, h, radius, false);
        }
        imageData.data.set(a);
    }

    function gaussianPatch(src, c, radius) {
        var tmp = makeCanvas(c.w, c.h);
        var ctx = tmp.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(src, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h);
        var imageData = ctx.getImageData(0, 0, c.w, c.h);
        boxBlur3(imageData, radius);
        ctx.putImageData(imageData, 0, 0);
        return tmp;
    }

    function mosaicPatch(src, c, block) {
        var sw = Math.max(1, Math.ceil(c.w / block));
        var sh = Math.max(1, Math.ceil(c.h / block));
        var small = makeCanvas(sw, sh);
        var sctx = small.getContext('2d');
        sctx.imageSmoothingEnabled = true;
        if ('imageSmoothingQuality' in sctx) sctx.imageSmoothingQuality = 'high';
        sctx.drawImage(src, c.x, c.y, c.w, c.h, 0, 0, sw, sh);

        var out = makeCanvas(c.w, c.h);
        var octx = out.getContext('2d');
        octx.imageSmoothingEnabled = false;
        octx.drawImage(small, 0, 0, sw, sh, 0, 0, c.w, c.h);
        return out;
    }

    /**
     * Build a fully opaque mask patch.
     * @param {HTMLImageElement|HTMLCanvasElement} src original photo (or its canvas)
     * @param {{x:number,y:number,w:number,h:number}} rect layer rectangle in source pixels
     * @param {{kind:string,strength?:number,color?:string}} params
     * @returns {HTMLCanvasElement} round(rect.w) x round(rect.h), alpha always 255
     */
    function createPatch(src, rect, params) {
        var opts = params || {};
        var kind = isMaskKind(opts.kind) ? opts.kind : 'gaussian';
        var strength = clampStrength(opts.strength);
        var w = Math.max(1, Math.round(rect.w));
        var h = Math.max(1, Math.round(rect.h));
        var originX = Math.round(rect.x);
        var originY = Math.round(rect.y);

        var out = makeCanvas(w, h);
        var ctx = out.getContext('2d');
        // Opaque base also guarantees the patch stays solid when a face box
        // (or a user-dragged layer) extends beyond the image edges.
        ctx.fillStyle = (kind === 'solid') ? (opts.color || '#111111') : '#000000';
        ctx.fillRect(0, 0, w, h);
        if (kind === 'solid' || !src) return out;

        var c = clampRect(rect, src);
        if (!c) return out;

        var patch = (kind === 'mosaic')
            ? mosaicPatch(src, c, mosaicBlock(rect, strength))
            : gaussianPatch(src, c, gaussianRadius(rect, strength));

        ctx.drawImage(patch, 0, 0, c.w, c.h,
            c.x - originX, c.y - originY, c.w, c.h);
        return out;
    }

    // A layer stores params, not pixels. Rebuild the patch only when geometry
    // or strength changed; positions are quantised to 2px so dragging stays
    // smooth instead of running a box blur on every pointermove frame.
    function patchKey(layer) {
        var m = layer.mask || {};
        return [
            m.kind || '', clampStrength(m.strength), m.color || '',
            Math.floor(layer.x / 2), Math.floor(layer.y / 2),
            Math.round(layer.width), Math.round(layer.height)
        ].join('|');
    }

    function refreshLayer(layer, src, force) {
        if (!layer || !layer.mask) return;
        var key = patchKey(layer);
        if (!force && layer._maskKey === key && layer.img) return;
        layer.img = createPatch(src, {
            x: layer.x, y: layer.y, w: layer.width, h: layer.height
        }, layer.mask);
        layer._maskKey = key;
    }

    global.MaskEngine = {
        isMaskKind: isMaskKind,
        clampStrength: clampStrength,
        clampRect: clampRect,
        createPatch: createPatch,
        refreshLayer: refreshLayer,
        gaussianRadius: gaussianRadius,
        mosaicBlock: mosaicBlock,
        DEFAULT_STRENGTH: DEFAULT_STRENGTH
    };
})(window);
