/*!
 * author: FDD <smileFDD@gmail.com> 
 * wind-layer v0.0.6
 * build-time: 2019-3-5 10:25
 * LICENSE: MIT
 * (c) 2017-2019 https://sakitam-fdd.github.io/wind-layer
 */
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global.BMapWind = factory());
}(this, (function () { 'use strict';

  function _inheritsLoose(subClass, superClass) {
    subClass.prototype = Object.create(superClass.prototype);
    subClass.prototype.constructor = subClass;
    subClass.__proto__ = superClass;
  }

  var Windy = function Windy(params) {
    if (!params.projection) params.projection = 'EPSG:4326';
    var MIN_VELOCITY_INTENSITY = params.minVelocity || 0;
    var MAX_VELOCITY_INTENSITY = params.maxVelocity || 10;
    var VELOCITY_SCALE = (params.velocityScale || 0.005) * (Math.pow(window.devicePixelRatio, 1 / 3) || 1);
    var OVERLAY_ALPHA = Math.floor(0.4 * 255);
    var MAX_PARTICLE_AGE = params.particleAge || 90;
    var PARTICLE_LINE_WIDTH = params.lineWidth || 1;
    var PARTICLE_MULTIPLIER = params.particleMultiplier || 1 / 300;
    var PARTICLE_REDUCTION = Math.pow(window.devicePixelRatio, 1 / 3) || 1.6;
    var FRAME_RATE = params.frameRate || 15,
        FRAME_TIME = 1000 / FRAME_RATE;
    var defaultColorScale = ["rgb(36,104, 180)", "rgb(60,157, 194)", "rgb(128,205,193 )", "rgb(151,218,168 )", "rgb(198,231,181)", "rgb(238,247,217)", "rgb(255,238,159)", "rgb(252,217,125)", "rgb(255,182,100)", "rgb(252,150,75)", "rgb(250,112,52)", "rgb(245,64,32)", "rgb(237,45,28)", "rgb(220,24,32)", "rgb(180,0,35)"];
    var defaultOverlayColorScale = [[193, [37, 4, 42]], [206, [41, 10, 130]], [219, [81, 40, 40]], [233.15, [192, 37, 149]], [255.372, [70, 215, 215]], [273.15, [21, 84, 187]], [275.15, [24, 132, 14]], [291, [247, 251, 59]], [298, [235, 167, 21]], [311, [230, 71, 39]], [328, [88, 27, 67]]];
    var colorScale = params.colorScale || defaultColorScale;
    var overlayColorScale = params.overlayColorScale || defaultOverlayColorScale;
    var NULL_WIND_VECTOR = [NaN, NaN, null];
    var builder;
    var grid;
    var gridData = params.data;
    var date;
    var λ0, φ0, Δλ, Δφ, ni, nj;
    var isWind = true;

    var setData = function setData(data) {
      gridData = data;
    };

    var bilinearInterpolateScalar = function bilinearInterpolateScalar(x, y, g00, g10, g01, g11) {
      var rx = 1 - x;
      var ry = 1 - y;
      return g00 * rx * ry + g10 * x * ry + g01 * rx * y + g11 * x * y;
    };

    var bilinearInterpolateVector = function bilinearInterpolateVector(x, y, g00, g10, g01, g11) {
      var rx = 1 - x;
      var ry = 1 - y;
      var a = rx * ry,
          b = x * ry,
          c = rx * y,
          d = x * y;
      var u = g00[0] * a + g10[0] * b + g01[0] * c + g11[0] * d;
      var v = g00[1] * a + g10[1] * b + g01[1] * c + g11[1] * d;
      return [u, v, Math.sqrt(u * u + v * v)];
    };

    var createScalarBuilder = function createScalarBuilder(scalar) {
      isWind = false;
      var _data = scalar.data;
      return {
        header: scalar.header,
        interpolate: bilinearInterpolateScalar,
        data: function data(i) {
          return _data[i];
        }
      };
    };

    var createWindBuilder = function createWindBuilder(uComp, vComp) {
      isWind = true;
      var uData = uComp.data,
          vData = vComp.data;
      return {
        header: uComp.header,
        data: function data(i) {
          return [uData[i], vData[i]];
        },
        interpolate: bilinearInterpolateVector
      };
    };

    var createBuilder = function createBuilder(data) {
      var uComp = null,
          vComp = null,
          scalar = null;
      data.forEach(function (record) {
        switch (record.header.parameterCategory + "," + record.header.parameterNumber) {
          case "1,2":
          case "2,2":
            uComp = record;
            break;

          case "1,3":
          case "2,3":
            vComp = record;
            break;

          default:
            scalar = record;
        }
      });
      return scalar != null ? createScalarBuilder(scalar) : createWindBuilder(uComp, vComp);
    };

    var buildGrid = function buildGrid(data, callback) {
      builder = createBuilder(data);
      var header = builder.header;
      λ0 = header.lo1;
      φ0 = Math.max(header.la2, header.la1);
      Δλ = header.dx;
      Δφ = header.dy;
      ni = header.nx;
      nj = header.ny;
      date = new Date(header.refTime);
      date.setHours(date.getHours() + header.forecastTime);
      grid = [];
      var p = 0;
      var isContinuous = Math.floor(ni * Δλ) >= 360;

      for (var j = 0; j < nj; j++) {
        var row = [];

        for (var i = 0; i < ni; i++, p++) {
          row[i] = builder.data(p);
        }

        if (isContinuous) {
          row.push(row[0]);
        }

        grid[j] = row;
      }

      callback({
        date: date,
        interpolate: interpolate
      });
    };

    var interpolate = function interpolate(λ, φ) {
      if (!grid) return null;
      var i = floorMod(λ - λ0, 360) / Δλ;
      var j = (φ0 - φ) / Δφ;
      var fi = Math.floor(i),
          ci = fi + 1;
      var fj = Math.floor(j),
          cj = fj + 1;
      var row;

      if (row = grid[fj]) {
        var g00 = row[fi];
        var g10 = row[ci];

        if (isValue(g00) && isValue(g10) && (row = grid[cj])) {
          var g01 = row[fi];
          var g11 = row[ci];

          if (isValue(g01) && isValue(g11)) {
            return builder.interpolate(i - fi, j - fj, g00, g10, g01, g11);
          }
        }
      }

      return null;
    };

    var isValue = function isValue(x) {
      return x !== null && x !== undefined;
    };

    var floorMod = function floorMod(a, n) {
      return a - n * Math.floor(a / n);
    };

    var clamp = function clamp(x, range) {
      return Math.max(range[0], Math.min(x, range[1]));
    };

    var proportion = function proportion(x, low, high) {
      return (clamp(x, [low, high]) - low) / (high - low);
    };

    var isMobile = function isMobile() {
      return /android|blackberry|iemobile|ipad|iphone|ipod|opera mini|webos/i.test(navigator.userAgent);
    };

    var colorInterpolator = function colorInterpolator(start, end) {
      var r = start[0],
          g = start[1],
          b = start[2];
      var Δr = end[0] - r,
          Δg = end[1] - g,
          Δb = end[2] - b;
      return function (i, a) {
        return [Math.floor(r + i * Δr), Math.floor(g + i * Δg), Math.floor(b + i * Δb), a];
      };
    };

    function segmentedColorScale(segments) {
      var points = [],
          interpolators = [],
          ranges = [];

      for (var i = 0; i < segments.length - 1; i++) {
        points.push(segments[i + 1][0]);
        interpolators.push(colorInterpolator(segments[i][1], segments[i + 1][1]));
        ranges.push([segments[i][0], segments[i + 1][0]]);
      }

      return function (point, alpha) {
        var i;

        for (i = 0; i < points.length - 1; i++) {
          if (point <= points[i]) {
            break;
          }
        }

        var range = ranges[i];
        return interpolators[i](proportion(point, range[0], range[1]), alpha);
      };
    }

    var distort = function distort(projection, λ, φ, x, y, scale, wind, windy) {
      var u = wind[0] * scale;
      var v = wind[1] * scale;
      var d = distortion(projection, λ, φ, x, y, windy);
      wind[0] = d[0] * u + d[2] * v;
      wind[1] = d[1] * u + d[3] * v;
      return wind;
    };

    var distortion = function distortion(projection, λ, φ, x, y, windy) {
      var τ = 2 * Math.PI;
      var H = params.projection === 'EPSG:4326' ? 5 : Math.pow(10, -5.2);
      var hλ = λ < 0 ? H : -H;
      var hφ = φ < 0 ? H : -H;
      var pλ = project(φ, λ + hλ, windy);
      var pφ = project(φ + hφ, λ, windy);
      var k = Math.cos(φ / 360 * τ);
      return [(pλ[0] - x) / hλ / k, (pλ[1] - y) / hλ / k, (pφ[0] - x) / hφ, (pφ[1] - y) / hφ];
    };

    var createMask = function createMask(bounds) {
      var canvas = document.createElement('canvas');
      var width = bounds.width;
      var height = bounds.height;
      canvas.width = width;
      canvas.height = height;
      var context = canvas.getContext("2d");
      context.fillStyle = "rgba(255, 0, 0, 1)";
      context.fill();
      var imageData = context.getImageData(0, 0, width, height);
      var data = imageData.data;
      return {
        imageData: imageData,
        isVisible: function isVisible(x, y) {
          var i = (y * width + x) * 4;
          return data[i + 3] > 0;
        },
        set: function set(x, y, rgba) {
          var i = (y * width + x) * 4;
          data[i] = rgba[0];
          data[i + 1] = rgba[1];
          data[i + 2] = rgba[2];
          data[i + 3] = rgba[3];
          return this;
        }
      };
    };

    var createField = function createField(columns, bounds, mask, callback) {
      function field(x, y) {
        var column = columns[Math.round(x)];
        return column && column[Math.round(y)] || NULL_WIND_VECTOR;
      }

      field.release = function () {
        columns = [];
      };

      field.randomize = function (o) {
        var x, y;
        var safetyNet = 0;

        do {
          x = Math.round(Math.floor(Math.random() * bounds.width) + bounds.x);
          y = Math.round(Math.floor(Math.random() * bounds.height) + bounds.y);
        } while (field(x, y)[2] === null && safetyNet++ < 30);

        o.x = x;
        o.y = y;
        return o;
      };

      field.overlay = mask.imageData;
      callback(bounds, field);
    };

    var buildBounds = function buildBounds(bounds, width, height) {
      var upperLeft = bounds[0];
      var lowerRight = bounds[1];
      var x = Math.round(upperLeft[0]);
      var y = Math.max(Math.floor(upperLeft[1], 0), 0);
      var xMax = Math.min(Math.ceil(lowerRight[0], width), width - 1);
      var yMax = Math.min(Math.ceil(lowerRight[1], height), height - 1);
      return {
        x: x,
        y: y,
        xMax: width,
        yMax: yMax,
        width: width,
        height: height
      };
    };

    var deg2rad = function deg2rad(deg) {
      return deg / 180 * Math.PI;
    };

    var rad2deg = function rad2deg(ang) {
      return ang / (Math.PI / 180.0);
    };

    var invert;

    if (params.projection === 'EPSG:4326') {
      invert = function invert(x, y, windy) {
        var mapLonDelta = windy.east - windy.west;
        var mapLatDelta = windy.south - windy.north;
        var lat = rad2deg(windy.north) + y / windy.height * rad2deg(mapLatDelta);
        var lon = rad2deg(windy.west) + x / windy.width * rad2deg(mapLonDelta);
        return [lon, lat];
      };
    } else {
      invert = function invert(x, y, windy) {
        var mapLonDelta = windy.east - windy.west;
        var worldMapRadius = windy.width / rad2deg(mapLonDelta) * 360 / (2 * Math.PI);
        var mapOffsetY = worldMapRadius / 2 * Math.log((1 + Math.sin(windy.south)) / (1 - Math.sin(windy.south)));
        var equatorY = windy.height + mapOffsetY;
        var a = (equatorY - y) / worldMapRadius;
        var lat = 180 / Math.PI * (2 * Math.atan(Math.exp(a)) - Math.PI / 2);
        var lon = rad2deg(windy.west) + x / windy.width * rad2deg(mapLonDelta);
        return [lon, lat];
      };
    }

    var mercY = function mercY(lat) {
      return Math.log(Math.tan(lat / 2 + Math.PI / 4));
    };

    var project = function project(lat, lon, windy) {
      var ymin = mercY(windy.south);
      var ymax = mercY(windy.north);
      var xFactor = windy.width / (windy.east - windy.west);
      var yFactor = windy.height / (ymax - ymin);
      var y = mercY(deg2rad(lat));
      var x = (deg2rad(lon) - windy.west) * xFactor;
      var y = (ymax - y) * yFactor;
      return [x, y];
    };

    var interpolateField = function interpolateField(grid, bounds, extent, callback) {
      var mask = createMask(bounds);
      var projection = {};
      var mapArea = (extent.south - extent.north) * (extent.west - extent.east);
      var velocityScale = VELOCITY_SCALE * Math.pow(mapArea, 0.4);
      var columns = [];
      var x = bounds.x;

      function interpolateColumn(x) {
        var column = [];

        for (var y = bounds.y; y <= bounds.yMax; y += 2) {
          var coord = invert(x, y, extent);
          var color = [0, 0, 0, 0];

          if (coord) {
            var λ = coord[0],
                φ = coord[1];

            if (isFinite(λ)) {
              var wind = grid.interpolate(λ, φ);
              var scalar = null;

              if (wind) {
                if (isWind) {
                  wind = distort(projection, λ, φ, x, y, velocityScale, wind, extent);
                  column[y + 1] = column[y] = wind;
                } else {
                  scalar = wind;
                }
              }

              if (isValue(scalar)) {
                color = segmentedColorScale(overlayColorScale)(scalar, OVERLAY_ALPHA);
              }
            }
          }

          mask.set(x, y, color).set(x + 1, y, color).set(x, y + 1, color).set(x + 1, y + 1, color);
        }

        columns[x + 1] = columns[x] = column;
      }

      (function batchInterpolate() {
        var start = Date.now();

        while (x < bounds.width) {
          interpolateColumn(x);
          x += 2;

          if (Date.now() - start > 1000) {
            setTimeout(batchInterpolate, 25);
            return;
          }
        }

        createField(columns, bounds, mask, callback);
      })();
    };

    var animationLoop;

    var animate = function animate(bounds, field) {
      function windIntensityColorScale(min, max) {
        colorScale.indexFor = function (m) {
          return Math.max(0, Math.min(colorScale.length - 1, Math.round((m - min) / (max - min) * (colorScale.length - 1))));
        };

        return colorScale;
      }

      var colorStyles = windIntensityColorScale(MIN_VELOCITY_INTENSITY, MAX_VELOCITY_INTENSITY);
      var buckets = colorStyles.map(function () {
        return [];
      });
      var particleCount = Math.round(bounds.width * bounds.height * PARTICLE_MULTIPLIER);

      if (isMobile()) {
        particleCount *= PARTICLE_REDUCTION;
      }

      var fadeFillStyle = "rgba(0, 0, 0, 0.97)";
      var particles = [];

      for (var i = 0; i < particleCount; i++) {
        particles.push(field.randomize({
          age: Math.floor(Math.random() * MAX_PARTICLE_AGE) + 0
        }));
      }

      function evolve() {
        buckets.forEach(function (bucket) {
          bucket.length = 0;
        });
        particles.forEach(function (particle) {
          if (particle.age > MAX_PARTICLE_AGE) {
            field.randomize(particle).age = 0;
          }

          var x = particle.x;
          var y = particle.y;
          var v = field(x, y);
          var m = v[2];

          if (m === null) {
            particle.age = MAX_PARTICLE_AGE;
          } else {
            var xt = x + v[0];
            var yt = y + v[1];

            if (field(xt, yt)[2] !== null) {
              particle.xt = xt;
              particle.yt = yt;
              buckets[colorStyles.indexFor(m)].push(particle);
            } else {
              particle.x = xt;
              particle.y = yt;
            }
          }

          particle.age += 1;
        });
      }

      var g = params.canvas.getContext("2d");
      g.lineWidth = PARTICLE_LINE_WIDTH;
      g.fillStyle = fadeFillStyle;
      g.globalAlpha = 0.6;

      function draw() {
        var prev = "lighter";
        g.globalCompositeOperation = "destination-in";
        g.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
        g.globalCompositeOperation = prev;
        g.globalAlpha = 0.9;
        buckets.forEach(function (bucket, i) {
          if (bucket.length > 0) {
            g.beginPath();
            g.strokeStyle = colorStyles[i];
            bucket.forEach(function (particle) {
              g.moveTo(particle.x, particle.y);
              g.lineTo(particle.xt, particle.yt);
              particle.x = particle.xt;
              particle.y = particle.yt;
            });
            g.stroke();
          }
        });
      }

      var then = Date.now();

      (function frame() {
        animationLoop = requestAnimationFrame(frame);
        var now = Date.now();
        var delta = now - then;

        if (delta > FRAME_TIME) {
          then = now - delta % FRAME_TIME;
          evolve();
          draw();
        }
      })();
    };

    var overlay = function overlay(bounds, field) {
      if (!field) return;
      var canvas = params.canvas,
          w = canvas.width,
          h = canvas.height,
          ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, w, h);
      ctx.putImageData(field.overlay, 0, 0);
    };

    var updateData = function updateData(data, bounds, width, height, extent) {
      delete params.data;
      params.data = data;
      if (extent) start(bounds, width, height, extent);
    };

    var start = function start(bounds, width, height, extent) {
      var mapBounds = {
        south: deg2rad(extent[0][1]),
        north: deg2rad(extent[1][1]),
        east: deg2rad(extent[1][0]),
        west: deg2rad(extent[0][0]),
        width: width,
        height: height
      };
      stop();
      buildGrid(gridData, function (grid) {
        interpolateField(grid, buildBounds(bounds, width, height), mapBounds, function (bounds, field) {
          windy.field = field;

          if (isWind) {
            animate(bounds, field);
          } else {
            overlay(bounds, field);
          }
        });
      });
    };

    var stop = function stop() {
      if (windy.field) windy.field.release();
      if (animationLoop) cancelAnimationFrame(animationLoop);
    };

    var shift = function shift(dx, dy) {
      var canvas = params.canvas,
          w = canvas.width,
          h = canvas.height,
          ctx = canvas.getContext("2d");

      if (w > dx && h > dy) {
        var clamp = function clamp(high, value) {
          return Math.max(0, Math.min(high, value));
        };

        var imageData = ctx.getImageData(clamp(w, -dx), clamp(h, -dy), clamp(w, w - dx), clamp(h, h - dy));
        ctx.clearRect(0, 0, w, h);
        ctx.putImageData(imageData, clamp(w, dx), clamp(h, dy));

        for (var i = 0, pLength = particles.length; i < pLength; i++) {
          particles[i].x += dx;
          particles[i].y += dy;
        }
      }
    };

    var windy = {
      params: params,
      start: start,
      stop: stop,
      update: updateData,
      shift: shift,
      createField: createField,
      interpolatePoint: interpolate,
      setData: setData
    };
    return windy;
  };

  window.requestAnimationFrame = function () {
    return window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.oRequestAnimationFrame || window.msRequestAnimationFrame || function (callback) {
      return window.setTimeout(callback, 1000 / FRAME_RATE);
    };
  }();

  if (!window.cancelAnimationFrame) {
    window.cancelAnimationFrame = function (id) {
      clearTimeout(id);
    };
  }

  var getDirection = function getDirection(uMs, vMs, angleConvention) {
    if (angleConvention.endsWith('CCW')) {
      vMs = vMs > 0 ? vMs = -vMs : Math.abs(vMs);
    }

    var velocityAbs = Math.sqrt(Math.pow(uMs, 2) + Math.pow(vMs, 2));
    var velocityDir = Math.atan2(uMs / velocityAbs, vMs / velocityAbs);
    var velocityDirToDegrees = velocityDir * 180 / Math.PI + 180;

    if (angleConvention === 'bearingCW' || angleConvention === 'meteoCCW') {
      velocityDirToDegrees += 180;
      if (velocityDirToDegrees >= 360) velocityDirToDegrees -= 360;
    }

    return velocityDirToDegrees;
  };

  var getSpeed = function getSpeed(uMs, vMs, unit) {
    var velocityAbs = Math.sqrt(Math.pow(uMs, 2) + Math.pow(vMs, 2));

    if (unit === 'k/h') {
      return meterSec2kilometerHour(velocityAbs);
    } else if (unit === 'kt') {
      return meterSec2Knots(velocityAbs);
    } else {
      return velocityAbs;
    }
  };

  var meterSec2Knots = function meterSec2Knots(meters) {
    return meters / 0.514;
  };

  var meterSec2kilometerHour = function meterSec2kilometerHour(meters) {
    return meters * 3.6;
  };

  var global = typeof window === 'undefined' ? {} : window;
  if (!global.BMap) global.BMap = {};
  if (!global.BMap.Overlay) global.BMap.Overlay = function Overlay() {};

  var BaiduWind = function (_global$BMap$Overlay) {
    _inheritsLoose(BaiduWind, _global$BMap$Overlay);

    function BaiduWind(data, options) {
      var _this;

      if (options === void 0) {
        options = {};
      }

      _this = _global$BMap$Overlay.call(this, options) || this;
      _this.options = options;
      _this.paneName = _this.options.paneName || 'mapPane';
      _this.context = _this.options.context || '2d';
      _this.zIndex = _this.options.zIndex || 0;
      _this.mixBlendMode = _this.options.mixBlendMode || null;
      _this.enableMassClear = _this.options.enableMassClear;
      _this._map = options.map;
      _this._lastDrawTime = null;
      _this.canvas = null;
      _this.data = data;
      _this._windy = null;

      _this.show();

      return _this;
    }

    var _proto = BaiduWind.prototype;

    _proto.getData = function getData() {
      return this.data;
    };

    _proto.setData = function setData(data) {
      this.data = data;

      if (this._map && this.data) {
        this._draw();
      }
    };

    _proto._getExtent = function _getExtent() {
      var size = this._map.getSize();

      var _ne = this._map.getBounds().getNorthEast();

      var _sw = this._map.getBounds().getSouthWest();

      return [[[0, 0], [size.width, size.height]], size.width, size.height, [[_ne.lng, _ne.lat], [_sw.lng, _sw.lat]]];
    };

    _proto.appendTo = function appendTo(map) {
      if (map) {
        map.addOverlay(this);
      } else {
        throw new Error('not map object');
      }
    };

    _proto.initialize = function initialize(map) {
      var _this2 = this;

      this._map = map;
      var canvas = this.canvas = document.createElement('canvas');
      canvas.style.cssText = "position:absolute; left:0; top:0; z-index: " + this.zIndex + " ;user-select:none;";
      canvas.style.mixBlendMode = this.mixBlendMode;
      this.adjustSize();
      map.getPanes()[this.paneName].appendChild(canvas);
      map.addEventListener('resize', function () {
        _this2.adjustSize();

        _this2._draw();
      });
      return this.canvas;
    };

    _proto.adjustSize = function adjustSize() {
      var size = this._map.getSize();

      var canvas = this.canvas;
      var devicePixelRatio = this.devicePixelRatio = global.devicePixelRatio || 1;
      canvas.width = size.width * devicePixelRatio;
      canvas.height = size.height * devicePixelRatio;

      if (this.context === '2d') {
        canvas.getContext(this.context).scale(devicePixelRatio, devicePixelRatio);
      }

      canvas.style.width = size.width + 'px';
      canvas.style.height = size.height + 'px';
    };

    _proto.draw = function draw() {
      var self = this;
      clearTimeout(self.timeoutID);
      self.timeoutID = setTimeout(function () {
        self._draw();
      }, 15);
    };

    _proto._draw = function _draw() {
      var map = this._map;
      var size = map.getSize();
      var center = map.getCenter();

      if (center) {
        var pixel = map.pointToOverlayPixel(center);
        this.canvas.style.left = pixel.x - size.width / 2 + 'px';
        this.canvas.style.top = pixel.y - size.height / 2 + 'px';
        this.dispatchEvent('draw');
        this.options.update && this.options.update.call(this);
        this.render(this.canvas);
      }
    };

    _proto.render = function render(canvas) {
      var extent = this._getExtent();

      if (!this.getData() || !extent) return this;

      if (canvas && !this._windy) {
        this._windy = new Windy({
          canvas: canvas,
          data: this.getData(),
          'onDraw': function onDraw() {}
        });

        this._windy.start(extent[0], extent[1], extent[2], extent[3]);
      } else if (canvas && this._windy) {
        this._windy.start(extent[0], extent[1], extent[2], extent[3]);
      }

      return this;
    };

    _proto.getContainer = function getContainer() {
      return this.canvas;
    };

    _proto.setZIndex = function setZIndex(zIndex) {
      this.zIndex = zIndex;
      this.canvas.style.zIndex = this.zIndex;
    };

    _proto.getZIndex = function getZIndex() {
      return this.zIndex;
    };

    _proto.getPointData = function getPointData(coordinates) {
      var gridValue = this._windy.interpolatePoint(coordinates[0], coordinates[1]);

      if (gridValue && !isNaN(gridValue[0]) && !isNaN(gridValue[1]) && gridValue[2]) {
        return {
          direction: getDirection(gridValue[0], gridValue[1], this.options.angleConvention || 'bearingCCW'),
          speed: getSpeed(gridValue[0], gridValue[1], this.options.speedUnit)
        };
      }
    };

    _proto.clearWind = function clearWind() {
      if (this._windy) this._windy.stop();
    };

    return BaiduWind;
  }(global.BMap.Overlay);

  return BaiduWind;

})));
//# sourceMappingURL=BMapWind.js.map
