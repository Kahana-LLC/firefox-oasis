"use strict";
var AssistantUI = (() => {
  var fe,
    P,
    Fe,
    Mt,
    ee,
    Re,
    We,
    De,
    ze,
    ye,
    ve,
    he,
    It,
    re = {},
    Ve = [],
    Nt = /acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i,
    me = Array.isArray;
  function q(e, t) {
    for (var o in t) e[o] = t[o];
    return e;
  }
  function ke(e) {
    e && e.parentNode && e.parentNode.removeChild(e);
  }
  function n(e, t, o) {
    var i,
      s,
      r,
      d = {};
    for (r in t)
      r == "key" ? (i = t[r]) : r == "ref" ? (s = t[r]) : (d[r] = t[r]);
    if (
      (arguments.length > 2 &&
        (d.children = arguments.length > 3 ? fe.call(arguments, 2) : o),
      typeof e == "function" && e.defaultProps != null)
    )
      for (r in e.defaultProps) d[r] === void 0 && (d[r] = e.defaultProps[r]);
    return ue(e, d, i, s, null);
  }
  function ue(e, t, o, i, s) {
    var r = {
      type: e,
      props: t,
      key: o,
      ref: i,
      __k: null,
      __: null,
      __b: 0,
      __e: null,
      __c: null,
      constructor: void 0,
      __v: s == null ? ++Fe : s,
      __i: -1,
      __u: 0,
    };
    return (s == null && P.vnode != null && P.vnode(r), r);
  }
  function X(e) {
    return e.children;
  }
  function pe(e, t) {
    ((this.props = e), (this.context = t));
  }
  function oe(e, t) {
    if (t == null) return e.__ ? oe(e.__, e.__i + 1) : null;
    for (var o; t < e.__k.length; t++)
      if ((o = e.__k[t]) != null && o.__e != null) return o.__e;
    return typeof e.type == "function" ? oe(e) : null;
  }
  function Be(e) {
    var t, o;
    if ((e = e.__) != null && e.__c != null) {
      for (e.__e = e.__c.base = null, t = 0; t < e.__k.length; t++)
        if ((o = e.__k[t]) != null && o.__e != null) {
          e.__e = e.__c.base = o.__e;
          break;
        }
      return Be(e);
    }
  }
  function Pe(e) {
    ((!e.__d && (e.__d = !0) && ee.push(e) && !ge.__r++) ||
      Re != P.debounceRendering) &&
      ((Re = P.debounceRendering) || We)(ge);
  }
  function ge() {
    for (var e, t, o, i, s, r, d, l = 1; ee.length; )
      (ee.length > l && ee.sort(De),
        (e = ee.shift()),
        (l = ee.length),
        e.__d &&
          ((o = void 0),
          (i = void 0),
          (s = (i = (t = e).__v).__e),
          (r = []),
          (d = []),
          t.__P &&
            (((o = q({}, i)).__v = i.__v + 1),
            P.vnode && P.vnode(o),
            we(
              t.__P,
              o,
              i,
              t.__n,
              t.__P.namespaceURI,
              32 & i.__u ? [s] : null,
              r,
              s == null ? oe(i) : s,
              !!(32 & i.__u),
              d
            ),
            (o.__v = i.__v),
            (o.__.__k[o.__i] = o),
            $e(r, o, d),
            (i.__e = i.__ = null),
            o.__e != s && Be(o))));
    ge.__r = 0;
  }
  function Ue(e, t, o, i, s, r, d, l, m, c, g) {
    var a,
      b,
      u,
      p,
      h,
      x,
      f,
      k = (i && i.__k) || Ve,
      I = t.length;
    for (m = Lt(o, t, k, m, I), a = 0; a < I; a++)
      (u = o.__k[a]) != null &&
        ((b = u.__i == -1 ? re : k[u.__i] || re),
        (u.__i = a),
        (x = we(e, u, b, s, r, d, l, m, c, g)),
        (p = u.__e),
        u.ref &&
          b.ref != u.ref &&
          (b.ref && Ae(b.ref, null, u), g.push(u.ref, u.__c || p, u)),
        h == null && p != null && (h = p),
        (f = !!(4 & u.__u)) || b.__k === u.__k
          ? (m = je(u, m, e, f))
          : typeof u.type == "function" && x !== void 0
            ? (m = x)
            : p && (m = p.nextSibling),
        (u.__u &= -7));
    return ((o.__e = h), m);
  }
  function Lt(e, t, o, i, s) {
    var r,
      d,
      l,
      m,
      c,
      g = o.length,
      a = g,
      b = 0;
    for (e.__k = new Array(s), r = 0; r < s; r++)
      (d = t[r]) != null && typeof d != "boolean" && typeof d != "function"
        ? (typeof d == "string" ||
          typeof d == "number" ||
          typeof d == "bigint" ||
          d.constructor == String
            ? (d = e.__k[r] = ue(null, d, null, null, null))
            : me(d)
              ? (d = e.__k[r] = ue(X, { children: d }, null, null, null))
              : d.constructor === void 0 && d.__b > 0
                ? (d = e.__k[r] =
                    ue(d.type, d.props, d.key, d.ref ? d.ref : null, d.__v))
                : (e.__k[r] = d),
          (m = r + b),
          (d.__ = e),
          (d.__b = e.__b + 1),
          (l = null),
          (c = d.__i = Rt(d, o, m, a)) != -1 &&
            (a--, (l = o[c]) && (l.__u |= 2)),
          l == null || l.__v == null
            ? (c == -1 && (s > g ? b-- : s < g && b++),
              typeof d.type != "function" && (d.__u |= 4))
            : c != m &&
              (c == m - 1
                ? b--
                : c == m + 1
                  ? b++
                  : (c > m ? b-- : b++, (d.__u |= 4))))
        : (e.__k[r] = null);
    if (a)
      for (r = 0; r < g; r++)
        (l = o[r]) != null &&
          (2 & l.__u) == 0 &&
          (l.__e == i && (i = oe(l)), Ge(l, l));
    return i;
  }
  function je(e, t, o, i) {
    var s, r;
    if (typeof e.type == "function") {
      for (s = e.__k, r = 0; s && r < s.length; r++)
        s[r] && ((s[r].__ = e), (t = je(s[r], t, o, i)));
      return t;
    }
    e.__e != t &&
      (i &&
        (t && e.type && !t.parentNode && (t = oe(e)),
        o.insertBefore(e.__e, t || null)),
      (t = e.__e));
    do t = t && t.nextSibling;
    while (t != null && t.nodeType == 8);
    return t;
  }
  function Rt(e, t, o, i) {
    var s,
      r,
      d,
      l = e.key,
      m = e.type,
      c = t[o],
      g = c != null && (2 & c.__u) == 0;
    if ((c === null && l == null) || (g && l == c.key && m == c.type)) return o;
    if (i > (g ? 1 : 0)) {
      for (s = o - 1, r = o + 1; s >= 0 || r < t.length; )
        if (
          (c = t[(d = s >= 0 ? s-- : r++)]) != null &&
          (2 & c.__u) == 0 &&
          l == c.key &&
          m == c.type
        )
          return d;
    }
    return -1;
  }
  function He(e, t, o) {
    t[0] == "-"
      ? e.setProperty(t, o == null ? "" : o)
      : (e[t] =
          o == null ? "" : typeof o != "number" || Nt.test(t) ? o : o + "px");
  }
  function de(e, t, o, i, s) {
    var r, d;
    e: if (t == "style")
      if (typeof o == "string") e.style.cssText = o;
      else {
        if ((typeof i == "string" && (e.style.cssText = i = ""), i))
          for (t in i) (o && t in o) || He(e.style, t, "");
        if (o) for (t in o) (i && o[t] == i[t]) || He(e.style, t, o[t]);
      }
    else if (t[0] == "o" && t[1] == "n")
      ((r = t != (t = t.replace(ze, "$1"))),
        (d = t.toLowerCase()),
        (t =
          d in e || t == "onFocusOut" || t == "onFocusIn"
            ? d.slice(2)
            : t.slice(2)),
        e.l || (e.l = {}),
        (e.l[t + r] = o),
        o
          ? i
            ? (o.u = i.u)
            : ((o.u = ye), e.addEventListener(t, r ? he : ve, r))
          : e.removeEventListener(t, r ? he : ve, r));
    else {
      if (s == "http://www.w3.org/2000/svg")
        t = t.replace(/xlink(H|:h)/, "h").replace(/sName$/, "s");
      else if (
        t != "width" &&
        t != "height" &&
        t != "href" &&
        t != "list" &&
        t != "form" &&
        t != "tabIndex" &&
        t != "download" &&
        t != "rowSpan" &&
        t != "colSpan" &&
        t != "role" &&
        t != "popover" &&
        t in e
      )
        try {
          e[t] = o == null ? "" : o;
          break e;
        } catch {}
      typeof o == "function" ||
        (o == null || (o === !1 && t[4] != "-")
          ? e.removeAttribute(t)
          : e.setAttribute(t, t == "popover" && o == 1 ? "" : o));
    }
  }
  function Oe(e) {
    return function (t) {
      if (this.l) {
        var o = this.l[t.type + e];
        if (t.t == null) t.t = ye++;
        else if (t.t < o.u) return;
        return o(P.event ? P.event(t) : t);
      }
    };
  }
  function we(e, t, o, i, s, r, d, l, m, c) {
    var g,
      a,
      b,
      u,
      p,
      h,
      x,
      f,
      k,
      I,
      w,
      C,
      T,
      M,
      _,
      y,
      H,
      v = t.type;
    if (t.constructor !== void 0) return null;
    (128 & o.__u && ((m = !!(32 & o.__u)), (r = [(l = t.__e = o.__e)])),
      (g = P.__b) && g(t));
    e: if (typeof v == "function")
      try {
        if (
          ((f = t.props),
          (k = "prototype" in v && v.prototype.render),
          (I = (g = v.contextType) && i[g.__c]),
          (w = g ? (I ? I.props.value : g.__) : i),
          o.__c
            ? (x = (a = t.__c = o.__c).__ = a.__E)
            : (k
                ? (t.__c = a = new v(f, w))
                : ((t.__c = a = new pe(f, w)),
                  (a.constructor = v),
                  (a.render = Ht)),
              I && I.sub(a),
              a.state || (a.state = {}),
              (a.__n = i),
              (b = a.__d = !0),
              (a.__h = []),
              (a._sb = [])),
          k && a.__s == null && (a.__s = a.state),
          k &&
            v.getDerivedStateFromProps != null &&
            (a.__s == a.state && (a.__s = q({}, a.__s)),
            q(a.__s, v.getDerivedStateFromProps(f, a.__s))),
          (u = a.props),
          (p = a.state),
          (a.__v = t),
          b)
        )
          (k &&
            v.getDerivedStateFromProps == null &&
            a.componentWillMount != null &&
            a.componentWillMount(),
            k &&
              a.componentDidMount != null &&
              a.__h.push(a.componentDidMount));
        else {
          if (
            (k &&
              v.getDerivedStateFromProps == null &&
              f !== u &&
              a.componentWillReceiveProps != null &&
              a.componentWillReceiveProps(f, w),
            t.__v == o.__v ||
              (!a.__e &&
                a.shouldComponentUpdate != null &&
                a.shouldComponentUpdate(f, a.__s, w) === !1))
          ) {
            for (
              t.__v != o.__v &&
                ((a.props = f), (a.state = a.__s), (a.__d = !1)),
                t.__e = o.__e,
                t.__k = o.__k,
                t.__k.some(function (R) {
                  R && (R.__ = t);
                }),
                C = 0;
              C < a._sb.length;
              C++
            )
              a.__h.push(a._sb[C]);
            ((a._sb = []), a.__h.length && d.push(a));
            break e;
          }
          (a.componentWillUpdate != null && a.componentWillUpdate(f, a.__s, w),
            k &&
              a.componentDidUpdate != null &&
              a.__h.push(function () {
                a.componentDidUpdate(u, p, h);
              }));
        }
        if (
          ((a.context = w),
          (a.props = f),
          (a.__P = e),
          (a.__e = !1),
          (T = P.__r),
          (M = 0),
          k)
        ) {
          for (
            a.state = a.__s,
              a.__d = !1,
              T && T(t),
              g = a.render(a.props, a.state, a.context),
              _ = 0;
            _ < a._sb.length;
            _++
          )
            a.__h.push(a._sb[_]);
          a._sb = [];
        } else
          do
            ((a.__d = !1),
              T && T(t),
              (g = a.render(a.props, a.state, a.context)),
              (a.state = a.__s));
          while (a.__d && ++M < 25);
        ((a.state = a.__s),
          a.getChildContext != null && (i = q(q({}, i), a.getChildContext())),
          k &&
            !b &&
            a.getSnapshotBeforeUpdate != null &&
            (h = a.getSnapshotBeforeUpdate(u, p)),
          (y = g),
          g != null &&
            g.type === X &&
            g.key == null &&
            (y = Ye(g.props.children)),
          (l = Ue(e, me(y) ? y : [y], t, o, i, s, r, d, l, m, c)),
          (a.base = t.__e),
          (t.__u &= -161),
          a.__h.length && d.push(a),
          x && (a.__E = a.__ = null));
      } catch (R) {
        if (((t.__v = null), m || r != null))
          if (R.then) {
            for (
              t.__u |= m ? 160 : 128;
              l && l.nodeType == 8 && l.nextSibling;

            )
              l = l.nextSibling;
            ((r[r.indexOf(l)] = null), (t.__e = l));
          } else {
            for (H = r.length; H--; ) ke(r[H]);
            xe(t);
          }
        else ((t.__e = o.__e), (t.__k = o.__k), R.then || xe(t));
        P.__e(R, t, o);
      }
    else
      r == null && t.__v == o.__v
        ? ((t.__k = o.__k), (t.__e = o.__e))
        : (l = t.__e = Pt(o.__e, t, o, i, s, r, d, m, c));
    return ((g = P.diffed) && g(t), 128 & t.__u ? void 0 : l);
  }
  function xe(e) {
    (e && e.__c && (e.__c.__e = !0), e && e.__k && e.__k.forEach(xe));
  }
  function $e(e, t, o) {
    for (var i = 0; i < o.length; i++) Ae(o[i], o[++i], o[++i]);
    (P.__c && P.__c(t, e),
      e.some(function (s) {
        try {
          ((e = s.__h),
            (s.__h = []),
            e.some(function (r) {
              r.call(s);
            }));
        } catch (r) {
          P.__e(r, s.__v);
        }
      }));
  }
  function Ye(e) {
    return typeof e != "object" || e == null || (e.__b && e.__b > 0)
      ? e
      : me(e)
        ? e.map(Ye)
        : q({}, e);
  }
  function Pt(e, t, o, i, s, r, d, l, m) {
    var c,
      g,
      a,
      b,
      u,
      p,
      h,
      x = o.props || re,
      f = t.props,
      k = t.type;
    if (
      (k == "svg"
        ? (s = "http://www.w3.org/2000/svg")
        : k == "math"
          ? (s = "http://www.w3.org/1998/Math/MathML")
          : s || (s = "http://www.w3.org/1999/xhtml"),
      r != null)
    ) {
      for (c = 0; c < r.length; c++)
        if (
          (u = r[c]) &&
          "setAttribute" in u == !!k &&
          (k ? u.localName == k : u.nodeType == 3)
        ) {
          ((e = u), (r[c] = null));
          break;
        }
    }
    if (e == null) {
      if (k == null) return document.createTextNode(f);
      ((e = document.createElementNS(s, k, f.is && f)),
        l && (P.__m && P.__m(t, r), (l = !1)),
        (r = null));
    }
    if (k == null) x === f || (l && e.data == f) || (e.data = f);
    else {
      if (((r = r && fe.call(e.childNodes)), !l && r != null))
        for (x = {}, c = 0; c < e.attributes.length; c++)
          x[(u = e.attributes[c]).name] = u.value;
      for (c in x)
        if (((u = x[c]), c != "children")) {
          if (c == "dangerouslySetInnerHTML") a = u;
          else if (!(c in f)) {
            if (
              (c == "value" && "defaultValue" in f) ||
              (c == "checked" && "defaultChecked" in f)
            )
              continue;
            de(e, c, null, u, s);
          }
        }
      for (c in f)
        ((u = f[c]),
          c == "children"
            ? (b = u)
            : c == "dangerouslySetInnerHTML"
              ? (g = u)
              : c == "value"
                ? (p = u)
                : c == "checked"
                  ? (h = u)
                  : (l && typeof u != "function") ||
                    x[c] === u ||
                    de(e, c, u, x[c], s));
      if (g)
        (l ||
          (a && (g.__html == a.__html || g.__html == e.innerHTML)) ||
          (e.innerHTML = g.__html),
          (t.__k = []));
      else if (
        (a && (e.innerHTML = ""),
        Ue(
          t.type == "template" ? e.content : e,
          me(b) ? b : [b],
          t,
          o,
          i,
          k == "foreignObject" ? "http://www.w3.org/1999/xhtml" : s,
          r,
          d,
          r ? r[0] : o.__k && oe(o, 0),
          l,
          m
        ),
        r != null)
      )
        for (c = r.length; c--; ) ke(r[c]);
      l ||
        ((c = "value"),
        k == "progress" && p == null
          ? e.removeAttribute("value")
          : p != null &&
            (p !== e[c] ||
              (k == "progress" && !p) ||
              (k == "option" && p != x[c])) &&
            de(e, c, p, x[c], s),
        (c = "checked"),
        h != null && h != e[c] && de(e, c, h, x[c], s));
    }
    return e;
  }
  function Ae(e, t, o) {
    try {
      if (typeof e == "function") {
        var i = typeof e.__u == "function";
        (i && e.__u(), (i && t == null) || (e.__u = e(t)));
      } else e.current = t;
    } catch (s) {
      P.__e(s, o);
    }
  }
  function Ge(e, t, o) {
    var i, s;
    if (
      (P.unmount && P.unmount(e),
      (i = e.ref) && ((i.current && i.current != e.__e) || Ae(i, null, t)),
      (i = e.__c) != null)
    ) {
      if (i.componentWillUnmount)
        try {
          i.componentWillUnmount();
        } catch (r) {
          P.__e(r, t);
        }
      i.base = i.__P = null;
    }
    if ((i = e.__k))
      for (s = 0; s < i.length; s++)
        i[s] && Ge(i[s], t, o || typeof e.type != "function");
    (o || ke(e.__e), (e.__c = e.__ = e.__e = void 0));
  }
  function Ht(e, t, o) {
    return this.constructor(e, o);
  }
  function Ke(e, t, o) {
    var i, s, r, d;
    (t == document && (t = document.documentElement),
      P.__ && P.__(e, t),
      (s = (i = typeof o == "function") ? null : (o && o.__k) || t.__k),
      (r = []),
      (d = []),
      we(
        t,
        (e = ((!i && o) || t).__k = n(X, null, [e])),
        s || re,
        re,
        t.namespaceURI,
        !i && o ? [o] : s ? null : t.firstChild ? fe.call(t.childNodes) : null,
        r,
        !i && o ? o : s ? s.__e : t.firstChild,
        i,
        d
      ),
      $e(r, e, d));
  }
  ((fe = Ve.slice),
    (P = {
      __e: function (e, t, o, i) {
        for (var s, r, d; (t = t.__); )
          if ((s = t.__c) && !s.__)
            try {
              if (
                ((r = s.constructor) &&
                  r.getDerivedStateFromError != null &&
                  (s.setState(r.getDerivedStateFromError(e)), (d = s.__d)),
                s.componentDidCatch != null &&
                  (s.componentDidCatch(e, i || {}), (d = s.__d)),
                d)
              )
                return (s.__E = s);
            } catch (l) {
              e = l;
            }
        throw e;
      },
    }),
    (Fe = 0),
    (Mt = function (e) {
      return e != null && e.constructor === void 0;
    }),
    (pe.prototype.setState = function (e, t) {
      var o;
      ((o =
        this.__s != null && this.__s != this.state
          ? this.__s
          : (this.__s = q({}, this.state))),
        typeof e == "function" && (e = e(q({}, o), this.props)),
        e && q(o, e),
        e != null && this.__v && (t && this._sb.push(t), Pe(this)));
    }),
    (pe.prototype.forceUpdate = function (e) {
      this.__v && ((this.__e = !0), e && this.__h.push(e), Pe(this));
    }),
    (pe.prototype.render = X),
    (ee = []),
    (We =
      typeof Promise == "function"
        ? Promise.prototype.then.bind(Promise.resolve())
        : setTimeout),
    (De = function (e, t) {
      return e.__v.__b - t.__v.__b;
    }),
    (ge.__r = 0),
    (ze = /(PointerCapture)$|Capture$/i),
    (ye = 0),
    (ve = Oe(!1)),
    (he = Oe(!0)),
    (It = 0));
  var ae,
    O,
    Ce,
    Ze,
    se = 0,
    ot = [],
    W = P,
    Xe = W.__b,
    qe = W.__r,
    Je = W.diffed,
    Qe = W.__c,
    et = W.unmount,
    tt = W.__;
  function Te(e, t) {
    (W.__h && W.__h(O, e, se || t), (se = 0));
    var o = O.__H || (O.__H = { __: [], __h: [] });
    return (e >= o.__.length && o.__.push({}), o.__[e]);
  }
  function A(e) {
    return ((se = 1), Ot(rt, e));
  }
  function Ot(e, t, o) {
    var i = Te(ae++, 2);
    if (
      ((i.t = e),
      !i.__c &&
        ((i.__ = [
          o ? o(t) : rt(void 0, t),
          function (l) {
            var m = i.__N ? i.__N[0] : i.__[0],
              c = i.t(m, l);
            m !== c && ((i.__N = [c, i.__[1]]), i.__c.setState({}));
          },
        ]),
        (i.__c = O),
        !O.__f))
    ) {
      var s = function (l, m, c) {
        if (!i.__c.__H) return !0;
        var g = i.__c.__H.__.filter(function (b) {
          return !!b.__c;
        });
        if (
          g.every(function (b) {
            return !b.__N;
          })
        )
          return !r || r.call(this, l, m, c);
        var a = i.__c.props !== l;
        return (
          g.forEach(function (b) {
            if (b.__N) {
              var u = b.__[0];
              ((b.__ = b.__N), (b.__N = void 0), u !== b.__[0] && (a = !0));
            }
          }),
          (r && r.call(this, l, m, c)) || a
        );
      };
      O.__f = !0;
      var r = O.shouldComponentUpdate,
        d = O.componentWillUpdate;
      ((O.componentWillUpdate = function (l, m, c) {
        if (this.__e) {
          var g = r;
          ((r = void 0), s(l, m, c), (r = g));
        }
        d && d.call(this, l, m, c);
      }),
        (O.shouldComponentUpdate = s));
    }
    return i.__N || i.__;
  }
  function z(e, t) {
    var o = Te(ae++, 3);
    !W.__s && it(o.__H, t) && ((o.__ = e), (o.u = t), O.__H.__h.push(o));
  }
  function V(e) {
    return (
      (se = 5),
      _e(function () {
        return { current: e };
      }, [])
    );
  }
  function _e(e, t) {
    var o = Te(ae++, 7);
    return (it(o.__H, t) && ((o.__ = e()), (o.__H = t), (o.__h = e)), o.__);
  }
  function F(e, t) {
    return (
      (se = 8),
      _e(function () {
        return e;
      }, t)
    );
  }
  function Ft() {
    for (var e; (e = ot.shift()); )
      if (e.__P && e.__H)
        try {
          (e.__H.__h.forEach(be), e.__H.__h.forEach(Se), (e.__H.__h = []));
        } catch (t) {
          ((e.__H.__h = []), W.__e(t, e.__v));
        }
  }
  ((W.__b = function (e) {
    ((O = null), Xe && Xe(e));
  }),
    (W.__ = function (e, t) {
      (e && t.__k && t.__k.__m && (e.__m = t.__k.__m), tt && tt(e, t));
    }),
    (W.__r = function (e) {
      (qe && qe(e), (ae = 0));
      var t = (O = e.__c).__H;
      (t &&
        (Ce === O
          ? ((t.__h = []),
            (O.__h = []),
            t.__.forEach(function (o) {
              (o.__N && (o.__ = o.__N), (o.u = o.__N = void 0));
            }))
          : (t.__h.forEach(be), t.__h.forEach(Se), (t.__h = []), (ae = 0))),
        (Ce = O));
    }),
    (W.diffed = function (e) {
      Je && Je(e);
      var t = e.__c;
      (t &&
        t.__H &&
        (t.__H.__h.length &&
          ((ot.push(t) !== 1 && Ze === W.requestAnimationFrame) ||
            ((Ze = W.requestAnimationFrame) || Wt)(Ft)),
        t.__H.__.forEach(function (o) {
          (o.u && (o.__H = o.u), (o.u = void 0));
        })),
        (Ce = O = null));
    }),
    (W.__c = function (e, t) {
      (t.some(function (o) {
        try {
          (o.__h.forEach(be),
            (o.__h = o.__h.filter(function (i) {
              return !i.__ || Se(i);
            })));
        } catch (i) {
          (t.some(function (s) {
            s.__h && (s.__h = []);
          }),
            (t = []),
            W.__e(i, o.__v));
        }
      }),
        Qe && Qe(e, t));
    }),
    (W.unmount = function (e) {
      et && et(e);
      var t,
        o = e.__c;
      o &&
        o.__H &&
        (o.__H.__.forEach(function (i) {
          try {
            be(i);
          } catch (s) {
            t = s;
          }
        }),
        (o.__H = void 0),
        t && W.__e(t, o.__v));
    }));
  var nt = typeof requestAnimationFrame == "function";
  function Wt(e) {
    var t,
      o = function () {
        (clearTimeout(i), nt && cancelAnimationFrame(t), setTimeout(e));
      },
      i = setTimeout(o, 35);
    nt && (t = requestAnimationFrame(o));
  }
  function be(e) {
    var t = O,
      o = e.__c;
    (typeof o == "function" && ((e.__c = void 0), o()), (O = t));
  }
  function Se(e) {
    var t = O;
    ((e.__c = e.__()), (O = t));
  }
  function it(e, t) {
    return (
      !e ||
      e.length !== t.length ||
      t.some(function (o, i) {
        return o !== e[i];
      })
    );
  }
  function rt(e, t) {
    return typeof t == "function" ? t(e) : t;
  }
  function at(e) {
    return Math.min(1, Math.max(0, e));
  }
  function st({ agent: e, agentState: t }) {
    let o = V(null),
      i = V(0),
      s = V(0),
      r = V(0);
    return (
      z(
        () =>
          e.on(l => {
            l.type === "audio_level" &&
              ((i.current = l.mic), (s.current = l.tts));
          }),
        [e]
      ),
      z(() => {
        let d = o.current;
        if (!d) return;
        let l = d.getContext("2d");
        if (!l) return;
        let m = 0,
          c = (typeof window != "undefined" && window.devicePixelRatio) || 1,
          g = () => {
            let u = d.parentElement,
              p = u ? u.clientWidth : 320,
              h = 200;
            ((d.width = Math.floor(p * c)),
              (d.height = Math.floor(h * c)),
              (d.style.width = `${p}px`),
              (d.style.height = `${h}px`),
              l.setTransform(c, 0, 0, c, 0, 0));
          };
        g();
        let a = null;
        try {
          ((a = new ResizeObserver(g)),
            d.parentElement && a.observe(d.parentElement));
        } catch {
          g();
        }
        let b = u => {
          r.current = u * 0.001;
          let p = d.clientWidth || 320,
            h = d.clientHeight || 200;
          l.clearRect(0, 0, p, h);
          let x =
              t === "thinking" || t === "transcribing"
                ? 0.22 + Math.sin(u * 0.0022) * 0.08
                : t === "idle"
                  ? 0.08 + Math.sin(u * 0.0015) * 0.04
                  : 0,
            f = at(i.current + x * 0.35),
            k = at(s.current),
            I = Math.max(f, k, x),
            w = p * 0.5,
            C = h * 0.42,
            T = p * 0.38,
            M = 12 + I * 55,
            _ = [
              { phase: 0, alpha: 0.45, w: 2.2 },
              { phase: 0.4, alpha: 0.65, w: 1.8 },
              { phase: -0.35, alpha: 0.85, w: 1.4 },
            ];
          for (let y of _) {
            let H = r.current * 1.2 + y.phase;
            (l.save(),
              (l.lineWidth = y.w),
              (l.lineCap = "round"),
              (l.shadowBlur = 18 + I * 28),
              (l.shadowColor =
                t === "speaking"
                  ? `rgba(160, 200, 255, ${0.35 + k * 0.45})`
                  : `rgba(140, 200, 90, ${0.35 + f * 0.45})`));
            let v = l.createLinearGradient(0, 0, p, 0);
            (v.addColorStop(0, `rgba(80, 220, 160, ${y.alpha})`),
              v.addColorStop(0.45, `rgba(100, 180, 255, ${y.alpha})`),
              v.addColorStop(1, `rgba(220, 120, 255, ${y.alpha})`),
              (l.strokeStyle = v),
              (l.globalAlpha = 0.75 + I * 0.2),
              l.beginPath());
            let R = 48;
            for (let $ = 0; $ <= R; $++) {
              let B = $ / R,
                J = w - T + B * T * 2,
                Q =
                  Math.sin(B * Math.PI + H) * M * (0.35 + 0.65 * I) +
                  Math.sin(B * Math.PI * 3 + H * 2) * (3 + I * 12) * y.alpha,
                te = C + Q + Math.sin(H + B * 4) * I * 6;
              $ === 0 ? l.moveTo(J, te) : l.lineTo(J, te);
            }
            (l.stroke(), l.restore());
          }
          m = requestAnimationFrame(b);
        };
        return (
          (m = requestAnimationFrame(b)),
          () => {
            (cancelAnimationFrame(m), a == null || a.disconnect());
          }
        );
      }, [t, e]),
      n(
        "div",
        { className: "voice-aura-wrap" },
        n("canvas", {
          ref: o,
          className: "voice-aura-canvas",
          "aria-hidden": !0,
        })
      )
    );
  }
  var ct = window;
  function lt({ auth: e, onShowAuth: t }) {
    let [o, i] = A(!1),
      s = V(null),
      r = e.user && typeof e.user != "string" ? e.user.email : void 0;
    z(() => {
      function c(g) {
        s.current && !s.current.contains(g.target) && i(!1);
      }
      return (
        document.addEventListener("mousedown", c),
        () => document.removeEventListener("mousedown", c)
      );
    }, []);
    let d = c => {
        (c.preventDefault(), c.stopPropagation());
        try {
          window.parent.postMessage({ type: "oasisOverlayClose" }, "*");
        } catch {}
      },
      l = c => {
        c.target.closest("button") ||
          c.target.closest(".dropdown-menu") ||
          (c.button === 0 &&
            (c.preventDefault(),
            c.stopPropagation(),
            window.parent.postMessage(
              {
                type: "oasisOverlayDragStart",
                screenX: c.screenX,
                screenY: c.screenY,
              },
              "*"
            )));
      },
      m = async () => {
        ct.supabaseAuth && (await ct.supabaseAuth.signOut(), i(!1));
      };
    return n(
      "div",
      {
        onPointerDown: l,
        style: {
          height: "48px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 8px",
          background: "transparent",
          cursor: "grab",
          zIndex: 2147483647,
          boxSizing: "border-box",
          userSelect: "none",
          flexShrink: 0,
        },
      },
      n(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "8px" } },
        n(
          "div",
          {
            style: {
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            },
          },
          n(
            "svg",
            {
              width: "32",
              height: "32",
              viewBox: "0 0 32 32",
              fill: "none",
              xmlns: "http://www.w3.org/2000/svg",
            },
            n("ellipse", {
              cx: "16.5",
              cy: "16",
              rx: "12.5",
              ry: "10.5",
              fill: "#978455",
            }),
            n("ellipse", {
              cx: "16.5",
              cy: "18",
              rx: "10.5",
              ry: "8.5",
              fill: "#F8FAF2",
            }),
            n("ellipse", {
              cx: "10.3268",
              cy: "18.7453",
              rx: "2.45004",
              ry: "5.0274",
              transform: "rotate(46.2818 10.3268 18.7453)",
              fill: "#978455",
            }),
            n("circle", {
              cx: "1",
              cy: "1",
              r: "1",
              transform: "matrix(1 0 0 -1 12 17.5)",
              fill: "#F8FAF2",
            }),
            n("ellipse", {
              cx: "2.45004",
              cy: "5.0274",
              rx: "2.45004",
              ry: "5.0274",
              transform:
                "matrix(-0.691112 0.722747 0.722747 0.691112 20.7329 13.5)",
              fill: "#978455",
            }),
            n("circle", {
              cx: "1",
              cy: "1",
              r: "1",
              transform: "matrix(1 0 0 -1 19 17.5)",
              fill: "#F8FAF2",
            })
          )
        ),
        n(
          "span",
          {
            style: {
              fontSize: "20px",
              fontWeight: 600,
              color: "#495800",
              fontFamily: "system-ui, -apple-system, sans-serif",
            },
          },
          "Oasis AI"
        ),
        n(
          "div",
          {
            style: {
              background: "#F2F4E5",
              padding: "1px 8px",
              borderRadius: "32px",
              display: "flex",
              alignItems: "center",
            },
          },
          n("span", { style: { fontSize: "12px", color: "#495800" } }, "Beta")
        )
      ),
      n(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "4px" } },
        n(
          "div",
          { style: { position: "relative" }, ref: s },
          n(
            Ee,
            { onClick: () => i(!o), title: "Menu" },
            n(
              "svg",
              { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none" },
              n("circle", { cx: "5", cy: "12", r: "2", fill: "#7A9200" }),
              n("circle", { cx: "12", cy: "12", r: "2", fill: "#7A9200" }),
              n("circle", { cx: "19", cy: "12", r: "2", fill: "#7A9200" })
            )
          ),
          o &&
            n(
              "div",
              {
                className: "dropdown-menu",
                style: {
                  position: "absolute",
                  top: "36px",
                  right: "0",
                  background: "white",
                  border: "1px solid #eee",
                  borderRadius: "12px",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
                  width: "200px",
                  overflow: "hidden",
                  zIndex: 1e3,
                },
              },
              e.isAuthenticated
                ? n(
                    "div",
                    null,
                    n(
                      "div",
                      {
                        style: {
                          padding: "12px 16px",
                          borderBottom: "1px solid #f5f5f5",
                          background: "#fafafa",
                        },
                      },
                      n(
                        "div",
                        {
                          style: {
                            fontSize: "11px",
                            color: "#888",
                            marginBottom: "2px",
                          },
                        },
                        "Signed in as"
                      ),
                      n(
                        "div",
                        {
                          style: {
                            fontSize: "13px",
                            fontWeight: 500,
                            color: "#333",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          },
                        },
                        r
                      )
                    ),
                    n(
                      Me,
                      {
                        onClick: () => {
                          (alert("Settings coming soon"), i(!1));
                        },
                      },
                      "Settings"
                    ),
                    n(
                      Me,
                      { onClick: m, style: { color: "#e53935" } },
                      "Sign Out"
                    )
                  )
                : n(
                    "div",
                    null,
                    n(
                      Me,
                      {
                        onClick: () => {
                          (t(), i(!1));
                        },
                      },
                      "Sign In / Sign Up"
                    )
                  )
            )
        ),
        n(
          Ee,
          {
            onClick: c => {
              (c.preventDefault(), c.stopPropagation());
              try {
                window.parent.postMessage(
                  { type: "oasisOverlayToggleSidebar" },
                  "*"
                );
              } catch {}
            },
            title: "Toggle Sidebar",
          },
          n(
            "svg",
            {
              width: "24",
              height: "24",
              viewBox: "0 0 24 24",
              fill: "none",
              xmlns: "http://www.w3.org/2000/svg",
            },
            n("path", {
              d: "M6 21C5.20435 21 4.44129 20.6839 3.87868 20.1213C3.31607 19.5587 3 18.7956 3 18V6C3 5.20435 3.31607 4.44129 3.87868 3.87868C4.44129 3.31607 5.20435 3 6 3H18C18.7956 3 19.5587 3.31607 20.1213 3.87868C20.6839 4.44129 21 5.20435 21 6V18C21 18.7956 20.6839 19.5587 20.1213 20.1213C19.5587 20.6839 18.7956 21 18 21H6ZM18 5H10V19H18C18.2652 19 18.5196 18.8946 18.7071 18.7071C18.8946 18.5196 19 18.2652 19 18V6C19 5.73478 18.8946 5.48043 18.7071 5.29289C18.5196 5.10536 18.2652 5 18 5Z",
              fill: "#7A9200",
            })
          )
        ),
        n(
          Ee,
          { onClick: d, title: "Close", hoverColor: "#ffecec" },
          n(
            "svg",
            {
              width: "24",
              height: "24",
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "#7A9200",
              strokeWidth: "2",
              strokeLinecap: "round",
              strokeLinejoin: "round",
            },
            n("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
            n("line", { x1: "6", y1: "6", x2: "18", y2: "18" })
          )
        )
      )
    );
  }
  function Ee({ onClick: e, title: t, children: o, hoverColor: i }) {
    return n(
      "button",
      {
        onClick: e,
        title: t,
        style: {
          border: 0,
          background: "transparent",
          cursor: "pointer",
          borderRadius: "50%",
          width: "32px",
          height: "32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background 0.2s",
          color: "#7A9200",
        },
        onMouseEnter: s =>
          (s.currentTarget.style.backgroundColor =
            i || "rgba(122, 146, 0, 0.1)"),
        onMouseLeave: s =>
          (s.currentTarget.style.backgroundColor = "transparent"),
      },
      o
    );
  }
  function Me({ onClick: e, children: t, style: o }) {
    return n(
      "div",
      {
        onClick: e,
        style: {
          padding: "10px 16px",
          fontSize: "13px",
          color: "#333",
          cursor: "pointer",
          transition: "background 0.1s",
          ...o,
        },
        onMouseEnter: i => (i.currentTarget.style.backgroundColor = "#f5f5f5"),
        onMouseLeave: i => (i.currentTarget.style.backgroundColor = "white"),
      },
      t
    );
  }
  function Dt() {
    return n(
      "svg",
      {
        width: "18",
        height: "18",
        viewBox: "0 0 24 24",
        "aria-hidden": "true",
      },
      n("path", {
        fill: "#EA4335",
        d: "M12 10.2v3.9h5.4c-.2 1.3-1.5 3.9-5.4 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.2 14.7 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12S6.6 21.8 12 21.8c6.9 0 9.2-4.8 9.2-7.3 0-.5 0-.9-.1-1.3H12Z",
      }),
      n("path", {
        fill: "#34A853",
        d: "M2.2 12c0 2 .8 3.8 2.1 5.1l3.4-2.6c-.9-.7-1.5-1.8-1.5-3.1s.5-2.4 1.5-3.1L4.3 5.7C3 7 2.2 9.1 2.2 12Z",
      }),
      n("path", {
        fill: "#FBBC05",
        d: "M12 21.8c2.7 0 4.9-.9 6.5-2.5l-3.2-2.5c-.9.6-2 1-3.3 1-2.5 0-4.6-1.7-5.4-4l-3.4 2.6c1.7 3.2 5 5.4 8.8 5.4Z",
      }),
      n("path", {
        fill: "#4285F4",
        d: "M18.5 19.3c1.9-1.8 2.7-4.4 2.7-6.6 0-.7-.1-1.2-.2-1.7H12v3.9h5.4c-.3 1.5-1.1 2.8-2.3 3.7l3.4 2.7Z",
      })
    );
  }
  function zt() {
    return n(
      "svg",
      {
        width: "18",
        height: "18",
        viewBox: "0 0 24 24",
        "aria-hidden": "true",
      },
      n("path", {
        fill: "#111",
        d: "M16.7 12.8c0-2.1 1.8-3.1 1.9-3.2-1-1.5-2.7-1.7-3.3-1.7-1.4-.1-2.8.9-3.5.9-.8 0-1.9-.9-3.1-.9-1.6 0-3 .9-3.9 2.2-1.7 2.9-.4 7.2 1.2 9.4.8 1.1 1.7 2.4 2.9 2.3 1.1 0 1.6-.7 3-.7 1.5 0 1.9.7 3 .7 1.2 0 2-.9 2.8-2 .9-1.3 1.3-2.5 1.3-2.6-.1 0-2.3-.9-2.3-4.4Zm-2.3-6.3c.6-.8 1-1.8.9-2.9-.9 0-2.1.6-2.8 1.4-.6.7-1.1 1.8-.9 2.8 1 0 2.1-.5 2.8-1.3Z",
      })
    );
  }
  function Vt() {
    return n(
      "svg",
      {
        width: "18",
        height: "18",
        viewBox: "0 0 24 24",
        "aria-hidden": "true",
      },
      n("path", { fill: "#F25022", d: "M3 3h8.6v8.6H3z" }),
      n("path", { fill: "#7FBA00", d: "M12.4 3H21v8.6h-8.6z" }),
      n("path", { fill: "#00A4EF", d: "M3 12.4h8.6V21H3z" }),
      n("path", { fill: "#FFB900", d: "M12.4 12.4H21V21h-8.6z" })
    );
  }
  function dt({ onSuccess: e, onCancel: t }) {
    let o = V(!1),
      [i, s] = A("signup"),
      [r, d] = A(""),
      [l, m] = A(""),
      [c, g] = A(!1),
      [a, b] = A(!1),
      [u, p] = A(null),
      [h, x] = A(null);
    z(() => {
      let T = M => {
        let _ = M.detail,
          y =
            (_ == null ? void 0 : _.description) ||
            (_ == null ? void 0 : _.error);
        y && (p(y), x(null));
      };
      return (
        window.addEventListener("oasis-auth-error", T),
        () => {
          window.removeEventListener("oasis-auth-error", T);
        }
      );
    }, []);
    let f = async T => {
        var _, y, H;
        if (o.current) return;
        ((o.current = !0), p(null), x(null), g(!0));
        let M = window.supabaseAuth;
        if (!M) {
          (p("Auth service not available"), (o.current = !1), g(!1));
          return;
        }
        try {
          let v = await M[T](),
            R =
              ((_ = v == null ? void 0 : v.error) == null
                ? void 0
                : _.message) || "",
            $ = [
              "GOOGLE_OAUTH_URL:",
              "AZURE_OAUTH_URL:",
              "APPLE_OAUTH_URL:",
            ].find(B => R.startsWith(B));
          if ($) {
            let B = R.slice($.length);
            ((
              (H = (y = window.assistantBridge) == null ? void 0 : y.openTab) ==
              null
                ? void 0
                : H.call(y, B)
            )
              ? x(
                  "Finish sign-in in the opened tab. Oasis will complete sign-in automatically."
                )
              : p("Failed to open the OAuth tab. Please try again."),
              g(!1));
            return;
          }
          if (v != null && v.error) {
            let B = M.handleAuthError
              ? M.handleAuthError(v.error)
              : v.error.message || "An error occurred";
            p(B);
          } else v != null && v.user && e();
        } catch (v) {
          let R = M.handleAuthError
            ? M.handleAuthError(v)
            : v.message || "An error occurred";
          p(R);
        } finally {
          ((o.current = !1), g(!1));
        }
      },
      k = async T => {
        (T.preventDefault(), p(null), x(null), b(!0));
        let M = window.supabaseAuth;
        if (!M) {
          (p("Auth service not available"), b(!1));
          return;
        }
        try {
          let _;
          if (i === "signup") _ = await M.signUp(r, l);
          else if (i === "signin") _ = await M.signInWithEmail(r, l);
          else if (
            i === "forgotPassword" &&
            ((_ = await M.resetPasswordForEmail(r)), !_.error)
          ) {
            (x("Password reset email sent. Please check your inbox."), b(!1));
            return;
          }
          let { user: y, error: H } = _;
          if (H) {
            let v = M.handleAuthError
              ? M.handleAuthError(H)
              : H.message || "An error occurred";
            p(v);
            return;
          }
          y
            ? e()
            : i === "signup" &&
              p("Please check your email for a confirmation link.");
        } catch (_) {
          let y = window.supabaseAuth,
            H =
              y != null && y.handleAuthError
                ? y.handleAuthError(_)
                : _ && typeof _ == "object" && "message" in _
                  ? String(_.message || "An error occurred")
                  : "An error occurred";
          p(H);
        } finally {
          b(!1);
        }
      },
      I = () => {
        switch (i) {
          case "signup":
            return "Create Account";
          case "signin":
            return "Welcome Back";
          case "forgotPassword":
            return "Reset Password";
        }
      },
      w = () => {
        switch (i) {
          case "signup":
            return "Sign up to sync your tabs and history.";
          case "signin":
            return "Sign in to your Oasis account.";
          case "forgotPassword":
            return "Enter your email to receive a reset link.";
        }
      },
      C = () => {
        if (a) return "Processing...";
        switch (i) {
          case "signup":
            return "Sign Up";
          case "signin":
            return "Sign In";
          case "forgotPassword":
            return "Send Reset Link";
        }
      };
    return n(
      "div",
      {
        style: {
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          gap: "24px",
        },
      },
      n(
        "div",
        { style: { textAlign: "center" } },
        n(
          "h2",
          {
            style: {
              fontSize: "24px",
              fontWeight: 600,
              color: "#7A9200",
              margin: "0 0 8px 0",
            },
          },
          I()
        ),
        n("p", { style: { color: "#666", margin: 0 } }, w())
      ),
      i !== "forgotPassword" &&
        n(
          "div",
          {
            style: {
              width: "100%",
              maxWidth: "320px",
              display: "flex",
              gap: "12px",
            },
          },
          n(
            "button",
            {
              type: "button",
              "aria-label": "Continue with Google",
              onClick: () => f("signInWithGoogle"),
              disabled: c,
              style: {
                flex: 1,
                height: "44px",
                borderRadius: "999px",
                border: "1px solid #d9dfc8",
                background: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: c ? "wait" : "pointer",
                outlineOffset: "2px",
              },
            },
            n(Dt, null)
          ),
          n(
            "button",
            {
              type: "button",
              "aria-label": "Continue with Apple",
              onClick: () => f("signInWithApple"),
              disabled: c,
              style: {
                flex: 1,
                height: "44px",
                borderRadius: "999px",
                border: "1px solid #d9dfc8",
                background: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: c ? "wait" : "pointer",
                outlineOffset: "2px",
              },
            },
            n(zt, null)
          ),
          n(
            "button",
            {
              type: "button",
              "aria-label": "Continue with Microsoft",
              onClick: () => f("signInWithAzure"),
              disabled: c,
              style: {
                flex: 1,
                height: "44px",
                borderRadius: "999px",
                border: "1px solid #d9dfc8",
                background: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: c ? "wait" : "pointer",
                outlineOffset: "2px",
              },
            },
            n(Vt, null)
          )
        ),
      n(
        "form",
        {
          onSubmit: k,
          style: {
            width: "100%",
            maxWidth: "320px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          },
        },
        n(
          "div",
          null,
          n(
            "label",
            {
              style: {
                display: "block",
                marginBottom: "6px",
                fontSize: "13px",
                fontWeight: 500,
                color: "#333",
              },
            },
            "Email"
          ),
          n("input", {
            type: "email",
            value: r,
            onInput: T => d(T.currentTarget.value),
            required: !0,
            className: "input-field",
            style: {
              width: "100%",
              boxSizing: "border-box",
              background: "white",
              border: "1px solid #e0e0e0",
            },
          })
        ),
        i !== "forgotPassword" &&
          n(
            "div",
            null,
            n(
              "div",
              {
                style: {
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "6px",
                },
              },
              n(
                "label",
                { style: { fontSize: "13px", fontWeight: 500, color: "#333" } },
                "Password"
              ),
              i === "signin" &&
                n(
                  "button",
                  {
                    type: "button",
                    onClick: () => {
                      (s("forgotPassword"), p(null), x(null));
                    },
                    style: {
                      background: "none",
                      border: "none",
                      color: "#7A9200",
                      fontSize: "12px",
                      cursor: "pointer",
                      padding: 0,
                    },
                  },
                  "Forgot Password?"
                )
            ),
            n("input", {
              type: "password",
              value: l,
              onInput: T => m(T.currentTarget.value),
              required: !0,
              className: "input-field",
              style: {
                width: "100%",
                boxSizing: "border-box",
                background: "white",
                border: "1px solid #e0e0e0",
              },
            })
          ),
        u &&
          n(
            "div",
            {
              style: {
                color: "#d32f2f",
                fontSize: "13px",
                background: "#ffebee",
                padding: "8px",
                borderRadius: "8px",
              },
            },
            u
          ),
        h &&
          n(
            "div",
            {
              style: {
                color: "#2e7d32",
                fontSize: "13px",
                background: "#e8f5e9",
                padding: "8px",
                borderRadius: "8px",
              },
            },
            h
          ),
        n(
          "button",
          {
            type: "submit",
            disabled: a,
            style: {
              background: "#7A9200",
              color: "white",
              border: "none",
              padding: "12px",
              borderRadius: "12px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: a ? "wait" : "pointer",
              opacity: a ? 0.7 : 1,
              marginTop: "8px",
            },
          },
          C()
        )
      ),
      n(
        "div",
        { style: { fontSize: "13px", color: "#666" } },
        i === "forgotPassword"
          ? n(
              "button",
              {
                onClick: () => {
                  (s("signin"), p(null), x(null));
                },
                style: {
                  background: "none",
                  border: "none",
                  color: "#7A9200",
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: 0,
                  textDecoration: "underline",
                },
              },
              "Back to Sign In"
            )
          : n(
              X,
              null,
              i === "signup"
                ? "Already have an account? "
                : "Don't have an account? ",
              n(
                "button",
                {
                  onClick: () => {
                    (s(i === "signup" ? "signin" : "signup"), p(null), x(null));
                  },
                  style: {
                    background: "none",
                    border: "none",
                    color: "#7A9200",
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: 0,
                    textDecoration: "underline",
                  },
                },
                i === "signup" ? "Sign In" : "Sign Up"
              )
            )
      ),
      n(
        "button",
        {
          onClick: t,
          style: {
            background: "none",
            border: "none",
            color: "#999",
            fontSize: "13px",
            cursor: "pointer",
            padding: 0,
          },
        },
        "Cancel"
      )
    );
  }
  function ut({ data: e, onConfirm: t, onCancel: o }) {
    return n(
      "div",
      {
        className: "confirmation-overlay",
        style: {
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1e4,
        },
      },
      n(
        "div",
        {
          className: "confirmation-modal",
          style: {
            background: "#fff",
            borderRadius: "12px",
            padding: "24px",
            maxWidth: "400px",
            width: "90%",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)",
            textAlign: "center",
          },
        },
        n(
          "div",
          {
            style: {
              width: "48px",
              height: "48px",
              background: "#FFF8E1",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px auto",
            },
          },
          n(
            "svg",
            {
              width: "24",
              height: "24",
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "#7A9200",
              strokeWidth: "2",
              strokeLinecap: "round",
              strokeLinejoin: "round",
            },
            n("path", { d: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" })
          )
        ),
        n(
          "h3",
          {
            style: {
              margin: "0 0 8px 0",
              fontSize: "18px",
              fontWeight: 600,
              color: "#333",
            },
          },
          "Confirm Action"
        ),
        n(
          "p",
          { style: { margin: "0 0 16px 0", fontSize: "14px", color: "#666" } },
          e.description
        ),
        n(
          "div",
          {
            style: {
              background: "#E8F5E9",
              borderRadius: "8px",
              padding: "8px 12px",
              marginBottom: "20px",
              fontSize: "13px",
              color: "#2E7D32",
            },
          },
          "Command: ",
          e.command
        ),
        n(
          "div",
          { style: { display: "flex", gap: "12px" } },
          n(
            "button",
            {
              onClick: o,
              style: {
                flex: 1,
                padding: "12px 16px",
                border: "1px solid #ddd",
                borderRadius: "8px",
                background: "#fff",
                color: "#333",
                fontSize: "14px",
                fontWeight: 500,
                cursor: "pointer",
              },
            },
            "Cancel"
          ),
          n(
            "button",
            {
              onClick: t,
              style: {
                flex: 1,
                padding: "12px 16px",
                border: "none",
                borderRadius: "8px",
                background: "#7A9200",
                color: "#fff",
                fontSize: "14px",
                fontWeight: 500,
                cursor: "pointer",
              },
            },
            "Approve"
          )
        )
      )
    );
  }
  function pt({ messageId: e, onClose: t }) {
    let o = window,
      [i, s] = A(!1),
      [r, d] = A([]),
      [l, m] = A(""),
      [c, g] = A(!0),
      [a, b] = A(!1),
      [u, p] = A(!1),
      [h, x] = A(!1),
      f = [
        "Didn't work",
        "Wrong result",
        "Too slow",
        "Safety concern",
        "Confusing",
        "Suggestion",
        "Other",
      ],
      k = _ => {
        d(y => (y.includes(_) ? y.filter(H => H !== _) : [...y, _]));
      },
      I = (_, y = {}) => {
        o.mpTrack && o.mpTrack(_, y);
      },
      w = (_, y = !1) => {
        y && console.error(`[Feedback] ${_}`);
      },
      C = async (_, y, H) => {
        var $, B, J;
        let v = ($ = o.supabaseAuth) == null ? void 0 : $.supabase,
          R =
            ((J = (B = o.supabaseAuth) == null ? void 0 : B.currentSession) ==
            null
              ? void 0
              : J.session_id) || null;
        if (!v) return (w("Feedback service unavailable.", !0), !1);
        try {
          let {
            data: { user: Q },
          } = await v.auth.getUser();
          if (!Q) return (w("Please sign in to submit feedback.", !0), !1);
          let te = {
              user_id: Q.id,
              session_id: R,
              message_id: e,
              reported_at: new Date().toISOString(),
              negative_rating: _,
              category: y,
              additional_info: JSON.stringify({
                badges: r,
                comment: H,
                include_context: c,
                contact_me: a,
              }),
            },
            { error: ne } = await v.from("feedback_events").insert(te);
          return ne
            ? (console.error("Feedback insert failed:", ne),
              I("feedback_submit_error", { message: ne.message || String(ne) }),
              w("Failed to submit feedback.", !0),
              !1)
            : (I("feedback_submit_success", {
                negative_rating: _,
                category: y,
              }),
              !0);
        } catch (Q) {
          return (console.error("Feedback submission exception:", Q), !1);
        }
      },
      T = async () => {
        (I("feedback_thumb_up", { messageId: e }),
          x(!0),
          (await C(!1, "Helpful", "")) && (p(!0), setTimeout(() => p(!1), 3e3)),
          x(!1));
      },
      M = async () => {
        if (r.length === 0 && !l.trim()) return;
        x(!0);
        let _ = r.length > 0 ? r[0] : "Other";
        ((await C(!0, _, l.trim())) &&
          (p(!0),
          setTimeout(() => {
            (t && t(), s(!1), p(!1), d([]), m(""));
          }, 2e3)),
          x(!1));
      };
    return u
      ? n(
          "div",
          { className: "feedback-submitted" },
          "Thanks for your feedback!"
        )
      : n(
          "div",
          { className: "feedback-container" },
          i
            ? n(
                "div",
                { className: "feedback-modal" },
                n(
                  "div",
                  { className: "feedback-header" },
                  n("span", null, "Help us improve Oasis"),
                  n(
                    "button",
                    { className: "feedback-close-btn", onClick: () => s(!1) },
                    n(
                      "svg",
                      {
                        width: "16",
                        height: "16",
                        viewBox: "0 0 24 24",
                        fill: "none",
                        stroke: "currentColor",
                        strokeWidth: "2",
                        strokeLinecap: "round",
                        strokeLinejoin: "round",
                      },
                      n("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
                      n("line", { x1: "6", y1: "6", x2: "18", y2: "18" })
                    )
                  )
                ),
                n(
                  "div",
                  { className: "feedback-badges" },
                  f.map(_ =>
                    n(
                      "button",
                      {
                        key: _,
                        className: `feedback-badge ${r.includes(_) ? "selected" : ""}`,
                        onClick: () => k(_),
                      },
                      _,
                      r.includes(_) &&
                        n(
                          "span",
                          { className: "badge-remove" },
                          n(
                            "svg",
                            {
                              width: "10",
                              height: "10",
                              viewBox: "0 0 24 24",
                              fill: "none",
                              stroke: "currentColor",
                              strokeWidth: "3",
                              strokeLinecap: "round",
                              strokeLinejoin: "round",
                            },
                            n("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
                            n("line", { x1: "6", y1: "6", x2: "18", y2: "18" })
                          )
                        )
                    )
                  )
                ),
                n(
                  "div",
                  { className: "feedback-input-container" },
                  n("textarea", {
                    className: "feedback-textarea",
                    placeholder: "Ask me anything...",
                    value: l,
                    onInput: _ => m(_.currentTarget.value),
                  })
                ),
                n(
                  "div",
                  { className: "feedback-checkboxes" },
                  n(
                    "label",
                    { className: "feedback-checkbox-label" },
                    n("input", {
                      type: "checkbox",
                      checked: c,
                      onChange: () => g(!c),
                    }),
                    n(
                      "span",
                      null,
                      "Include chat context (helps us fix issues faster)"
                    )
                  ),
                  n(
                    "label",
                    { className: "feedback-checkbox-label" },
                    n("input", {
                      type: "checkbox",
                      checked: a,
                      onChange: () => b(!a),
                    }),
                    n(
                      "span",
                      null,
                      "Contact me if this needs a quick follow-up"
                    )
                  )
                ),
                n(
                  "div",
                  { className: "feedback-footer" },
                  n(
                    "button",
                    {
                      className: "feedback-submit-btn",
                      onClick: M,
                      disabled: h || (r.length === 0 && !l.trim()),
                      style: {
                        opacity: h || (r.length === 0 && !l.trim()) ? 0.6 : 1,
                      },
                    },
                    h ? "Submitting..." : "Submit Feedback"
                  )
                )
              )
            : n(
                "div",
                { className: "feedback-options" },
                n(
                  "span",
                  { className: "feedback-label" },
                  "Did we get it right?"
                ),
                n(
                  "button",
                  {
                    className: "feedback-btn thumbs-up",
                    onClick: T,
                    disabled: h,
                    title: "Thumbs Up",
                  },
                  n(
                    "svg",
                    {
                      width: "14",
                      height: "14",
                      viewBox: "0 0 24 24",
                      fill: "none",
                      stroke: "currentColor",
                      strokeWidth: "2",
                      strokeLinecap: "round",
                      strokeLinejoin: "round",
                    },
                    n("path", {
                      d: "M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3",
                    })
                  )
                ),
                n(
                  "button",
                  {
                    className: "feedback-btn thumbs-down",
                    onClick: () => {
                      (s(!0), I("feedback_thumb_down", { messageId: e }));
                    },
                    disabled: h,
                    title: "Thumbs Down",
                  },
                  n(
                    "svg",
                    {
                      width: "14",
                      height: "14",
                      viewBox: "0 0 24 24",
                      fill: "none",
                      stroke: "currentColor",
                      strokeWidth: "2",
                      strokeLinecap: "round",
                      strokeLinejoin: "round",
                    },
                    n("path", {
                      d: "M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zM17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3",
                    })
                  )
                )
              )
        );
  }
  function gt({ label: e }) {
    return n(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: "8px",
          color: "#7A9200",
          fontSize: "13px",
          margin: "8px 0",
          paddingLeft: "4px",
        },
      },
      n(
        "svg",
        { width: "12", height: "12", viewBox: "0 0 50 50" },
        n("circle", {
          cx: "25",
          cy: "25",
          r: "20",
          stroke: "#7A9200",
          strokeWidth: "4",
          fill: "none",
          opacity: "0.2",
        }),
        n(
          "circle",
          {
            cx: "25",
            cy: "25",
            r: "20",
            stroke: "#7A9200",
            strokeWidth: "4",
            fill: "none",
            strokeDasharray: "31.4 94.2",
            strokeLinecap: "round",
          },
          n("animateTransform", {
            attributeName: "transform",
            type: "rotate",
            from: "0 25 25",
            to: "360 25 25",
            dur: "1s",
            repeatCount: "indefinite",
          })
        )
      ),
      n("span", null, e)
    );
  }
  var ce = window;
  function ft({
    messages: e,
    busy: t,
    activeToolLabel: o,
    onLinkClick: i,
    speakingMsgId: s,
    onTtsClick: r,
  }) {
    let d = V(null);
    return (
      z(() => {
        d.current && (d.current.scrollTop = d.current.scrollHeight);
      }, [e, t, o]),
      n(
        "div",
        { className: "chat-log", ref: d },
        e.length === 0 &&
          n(
            "div",
            {
              style: {
                textAlign: "center",
                marginTop: "8px",
                marginBottom: "8px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0px",
                width: "100%",
                padding: "8px",
                boxSizing: "border-box",
                flexShrink: 0,
              },
            },
            n(
              "div",
              {
                style: {
                  width: "75%",
                  maxWidth: "260px",
                  minWidth: "100px",
                  flexShrink: 0,
                },
              },
              n("img", {
                src: "chrome://browser/content/assistant/images/empty-state-bg.png",
                alt: "",
                style: {
                  width: "100%",
                  height: "auto",
                  maxHeight: "200px",
                  objectFit: "contain",
                  display: "block",
                },
              })
            ),
            n(
              "div",
              { style: { color: "#999", fontSize: "13px", lineHeight: "1.4" } },
              "Welcome to Oasis AI",
              n("br", null),
              "Browse, summarize, or manage your tabs."
            )
          ),
        e.map((l, m) => {
          let g = m === e.length - 1 && l.role === "ai";
          if (l.role === "user")
            return n(
              "div",
              { key: l.id, className: "message-bubble message-user" },
              n(
                "div",
                {
                  className: "message-content",
                  style: { whiteSpace: "pre-wrap" },
                },
                l.content
              )
            );
          if (l.role === "ai") {
            let a = l.content;
            try {
              if (ce.marked && ce.DOMPurify) {
                let b = ce.marked.parse(l.content);
                a = ce.DOMPurify.sanitize(b);
              }
            } catch {
              a = l.content;
            }
            return n(
              X,
              { key: l.id },
              n(
                "div",
                { className: "ai-message-wrapper" },
                n(
                  "div",
                  { className: "ai-response-container", onClick: i },
                  ce.marked
                    ? n("div", {
                        className: "markdown-body",
                        dangerouslySetInnerHTML: { __html: a },
                      })
                    : n(
                        "div",
                        {
                          className: "message-content",
                          style: {
                            whiteSpace: "pre-wrap",
                            background: "transparent",
                            border: "none",
                            padding: 0,
                          },
                        },
                        l.content
                      )
                ),
                n(
                  "div",
                  {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    },
                  },
                  !t &&
                    l.content &&
                    r &&
                    n(
                      "button",
                      {
                        className: "tts-btn",
                        type: "button",
                        onClick: () => {
                          s === l.id ? r(l.id, "") : r(l.id, l.content);
                        },
                        title: s === l.id ? "Stop speaking" : "Read aloud",
                        style: {
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: "4px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "4px",
                          color: s === l.id ? "#7A9200" : "#999",
                        },
                      },
                      s === l.id
                        ? n(
                            "svg",
                            {
                              width: "16",
                              height: "16",
                              viewBox: "0 0 24 24",
                              fill: "none",
                              stroke: "currentColor",
                              strokeWidth: "2",
                              strokeLinecap: "round",
                              strokeLinejoin: "round",
                            },
                            n("rect", {
                              x: "6",
                              y: "4",
                              width: "4",
                              height: "16",
                            }),
                            n("rect", {
                              x: "14",
                              y: "4",
                              width: "4",
                              height: "16",
                            })
                          )
                        : n(
                            "svg",
                            {
                              width: "16",
                              height: "16",
                              viewBox: "0 0 24 24",
                              fill: "none",
                              stroke: "currentColor",
                              strokeWidth: "2",
                              strokeLinecap: "round",
                              strokeLinejoin: "round",
                            },
                            n("polygon", {
                              points: "11 5 6 9 2 9 2 15 6 15 11 19 11 5",
                            }),
                            n("path", { d: "M15.54 8.46a5 5 0 0 1 0 7.07" }),
                            n("path", { d: "M19.07 4.93a10 10 0 0 1 0 14.14" })
                          )
                    ),
                  g && !t && n(pt, { messageId: l.id })
                )
              )
            );
          }
          return null;
        }),
        (t || o) && n(gt, { label: o || "Thinking..." })
      )
    );
  }
  function mt({
    input: e,
    isRecording: t,
    busy: o,
    isAuthenticated: i,
    ttsEnabled: s,
    onInput: r,
    onKeyDown: d,
    onSend: l,
    onToggleRecording: m,
    onResetSession: c,
    onFeedback: g,
    onToggleTts: a,
    onOpenVoiceAgent: b,
  }) {
    return n(
      "div",
      { className: "input-bar" },
      t &&
        n(
          "div",
          {
            className: "voice-input-push-hint",
            role: "status",
            "aria-live": "polite",
          },
          "Recording \u2014 tap the ",
          n("strong", null, "microphone"),
          " button again when you are done speaking. Your message will be transcribed and sent automatically.",
          n(
            "span",
            { className: "voice-input-push-hint-sub" },
            "Headphones or low speaker volume reduce echo. If transcription fails with \u201Caccess denied,\u201D see ",
            n(
              "code",
              { className: "voice-input-code-hint" },
              "browser/base/content/assistant/VOICE_INPUT_SETUP.md"
            ),
            " ",
            "(IAM / Lambda URL)."
          )
        ),
      n("textarea", {
        className: "input-field",
        value: t ? "Listening\u2026 (tap mic again to stop)" : e,
        onInput: u => {
          let p = u.currentTarget;
          r(p.value);
        },
        onKeyDown: d,
        placeholder: i ? "Ask me anything..." : "Please sign in...",
        disabled: o || !i || t,
        rows: 1,
        style: { minHeight: "24px", fontSize: "15px", color: "#333" },
      }),
      n(
        "div",
        {
          className: "input-row",
          style: {
            alignItems: "center",
            justifyContent: "space-between",
            paddingLeft: "8px",
          },
        },
        n(
          "button",
          {
            onClick: g,
            title: "Feedback?",
            style: {
              background: "none",
              border: "none",
              color: "#7A9200",
              fontSize: "13px",
              cursor: "pointer",
              fontWeight: 500,
              padding: "4px 8px",
              borderRadius: "4px",
            },
            onMouseEnter: u =>
              (u.currentTarget.style.backgroundColor = "#F2F4E5"),
            onMouseLeave: u =>
              (u.currentTarget.style.backgroundColor = "transparent"),
          },
          "Feedback?"
        ),
        n(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px" } },
          t &&
            n(
              "div",
              {
                className: "voice-wave",
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: "2px",
                  height: "20px",
                },
              },
              [...Array(8)].map((u, p) =>
                n("div", {
                  key: p,
                  className: "wave-bar",
                  style: {
                    width: "2px",
                    height: "8px",
                    background: "#7A9200",
                    borderRadius: "1px",
                    animationDelay: `${p * 0.1}s`,
                  },
                })
              )
            ),
          n(
            "button",
            {
              className: "send-btn",
              onClick: c,
              title: "Clear Chat History",
              style: {
                color: "#666",
                width: "32px",
                height: "32px",
                flex: "none",
              },
            },
            n(
              "svg",
              {
                width: "16",
                height: "16",
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: "2",
                strokeLinecap: "round",
                strokeLinejoin: "round",
              },
              n("path", { d: "M23 4v6h-6" }),
              n("path", { d: "M1 20v-6h6" }),
              n("path", {
                d: "M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
              })
            )
          ),
          n(
            "button",
            {
              className: "send-btn",
              onClick: a,
              title: s ? "Disable auto read-aloud" : "Enable auto read-aloud",
              style: {
                background: "none",
                border: "none",
                width: "32px",
                height: "32px",
                flex: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                cursor: "pointer",
                color: s ? "#7A9200" : "#999",
              },
            },
            s
              ? n(
                  "svg",
                  {
                    width: "18",
                    height: "18",
                    viewBox: "0 0 24 24",
                    fill: "none",
                    stroke: "currentColor",
                    strokeWidth: "2",
                    strokeLinecap: "round",
                    strokeLinejoin: "round",
                  },
                  n("polygon", { points: "11 5 6 9 2 9 2 15 6 15 11 19 11 5" }),
                  n("path", { d: "M15.54 8.46a5 5 0 0 1 0 7.07" }),
                  n("path", { d: "M19.07 4.93a10 10 0 0 1 0 14.14" })
                )
              : n(
                  "svg",
                  {
                    width: "18",
                    height: "18",
                    viewBox: "0 0 24 24",
                    fill: "none",
                    stroke: "currentColor",
                    strokeWidth: "2",
                    strokeLinecap: "round",
                    strokeLinejoin: "round",
                  },
                  n("polygon", { points: "11 5 6 9 2 9 2 15 6 15 11 19 11 5" }),
                  n("line", { x1: "23", y1: "9", x2: "17", y2: "15" }),
                  n("line", { x1: "17", y1: "9", x2: "23", y2: "15" })
                )
          ),
          n(
            "button",
            {
              className: "send-btn",
              onClick: b,
              disabled: o || !i,
              title: "Voice Agent",
              style: {
                background: "transparent",
                width: "36px",
                height: "36px",
                border: "none",
                flex: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
              },
            },
            n(
              "svg",
              {
                width: "36",
                height: "36",
                viewBox: "0 0 36 36",
                fill: "none",
                xmlns: "http://www.w3.org/2000/svg",
              },
              n("rect", {
                width: "36",
                height: "36",
                rx: "18",
                fill: "#F8FAF2",
              }),
              n("path", {
                d: "M18 10a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0v-5a3 3 0 0 0-3-3z",
                fill: "#94A833",
              }),
              n("path", {
                d: "M23 17v1a5 5 0 0 1-10 0v-1",
                stroke: "#94A833",
                strokeWidth: "1.5",
                strokeLinecap: "round",
              }),
              n("line", {
                x1: "18",
                y1: "23",
                x2: "18",
                y2: "26",
                stroke: "#94A833",
                strokeWidth: "1.5",
                strokeLinecap: "round",
              }),
              n("line", {
                x1: "15",
                y1: "26",
                x2: "21",
                y2: "26",
                stroke: "#94A833",
                strokeWidth: "1.5",
                strokeLinecap: "round",
              })
            )
          ),
          n(
            "button",
            {
              className: "send-btn",
              onClick: m,
              disabled: o || !i,
              title: t
                ? "Tap again to stop recording and send"
                : "Voice input: tap to start, tap again to stop and send (uses the same transcription service as the voice orb)",
              style: {
                background: "transparent",
                width: "36px",
                height: "36px",
                border: "none",
                flex: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
              },
            },
            t
              ? n(
                  "svg",
                  {
                    width: "36",
                    height: "36",
                    viewBox: "0 0 36 36",
                    fill: "none",
                    xmlns: "http://www.w3.org/2000/svg",
                  },
                  n("rect", {
                    width: "36",
                    height: "36",
                    rx: "18",
                    fill: "#F8FAF2",
                  }),
                  n("path", {
                    d: "M17.945 11.75C16.578 11.75 15.475 11.75 14.608 11.867C13.708 11.987 12.95 12.247 12.348 12.848C11.746 13.45 11.488 14.208 11.367 15.108C11.25 15.975 11.25 17.078 11.25 18.445V18.555C11.25 19.922 11.25 21.025 11.367 21.892C11.487 22.792 11.747 23.55 12.348 24.152C12.95 24.754 13.708 25.012 14.608 25.134C15.475 25.25 16.578 25.25 17.945 25.25H18.055C19.422 25.25 20.525 25.25 21.392 25.134C22.292 25.012 23.05 24.754 23.652 24.152C24.254 23.55 24.512 22.792 24.634 21.892C24.75 21.025 24.75 19.922 24.75 18.555V18.445C24.75 17.078 24.75 15.975 24.634 15.108C24.512 14.208 24.254 13.45 23.652 12.848C23.05 12.246 22.292 11.988 21.392 11.867C20.525 11.75 19.422 11.75 18.055 11.75H17.945Z",
                    fill: "#7A9200",
                  })
                )
              : n(
                  "svg",
                  {
                    width: "36",
                    height: "36",
                    viewBox: "313 0 36 36",
                    fill: "none",
                    xmlns: "http://www.w3.org/2000/svg",
                  },
                  n("rect", {
                    x: "313",
                    y: "0",
                    width: "36",
                    height: "36",
                    rx: "18",
                    fill: "#F8FAF2",
                  }),
                  n("path", {
                    fillRule: "evenodd",
                    clipRule: "evenodd",
                    d: "M327.958 12.8511C327.958 12.0442 328.278 11.2703 328.849 10.6997C329.419 10.1291 330.193 9.80859 331 9.80859C331.807 9.80859 332.581 10.1291 333.152 10.6997C333.722 11.2703 334.043 12.0442 334.043 12.8511V18.4681C334.043 19.2751 333.722 20.0489 333.152 20.6195C332.581 21.1901 331.807 21.5107 331 21.5107C330.193 21.5107 329.419 21.1901 328.849 20.6195C328.278 20.0489 327.958 19.2751 327.958 18.4681V12.8511ZM331 11.2128C330.566 11.2128 330.149 11.3854 329.842 11.6927C329.534 11.9999 329.362 12.4166 329.362 12.8511V18.4681C329.362 18.9026 329.534 19.3193 329.842 19.6266C330.149 19.9338 330.566 20.1064 331 20.1064C331.435 20.1064 331.851 19.9338 332.159 19.6266C332.466 19.3193 332.638 18.9026 332.638 18.4681V12.8511C332.638 12.4166 332.466 11.9999 332.159 11.6927C331.851 11.3854 331.435 11.2128 331 11.2128ZM326.319 17.766C326.506 17.766 326.684 17.84 326.816 17.9716C326.947 18.1033 327.021 18.2819 327.021 18.4681C327.021 19.5233 327.441 20.5353 328.187 21.2815C328.933 22.0276 329.945 22.4468 331 22.4468C332.055 22.4468 333.067 22.0276 333.814 21.2815C334.56 20.5353 334.979 19.5233 334.979 18.4681C334.979 18.2819 335.053 18.1033 335.184 17.9716C335.316 17.84 335.495 17.766 335.681 17.766C335.867 17.766 336.046 17.84 336.177 17.9716C336.309 18.1033 336.383 18.2819 336.383 18.4681C336.383 19.7742 335.908 21.0357 335.047 22.0176C334.186 22.9995 332.997 23.6348 331.702 23.8052V24.7872H333.809C333.995 24.7872 334.173 24.8612 334.305 24.9929C334.437 25.1246 334.511 25.3031 334.511 25.4894C334.511 25.6756 334.437 25.8542 334.305 25.9858C334.173 26.1175 333.995 26.1915 333.809 26.1915H328.192C328.005 26.1915 327.827 26.1175 327.695 25.9858C327.563 25.8542 327.49 25.6756 327.49 25.4894C327.49 25.3031 327.563 25.1246 327.695 24.9929C327.827 24.8612 328.005 24.7872 328.192 24.7872H330.298V23.8052C329.003 23.6348 327.814 22.9995 326.953 22.0176C326.092 21.0357 325.617 19.7742 325.617 18.4681C325.617 18.2819 325.691 18.1033 325.823 17.9716C325.955 17.84 326.133 17.766 326.319 17.766Z",
                    fill: "#94A833",
                  })
                )
          ),
          n(
            "button",
            {
              className: "send-btn",
              onClick: l,
              disabled: o || !i,
              title: "Send",
              style: { width: "36px", height: "36px" },
            },
            o
              ? n(
                  "svg",
                  {
                    width: "24",
                    height: "24",
                    viewBox: "0 0 24 24",
                    fill: "none",
                    stroke: "#7A9200",
                    strokeWidth: "2",
                  },
                  n("rect", { x: "9", y: "9", width: "6", height: "6" })
                )
              : n(
                  "svg",
                  {
                    width: "36",
                    height: "36",
                    viewBox: "0 0 36 36",
                    fill: "none",
                    xmlns: "http://www.w3.org/2000/svg",
                  },
                  n("circle", { cx: "18", cy: "18", r: "18", fill: "#7A9200" }),
                  n("path", {
                    d: "M18 24V12M18 12L24 18M18 12L12 18",
                    stroke: "white",
                    strokeWidth: "2",
                    strokeLinecap: "round",
                    strokeLinejoin: "round",
                  })
                )
          )
        )
      )
    );
  }
  var Bt = {
      list_tabs: "Listing tabs",
      new_window: "Opening new window",
      organize_windows: "Organizing windows",
      show_url: "Opening URL",
      open_tab: "Opening tab",
      close_tab: "Closing tab",
      move_tab_to_new_window: "Moving tab to new window",
      copy_tab_urls: "Copying tab URLs",
      create_bookmark_folder: "Creating folder",
      delete_bookmark_folder: "Deleting folder",
      list_bookmark_folders: "Listing folders",
      rename_bookmark_folder: "Renaming folder",
      add_tab_to_bookmark_folder: "Adding tab to folder",
      remove_tab_from_bookmark_folder: "Removing tab from folder",
      open_bookmark_folder: "Opening folder",
      split_tabs: "Splitting tabs",
      list_tab_groups: "Listing groups",
      create_tab_group: "Creating group",
      delete_tab_group: "Deleting group",
      add_tab_to_group: "Adding tab to group",
      remove_tab_from_group: "Removing from group",
      rename_tab_group: "Renaming group",
      search_memory: "Searching memory",
      open_search_result: "Opening result",
      summarize_page: "Summarizing page",
      show_subscription: "Showing subscription",
      confirm_action: "Confirming action",
      openTab: "Opening tab",
      createTabGroup: "Creating tab group",
      addTabsToGroup: "Adding tabs to group",
      syncTabs: "Syncing tabs",
    },
    bt = Bt;
  var le = window;
  function U() {
    try {
      if (typeof crypto != "undefined" && crypto.randomUUID)
        return crypto.randomUUID();
    } catch {}
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, e => {
      let t = (Math.random() * 16) | 0;
      return (e === "x" ? t : (t & 3) | 8).toString(16);
    });
  }
  function Ut(e) {
    if (!e) return "";
    if (e.includes(" ")) return e;
    let t = e
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function _t(e) {
    return String(e || "");
  }
  function jt(e) {
    let t = String(e);
    return t.includes("403") || t.includes("Forbidden")
      ? "Voice could not reach the transcription service (access denied). See browser/base/content/assistant/VOICE_INPUT_SETUP.md or ask your admin to check AWS IAM and the Lambda URL."
      : "Could not transcribe audio. Check your connection and try again.";
  }
  function $t(e) {
    var t, o;
    return (
      e.type === "human" ||
      ((t = e.id) == null ? void 0 : t.includes("Human")) ||
      ((o = e.constructor) == null ? void 0 : o.name) === "HumanMessage"
    );
  }
  function vt(e) {
    return e.map((t, o) => {
      let i = $t(t),
        s = t.content || (t.lc_kwargs ? t.lc_kwargs.content : "") || "";
      return {
        id: t.id || `hist-${o}-${t.role || "msg"}`,
        role: i ? "user" : "ai",
        content: s,
      };
    });
  }
  function ht(e) {
    let {
        auth: t,
        setPendingConfirmation: o,
        originalResetAssistantSession: i,
      } = e,
      [s, r] = A([]),
      [d, l] = A(""),
      [m, c] = A(!1),
      [g, a] = A(!1),
      [b, u] = A([]),
      [p, h] = A(!0),
      [x, f] = A(null),
      k = V(null),
      I = V(null),
      w = F((S, E) => {
        r(N => {
          let L = N.findIndex(G => G.id === S);
          if (L === -1) return N;
          let Y = [...N],
            D = Y[L];
          return ((Y[L] = { ...D, content: `${D.content}${E}` }), Y);
        });
      }, []),
      C = F(() => {
        (k.current && (k.current.pause(), (k.current = null)),
          I.current && (URL.revokeObjectURL(I.current), (I.current = null)),
          f(null));
      }, []),
      T = F(
        async (S, E) => {
          let N = le.textToSpeech;
          if (typeof N == "function") {
            (C(), f(E));
            try {
              let L = S.replace(/<[^>]*>/g, "")
                .replace(/[#*_`~\[\]()>!|]/g, "")
                .replace(/\n{2,}/g, ". ")
                .replace(/\n/g, " ")
                .trim();
              if (!L) return;
              let Y = await N(L),
                D = URL.createObjectURL(Y);
              I.current = D;
              let G = new Audio(D);
              ((k.current = G),
                (G.onended = () => {
                  C();
                }),
                (G.onerror = () => {
                  C();
                }),
                await G.play());
            } catch (L) {
              (console.error("TTS playback error:", L), C());
            }
          }
        },
        [C]
      ),
      M = F(
        async (S, E = "text") => {
          let N = le.runAssistantStream;
          if (typeof N != "function")
            return (
              r(D => [
                ...D,
                {
                  id: U(),
                  role: "ai",
                  content: "(runAssistantStream not available)",
                },
              ]),
              null
            );
          let L = U();
          return (
            r(D => [...D, { id: L, role: "ai", content: "" }]),
            {
              fullText: await N(
                S,
                D => {
                  let G = _t(D);
                  G && w(L, G);
                },
                E,
                L
              ),
              aiMessageId: L,
            }
          );
        },
        [w]
      ),
      _ = F((S, E, N) => {
        let L = U(),
          Y = N || bt[S] || Ut(S);
        return (
          u(D => [
            ...D,
            { id: L, name: S, status: "running", messageId: E, label: Y },
          ]),
          L
        );
      }, []),
      y = F((S, E) => {
        u(N => N.map(L => (L.id === S ? { ...L, status: E } : L)));
      }, []),
      H = _e(
        () =>
          [...b]
            .reverse()
            .find(S => S.status === "running" || S.status === "pending") ||
          null,
        [b]
      ),
      v = F(async () => {
        (r([]), u([]), typeof i == "function" && (await Promise.resolve(i())));
        let S = le.setAssistantHistory;
        typeof S == "function" && (await S([]));
      }, [i]),
      R = F(
        async (S, E) => {
          var D, G;
          let N = (D = E == null ? void 0 : E.fromVoice) != null ? D : !1,
            L = S || d;
          if (!L.trim()) return;
          if (!t.isAuthenticated) {
            r(Z => [
              ...Z,
              {
                id: U(),
                role: "ai",
                content: "Please sign in to use the assistant.",
              },
            ]);
            return;
          }
          (C(), l(""), c(!0), u([]));
          let Y = U();
          r(Z => [...Z, { id: Y, role: "user", content: L }]);
          try {
            let Z = await M(L, N ? "voice" : "text");
            N &&
              p &&
              (G = Z == null ? void 0 : Z.fullText) != null &&
              G.trim() &&
              T(Z.fullText, Z.aiMessageId);
          } catch (Z) {
            r(Et => [
              ...Et,
              { id: U(), role: "ai", content: `Error: ${String(Z)}` },
            ]);
          } finally {
            c(!1);
          }
        },
        [t.isAuthenticated, d, M, T, C, p]
      ),
      $ = F(
        S => {
          S.key === "Enter" && !S.shiftKey && (S.preventDefault(), R());
        },
        [R]
      ),
      B = F(async () => {
        let S = le.voiceInputService;
        if (!S) {
          r(E => [
            ...E,
            {
              id: U(),
              role: "ai",
              content: "Voice input is not available in this build.",
            },
          ]);
          return;
        }
        try {
          if (g) {
            try {
              let E = await S.stopRecording();
              (a(!1),
                E != null && E.trim()
                  ? R(E, { fromVoice: !0 })
                  : r(N => [
                      ...N,
                      {
                        id: U(),
                        role: "ai",
                        content:
                          "Nothing recognized; try again, speak a bit longer, or use the hands-free voice button for different capture settings.",
                      },
                    ]));
            } catch (E) {
              (console.error("Voice transcription failed:", E),
                a(!1),
                r(N => [...N, { id: U(), role: "ai", content: jt(E) }]));
            }
            return;
          }
          (C(), await S.startRecording(), a(!0));
        } catch (E) {
          (console.error("Voice recording failed:", E), a(!1));
          let N =
            E instanceof Error ? E.message : "Could not start voice recording.";
          r(L => [...L, { id: U(), role: "ai", content: N }]);
        }
      }, [g, R, C]),
      J = F(async () => {
        (o(null), C(), c(!0), u([]));
        try {
          await M("yes", "text");
        } finally {
          c(!1);
        }
      }, [M, o, C]),
      Q = F(async () => {
        (o(null), C(), c(!0), u([]));
        try {
          await M("no", "text");
        } catch {
          let S = le.oasisClearPendingConfirmation;
          (typeof S == "function" && S(),
            r(E => [
              ...E,
              { id: U(), role: "ai", content: "Action cancelled." },
            ]));
        } finally {
          c(!1);
        }
      }, [M, o, C]),
      te = F(() => {
        h(S => (S && C(), !S));
      }, [C]),
      ne = F(S => {
        let E = U(),
          N = U();
        return (
          r(L => [
            ...L,
            { id: E, role: "user", content: S },
            { id: N, role: "ai", content: "" },
          ]),
          N
        );
      }, []),
      St = F(
        (S, E) => {
          let N = _t(E);
          N && w(S, N);
        },
        [w]
      ),
      Tt = F((S, E) => {
        let N = S.replace(/\s+/g, " ").trim(),
          L = E.replace(/\s+/g, " ").trim();
        (!N && !L) ||
          r(Y => [
            ...Y,
            ...(N ? [{ id: U(), role: "user", content: N }] : []),
            ...(L ? [{ id: U(), role: "ai", content: L }] : []),
          ]);
      }, []);
    return {
      messages: s,
      setMessages: r,
      input: d,
      setInput: l,
      busy: m,
      isRecording: g,
      toolActions: b,
      activeToolAction: H,
      send: R,
      handleKeyDown: $,
      toggleRecording: B,
      handleConfirmationApprove: J,
      handleConfirmationCancel: Q,
      startToolAction: _,
      updateToolAction: y,
      resetAssistantSession: v,
      ttsEnabled: p,
      toggleTtsEnabled: te,
      speakingMsgId: x,
      speakText: T,
      stopSpeaking: C,
      voiceTurnBeginForChat: ne,
      voiceStreamChunkForChat: St,
      voiceSpokenTurnMirrorForChat: Tt,
    };
  }
  var Ie = "oasis-auth-update",
    Ne = "oasis-history-update",
    Le = "oasis-confirmation-update";
  var ie = window;
  function xt(e) {
    if (!(!e || typeof e == "string"))
      return typeof e.id == "string" ? e.id : void 0;
  }
  function Yt(e) {
    var t, o;
    if (typeof e == "function") return e;
    if (e && typeof e == "object") {
      let i = e;
      if (typeof i.unsubscribe == "function")
        return () => {
          i.unsubscribe();
        };
      if (
        typeof ((o = (t = i.data) == null ? void 0 : t.subscription) == null
          ? void 0
          : o.unsubscribe) == "function"
      ) {
        let s = i.data.subscription.unsubscribe;
        return () => {
          s();
        };
      }
    }
  }
  function yt(e) {
    let {
      setAuth: t,
      setMessages: o,
      setPendingConfirmation: i,
      onAuthenticated: s,
      onUserChanged: r,
    } = e;
    z(() => {
      var u;
      let d = () => {
          let p = ie.oasisAuthState;
          !p ||
            p.isAuthenticated === void 0 ||
            (t(h => {
              let x = h.isAuthenticated === p.isAuthenticated,
                f = xt(h.user) === xt(p.user);
              return x && f
                ? h
                : (f || r(),
                  { isAuthenticated: !!p.isAuthenticated, user: p.user });
            }),
            p.isAuthenticated && s());
        },
        l = () => {
          (async () => {
            try {
              let p = ie.getAssistantHistory;
              if (typeof p != "function") return;
              let h = await Promise.resolve(p());
              if (!Array.isArray(h)) return;
              let x = vt(h);
              o(() => x);
            } catch {}
          })();
        },
        m = async () => {
          try {
            let p = ie.oasisAuthState;
            if (p != null && p.isAuthenticated) {
              (t({ isAuthenticated: !0, user: p.user }), s());
              return;
            }
            let h = ie.supabaseAuth;
            if (!h || !(await h.isAuthenticated())) return;
            let f = await h.getCurrentUser();
            (t({ isAuthenticated: !0, user: f }), s());
          } catch {}
        };
      (m(), window.addEventListener(Ie, d), window.addEventListener(Ne, l));
      let c = p => {
        let h = p.detail;
        i(h);
      };
      window.addEventListener(Le, c);
      let g;
      if (
        typeof ((u = ie.supabaseAuth) == null ? void 0 : u.onAuthStateChange) ==
        "function"
      ) {
        let p = ie.supabaseAuth.onAuthStateChange(h => {
          (t({ isAuthenticated: !!h.isAuthenticated, user: h.user }),
            h.isAuthenticated && (s(), r()));
        });
        g = Yt(p);
      }
      let a = window.setTimeout(() => {
          m();
        }, 1500),
        b = window.setTimeout(l, 500);
      return (
        l(),
        () => {
          (window.removeEventListener(Ie, d),
            window.removeEventListener(Ne, l),
            window.removeEventListener(Le, c),
            window.clearTimeout(a),
            window.clearTimeout(b),
            g == null || g());
        }
      );
    }, [s, r, t, o, i]);
  }
  var K = window;
  function kt(e) {
    let {
      startToolAction: t,
      updateToolAction: o,
      resetAssistantSession: i,
      setPendingConfirmation: s,
    } = e;
    z(() => {
      let r = K.oasisRecordToolActionStart,
        d = K.oasisRecordToolActionUpdate,
        l = K.resetAssistantSession,
        m = K.oasisSetPendingConfirmationRelay;
      return (
        (K.oasisRecordToolActionStart = (c, g, a) => t(c, g, a)),
        (K.oasisRecordToolActionUpdate = (c, g) => {
          o(c, g);
        }),
        (K.resetAssistantSession = () => i()),
        (K.oasisSetPendingConfirmationRelay = c => {
          s(c);
        }),
        () => {
          ((K.oasisRecordToolActionStart = r),
            (K.oasisRecordToolActionUpdate = d),
            (K.resetAssistantSession = l),
            (K.oasisSetPendingConfirmationRelay = m));
        }
      );
    }, [i, s, t, o]);
  }
  var j = window;
  function Gt({ email: e, onClose: t }) {
    return n(
      "div",
      { className: "signed-in-banner" },
      n(
        "div",
        { className: "banner-content" },
        n("span", { className: "banner-label" }, "Signed in as"),
        n("span", { className: "banner-email" }, e)
      ),
      n(
        "button",
        { className: "banner-close", onClick: t, title: "Close" },
        n(
          "svg",
          {
            width: "14",
            height: "14",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2.5",
            strokeLinecap: "round",
            strokeLinejoin: "round",
          },
          n("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
          n("line", { x1: "6", y1: "6", x2: "18", y2: "18" })
        )
      )
    );
  }
  function Kt(e) {
    return e
      ? typeof e == "string"
        ? e
        : typeof e.email == "string"
          ? e.email
          : ""
      : "";
  }
  var wt = "oasis.voice.echoHintDismissed";
  function Zt(e, t, o, i) {
    if (o === "echo_guard") return "Ready in a moment\u2026";
    switch (e) {
      case "idle":
        return "Voice ready";
      case "listening":
        return t ? "Hearing you" : "Listening";
      case "transcribing":
        return "Processing speech";
      case "thinking":
        return i ? "Assistant is thinking" : "Writing in chat";
      case "speaking":
        return "Assistant is speaking";
      default:
        return "";
    }
  }
  function Xt(e, t, o) {
    if (t === "echo_guard")
      return "Letting the room quiet down so your mic is not picking up the assistant.";
    switch (e) {
      case "idle":
        return "Tap the microphone below to start";
      case "listening":
        return "Pause briefly after you speak, or tap the orb to send now";
      case "transcribing":
        return "Tap the orb to cancel if this takes too long";
      case "thinking":
        return o
          ? "Tap the orb to cancel if this takes too long"
          : "Watch the chat for the streamed reply; tap the orb to cancel";
      case "speaking":
        return "Tap the orb to stop playback";
      default:
        return "";
    }
  }
  function qt(e) {
    return e === "listening"
      ? "voice-agent-overlay-phase-you"
      : e === "transcribing" || e === "thinking" || e === "speaking"
        ? "voice-agent-overlay-phase-assistant"
        : "voice-agent-overlay-phase-idle";
  }
  function Jt() {
    try {
      return localStorage.getItem(wt) === "1";
    } catch {
      return !1;
    }
  }
  function Qt({ onClose: e }) {
    let [t, o] = A("idle"),
      [i, s] = A(""),
      [r, d] = A(""),
      [l, m] = A(!1),
      [c, g] = A(null),
      [a, b] = A("continuous"),
      [u, p] = A(!0),
      [h, x] = A(Jt),
      f = j.voiceAgent;
    z(() => {
      if (!f) return;
      (b(f.getCaptureMode()), p(f.getVoiceSpokenRepliesEnabled()));
      let v = f.on(R => {
        switch (R.type) {
          case "state":
            (o(R.state), R.state === "idle" && g(null));
            break;
          case "userTranscript":
            (s(R.text), R.text.trim() && d(""));
            break;
          case "error":
            d(R.message);
            break;
          case "vad":
            m(R.userSpeaking);
            break;
          case "listening_phase":
            g(R.phase);
            break;
          case "turn_done":
            break;
          case "assistant_reply_text":
          case "audio_level":
            break;
        }
      });
      return (
        o(f.getState()),
        m(f.getUserSpeaking()),
        () => {
          (v(), f.stop());
        }
      );
    }, [f]);
    let k = () => {
        if (!f) return;
        let v = f.getState();
        if (v === "transcribing" || v === "thinking") {
          f.stop();
          return;
        }
        if (v === "speaking") {
          f.stopSpeaking();
          return;
        }
        if (v === "listening") {
          f.finishListening();
          return;
        }
        v === "idle" && (d(""), f.startConversation());
      },
      I = () => {
        (f && f.stop(), e());
      },
      w = t === "listening",
      C = t === "transcribing" || t === "thinking",
      T = t === "speaking",
      M = !h && w && c === "capturing",
      _ = v => {
        f && (f.setCaptureMode(v), b(v));
      },
      y = v => {
        f && (f.setVoiceSpokenRepliesEnabled(v), p(v));
      },
      H = () => {
        x(!0);
        try {
          localStorage.setItem(wt, "1");
        } catch {}
      };
    return f
      ? n(
          "div",
          { className: `voice-agent-overlay ${qt(t)}` },
          n(
            "button",
            { className: "voice-agent-close", onClick: I, title: "Close" },
            n(
              "svg",
              {
                width: "20",
                height: "20",
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: "2.5",
                strokeLinecap: "round",
                strokeLinejoin: "round",
              },
              n("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
              n("line", { x1: "6", y1: "6", x2: "18", y2: "18" })
            )
          ),
          n(
            "div",
            { className: "voice-agent-content" },
            n(st, { agent: f, agentState: t }),
            w &&
              n(
                "div",
                {
                  className: l
                    ? "voice-agent-recording-pill voice-agent-recording-pill-active"
                    : "voice-agent-recording-pill",
                  "aria-live": "polite",
                },
                l ? "Picking up speech" : "Mic on"
              ),
            i &&
              n(
                "div",
                { className: "voice-agent-transcript voice-agent-user-text" },
                i
              ),
            M &&
              n(
                "div",
                { className: "voice-agent-echo-hint", role: "status" },
                n(
                  "span",
                  null,
                  "For best results, use headphones or keep speaker volume low to reduce echo."
                ),
                n(
                  "button",
                  {
                    type: "button",
                    className: "voice-agent-echo-hint-dismiss",
                    onClick: H,
                  },
                  "Dismiss"
                )
              ),
            r &&
              n(
                "div",
                { className: "voice-agent-error-row" },
                n(
                  "div",
                  { className: "voice-agent-transcript voice-agent-error" },
                  r
                ),
                n(
                  "button",
                  {
                    type: "button",
                    className: "voice-agent-error-dismiss",
                    onClick: () => d(""),
                  },
                  "Dismiss"
                )
              )
          ),
          n(
            "div",
            { className: "voice-agent-bottom" },
            n(
              "div",
              {
                className: "voice-agent-capture-toggle",
                role: "group",
                "aria-label": "Voice capture mode",
              },
              n("span", { className: "voice-agent-capture-label" }, "Capture"),
              n(
                "button",
                {
                  type: "button",
                  className:
                    a === "continuous"
                      ? "voice-agent-capture-option voice-agent-capture-option-active"
                      : "voice-agent-capture-option",
                  onClick: () => _("continuous"),
                },
                "Continuous"
              ),
              n(
                "button",
                {
                  type: "button",
                  className:
                    a === "precise"
                      ? "voice-agent-capture-option voice-agent-capture-option-active"
                      : "voice-agent-capture-option",
                  onClick: () => _("precise"),
                },
                "Precise"
              )
            ),
            n(
              "div",
              {
                className: "voice-agent-capture-toggle",
                role: "group",
                "aria-label": "Voice reply mode",
              },
              n("span", { className: "voice-agent-capture-label" }, "Replies"),
              n(
                "button",
                {
                  type: "button",
                  className: u
                    ? "voice-agent-capture-option voice-agent-capture-option-active"
                    : "voice-agent-capture-option",
                  onClick: () => y(!0),
                },
                "Spoken"
              ),
              n(
                "button",
                {
                  type: "button",
                  className: u
                    ? "voice-agent-capture-option"
                    : "voice-agent-capture-option voice-agent-capture-option-active",
                  onClick: () => y(!1),
                },
                "Chat"
              )
            ),
            n(
              "div",
              { className: "voice-agent-status-block" },
              n("div", { className: "voice-agent-status" }, Zt(t, l, c, u)),
              n("div", { className: "voice-agent-hint" }, Xt(t, c, u))
            ),
            n(
              "button",
              {
                type: "button",
                className: [
                  "voice-agent-orb",
                  w ? "voice-agent-orb-listening" : "",
                  C ? "voice-agent-orb-busy" : "",
                  T ? "voice-agent-orb-speaking" : "",
                ]
                  .filter(Boolean)
                  .join(" "),
                onPointerDown: k,
                title: C
                  ? "Cancel"
                  : t === "speaking"
                    ? "Stop playback"
                    : t === "listening"
                      ? "Tap to stop listening and send what we heard"
                      : "Start voice conversation",
              },
              C
                ? n(
                    "svg",
                    {
                      className: "voice-agent-orb-icon",
                      width: "32",
                      height: "32",
                      viewBox: "0 0 24 24",
                      fill: "currentColor",
                    },
                    n("rect", {
                      x: "6",
                      y: "6",
                      width: "12",
                      height: "12",
                      rx: "2",
                    })
                  )
                : T
                  ? n(
                      "svg",
                      {
                        className: "voice-agent-orb-icon",
                        width: "32",
                        height: "32",
                        viewBox: "0 0 24 24",
                        fill: "none",
                        stroke: "currentColor",
                        strokeWidth: "2",
                        strokeLinecap: "round",
                        strokeLinejoin: "round",
                      },
                      n("rect", { x: "6", y: "4", width: "4", height: "16" }),
                      n("rect", { x: "14", y: "4", width: "4", height: "16" })
                    )
                  : n(
                      "svg",
                      {
                        className: "voice-agent-orb-icon",
                        width: "32",
                        height: "32",
                        viewBox: "0 0 24 24",
                        fill: "none",
                        stroke: "currentColor",
                        strokeWidth: "2",
                        strokeLinecap: "round",
                        strokeLinejoin: "round",
                      },
                      n("path", {
                        d: "M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z",
                      }),
                      n("path", { d: "M19 10v2a7 7 0 0 1-14 0v-2" }),
                      n("line", { x1: "12", y1: "19", x2: "12", y2: "23" }),
                      n("line", { x1: "8", y1: "23", x2: "16", y2: "23" })
                    )
            )
          )
        )
      : n(
          "div",
          { className: "voice-agent-overlay voice-agent-overlay-phase-idle" },
          n(
            "button",
            {
              className: "voice-agent-close",
              onClick: e,
              type: "button",
              title: "Close",
            },
            n(
              "svg",
              {
                width: "20",
                height: "20",
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: "2.5",
                strokeLinecap: "round",
                strokeLinejoin: "round",
              },
              n("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
              n("line", { x1: "6", y1: "6", x2: "18", y2: "18" })
            )
          ),
          n(
            "div",
            { className: "voice-agent-content" },
            n(
              "div",
              { className: "voice-agent-transcript voice-agent-error" },
              "Voice assistant is not available in this build."
            )
          )
        );
  }
  function At() {
    var I;
    let [e, t] = A({ isAuthenticated: !1, user: null }),
      [o, i] = A("chat"),
      [s, r] = A(!0),
      [d, l] = A(null),
      [m, c] = A(!1),
      g = V(j.resetAssistantSession),
      a = F(() => {
        i("chat");
      }, []),
      b = F(() => {
        r(!0);
      }, []),
      u = ht({
        auth: e,
        setPendingConfirmation: l,
        originalResetAssistantSession: g.current,
      });
    (kt({
      startToolAction: u.startToolAction,
      updateToolAction: u.updateToolAction,
      resetAssistantSession: u.resetAssistantSession,
      setPendingConfirmation: l,
    }),
      z(() => {
        let w = u.voiceTurnBeginForChat,
          C = u.voiceStreamChunkForChat,
          T = u.voiceSpokenTurnMirrorForChat;
        return (
          (j.oasisVoiceAssistantTurnBegin = w),
          (j.oasisVoiceAssistantStreamChunk = C),
          (j.oasisVoiceSpokenTurnMirror = T),
          () => {
            (j.oasisVoiceAssistantTurnBegin === w &&
              delete j.oasisVoiceAssistantTurnBegin,
              j.oasisVoiceAssistantStreamChunk === C &&
                delete j.oasisVoiceAssistantStreamChunk,
              j.oasisVoiceSpokenTurnMirror === T &&
                delete j.oasisVoiceSpokenTurnMirror);
          }
        );
      }, [
        u.voiceTurnBeginForChat,
        u.voiceStreamChunkForChat,
        u.voiceSpokenTurnMirrorForChat,
      ]),
      yt({
        setAuth: t,
        setMessages: u.setMessages,
        setPendingConfirmation: l,
        onAuthenticated: a,
        onUserChanged: b,
      }));
    let p = w => {
        (w.preventDefault(), w.stopPropagation());
        try {
          window.parent.postMessage(
            {
              type: "oasisOverlayResizeStart",
              screenX: w.screenX,
              screenY: w.screenY,
            },
            "*"
          );
        } catch {}
      },
      h = () => {
        let w = "https://tally.so/r/3jkNN6";
        if (typeof j.openWebLinkIn == "function") {
          j.openWebLinkIn(w, "tab", {});
          return;
        }
        if (window.top && typeof window.top.openWebLinkIn == "function") {
          window.top.openWebLinkIn(w, "tab", {});
          return;
        }
        window.open(w, "_blank");
      },
      x = w => {
        var _;
        let T = w.target.closest("a");
        if (!T || !T.href || T.href.startsWith("javascript:")) return;
        w.preventDefault();
        let M = T.href;
        (_ = j.assistantBridge) != null && _.openTab
          ? j.assistantBridge.openTab(M)
          : window.open(M, "_blank");
      },
      f = F(
        (w, C) => {
          if (!C) {
            u.stopSpeaking();
            return;
          }
          u.speakText(C, w);
        },
        [u]
      ),
      k = Kt(e.user);
    return n(
      "div",
      { className: "assistant-container" },
      m && n(Qt, { onClose: () => c(!1) }),
      d &&
        n(ut, {
          data: d,
          onConfirm: () => {
            u.handleConfirmationApprove();
          },
          onCancel: () => {
            u.handleConfirmationCancel();
          },
        }),
      n(lt, { auth: e, onShowAuth: () => i("auth") }),
      n(
        "div",
        {
          onPointerDown: p,
          style: {
            position: "fixed",
            bottom: "0",
            right: "0",
            width: "20px",
            height: "20px",
            cursor: "nwse-resize",
            zIndex: 99999,
          },
          title: "Resize",
        },
        n(
          "svg",
          {
            width: "20",
            height: "20",
            viewBox: "0 0 20 20",
            fill: "none",
            style: { position: "absolute", bottom: 2, right: 2, opacity: 0.3 },
          },
          n("path", {
            d: "M14 14L18 18",
            stroke: "#000",
            strokeWidth: "2",
            strokeLinecap: "round",
          }),
          n("path", {
            d: "M10 18L18 10",
            stroke: "#000",
            strokeWidth: "2",
            strokeLinecap: "round",
          })
        )
      ),
      o === "auth"
        ? n(dt, { onSuccess: () => i("chat"), onCancel: () => i("chat") })
        : n(
            X,
            null,
            e.isAuthenticated &&
              k &&
              s &&
              n(Gt, { email: k, onClose: () => r(!1) }),
            n(ft, {
              messages: u.messages,
              busy: u.busy,
              activeToolLabel:
                ((I = u.activeToolAction) == null ? void 0 : I.label) || null,
              onLinkClick: x,
              speakingMsgId: u.speakingMsgId,
              onTtsClick: f,
            }),
            n(mt, {
              input: u.input,
              isRecording: u.isRecording,
              busy: u.busy,
              isAuthenticated: e.isAuthenticated,
              ttsEnabled: u.ttsEnabled,
              onInput: u.setInput,
              onKeyDown: u.handleKeyDown,
              onSend: () => {
                u.send();
              },
              onToggleRecording: () => {
                u.toggleRecording();
              },
              onResetSession: () => {
                u.resetAssistantSession();
              },
              onFeedback: h,
              onToggleTts: () => {
                (u.speakingMsgId && u.stopSpeaking(), u.toggleTtsEnabled());
              },
              onOpenVoiceAgent: () => c(!0),
            })
          )
    );
  }
  var Ct = "assistant-preact-root";
  function en() {
    let e = document.getElementById(Ct);
    if (!e) {
      ((e = document.createElement("div")), (e.id = Ct));
      let t = document.getElementById("log");
      t && t.parentElement
        ? t.parentElement.insertBefore(e, t)
        : document.body.appendChild(e);
    }
    return e;
  }
  var tn = en();
  Ke(n(At, {}), tn);
})();
