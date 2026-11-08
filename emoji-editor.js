/**
 * Emoji editor for result.html.
 *
 * Self-contained: no face-api.js, no homepage DOM, no models. It mirrors the
 * interaction model in app.js (identical handle metrics, hit testing, drag /
 * resize / rotate / delete) so a result generated in the tool can still be
 * edited here. The result page keeps its static, crawlable <img> as the
 * default state; this module only takes over when a local result exists.
 */
(function (global) {
    'use strict';

    var MIN_SIZE = 10;

    function isTouchDevice() {
        return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    }

    // Keep in sync with getHandleMetrics() in app.js.
    function getHandleMetrics() {
        var touch = isTouchDevice();
        return {
            handleSize: touch ? 22 : 14,
            deleteOffset: touch ? 20 : 16,
            rotateHandleSize: touch ? 24 : 16,
            rotateOffset: touch ? 32 : 26
        };
    }

    function loadImage(src) {
        return new Promise(function (resolve, reject) {
            var img = new Image();
            img.onload = function () { resolve(img); };
            img.onerror = function () { reject(new Error('Image failed to load: ' + src)); };
            img.src = src;
        });
    }

    function create(options) {
        var canvas = options.canvas;
        var ctx = canvas.getContext('2d');
        var baseImage = options.baseImage;
        var onChange = options.onChange || function () {};
        var emojis = [];
        var selected = null;
        var controlsInitiallyVisible = true;
        var drag = null;

        // Use the export dimensions when available: emoji x/y/width/height
        // were recorded in that coordinate space, so drawing the base image
        // scaled to these dimensions keeps every layer perfectly aligned.
        canvas.width = options.width || baseImage.naturalWidth || baseImage.width;
        canvas.height = options.height || baseImage.naturalHeight || baseImage.height;

        function metrics() { return getHandleMetrics(); }

        function paintEmoji(target, e) {
            target.save();
            target.translate(e.x + e.width / 2, e.y + e.height / 2);
            target.rotate(e.angle);
            target.drawImage(e.img, -e.width / 2, -e.height / 2, e.width, e.height);
            target.restore();
        }

        function drawControls(e, isSelected) {
            var m = metrics(), h = m.handleSize, half = h / 2;
            var rhalf = m.rotateHandleSize / 2;
            var delX = e.width / 2 + m.deleteOffset - half;
            var delY = -e.height / 2 - m.deleteOffset - half;
            var xs = [-e.width / 2 - half, -half, e.width / 2 - half];
            var ys = [-e.height / 2 - half, -half, e.height / 2 - half];

            ctx.save();
            ctx.translate(e.x + e.width / 2, e.y + e.height / 2);
            ctx.rotate(e.angle);

            ctx.strokeStyle = isSelected ? '#6c47ff' : '#333';
            ctx.lineWidth = isSelected ? 2 : 1;
            ctx.strokeRect(-e.width / 2, -e.height / 2, e.width, e.height);

            ctx.fillStyle = '#ff0000';
            [[0, 0], [2, 0], [0, 2], [2, 2], [1, 0], [0, 1], [2, 1], [1, 2]].forEach(function (p) {
                ctx.fillRect(xs[p[0]], ys[p[1]], h, h);
            });

            // Rotate handle (diamond above the top edge).
            var ry = -e.height / 2 - m.rotateOffset;
            ctx.beginPath();
            ctx.moveTo(0, ry - rhalf);
            ctx.lineTo(rhalf, ry);
            ctx.lineTo(0, ry + rhalf);
            ctx.lineTo(-rhalf, ry);
            ctx.closePath();
            ctx.fill();

            // Delete handle (dark square with a white X).
            ctx.fillStyle = '#222';
            ctx.fillRect(delX, delY, h, h);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(delX + 4, delY + 4);
            ctx.lineTo(delX + h - 4, delY + h - 4);
            ctx.moveTo(delX + h - 4, delY + 4);
            ctx.lineTo(delX + 4, delY + h - 4);
            ctx.stroke();

            ctx.restore();
        }

        function redraw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
            emojis.forEach(function (e) { paintEmoji(ctx, e); });
            if (controlsInitiallyVisible) {
                emojis.forEach(function (e) { drawControls(e, e === selected); });
            } else if (selected) {
                drawControls(selected, true);
            }
        }

        function exportCanvas() {
            var out = document.createElement('canvas');
            out.width = canvas.width;
            out.height = canvas.height;
            var c = out.getContext('2d');
            c.drawImage(baseImage, 0, 0, out.width, out.height);
            emojis.forEach(function (e) { paintEmoji(c, e); });
            return out;
        }

        function toPoint(event) {
            var rect = canvas.getBoundingClientRect();
            return {
                x: (event.clientX - rect.left) * canvas.width / rect.width,
                y: (event.clientY - rect.top) * canvas.height / rect.height
            };
        }

        function toLocal(e, p) {
            var dx = p.x - (e.x + e.width / 2);
            var dy = p.y - (e.y + e.height / 2);
            var cos = Math.cos(e.angle), sin = Math.sin(e.angle);
            return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
        }

        function boxHit(l, cx, cy, hw, hh) {
            return l.x >= cx - hw && l.x <= cx + hw && l.y >= cy - hh && l.y <= cy + hh;
        }

        function hitTest(p) {
            var m = metrics(), half = m.handleSize / 2, rhalf = m.rotateHandleSize / 2;
            for (var i = emojis.length - 1; i >= 0; i--) {
                var e = emojis[i], l = toLocal(e, p);
                if (controlsInitiallyVisible || selected === e) {
                    var delX = e.width / 2 + m.deleteOffset - half;
                    var delY = -e.height / 2 - m.deleteOffset - half;
                    if (l.x >= delX && l.x <= delX + m.handleSize &&
                        l.y >= delY && l.y <= delY + m.handleSize) {
                        return { action: 'delete', emoji: e, index: i, cursor: 'pointer' };
                    }
                    if (boxHit(l, 0, -e.height / 2 - m.rotateOffset, rhalf, rhalf)) {
                        return { action: 'rotate', emoji: e, index: i, cursor: 'crosshair' };
                    }
                    var corners = [
                        { x: -e.width / 2, y: -e.height / 2, mode: 'topLeft', cursor: 'nwse-resize' },
                        { x: e.width / 2, y: -e.height / 2, mode: 'topRight', cursor: 'nesw-resize' },
                        { x: -e.width / 2, y: e.height / 2, mode: 'bottomLeft', cursor: 'nesw-resize' },
                        { x: e.width / 2, y: e.height / 2, mode: 'bottomRight', cursor: 'nwse-resize' }
                    ];
                    for (var c = 0; c < corners.length; c++) {
                        if (boxHit(l, corners[c].x, corners[c].y, half, half)) {
                            return { action: 'resize', emoji: e, index: i, mode: corners[c].mode, cursor: corners[c].cursor };
                        }
                    }
                    var edges = [
                        { x: 0, y: -e.height / 2, mode: 'top', cursor: 'ns-resize' },
                        { x: 0, y: e.height / 2, mode: 'bottom', cursor: 'ns-resize' },
                        { x: -e.width / 2, y: 0, mode: 'left', cursor: 'ew-resize' },
                        { x: e.width / 2, y: 0, mode: 'right', cursor: 'ew-resize' }
                    ];
                    for (var k = 0; k < edges.length; k++) {
                        if (boxHit(l, edges[k].x, edges[k].y, half, half)) {
                            return { action: 'resize', emoji: e, index: i, mode: edges[k].mode, cursor: edges[k].cursor };
                        }
                    }
                }
                if (l.x >= -e.width / 2 && l.x <= e.width / 2 &&
                    l.y >= -e.height / 2 && l.y <= e.height / 2) {
                    return { action: 'drag', emoji: e, index: i, cursor: 'move' };
                }
            }
            return { action: 'none', cursor: 'default' };
        }

        function shrinkW(e, dx) {
            var w = e.width - dx;
            if (w < MIN_SIZE) { e.x += e.width - MIN_SIZE; e.width = MIN_SIZE; }
            else { e.x += dx; e.width = w; }
        }

        function shrinkH(e, dy) {
            var h = e.height - dy;
            if (h < MIN_SIZE) { e.y += e.height - MIN_SIZE; e.height = MIN_SIZE; }
            else { e.y += dy; e.height = h; }
        }

        function resize(e, mode, dx, dy) {
            switch (mode) {
                case 'bottomRight': e.width += dx; e.height += dy; break;
                case 'bottomLeft': shrinkW(e, dx); e.height += dy; break;
                case 'topRight': shrinkH(e, dy); e.width += dx; break;
                case 'topLeft': shrinkW(e, dx); shrinkH(e, dy); break;
                case 'left': shrinkW(e, dx); break;
                case 'right': e.width += dx; break;
                case 'top': shrinkH(e, dy); break;
                case 'bottom': e.height += dy; break;
            }
            e.width = Math.max(MIN_SIZE, e.width);
            e.height = Math.max(MIN_SIZE, e.height);
        }

        function changed() { onChange(emojis.length); }

        function onPointerDown(event) {
            var p = toPoint(event);
            var hit = hitTest(p);
            controlsInitiallyVisible = false;
            event.preventDefault();

            if (hit.action === 'delete') {
                emojis.splice(hit.index, 1);
                if (selected === hit.emoji) selected = null;
                redraw(); changed();
                return;
            }
            if (hit.action === 'none') {
                selected = null; redraw();
                return;
            }
            selected = hit.emoji;
            drag = { action: hit.action, mode: hit.mode, x: p.x, y: p.y };
            if (canvas.setPointerCapture && event.pointerId != null) {
                try { canvas.setPointerCapture(event.pointerId); } catch (err) { /* optional */ }
            }
            redraw();
        }

        function onPointerMove(event) {
            var p = toPoint(event);
            if (!drag) {
                canvas.style.cursor = hitTest(p).cursor || 'default';
                return;
            }
            var e = selected;
            if (!e) return;
            var dx = p.x - drag.x, dy = p.y - drag.y;
            if (drag.action === 'drag') {
                e.x += dx; e.y += dy;
            } else if (drag.action === 'rotate') {
                e.angle = Math.atan2(p.y - (e.y + e.height / 2), p.x - (e.x + e.width / 2)) + Math.PI / 2;
            } else if (drag.action === 'resize') {
                resize(e, drag.mode, dx, dy);
            }
            drag.x = p.x; drag.y = p.y;
            redraw(); changed();
            event.preventDefault();
        }

        function onPointerUp() { drag = null; }
        function onPointerLeave() { if (!drag) canvas.style.cursor = 'default'; }

        function onKeyDown(event) {
            var target = event.target || {};
            var tag = target.tagName || '';
            if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
            if ((event.key === 'Delete' || event.key === 'Backspace') && selected) {
                var i = emojis.indexOf(selected);
                if (i > -1) { emojis.splice(i, 1); selected = null; redraw(); changed(); }
            }
            if (event.key === 'Escape' && selected) { selected = null; redraw(); }
        }

        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointercancel', onPointerUp);
        canvas.addEventListener('pointerleave', onPointerLeave);
        document.addEventListener('keydown', onKeyDown);

        return {
            setEmojis: function (list) {
                emojis = list.slice();
                selected = null;
                controlsInitiallyVisible = true;
                redraw();
            },
            exportBlob: function () {
                return new Promise(function (resolve) { exportCanvas().toBlob(resolve, 'image/png'); });
            },
            get count() { return emojis.length; },
            redraw: redraw,
            destroy: function () {
                canvas.removeEventListener('pointerdown', onPointerDown);
                canvas.removeEventListener('pointermove', onPointerMove);
                canvas.removeEventListener('pointerup', onPointerUp);
                canvas.removeEventListener('pointercancel', onPointerUp);
                canvas.removeEventListener('pointerleave', onPointerLeave);
                document.removeEventListener('keydown', onKeyDown);
            }
        };
    }

    global.EmojiEditor = { create: create, loadImage: loadImage };
})(window);
