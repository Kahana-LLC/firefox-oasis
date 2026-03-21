"use strict";
var AssistantUI = (() => {
  // node_modules/preact/dist/preact.module.js
  var n;
  var l;
  var u;
  var t;
  var i;
  var o;
  var r;
  var e;
  var f;
  var c;
  var s;
  var a;
  var h;
  var p = {};
  var v = [];
  var y = /acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i;
  var d = Array.isArray;
  function w(n2, l3) {
    for (var u3 in l3) n2[u3] = l3[u3];
    return n2;
  }
  function g(n2) {
    n2 && n2.parentNode && n2.parentNode.removeChild(n2);
  }
  function _(l3, u3, t3) {
    var i3,
      o3,
      r3,
      e3 = {};
    for (r3 in u3)
      "key" == r3
        ? (i3 = u3[r3])
        : "ref" == r3
          ? (o3 = u3[r3])
          : (e3[r3] = u3[r3]);
    if (
      (arguments.length > 2 &&
        (e3.children = arguments.length > 3 ? n.call(arguments, 2) : t3),
      "function" == typeof l3 && null != l3.defaultProps)
    )
      for (r3 in l3.defaultProps)
        void 0 === e3[r3] && (e3[r3] = l3.defaultProps[r3]);
    return m(l3, e3, i3, o3, null);
  }
  function m(n2, t3, i3, o3, r3) {
    var e3 = {
      type: n2,
      props: t3,
      key: i3,
      ref: o3,
      __k: null,
      __: null,
      __b: 0,
      __e: null,
      __c: null,
      constructor: void 0,
      __v: null == r3 ? ++u : r3,
      __i: -1,
      __u: 0,
    };
    return (null == r3 && null != l.vnode && l.vnode(e3), e3);
  }
  function k(n2) {
    return n2.children;
  }
  function x(n2, l3) {
    ((this.props = n2), (this.context = l3));
  }
  function S(n2, l3) {
    if (null == l3) return n2.__ ? S(n2.__, n2.__i + 1) : null;
    for (var u3; l3 < n2.__k.length; l3++)
      if (null != (u3 = n2.__k[l3]) && null != u3.__e) return u3.__e;
    return "function" == typeof n2.type ? S(n2) : null;
  }
  function C(n2) {
    var l3, u3;
    if (null != (n2 = n2.__) && null != n2.__c) {
      for (n2.__e = n2.__c.base = null, l3 = 0; l3 < n2.__k.length; l3++)
        if (null != (u3 = n2.__k[l3]) && null != u3.__e) {
          n2.__e = n2.__c.base = u3.__e;
          break;
        }
      return C(n2);
    }
  }
  function M(n2) {
    ((!n2.__d && (n2.__d = true) && i.push(n2) && !$.__r++) ||
      o != l.debounceRendering) &&
      ((o = l.debounceRendering) || r)($);
  }
  function $() {
    for (var n2, u3, t3, o3, r3, f3, c3, s3 = 1; i.length; )
      (i.length > s3 && i.sort(e),
        (n2 = i.shift()),
        (s3 = i.length),
        n2.__d &&
          ((t3 = void 0),
          (o3 = void 0),
          (r3 = (o3 = (u3 = n2).__v).__e),
          (f3 = []),
          (c3 = []),
          u3.__P &&
            (((t3 = w({}, o3)).__v = o3.__v + 1),
            l.vnode && l.vnode(t3),
            O(
              u3.__P,
              t3,
              o3,
              u3.__n,
              u3.__P.namespaceURI,
              32 & o3.__u ? [r3] : null,
              f3,
              null == r3 ? S(o3) : r3,
              !!(32 & o3.__u),
              c3
            ),
            (t3.__v = o3.__v),
            (t3.__.__k[t3.__i] = t3),
            N(f3, t3, c3),
            (o3.__e = o3.__ = null),
            t3.__e != r3 && C(t3))));
    $.__r = 0;
  }
  function I(n2, l3, u3, t3, i3, o3, r3, e3, f3, c3, s3) {
    var a3,
      h3,
      y3,
      d3,
      w3,
      g2,
      _2,
      m3 = (t3 && t3.__k) || v,
      b = l3.length;
    for (f3 = P(u3, l3, m3, f3, b), a3 = 0; a3 < b; a3++)
      null != (y3 = u3.__k[a3]) &&
        ((h3 = -1 == y3.__i ? p : m3[y3.__i] || p),
        (y3.__i = a3),
        (g2 = O(n2, y3, h3, i3, o3, r3, e3, f3, c3, s3)),
        (d3 = y3.__e),
        y3.ref &&
          h3.ref != y3.ref &&
          (h3.ref && B(h3.ref, null, y3), s3.push(y3.ref, y3.__c || d3, y3)),
        null == w3 && null != d3 && (w3 = d3),
        (_2 = !!(4 & y3.__u)) || h3.__k === y3.__k
          ? (f3 = A(y3, f3, n2, _2))
          : "function" == typeof y3.type && void 0 !== g2
            ? (f3 = g2)
            : d3 && (f3 = d3.nextSibling),
        (y3.__u &= -7));
    return ((u3.__e = w3), f3);
  }
  function P(n2, l3, u3, t3, i3) {
    var o3,
      r3,
      e3,
      f3,
      c3,
      s3 = u3.length,
      a3 = s3,
      h3 = 0;
    for (n2.__k = new Array(i3), o3 = 0; o3 < i3; o3++)
      null != (r3 = l3[o3]) && "boolean" != typeof r3 && "function" != typeof r3
        ? ("string" == typeof r3 ||
          "number" == typeof r3 ||
          "bigint" == typeof r3 ||
          r3.constructor == String
            ? (r3 = n2.__k[o3] = m(null, r3, null, null, null))
            : d(r3)
              ? (r3 = n2.__k[o3] = m(k, { children: r3 }, null, null, null))
              : void 0 === r3.constructor && r3.__b > 0
                ? (r3 = n2.__k[o3] =
                    m(
                      r3.type,
                      r3.props,
                      r3.key,
                      r3.ref ? r3.ref : null,
                      r3.__v
                    ))
                : (n2.__k[o3] = r3),
          (f3 = o3 + h3),
          (r3.__ = n2),
          (r3.__b = n2.__b + 1),
          (e3 = null),
          -1 != (c3 = r3.__i = L(r3, u3, f3, a3)) &&
            (a3--, (e3 = u3[c3]) && (e3.__u |= 2)),
          null == e3 || null == e3.__v
            ? (-1 == c3 && (i3 > s3 ? h3-- : i3 < s3 && h3++),
              "function" != typeof r3.type && (r3.__u |= 4))
            : c3 != f3 &&
              (c3 == f3 - 1
                ? h3--
                : c3 == f3 + 1
                  ? h3++
                  : (c3 > f3 ? h3-- : h3++, (r3.__u |= 4))))
        : (n2.__k[o3] = null);
    if (a3)
      for (o3 = 0; o3 < s3; o3++)
        null != (e3 = u3[o3]) &&
          0 == (2 & e3.__u) &&
          (e3.__e == t3 && (t3 = S(e3)), D(e3, e3));
    return t3;
  }
  function A(n2, l3, u3, t3) {
    var i3, o3;
    if ("function" == typeof n2.type) {
      for (i3 = n2.__k, o3 = 0; i3 && o3 < i3.length; o3++)
        i3[o3] && ((i3[o3].__ = n2), (l3 = A(i3[o3], l3, u3, t3)));
      return l3;
    }
    n2.__e != l3 &&
      (t3 &&
        (l3 && n2.type && !l3.parentNode && (l3 = S(n2)),
        u3.insertBefore(n2.__e, l3 || null)),
      (l3 = n2.__e));
    do {
      l3 = l3 && l3.nextSibling;
    } while (null != l3 && 8 == l3.nodeType);
    return l3;
  }
  function L(n2, l3, u3, t3) {
    var i3,
      o3,
      r3,
      e3 = n2.key,
      f3 = n2.type,
      c3 = l3[u3],
      s3 = null != c3 && 0 == (2 & c3.__u);
    if ((null === c3 && null == e3) || (s3 && e3 == c3.key && f3 == c3.type))
      return u3;
    if (t3 > (s3 ? 1 : 0)) {
      for (i3 = u3 - 1, o3 = u3 + 1; i3 >= 0 || o3 < l3.length; )
        if (
          null != (c3 = l3[(r3 = i3 >= 0 ? i3-- : o3++)]) &&
          0 == (2 & c3.__u) &&
          e3 == c3.key &&
          f3 == c3.type
        )
          return r3;
    }
    return -1;
  }
  function T(n2, l3, u3) {
    "-" == l3[0]
      ? n2.setProperty(l3, null == u3 ? "" : u3)
      : (n2[l3] =
          null == u3
            ? ""
            : "number" != typeof u3 || y.test(l3)
              ? u3
              : u3 + "px");
  }
  function j(n2, l3, u3, t3, i3) {
    var o3, r3;
    n: if ("style" == l3)
      if ("string" == typeof u3) n2.style.cssText = u3;
      else {
        if (("string" == typeof t3 && (n2.style.cssText = t3 = ""), t3))
          for (l3 in t3) (u3 && l3 in u3) || T(n2.style, l3, "");
        if (u3)
          for (l3 in u3) (t3 && u3[l3] == t3[l3]) || T(n2.style, l3, u3[l3]);
      }
    else if ("o" == l3[0] && "n" == l3[1])
      ((o3 = l3 != (l3 = l3.replace(f, "$1"))),
        (r3 = l3.toLowerCase()),
        (l3 =
          r3 in n2 || "onFocusOut" == l3 || "onFocusIn" == l3
            ? r3.slice(2)
            : l3.slice(2)),
        n2.l || (n2.l = {}),
        (n2.l[l3 + o3] = u3),
        u3
          ? t3
            ? (u3.u = t3.u)
            : ((u3.u = c), n2.addEventListener(l3, o3 ? a : s, o3))
          : n2.removeEventListener(l3, o3 ? a : s, o3));
    else {
      if ("http://www.w3.org/2000/svg" == i3)
        l3 = l3.replace(/xlink(H|:h)/, "h").replace(/sName$/, "s");
      else if (
        "width" != l3 &&
        "height" != l3 &&
        "href" != l3 &&
        "list" != l3 &&
        "form" != l3 &&
        "tabIndex" != l3 &&
        "download" != l3 &&
        "rowSpan" != l3 &&
        "colSpan" != l3 &&
        "role" != l3 &&
        "popover" != l3 &&
        l3 in n2
      )
        try {
          n2[l3] = null == u3 ? "" : u3;
          break n;
        } catch (n3) {}
      "function" == typeof u3 ||
        (null == u3 || (false === u3 && "-" != l3[4])
          ? n2.removeAttribute(l3)
          : n2.setAttribute(l3, "popover" == l3 && 1 == u3 ? "" : u3));
    }
  }
  function F(n2) {
    return function (u3) {
      if (this.l) {
        var t3 = this.l[u3.type + n2];
        if (null == u3.t) u3.t = c++;
        else if (u3.t < t3.u) return;
        return t3(l.event ? l.event(u3) : u3);
      }
    };
  }
  function O(n2, u3, t3, i3, o3, r3, e3, f3, c3, s3) {
    var a3,
      h3,
      p3,
      v3,
      y3,
      _2,
      m3,
      b,
      S2,
      C3,
      M2,
      $2,
      P2,
      A3,
      H,
      L2,
      T3,
      j3 = u3.type;
    if (void 0 !== u3.constructor) return null;
    (128 & t3.__u && ((c3 = !!(32 & t3.__u)), (r3 = [(f3 = u3.__e = t3.__e)])),
      (a3 = l.__b) && a3(u3));
    n: if ("function" == typeof j3)
      try {
        if (
          ((b = u3.props),
          (S2 = "prototype" in j3 && j3.prototype.render),
          (C3 = (a3 = j3.contextType) && i3[a3.__c]),
          (M2 = a3 ? (C3 ? C3.props.value : a3.__) : i3),
          t3.__c
            ? (m3 = (h3 = u3.__c = t3.__c).__ = h3.__E)
            : (S2
                ? (u3.__c = h3 = new j3(b, M2))
                : ((u3.__c = h3 = new x(b, M2)),
                  (h3.constructor = j3),
                  (h3.render = E)),
              C3 && C3.sub(h3),
              h3.state || (h3.state = {}),
              (h3.__n = i3),
              (p3 = h3.__d = true),
              (h3.__h = []),
              (h3._sb = [])),
          S2 && null == h3.__s && (h3.__s = h3.state),
          S2 &&
            null != j3.getDerivedStateFromProps &&
            (h3.__s == h3.state && (h3.__s = w({}, h3.__s)),
            w(h3.__s, j3.getDerivedStateFromProps(b, h3.__s))),
          (v3 = h3.props),
          (y3 = h3.state),
          (h3.__v = u3),
          p3)
        )
          (S2 &&
            null == j3.getDerivedStateFromProps &&
            null != h3.componentWillMount &&
            h3.componentWillMount(),
            S2 &&
              null != h3.componentDidMount &&
              h3.__h.push(h3.componentDidMount));
        else {
          if (
            (S2 &&
              null == j3.getDerivedStateFromProps &&
              b !== v3 &&
              null != h3.componentWillReceiveProps &&
              h3.componentWillReceiveProps(b, M2),
            u3.__v == t3.__v ||
              (!h3.__e &&
                null != h3.shouldComponentUpdate &&
                false === h3.shouldComponentUpdate(b, h3.__s, M2)))
          ) {
            for (
              u3.__v != t3.__v &&
                ((h3.props = b), (h3.state = h3.__s), (h3.__d = false)),
                u3.__e = t3.__e,
                u3.__k = t3.__k,
                u3.__k.some(function (n3) {
                  n3 && (n3.__ = u3);
                }),
                $2 = 0;
              $2 < h3._sb.length;
              $2++
            )
              h3.__h.push(h3._sb[$2]);
            ((h3._sb = []), h3.__h.length && e3.push(h3));
            break n;
          }
          (null != h3.componentWillUpdate &&
            h3.componentWillUpdate(b, h3.__s, M2),
            S2 &&
              null != h3.componentDidUpdate &&
              h3.__h.push(function () {
                h3.componentDidUpdate(v3, y3, _2);
              }));
        }
        if (
          ((h3.context = M2),
          (h3.props = b),
          (h3.__P = n2),
          (h3.__e = false),
          (P2 = l.__r),
          (A3 = 0),
          S2)
        ) {
          for (
            h3.state = h3.__s,
              h3.__d = false,
              P2 && P2(u3),
              a3 = h3.render(h3.props, h3.state, h3.context),
              H = 0;
            H < h3._sb.length;
            H++
          )
            h3.__h.push(h3._sb[H]);
          h3._sb = [];
        } else
          do {
            ((h3.__d = false),
              P2 && P2(u3),
              (a3 = h3.render(h3.props, h3.state, h3.context)),
              (h3.state = h3.__s));
          } while (h3.__d && ++A3 < 25);
        ((h3.state = h3.__s),
          null != h3.getChildContext &&
            (i3 = w(w({}, i3), h3.getChildContext())),
          S2 &&
            !p3 &&
            null != h3.getSnapshotBeforeUpdate &&
            (_2 = h3.getSnapshotBeforeUpdate(v3, y3)),
          (L2 = a3),
          null != a3 &&
            a3.type === k &&
            null == a3.key &&
            (L2 = V(a3.props.children)),
          (f3 = I(n2, d(L2) ? L2 : [L2], u3, t3, i3, o3, r3, e3, f3, c3, s3)),
          (h3.base = u3.__e),
          (u3.__u &= -161),
          h3.__h.length && e3.push(h3),
          m3 && (h3.__E = h3.__ = null));
      } catch (n3) {
        if (((u3.__v = null), c3 || null != r3))
          if (n3.then) {
            for (
              u3.__u |= c3 ? 160 : 128;
              f3 && 8 == f3.nodeType && f3.nextSibling;

            )
              f3 = f3.nextSibling;
            ((r3[r3.indexOf(f3)] = null), (u3.__e = f3));
          } else {
            for (T3 = r3.length; T3--; ) g(r3[T3]);
            z(u3);
          }
        else ((u3.__e = t3.__e), (u3.__k = t3.__k), n3.then || z(u3));
        l.__e(n3, u3, t3);
      }
    else
      null == r3 && u3.__v == t3.__v
        ? ((u3.__k = t3.__k), (u3.__e = t3.__e))
        : (f3 = u3.__e = q(t3.__e, u3, t3, i3, o3, r3, e3, c3, s3));
    return ((a3 = l.diffed) && a3(u3), 128 & u3.__u ? void 0 : f3);
  }
  function z(n2) {
    (n2 && n2.__c && (n2.__c.__e = true), n2 && n2.__k && n2.__k.forEach(z));
  }
  function N(n2, u3, t3) {
    for (var i3 = 0; i3 < t3.length; i3++) B(t3[i3], t3[++i3], t3[++i3]);
    (l.__c && l.__c(u3, n2),
      n2.some(function (u4) {
        try {
          ((n2 = u4.__h),
            (u4.__h = []),
            n2.some(function (n3) {
              n3.call(u4);
            }));
        } catch (n3) {
          l.__e(n3, u4.__v);
        }
      }));
  }
  function V(n2) {
    return "object" != typeof n2 || null == n2 || (n2.__b && n2.__b > 0)
      ? n2
      : d(n2)
        ? n2.map(V)
        : w({}, n2);
  }
  function q(u3, t3, i3, o3, r3, e3, f3, c3, s3) {
    var a3,
      h3,
      v3,
      y3,
      w3,
      _2,
      m3,
      b = i3.props || p,
      k3 = t3.props,
      x2 = t3.type;
    if (
      ("svg" == x2
        ? (r3 = "http://www.w3.org/2000/svg")
        : "math" == x2
          ? (r3 = "http://www.w3.org/1998/Math/MathML")
          : r3 || (r3 = "http://www.w3.org/1999/xhtml"),
      null != e3)
    ) {
      for (a3 = 0; a3 < e3.length; a3++)
        if (
          (w3 = e3[a3]) &&
          "setAttribute" in w3 == !!x2 &&
          (x2 ? w3.localName == x2 : 3 == w3.nodeType)
        ) {
          ((u3 = w3), (e3[a3] = null));
          break;
        }
    }
    if (null == u3) {
      if (null == x2) return document.createTextNode(k3);
      ((u3 = document.createElementNS(r3, x2, k3.is && k3)),
        c3 && (l.__m && l.__m(t3, e3), (c3 = false)),
        (e3 = null));
    }
    if (null == x2) b === k3 || (c3 && u3.data == k3) || (u3.data = k3);
    else {
      if (((e3 = e3 && n.call(u3.childNodes)), !c3 && null != e3))
        for (b = {}, a3 = 0; a3 < u3.attributes.length; a3++)
          b[(w3 = u3.attributes[a3]).name] = w3.value;
      for (a3 in b)
        if (((w3 = b[a3]), "children" == a3));
        else if ("dangerouslySetInnerHTML" == a3) v3 = w3;
        else if (!(a3 in k3)) {
          if (
            ("value" == a3 && "defaultValue" in k3) ||
            ("checked" == a3 && "defaultChecked" in k3)
          )
            continue;
          j(u3, a3, null, w3, r3);
        }
      for (a3 in k3)
        ((w3 = k3[a3]),
          "children" == a3
            ? (y3 = w3)
            : "dangerouslySetInnerHTML" == a3
              ? (h3 = w3)
              : "value" == a3
                ? (_2 = w3)
                : "checked" == a3
                  ? (m3 = w3)
                  : (c3 && "function" != typeof w3) ||
                    b[a3] === w3 ||
                    j(u3, a3, w3, b[a3], r3));
      if (h3)
        (c3 ||
          (v3 && (h3.__html == v3.__html || h3.__html == u3.innerHTML)) ||
          (u3.innerHTML = h3.__html),
          (t3.__k = []));
      else if (
        (v3 && (u3.innerHTML = ""),
        I(
          "template" == t3.type ? u3.content : u3,
          d(y3) ? y3 : [y3],
          t3,
          i3,
          o3,
          "foreignObject" == x2 ? "http://www.w3.org/1999/xhtml" : r3,
          e3,
          f3,
          e3 ? e3[0] : i3.__k && S(i3, 0),
          c3,
          s3
        ),
        null != e3)
      )
        for (a3 = e3.length; a3--; ) g(e3[a3]);
      c3 ||
        ((a3 = "value"),
        "progress" == x2 && null == _2
          ? u3.removeAttribute("value")
          : null != _2 &&
            (_2 !== u3[a3] ||
              ("progress" == x2 && !_2) ||
              ("option" == x2 && _2 != b[a3])) &&
            j(u3, a3, _2, b[a3], r3),
        (a3 = "checked"),
        null != m3 && m3 != u3[a3] && j(u3, a3, m3, b[a3], r3));
    }
    return u3;
  }
  function B(n2, u3, t3) {
    try {
      if ("function" == typeof n2) {
        var i3 = "function" == typeof n2.__u;
        (i3 && n2.__u(), (i3 && null == u3) || (n2.__u = n2(u3)));
      } else n2.current = u3;
    } catch (n3) {
      l.__e(n3, t3);
    }
  }
  function D(n2, u3, t3) {
    var i3, o3;
    if (
      (l.unmount && l.unmount(n2),
      (i3 = n2.ref) &&
        ((i3.current && i3.current != n2.__e) || B(i3, null, u3)),
      null != (i3 = n2.__c))
    ) {
      if (i3.componentWillUnmount)
        try {
          i3.componentWillUnmount();
        } catch (n3) {
          l.__e(n3, u3);
        }
      i3.base = i3.__P = null;
    }
    if ((i3 = n2.__k))
      for (o3 = 0; o3 < i3.length; o3++)
        i3[o3] && D(i3[o3], u3, t3 || "function" != typeof n2.type);
    (t3 || g(n2.__e), (n2.__c = n2.__ = n2.__e = void 0));
  }
  function E(n2, l3, u3) {
    return this.constructor(n2, u3);
  }
  function G(u3, t3, i3) {
    var o3, r3, e3, f3;
    (t3 == document && (t3 = document.documentElement),
      l.__ && l.__(u3, t3),
      (r3 = (o3 = "function" == typeof i3) ? null : (i3 && i3.__k) || t3.__k),
      (e3 = []),
      (f3 = []),
      O(
        t3,
        (u3 = ((!o3 && i3) || t3).__k = _(k, null, [u3])),
        r3 || p,
        p,
        t3.namespaceURI,
        !o3 && i3
          ? [i3]
          : r3
            ? null
            : t3.firstChild
              ? n.call(t3.childNodes)
              : null,
        e3,
        !o3 && i3 ? i3 : r3 ? r3.__e : t3.firstChild,
        o3,
        f3
      ),
      N(e3, u3, f3));
  }
  ((n = v.slice),
    (l = {
      __e: function (n2, l3, u3, t3) {
        for (var i3, o3, r3; (l3 = l3.__); )
          if ((i3 = l3.__c) && !i3.__)
            try {
              if (
                ((o3 = i3.constructor) &&
                  null != o3.getDerivedStateFromError &&
                  (i3.setState(o3.getDerivedStateFromError(n2)), (r3 = i3.__d)),
                null != i3.componentDidCatch &&
                  (i3.componentDidCatch(n2, t3 || {}), (r3 = i3.__d)),
                r3)
              )
                return (i3.__E = i3);
            } catch (l4) {
              n2 = l4;
            }
        throw n2;
      },
    }),
    (u = 0),
    (t = function (n2) {
      return null != n2 && void 0 === n2.constructor;
    }),
    (x.prototype.setState = function (n2, l3) {
      var u3;
      ((u3 =
        null != this.__s && this.__s != this.state
          ? this.__s
          : (this.__s = w({}, this.state))),
        "function" == typeof n2 && (n2 = n2(w({}, u3), this.props)),
        n2 && w(u3, n2),
        null != n2 && this.__v && (l3 && this._sb.push(l3), M(this)));
    }),
    (x.prototype.forceUpdate = function (n2) {
      this.__v && ((this.__e = true), n2 && this.__h.push(n2), M(this));
    }),
    (x.prototype.render = k),
    (i = []),
    (r =
      "function" == typeof Promise
        ? Promise.prototype.then.bind(Promise.resolve())
        : setTimeout),
    (e = function (n2, l3) {
      return n2.__v.__b - l3.__v.__b;
    }),
    ($.__r = 0),
    (f = /(PointerCapture)$|Capture$/i),
    (c = 0),
    (s = F(false)),
    (a = F(true)),
    (h = 0));

  // node_modules/preact/hooks/dist/hooks.module.js
  var t2;
  var r2;
  var u2;
  var i2;
  var o2 = 0;
  var f2 = [];
  var c2 = l;
  var e2 = c2.__b;
  var a2 = c2.__r;
  var v2 = c2.diffed;
  var l2 = c2.__c;
  var m2 = c2.unmount;
  var s2 = c2.__;
  function p2(n2, t3) {
    (c2.__h && c2.__h(r2, n2, o2 || t3), (o2 = 0));
    var u3 = r2.__H || (r2.__H = { __: [], __h: [] });
    return (n2 >= u3.__.length && u3.__.push({}), u3.__[n2]);
  }
  function d2(n2) {
    return ((o2 = 1), h2(D2, n2));
  }
  function h2(n2, u3, i3) {
    var o3 = p2(t2++, 2);
    if (
      ((o3.t = n2),
      !o3.__c &&
        ((o3.__ = [
          i3 ? i3(u3) : D2(void 0, u3),
          function (n3) {
            var t3 = o3.__N ? o3.__N[0] : o3.__[0],
              r3 = o3.t(t3, n3);
            t3 !== r3 && ((o3.__N = [r3, o3.__[1]]), o3.__c.setState({}));
          },
        ]),
        (o3.__c = r2),
        !r2.__f))
    ) {
      var f3 = function (n3, t3, r3) {
        if (!o3.__c.__H) return true;
        var u4 = o3.__c.__H.__.filter(function (n4) {
          return !!n4.__c;
        });
        if (
          u4.every(function (n4) {
            return !n4.__N;
          })
        )
          return !c3 || c3.call(this, n3, t3, r3);
        var i4 = o3.__c.props !== n3;
        return (
          u4.forEach(function (n4) {
            if (n4.__N) {
              var t4 = n4.__[0];
              ((n4.__ = n4.__N),
                (n4.__N = void 0),
                t4 !== n4.__[0] && (i4 = true));
            }
          }),
          (c3 && c3.call(this, n3, t3, r3)) || i4
        );
      };
      r2.__f = true;
      var c3 = r2.shouldComponentUpdate,
        e3 = r2.componentWillUpdate;
      ((r2.componentWillUpdate = function (n3, t3, r3) {
        if (this.__e) {
          var u4 = c3;
          ((c3 = void 0), f3(n3, t3, r3), (c3 = u4));
        }
        e3 && e3.call(this, n3, t3, r3);
      }),
        (r2.shouldComponentUpdate = f3));
    }
    return o3.__N || o3.__;
  }
  function y2(n2, u3) {
    var i3 = p2(t2++, 3);
    !c2.__s &&
      C2(i3.__H, u3) &&
      ((i3.__ = n2), (i3.u = u3), r2.__H.__h.push(i3));
  }
  function A2(n2) {
    return (
      (o2 = 5),
      T2(function () {
        return { current: n2 };
      }, [])
    );
  }
  function T2(n2, r3) {
    var u3 = p2(t2++, 7);
    return (
      C2(u3.__H, r3) && ((u3.__ = n2()), (u3.__H = r3), (u3.__h = n2)),
      u3.__
    );
  }
  function j2() {
    for (var n2; (n2 = f2.shift()); )
      if (n2.__P && n2.__H)
        try {
          (n2.__H.__h.forEach(z2), n2.__H.__h.forEach(B2), (n2.__H.__h = []));
        } catch (t3) {
          ((n2.__H.__h = []), c2.__e(t3, n2.__v));
        }
  }
  ((c2.__b = function (n2) {
    ((r2 = null), e2 && e2(n2));
  }),
    (c2.__ = function (n2, t3) {
      (n2 && t3.__k && t3.__k.__m && (n2.__m = t3.__k.__m), s2 && s2(n2, t3));
    }),
    (c2.__r = function (n2) {
      (a2 && a2(n2), (t2 = 0));
      var i3 = (r2 = n2.__c).__H;
      (i3 &&
        (u2 === r2
          ? ((i3.__h = []),
            (r2.__h = []),
            i3.__.forEach(function (n3) {
              (n3.__N && (n3.__ = n3.__N), (n3.u = n3.__N = void 0));
            }))
          : (i3.__h.forEach(z2), i3.__h.forEach(B2), (i3.__h = []), (t2 = 0))),
        (u2 = r2));
    }),
    (c2.diffed = function (n2) {
      v2 && v2(n2);
      var t3 = n2.__c;
      (t3 &&
        t3.__H &&
        (t3.__H.__h.length &&
          ((1 !== f2.push(t3) && i2 === c2.requestAnimationFrame) ||
            ((i2 = c2.requestAnimationFrame) || w2)(j2)),
        t3.__H.__.forEach(function (n3) {
          (n3.u && (n3.__H = n3.u), (n3.u = void 0));
        })),
        (u2 = r2 = null));
    }),
    (c2.__c = function (n2, t3) {
      (t3.some(function (n3) {
        try {
          (n3.__h.forEach(z2),
            (n3.__h = n3.__h.filter(function (n4) {
              return !n4.__ || B2(n4);
            })));
        } catch (r3) {
          (t3.some(function (n4) {
            n4.__h && (n4.__h = []);
          }),
            (t3 = []),
            c2.__e(r3, n3.__v));
        }
      }),
        l2 && l2(n2, t3));
    }),
    (c2.unmount = function (n2) {
      m2 && m2(n2);
      var t3,
        r3 = n2.__c;
      r3 &&
        r3.__H &&
        (r3.__H.__.forEach(function (n3) {
          try {
            z2(n3);
          } catch (n4) {
            t3 = n4;
          }
        }),
        (r3.__H = void 0),
        t3 && c2.__e(t3, r3.__v));
    }));
  var k2 = "function" == typeof requestAnimationFrame;
  function w2(n2) {
    var t3,
      r3 = function () {
        (clearTimeout(u3), k2 && cancelAnimationFrame(t3), setTimeout(n2));
      },
      u3 = setTimeout(r3, 35);
    k2 && (t3 = requestAnimationFrame(r3));
  }
  function z2(n2) {
    var t3 = r2,
      u3 = n2.__c;
    ("function" == typeof u3 && ((n2.__c = void 0), u3()), (r2 = t3));
  }
  function B2(n2) {
    var t3 = r2;
    ((n2.__c = n2.__()), (r2 = t3));
  }
  function C2(n2, t3) {
    return (
      !n2 ||
      n2.length !== t3.length ||
      t3.some(function (t4, r3) {
        return t4 !== n2[r3];
      })
    );
  }
  function D2(n2, t3) {
    return "function" == typeof t3 ? t3(n2) : t3;
  }

  // src/components/Header.tsx
  function Header({ auth, onShowAuth }) {
    var _a;
    const [isMaximized, setIsMaximized] = d2(false);
    const [showMenu, setShowMenu] = d2(false);
    const menuRef = A2(null);
    y2(() => {
      function handleClickOutside(event) {
        if (menuRef.current && !menuRef.current.contains(event.target)) {
          setShowMenu(false);
        }
      }
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }, []);
    const handleMinimize = e3 => {
      e3.preventDefault();
      e3.stopPropagation();
      try {
        window.parent.postMessage({ type: "oasisOverlayMinimize" }, "*");
      } catch (err) {}
    };
    const handleExpand = e3 => {
      e3.preventDefault();
      e3.stopPropagation();
      try {
        if (isMaximized) {
          window.parent.postMessage(
            { type: "oasisOverlayExitFullscreen" },
            "*"
          );
          setIsMaximized(false);
        } else {
          window.parent.postMessage({ type: "oasisOverlayExpand" }, "*");
          setIsMaximized(true);
        }
      } catch (err) {}
    };
    const handleClose = e3 => {
      e3.preventDefault();
      e3.stopPropagation();
      try {
        window.parent.postMessage({ type: "oasisOverlayClose" }, "*");
      } catch (err) {}
    };
    const handleDragStart = e3 => {
      if (e3.target.closest("button") || e3.target.closest(".dropdown-menu"))
        return;
      if (e3.button !== 0) return;
      e3.preventDefault();
      e3.stopPropagation();
      window.parent.postMessage(
        {
          type: "oasisOverlayDragStart",
          screenX: e3.screenX,
          screenY: e3.screenY,
        },
        "*"
      );
    };
    const handleSignOut = async () => {
      if (window.supabaseAuth) {
        await window.supabaseAuth.signOut();
        setShowMenu(false);
      }
    };
    return /* @__PURE__ */ _(
      "div",
      {
        onPointerDown: handleDragStart,
        style: {
          height: "48px",
          // Slightly taller for better touch
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 8px",
          // Figma has less padding on edges of the internal row
          background: "transparent",
          cursor: "grab",
          zIndex: 2147483647,
          boxSizing: "border-box",
          userSelect: "none",
          flexShrink: 0,
        },
      },
      /* @__PURE__ */ _(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "8px" } },
        /* @__PURE__ */ _(
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
          /* @__PURE__ */ _(
            "svg",
            {
              width: "32",
              height: "32",
              viewBox: "0 0 32 32",
              fill: "none",
              xmlns: "http://www.w3.org/2000/svg",
            },
            /* @__PURE__ */ _("ellipse", {
              cx: "16.5",
              cy: "16",
              rx: "12.5",
              ry: "10.5",
              fill: "#978455",
            }),
            /* @__PURE__ */ _("ellipse", {
              cx: "16.5",
              cy: "18",
              rx: "10.5",
              ry: "8.5",
              fill: "#F8FAF2",
            }),
            /* @__PURE__ */ _("ellipse", {
              cx: "10.3268",
              cy: "18.7453",
              rx: "2.45004",
              ry: "5.0274",
              transform: "rotate(46.2818 10.3268 18.7453)",
              fill: "#978455",
            }),
            /* @__PURE__ */ _("circle", {
              cx: "1",
              cy: "1",
              r: "1",
              transform: "matrix(1 0 0 -1 12 17.5)",
              fill: "#F8FAF2",
            }),
            /* @__PURE__ */ _("ellipse", {
              cx: "2.45004",
              cy: "5.0274",
              rx: "2.45004",
              ry: "5.0274",
              transform:
                "matrix(-0.691112 0.722747 0.722747 0.691112 20.7329 13.5)",
              fill: "#978455",
            }),
            /* @__PURE__ */ _("circle", {
              cx: "1",
              cy: "1",
              r: "1",
              transform: "matrix(1 0 0 -1 19 17.5)",
              fill: "#F8FAF2",
            })
          )
        ),
        /* @__PURE__ */ _(
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
        /* @__PURE__ */ _(
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
          /* @__PURE__ */ _(
            "span",
            { style: { fontSize: "12px", color: "#495800" } },
            "Beta"
          )
        )
      ),
      /* @__PURE__ */ _(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "4px" } },
        /* @__PURE__ */ _(
          "div",
          { style: { position: "relative" }, ref: menuRef },
          /* @__PURE__ */ _(
            HeaderBtn,
            { onClick: () => setShowMenu(!showMenu), title: "Menu" },
            /* @__PURE__ */ _(
              "svg",
              { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none" },
              /* @__PURE__ */ _("circle", {
                cx: "5",
                cy: "12",
                r: "2",
                fill: "#7A9200",
              }),
              /* @__PURE__ */ _("circle", {
                cx: "12",
                cy: "12",
                r: "2",
                fill: "#7A9200",
              }),
              /* @__PURE__ */ _("circle", {
                cx: "19",
                cy: "12",
                r: "2",
                fill: "#7A9200",
              })
            )
          ),
          showMenu &&
            /* @__PURE__ */ _(
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
              auth.isAuthenticated
                ? /* @__PURE__ */ _(
                    "div",
                    null,
                    /* @__PURE__ */ _(
                      "div",
                      {
                        style: {
                          padding: "12px 16px",
                          borderBottom: "1px solid #f5f5f5",
                          background: "#fafafa",
                        },
                      },
                      /* @__PURE__ */ _(
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
                      /* @__PURE__ */ _(
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
                        (_a = auth.user) == null ? void 0 : _a.email
                      )
                    ),
                    /* @__PURE__ */ _(
                      MenuItem,
                      {
                        onClick: () => {
                          alert("Settings coming soon");
                          setShowMenu(false);
                        },
                      },
                      "Settings"
                    ),
                    /* @__PURE__ */ _(
                      MenuItem,
                      { onClick: handleSignOut, style: { color: "#e53935" } },
                      "Sign Out"
                    )
                  )
                : /* @__PURE__ */ _(
                    "div",
                    null,
                    /* @__PURE__ */ _(
                      MenuItem,
                      {
                        onClick: () => {
                          onShowAuth();
                          setShowMenu(false);
                        },
                      },
                      "Sign In / Sign Up"
                    )
                  )
            )
        ),
        /* @__PURE__ */ _(
          HeaderBtn,
          {
            onClick: e3 => {
              e3.preventDefault();
              e3.stopPropagation();
              try {
                window.parent.postMessage(
                  { type: "oasisOverlayToggleSidebar" },
                  "*"
                );
              } catch (err) {}
            },
            title: "Toggle Sidebar",
          },
          /* @__PURE__ */ _(
            "svg",
            {
              width: "24",
              height: "24",
              viewBox: "0 0 24 24",
              fill: "none",
              xmlns: "http://www.w3.org/2000/svg",
            },
            /* @__PURE__ */ _("path", {
              d: "M6 21C5.20435 21 4.44129 20.6839 3.87868 20.1213C3.31607 19.5587 3 18.7956 3 18V6C3 5.20435 3.31607 4.44129 3.87868 3.87868C4.44129 3.31607 5.20435 3 6 3H18C18.7956 3 19.5587 3.31607 20.1213 3.87868C20.6839 4.44129 21 5.20435 21 6V18C21 18.7956 20.6839 19.5587 20.1213 20.1213C19.5587 20.6839 18.7956 21 18 21H6ZM18 5H10V19H18C18.2652 19 18.5196 18.8946 18.7071 18.7071C18.8946 18.5196 19 18.2652 19 18V6C19 5.73478 18.8946 5.48043 18.7071 5.29289C18.5196 5.10536 18.2652 5 18 5Z",
              fill: "#7A9200",
            })
          )
        ),
        /* @__PURE__ */ _(
          HeaderBtn,
          { onClick: handleClose, title: "Close", hoverColor: "#ffecec" },
          /* @__PURE__ */ _(
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
            /* @__PURE__ */ _("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
            /* @__PURE__ */ _("line", { x1: "6", y1: "6", x2: "18", y2: "18" })
          )
        )
      )
    );
  }
  function HeaderBtn({ onClick, title, children, hoverColor }) {
    return /* @__PURE__ */ _(
      "button",
      {
        onClick,
        title,
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
        onMouseEnter: e3 =>
          (e3.currentTarget.style.backgroundColor =
            hoverColor || "rgba(122, 146, 0, 0.1)"),
        onMouseLeave: e3 =>
          (e3.currentTarget.style.backgroundColor = "transparent"),
      },
      children
    );
  }
  function MenuItem({ onClick, children, style }) {
    return /* @__PURE__ */ _(
      "div",
      {
        onClick,
        style: {
          padding: "10px 16px",
          fontSize: "13px",
          color: "#333",
          cursor: "pointer",
          transition: "background 0.1s",
          ...style,
        },
        onMouseEnter: e3 =>
          (e3.currentTarget.style.backgroundColor = "#f5f5f5"),
        onMouseLeave: e3 => (e3.currentTarget.style.backgroundColor = "white"),
      },
      children
    );
  }

  // src/components/Auth.tsx
  function GoogleIcon() {
    return /* @__PURE__ */ _(
      "svg",
      {
        width: "18",
        height: "18",
        viewBox: "0 0 24 24",
        "aria-hidden": "true",
      },
      /* @__PURE__ */ _("path", {
        fill: "#EA4335",
        d: "M12 10.2v3.9h5.4c-.2 1.3-1.5 3.9-5.4 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.2 14.7 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12S6.6 21.8 12 21.8c6.9 0 9.2-4.8 9.2-7.3 0-.5 0-.9-.1-1.3H12Z",
      }),
      /* @__PURE__ */ _("path", {
        fill: "#34A853",
        d: "M2.2 12c0 2 .8 3.8 2.1 5.1l3.4-2.6c-.9-.7-1.5-1.8-1.5-3.1s.5-2.4 1.5-3.1L4.3 5.7C3 7 2.2 9.1 2.2 12Z",
      }),
      /* @__PURE__ */ _("path", {
        fill: "#FBBC05",
        d: "M12 21.8c2.7 0 4.9-.9 6.5-2.5l-3.2-2.5c-.9.6-2 1-3.3 1-2.5 0-4.6-1.7-5.4-4l-3.4 2.6c1.7 3.2 5 5.4 8.8 5.4Z",
      }),
      /* @__PURE__ */ _("path", {
        fill: "#4285F4",
        d: "M18.5 19.3c1.9-1.8 2.7-4.4 2.7-6.6 0-.7-.1-1.2-.2-1.7H12v3.9h5.4c-.3 1.5-1.1 2.8-2.3 3.7l3.4 2.7Z",
      })
    );
  }
  function AppleIcon() {
    return /* @__PURE__ */ _(
      "svg",
      {
        width: "18",
        height: "18",
        viewBox: "0 0 24 24",
        "aria-hidden": "true",
      },
      /* @__PURE__ */ _("path", {
        fill: "#111",
        d: "M16.7 12.8c0-2.1 1.8-3.1 1.9-3.2-1-1.5-2.7-1.7-3.3-1.7-1.4-.1-2.8.9-3.5.9-.8 0-1.9-.9-3.1-.9-1.6 0-3 .9-3.9 2.2-1.7 2.9-.4 7.2 1.2 9.4.8 1.1 1.7 2.4 2.9 2.3 1.1 0 1.6-.7 3-.7 1.5 0 1.9.7 3 .7 1.2 0 2-.9 2.8-2 .9-1.3 1.3-2.5 1.3-2.6-.1 0-2.3-.9-2.3-4.4Zm-2.3-6.3c.6-.8 1-1.8.9-2.9-.9 0-2.1.6-2.8 1.4-.6.7-1.1 1.8-.9 2.8 1 0 2.1-.5 2.8-1.3Z",
      })
    );
  }
  function MicrosoftIcon() {
    return /* @__PURE__ */ _(
      "svg",
      {
        width: "18",
        height: "18",
        viewBox: "0 0 24 24",
        "aria-hidden": "true",
      },
      /* @__PURE__ */ _("path", { fill: "#F25022", d: "M3 3h8.6v8.6H3z" }),
      /* @__PURE__ */ _("path", { fill: "#7FBA00", d: "M12.4 3H21v8.6h-8.6z" }),
      /* @__PURE__ */ _("path", { fill: "#00A4EF", d: "M3 12.4h8.6V21H3z" }),
      /* @__PURE__ */ _("path", {
        fill: "#FFB900",
        d: "M12.4 12.4H21V21h-8.6z",
      })
    );
  }
  function Auth({ onSuccess, onCancel }) {
    const oauthStartInFlightRef = A2(false);
    const [mode, setMode] = d2("signup");
    const [email, setEmail] = d2("");
    const [password, setPassword] = d2("");
    const [oauthLoading, setOauthLoading] = d2(false);
    const [loading, setLoading] = d2(false);
    const [error, setError] = d2(null);
    const [successMessage, setSuccessMessage] = d2(null);
    y2(() => {
      const handleAuthError = event => {
        const detail = event.detail;
        const message =
          (detail == null ? void 0 : detail.description) ||
          (detail == null ? void 0 : detail.error);
        if (message) {
          setError(message);
          setSuccessMessage(null);
        }
      };
      window.addEventListener("oasis-auth-error", handleAuthError);
      return () => {
        window.removeEventListener("oasis-auth-error", handleAuthError);
      };
    }, []);
    const handleOAuthStart = async providerMethod => {
      var _a, _b, _c;
      if (oauthStartInFlightRef.current) {
        return;
      }
      oauthStartInFlightRef.current = true;
      setError(null);
      setSuccessMessage(null);
      setOauthLoading(true);
      const authService = window.supabaseAuth;
      if (!authService) {
        setError("Auth service not available");
        oauthStartInFlightRef.current = false;
        setOauthLoading(false);
        return;
      }
      try {
        const result = await authService[providerMethod]();
        const message =
          ((_a = result == null ? void 0 : result.error) == null
            ? void 0
            : _a.message) || "";
        const prefix = [
          "GOOGLE_OAUTH_URL:",
          "AZURE_OAUTH_URL:",
          "APPLE_OAUTH_URL:",
        ].find(value => message.startsWith(value));
        if (prefix) {
          const url = message.slice(prefix.length);
          const opened =
            (_c =
              (_b = window.assistantBridge) == null ? void 0 : _b.openTab) ==
            null
              ? void 0
              : _c.call(_b, url);
          if (!opened) {
            setError("Failed to open the OAuth tab. Please try again.");
          } else {
            setSuccessMessage(
              "Finish sign-in in the opened tab. Oasis will complete sign-in automatically."
            );
          }
          setOauthLoading(false);
          return;
        }
        if (result == null ? void 0 : result.error) {
          const errorMessage = authService.handleAuthError
            ? authService.handleAuthError(result.error)
            : result.error.message || "An error occurred";
          setError(errorMessage);
        } else if (result == null ? void 0 : result.user) {
          onSuccess();
        }
      } catch (err) {
        const errorMessage = authService.handleAuthError
          ? authService.handleAuthError(err)
          : err.message || "An error occurred";
        setError(errorMessage);
      } finally {
        oauthStartInFlightRef.current = false;
        setOauthLoading(false);
      }
    };
    const handleSubmit = async e3 => {
      e3.preventDefault();
      setError(null);
      setSuccessMessage(null);
      setLoading(true);
      const authService = window.supabaseAuth;
      if (!authService) {
        setError("Auth service not available");
        setLoading(false);
        return;
      }
      try {
        let result;
        if (mode === "signup") {
          result = await authService.signUp(email, password);
        } else if (mode === "signin") {
          result = await authService.signInWithEmail(email, password);
        } else if (mode === "forgotPassword") {
          result = await authService.resetPasswordForEmail(email);
          if (!result.error) {
            setSuccessMessage(
              "Password reset email sent. Please check your inbox."
            );
            setLoading(false);
            return;
          }
        }
        const { user, error: apiError } = result;
        if (apiError) {
          const errorMessage = authService.handleAuthError
            ? authService.handleAuthError(apiError)
            : apiError.message || "An error occurred";
          setError(errorMessage);
          return;
        }
        if (user) {
          onSuccess();
        } else if (mode === "signup") {
          setError("Please check your email for a confirmation link.");
        }
      } catch (err) {
        const errorMessage = (
          authService == null ? void 0 : authService.handleAuthError
        )
          ? authService.handleAuthError(err)
          : err.message || "An error occurred";
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };
    const getTitle = () => {
      switch (mode) {
        case "signup":
          return "Create Account";
        case "signin":
          return "Welcome Back";
        case "forgotPassword":
          return "Reset Password";
      }
    };
    const getSubtitle = () => {
      switch (mode) {
        case "signup":
          return "Sign up to sync your tabs and history.";
        case "signin":
          return "Sign in to your Oasis account.";
        case "forgotPassword":
          return "Enter your email to receive a reset link.";
      }
    };
    const getButtonText = () => {
      if (loading) return "Processing...";
      switch (mode) {
        case "signup":
          return "Sign Up";
        case "signin":
          return "Sign In";
        case "forgotPassword":
          return "Send Reset Link";
      }
    };
    return /* @__PURE__ */ _(
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
      /* @__PURE__ */ _(
        "div",
        { style: { textAlign: "center" } },
        /* @__PURE__ */ _(
          "h2",
          {
            style: {
              fontSize: "24px",
              fontWeight: 600,
              color: "#7A9200",
              margin: "0 0 8px 0",
            },
          },
          getTitle()
        ),
        /* @__PURE__ */ _(
          "p",
          { style: { color: "#666", margin: 0 } },
          getSubtitle()
        )
      ),
      mode !== "forgotPassword" &&
        /* @__PURE__ */ _(
          "div",
          {
            style: {
              width: "100%",
              maxWidth: "320px",
              display: "flex",
              gap: "12px",
            },
          },
          /* @__PURE__ */ _(
            "button",
            {
              type: "button",
              "aria-label": "Continue with Google",
              onClick: () => handleOAuthStart("signInWithGoogle"),
              disabled: oauthLoading,
              style: {
                flex: 1,
                height: "44px",
                borderRadius: "999px",
                border: "1px solid #d9dfc8",
                background: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: oauthLoading ? "wait" : "pointer",
                outlineOffset: "2px",
              },
            },
            /* @__PURE__ */ _(GoogleIcon, null)
          ),
          /* @__PURE__ */ _(
            "button",
            {
              type: "button",
              "aria-label": "Continue with Apple",
              onClick: () => handleOAuthStart("signInWithApple"),
              disabled: oauthLoading,
              style: {
                flex: 1,
                height: "44px",
                borderRadius: "999px",
                border: "1px solid #d9dfc8",
                background: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: oauthLoading ? "wait" : "pointer",
                outlineOffset: "2px",
              },
            },
            /* @__PURE__ */ _(AppleIcon, null)
          ),
          /* @__PURE__ */ _(
            "button",
            {
              type: "button",
              "aria-label": "Continue with Microsoft",
              onClick: () => handleOAuthStart("signInWithAzure"),
              disabled: oauthLoading,
              style: {
                flex: 1,
                height: "44px",
                borderRadius: "999px",
                border: "1px solid #d9dfc8",
                background: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: oauthLoading ? "wait" : "pointer",
                outlineOffset: "2px",
              },
            },
            /* @__PURE__ */ _(MicrosoftIcon, null)
          )
        ),
      /* @__PURE__ */ _(
        "form",
        {
          onSubmit: handleSubmit,
          style: {
            width: "100%",
            maxWidth: "320px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          },
        },
        /* @__PURE__ */ _(
          "div",
          null,
          /* @__PURE__ */ _(
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
          /* @__PURE__ */ _("input", {
            type: "email",
            value: email,
            onInput: e3 => setEmail(e3.target.value),
            required: true,
            className: "input-field",
            style: {
              width: "100%",
              boxSizing: "border-box",
              background: "white",
              border: "1px solid #e0e0e0",
            },
          })
        ),
        mode !== "forgotPassword" &&
          /* @__PURE__ */ _(
            "div",
            null,
            /* @__PURE__ */ _(
              "div",
              {
                style: {
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "6px",
                },
              },
              /* @__PURE__ */ _(
                "label",
                { style: { fontSize: "13px", fontWeight: 500, color: "#333" } },
                "Password"
              ),
              mode === "signin" &&
                /* @__PURE__ */ _(
                  "button",
                  {
                    type: "button",
                    onClick: () => {
                      setMode("forgotPassword");
                      setError(null);
                      setSuccessMessage(null);
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
            /* @__PURE__ */ _("input", {
              type: "password",
              value: password,
              onInput: e3 => setPassword(e3.target.value),
              required: true,
              className: "input-field",
              style: {
                width: "100%",
                boxSizing: "border-box",
                background: "white",
                border: "1px solid #e0e0e0",
              },
            })
          ),
        error &&
          /* @__PURE__ */ _(
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
            error
          ),
        successMessage &&
          /* @__PURE__ */ _(
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
            successMessage
          ),
        /* @__PURE__ */ _(
          "button",
          {
            type: "submit",
            disabled: loading,
            style: {
              background: "#7A9200",
              color: "white",
              border: "none",
              padding: "12px",
              borderRadius: "12px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: loading ? "wait" : "pointer",
              opacity: loading ? 0.7 : 1,
              marginTop: "8px",
            },
          },
          getButtonText()
        )
      ),
      /* @__PURE__ */ _(
        "div",
        { style: { fontSize: "13px", color: "#666" } },
        mode === "forgotPassword"
          ? /* @__PURE__ */ _(
              "button",
              {
                onClick: () => {
                  setMode("signin");
                  setError(null);
                  setSuccessMessage(null);
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
          : /* @__PURE__ */ _(
              k,
              null,
              mode === "signup"
                ? "Already have an account? "
                : "Don't have an account? ",
              /* @__PURE__ */ _(
                "button",
                {
                  onClick: () => {
                    setMode(mode === "signup" ? "signin" : "signup");
                    setError(null);
                    setSuccessMessage(null);
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
                mode === "signup" ? "Sign In" : "Sign Up"
              )
            )
      ),
      /* @__PURE__ */ _(
        "button",
        {
          onClick: onCancel,
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

  // src/components/Feedback.tsx
  function Feedback({ messageId, onClose }) {
    const [showForm, setShowForm] = d2(false);
    const [selectedBadges, setSelectedBadges] = d2([]);
    const [comment, setComment] = d2("");
    const [includeContext, setIncludeContext] = d2(true);
    const [contactMe, setContactMe] = d2(false);
    const [submitted, setSubmitted] = d2(false);
    const [isSubmitting, setIsSubmitting] = d2(false);
    const badges = [
      "Didn't work",
      "Wrong result",
      "Too slow",
      "Safety concern",
      "Confusing",
      "Suggestion",
      "Other",
    ];
    const toggleBadge = badge => {
      setSelectedBadges(prev =>
        prev.includes(badge) ? prev.filter(b => b !== badge) : [...prev, badge]
      );
    };
    const mpTrack = (event, props = {}) => {
      if (window.mpTrack) {
        window.mpTrack(event, props);
      }
    };
    const showFeedbackMessage = (message, isError = false) => {
      console.log(`[Feedback] ${isError ? "Error: " : "Success: "}${message}`);
    };
    const submitToSupabase = async (isNegative, category, additionalInfo) => {
      var _a, _b, _c;
      const supabase =
        (_a = window.supabaseAuth) == null ? void 0 : _a.supabase;
      const sessionId =
        ((_c =
          (_b = window.supabaseAuth) == null ? void 0 : _b.currentSession) ==
        null
          ? void 0
          : _c.session_id) || null;
      if (!supabase) {
        showFeedbackMessage("Feedback service unavailable.", true);
        return false;
      }
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          showFeedbackMessage("Please sign in to submit feedback.", true);
          return false;
        }
        const payload = {
          user_id: user.id,
          session_id: sessionId,
          message_id: messageId,
          reported_at: /* @__PURE__ */ new Date().toISOString(),
          negative_rating: isNegative,
          category,
          additional_info: JSON.stringify({
            badges: selectedBadges,
            comment: additionalInfo,
            include_context: includeContext,
            contact_me: contactMe,
          }),
        };
        const { error } = await supabase
          .from("feedback_events")
          .insert(payload);
        if (error) {
          console.error("Feedback insert failed:", error);
          mpTrack("feedback_submit_error", {
            message: error.message || String(error),
          });
          showFeedbackMessage("Failed to submit feedback.", true);
          return false;
        }
        mpTrack("feedback_submit_success", {
          negative_rating: isNegative,
          category,
        });
        return true;
      } catch (err) {
        console.error("Feedback submission exception:", err);
        return false;
      }
    };
    const handleThumbUp = async () => {
      mpTrack("feedback_thumb_up", { messageId });
      setIsSubmitting(true);
      const success = await submitToSupabase(false, "Helpful", "");
      if (success) {
        setSubmitted(true);
        setTimeout(() => setSubmitted(false), 3e3);
      }
      setIsSubmitting(false);
    };
    const handleSubmit = async () => {
      if (selectedBadges.length === 0 && !comment.trim()) {
        return;
      }
      setIsSubmitting(true);
      const category = selectedBadges.length > 0 ? selectedBadges[0] : "Other";
      const success = await submitToSupabase(true, category, comment.trim());
      if (success) {
        setSubmitted(true);
        setTimeout(() => {
          if (onClose) onClose();
          setShowForm(false);
          setSubmitted(false);
          setSelectedBadges([]);
          setComment("");
        }, 2e3);
      }
      setIsSubmitting(false);
    };
    if (submitted) {
      return /* @__PURE__ */ _(
        "div",
        { className: "feedback-submitted" },
        "Thanks for your feedback!"
      );
    }
    return /* @__PURE__ */ _(
      "div",
      { className: "feedback-container" },
      !showForm
        ? /* @__PURE__ */ _(
            "div",
            { className: "feedback-options" },
            /* @__PURE__ */ _(
              "span",
              { className: "feedback-label" },
              "Did we get it right?"
            ),
            /* @__PURE__ */ _(
              "button",
              {
                className: "feedback-btn thumbs-up",
                onClick: handleThumbUp,
                disabled: isSubmitting,
                title: "Thumbs Up",
              },
              /* @__PURE__ */ _(
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
                /* @__PURE__ */ _("path", {
                  d: "M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3",
                })
              )
            ),
            /* @__PURE__ */ _(
              "button",
              {
                className: "feedback-btn thumbs-down",
                onClick: () => {
                  setShowForm(true);
                  mpTrack("feedback_thumb_down", { messageId });
                },
                disabled: isSubmitting,
                title: "Thumbs Down",
              },
              /* @__PURE__ */ _(
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
                /* @__PURE__ */ _("path", {
                  d: "M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zM17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3",
                })
              )
            )
          )
        : /* @__PURE__ */ _(
            "div",
            { className: "feedback-modal" },
            /* @__PURE__ */ _(
              "div",
              { className: "feedback-header" },
              /* @__PURE__ */ _("span", null, "Help us improve Oasis"),
              /* @__PURE__ */ _(
                "button",
                {
                  className: "feedback-close-btn",
                  onClick: () => setShowForm(false),
                },
                /* @__PURE__ */ _(
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
                  /* @__PURE__ */ _("line", {
                    x1: "18",
                    y1: "6",
                    x2: "6",
                    y2: "18",
                  }),
                  /* @__PURE__ */ _("line", {
                    x1: "6",
                    y1: "6",
                    x2: "18",
                    y2: "18",
                  })
                )
              )
            ),
            /* @__PURE__ */ _(
              "div",
              { className: "feedback-badges" },
              badges.map(badge =>
                /* @__PURE__ */ _(
                  "button",
                  {
                    key: badge,
                    className: `feedback-badge ${selectedBadges.includes(badge) ? "selected" : ""}`,
                    onClick: () => toggleBadge(badge),
                  },
                  badge,
                  selectedBadges.includes(badge) &&
                    /* @__PURE__ */ _(
                      "span",
                      { className: "badge-remove" },
                      /* @__PURE__ */ _(
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
                        /* @__PURE__ */ _("line", {
                          x1: "18",
                          y1: "6",
                          x2: "6",
                          y2: "18",
                        }),
                        /* @__PURE__ */ _("line", {
                          x1: "6",
                          y1: "6",
                          x2: "18",
                          y2: "18",
                        })
                      )
                    )
                )
              )
            ),
            /* @__PURE__ */ _(
              "div",
              { className: "feedback-input-container" },
              /* @__PURE__ */ _("textarea", {
                className: "feedback-textarea",
                placeholder: "Ask me anything...",
                value: comment,
                onInput: e3 => setComment(e3.target.value),
              })
            ),
            /* @__PURE__ */ _(
              "div",
              { className: "feedback-checkboxes" },
              /* @__PURE__ */ _(
                "label",
                { className: "feedback-checkbox-label" },
                /* @__PURE__ */ _("input", {
                  type: "checkbox",
                  checked: includeContext,
                  onChange: () => setIncludeContext(!includeContext),
                }),
                /* @__PURE__ */ _(
                  "span",
                  null,
                  "Include chat context (helps us fix issues faster)"
                )
              ),
              /* @__PURE__ */ _(
                "label",
                { className: "feedback-checkbox-label" },
                /* @__PURE__ */ _("input", {
                  type: "checkbox",
                  checked: contactMe,
                  onChange: () => setContactMe(!contactMe),
                }),
                /* @__PURE__ */ _(
                  "span",
                  null,
                  "Contact me if this needs a quick follow-up"
                )
              )
            ),
            /* @__PURE__ */ _(
              "div",
              { className: "feedback-footer" },
              /* @__PURE__ */ _(
                "button",
                {
                  className: "feedback-submit-btn",
                  onClick: handleSubmit,
                  disabled:
                    isSubmitting ||
                    (selectedBadges.length === 0 && !comment.trim()),
                  style: {
                    opacity:
                      isSubmitting ||
                      (selectedBadges.length === 0 && !comment.trim())
                        ? 0.6
                        : 1,
                  },
                },
                isSubmitting ? "Submitting..." : "Submit Feedback"
              )
            )
          )
    );
  }

  // src/toolLabels.ts
  var TOOL_LABELS = {
    // Assistant stream / generic
    runAssistantStream: "Analyzing tabs",
    // Commands (from build/src/commands.ts)
    list_tabs: "Listing tabs",
    new_window: "Opening new window",
    organize_windows: "Organizing windows",
    show_url: "Opening URL",
    open_tab: "Opening tab",
    close_tab: "Closing tab",
    move_tab_to_new_window: "Moving tab to new window",
    copy_tab_urls: "Copying tab URLs",
    // Hub/bookmark related
    create_hub: "Creating hub",
    delete_hub: "Deleting hub",
    list_hubs: "Listing hubs",
    rename_hub: "Renaming hub",
    add_tab_to_hub: "Adding tab to hub",
    remove_tab_from_hub: "Removing tab from hub",
    open_hub: "Opening hub",
    split_tabs: "Splitting tabs",
    // Other helpers
    search_memory: "Searching memory",
    show_subscription: "Showing subscription",
    // UI/bridge actions
    openTab: "Opening tab",
    createTabGroup: "Creating tab group",
    addTabsToGroup: "Adding tabs to group",
    syncTabs: "Syncing tabs",
  };
  var toolLabels_default = TOOL_LABELS;

  // src/App.tsx
  function ToolActionsGroup({ actions }) {
    const [open, setOpen] = d2(true);
    const anyRunning = actions.some(
      a3 => a3.status === "running" || a3.status === "pending"
    );
    const anyError = actions.some(a3 => a3.status === "error");
    if (actions.length === 0) return null;
    return /* @__PURE__ */ _(
      "div",
      {
        className: "tool-actions-group",
        style: { margin: "8px 0 4px 0", paddingLeft: "4px" },
      },
      /* @__PURE__ */ _(
        "div",
        {
          onClick: () => setOpen(!open),
          style: {
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
            color: "#999",
            fontSize: "12px",
            gap: "4px",
            userSelect: "none",
            marginBottom: open ? "4px" : "0",
          },
        },
        /* @__PURE__ */ _("span", { style: { fontWeight: 400 } }, "Steps"),
        /* @__PURE__ */ _(
          "svg",
          {
            width: "10",
            height: "10",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            style: {
              transform: open ? "rotate(0deg)" : "rotate(-90deg)",
              transition: "transform 0.2s",
              opacity: 0.6,
            },
          },
          /* @__PURE__ */ _("path", { d: "M6 9l6 6 6-6" })
        )
      ),
      open &&
        /* @__PURE__ */ _(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "4px" } },
          actions.map(a3 =>
            /* @__PURE__ */ _(
              "div",
              {
                key: a3.id,
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  color: "#999",
                  fontSize: "13px",
                },
              },
              /* @__PURE__ */ _(
                "div",
                {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "14px",
                  },
                },
                a3.status === "running" || a3.status === "pending"
                  ? /* @__PURE__ */ _(
                      "svg",
                      { width: "10", height: "10", viewBox: "0 0 50 50" },
                      /* @__PURE__ */ _("circle", {
                        cx: "25",
                        cy: "25",
                        r: "20",
                        stroke: "#999",
                        strokeWidth: "4",
                        fill: "none",
                        opacity: "0.2",
                      }),
                      /* @__PURE__ */ _(
                        "circle",
                        {
                          cx: "25",
                          cy: "25",
                          r: "20",
                          stroke: "#999",
                          strokeWidth: "4",
                          fill: "none",
                          strokeDasharray: "31.4 94.2",
                          strokeLinecap: "round",
                        },
                        /* @__PURE__ */ _("animateTransform", {
                          attributeName: "transform",
                          type: "rotate",
                          from: "0 25 25",
                          to: "360 25 25",
                          dur: "1s",
                          repeatCount: "indefinite",
                        })
                      )
                    )
                  : a3.status === "done"
                    ? /* @__PURE__ */ _(
                        "svg",
                        {
                          width: "10",
                          height: "10",
                          viewBox: "0 0 24 24",
                          fill: "none",
                          stroke: "#999",
                          strokeWidth: "3",
                          strokeLinecap: "round",
                          strokeLinejoin: "round",
                        },
                        /* @__PURE__ */ _("polyline", {
                          points: "20 6 9 17 4 12",
                        })
                      )
                    : /* @__PURE__ */ _(
                        "svg",
                        {
                          width: "10",
                          height: "10",
                          viewBox: "0 0 24 24",
                          fill: "none",
                          stroke: "#d32f2f",
                          strokeWidth: "3",
                          strokeLinecap: "round",
                          strokeLinejoin: "round",
                        },
                        /* @__PURE__ */ _("line", {
                          x1: "18",
                          y1: "6",
                          x2: "6",
                          y2: "18",
                        }),
                        /* @__PURE__ */ _("line", {
                          x1: "6",
                          y1: "6",
                          x2: "18",
                          y2: "18",
                        })
                      )
              ),
              /* @__PURE__ */ _(
                "span",
                {
                  style: {
                    opacity: a3.status === "done" ? 0.7 : 1,
                    fontWeight: a3.status === "running" ? 500 : 400,
                  },
                },
                a3.label || a3.output || a3.name
              )
            )
          )
        )
    );
  }
  function Banner({ email, onClose }) {
    return /* @__PURE__ */ _(
      "div",
      { className: "signed-in-banner" },
      /* @__PURE__ */ _(
        "div",
        { className: "banner-content" },
        /* @__PURE__ */ _(
          "span",
          { className: "banner-label" },
          "Signed in as"
        ),
        /* @__PURE__ */ _("span", { className: "banner-email" }, email)
      ),
      /* @__PURE__ */ _(
        "button",
        { className: "banner-close", onClick: onClose, title: "Close" },
        /* @__PURE__ */ _(
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
          /* @__PURE__ */ _("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
          /* @__PURE__ */ _("line", { x1: "6", y1: "6", x2: "18", y2: "18" })
        )
      )
    );
  }
  function ConfirmationModal({ data, onConfirm, onCancel }) {
    return /* @__PURE__ */ _(
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
      /* @__PURE__ */ _(
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
        /* @__PURE__ */ _(
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
          /* @__PURE__ */ _(
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
            /* @__PURE__ */ _("path", {
              d: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
            })
          )
        ),
        /* @__PURE__ */ _(
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
        /* @__PURE__ */ _(
          "p",
          { style: { margin: "0 0 16px 0", fontSize: "14px", color: "#666" } },
          data.description
        ),
        /* @__PURE__ */ _(
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
          data.command
        ),
        /* @__PURE__ */ _(
          "div",
          { style: { display: "flex", gap: "12px" } },
          /* @__PURE__ */ _(
            "button",
            {
              onClick: onCancel,
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
          /* @__PURE__ */ _(
            "button",
            {
              onClick: onConfirm,
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
  var recordStartRelay = null;
  var recordUpdateRelay = null;
  var resetAssistantSessionRelay = null;
  var pendingConfirmationRelay = null;
  var originalResetAssistantSession = window.resetAssistantSession;
  window.oasisRecordToolActionStart = (name, messageId, label) => {
    return recordStartRelay == null
      ? void 0
      : recordStartRelay(name, messageId, label);
  };
  window.oasisRecordToolActionUpdate = (id, status, output) => {
    return recordUpdateRelay == null
      ? void 0
      : recordUpdateRelay(id, status, output);
  };
  window.resetAssistantSession = () => {
    if (resetAssistantSessionRelay) {
      return resetAssistantSessionRelay();
    }
    return originalResetAssistantSession == null
      ? void 0
      : originalResetAssistantSession();
  };
  window.oasisSetPendingConfirmationRelay = data => {
    if (pendingConfirmationRelay) {
      pendingConfirmationRelay(data);
    }
  };
  function App() {
    var _a;
    const [messages, setMessages] = d2([]);
    const [input, setInput] = d2("");
    const [busy, setBusy] = d2(false);
    const [isRecording, setIsRecording] = d2(false);
    const [toolActions, setToolActions] = d2([]);
    const [auth, setAuth] = d2({ isAuthenticated: false, user: null });
    const [view, setView] = d2("chat");
    const [bannerVisible, setBannerVisible] = d2(true);
    const [pendingConfirmation, setPendingConfirmation] = d2(null);
    const logRef = A2(null);
    const resetAssistantSession = async () => {
      console.log("Resetting assistant session (UI + Backend)");
      setMessages([]);
      setToolActions([]);
      if (typeof originalResetAssistantSession === "function") {
        try {
          originalResetAssistantSession();
        } catch (e3) {
          console.error("Failed to call originalResetAssistantSession", e3);
        }
      }
      const setHistory = window.setAssistantHistory;
      if (typeof setHistory === "function") {
        await setHistory([]);
      }
    };
    y2(() => {
      recordStartRelay = startToolAction;
      recordUpdateRelay = updateToolAction;
      resetAssistantSessionRelay = resetAssistantSession;
      pendingConfirmationRelay = setPendingConfirmation;
      return () => {
        recordStartRelay = null;
        recordUpdateRelay = null;
        resetAssistantSessionRelay = null;
        pendingConfirmationRelay = null;
      };
    }, []);
    y2(() => {
      var _a2;
      const updateFromGlobal = e3 => {
        const eventDetail = e3 == null ? void 0 : e3.detail;
        const globalState = eventDetail || window.oasisAuthState;
        if (globalState && globalState.isAuthenticated !== void 0) {
          setAuth(prev => {
            var _a3, _b, _c, _d;
            if (
              prev.isAuthenticated === globalState.isAuthenticated &&
              ((_a3 = prev.user) == null ? void 0 : _a3.id) ===
                ((_b = globalState.user) == null ? void 0 : _b.id)
            ) {
              return prev;
            }
            if (
              ((_c = prev.user) == null ? void 0 : _c.id) !==
              ((_d = globalState.user) == null ? void 0 : _d.id)
            ) {
              setBannerVisible(true);
            }
            return {
              isAuthenticated: !!globalState.isAuthenticated,
              user: globalState.user,
            };
          });
          if (globalState.isAuthenticated) setView("chat");
        }
      };
      const checkAuth = async (retryCount = 0) => {
        let globalState = window.oasisAuthState;
        if (globalState && globalState.isAuthenticated) {
          setAuth({ isAuthenticated: true, user: globalState.user });
          setView("chat");
          return;
        }
        if (
          window.assistantBridge &&
          typeof window.assistantBridge.ensureSessionRestored === "function"
        ) {
          try {
            globalState = await window.assistantBridge.ensureSessionRestored();
            if (globalState && globalState.isAuthenticated) {
              setAuth({ isAuthenticated: true, user: globalState.user });
              setView("chat");
              return;
            }
          } catch (e3) {
            console.warn("Failed to ensure session restoration:", e3);
          }
        }
        if (window.supabaseAuth) {
          try {
            await new Promise(resolve => setTimeout(resolve, 200));
            const isAuth = await window.supabaseAuth.isAuthenticated();
            if (isAuth) {
              const user = await window.supabaseAuth.getCurrentUser();
              if (user) {
                if (!window.oasisAuthState) {
                  window.oasisAuthState = { isAuthenticated: true, user };
                }
                setAuth({ isAuthenticated: true, user });
                setView("chat");
                return;
              }
            }
            if (retryCount < 5 && !globalState) {
              setTimeout(() => checkAuth(retryCount + 1), 500);
            }
          } catch (e3) {
            console.error("Auth check failed:", e3);
            if (retryCount < 3) {
              setTimeout(() => checkAuth(retryCount + 1), 500);
            }
          }
        } else {
          if (retryCount < 10) {
            setTimeout(() => checkAuth(retryCount + 1), 200);
          }
        }
      };
      checkAuth();
      window.addEventListener("oasis-auth-update", e3 => updateFromGlobal(e3));
      window.addEventListener("oasis-history-update", loadHistory);
      const handleConfirmationUpdate = e3 => {
        const detail = e3.detail;
        setPendingConfirmation(detail);
      };
      window.addEventListener(
        "oasis-confirmation-update",
        handleConfirmationUpdate
      );
      if (
        (_a2 = window.supabaseAuth) == null ? void 0 : _a2.onAuthStateChange
      ) {
        window.supabaseAuth.onAuthStateChange(state => {
          setAuth({
            isAuthenticated: !!state.isAuthenticated,
            user: state.user,
          });
          if (state.isAuthenticated) {
            setView("chat");
            setBannerVisible(true);
          }
        });
      }
      const pollTimer = setTimeout(() => {
        checkAuth();
      }, 1500);
      const loadHistory = () => {
        try {
          const getHistory = window.getAssistantHistory;
          if (typeof getHistory === "function") {
            const history = getHistory();
            if (Array.isArray(history)) {
              const formatted = history.map((m3, idx) => {
                var _a3;
                return {
                  id: m3.id || `hist-${idx}-${m3.role || "msg"}`,
                  role:
                    m3.type === "human" ||
                    ((_a3 = m3.id) == null ? void 0 : _a3.includes("Human")) ||
                    m3.constructor.name === "HumanMessage"
                      ? "user"
                      : "ai",
                  content:
                    m3.content ||
                    (m3.lc_kwargs ? m3.lc_kwargs.content : "") ||
                    "",
                };
              });
              setMessages(formatted);
            }
          }
        } catch (e3) {
          console.error("Failed to load history:", e3);
        }
      };
      loadHistory();
      setTimeout(loadHistory, 500);
      return () => {
        window.removeEventListener("oasis-auth-update", updateFromGlobal);
        window.removeEventListener("oasis-history-update", loadHistory);
        window.removeEventListener(
          "oasis-confirmation-update",
          handleConfirmationUpdate
        );
        clearTimeout(pollTimer);
      };
    }, []);
    function uuid() {
      try {
        if (typeof crypto !== "undefined" && crypto.randomUUID) {
          return crypto.randomUUID();
        }
      } catch (e3) {}
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
        /[xy]/g,
        function (c3) {
          const r3 = (Math.random() * 16) | 0;
          const v3 = c3 === "x" ? r3 : (r3 & 3) | 8;
          return v3.toString(16);
        }
      );
    }
    function prettifyToolName(name) {
      if (!name) return "";
      if (name.includes(" ")) return name;
      const spaced = name
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");
      return spaced.charAt(0).toUpperCase() + spaced.slice(1);
    }
    const startToolAction = (name, messageId, label) => {
      const id = uuid();
      console.log(
        `\u{1F6E0}\uFE0F startToolAction: name=${name}, messageId=${messageId}, id=${id}`
      );
      const display =
        label || toolLabels_default[name] || prettifyToolName(name);
      setToolActions(prev => {
        const added = [
          ...prev,
          { id, name, status: "running", messageId, label: display },
        ];
        if (messageId && name !== "runAssistantStream") {
          return added.map(a3 =>
            a3.messageId === messageId && a3.name === "runAssistantStream"
              ? { ...a3, status: "done" }
              : a3
          );
        }
        return added;
      });
      return id;
    };
    const updateToolAction = (id, status, output) => {
      console.log(
        `\u{1F6E0}\uFE0F updateToolAction: id=${id}, status=${status}, output=${output == null ? void 0 : output.substring(0, 30)}`
      );
      setToolActions(prev =>
        prev.map(a3 =>
          a3.id === id
            ? { ...a3, status, output: output != null ? output : a3.output }
            : a3
        )
      );
    };
    y2(() => {
      if (logRef.current) {
        logRef.current.scrollTop = logRef.current.scrollHeight;
      }
    }, [messages]);
    const onChunk = text => {
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.role === "ai") {
          return [
            ...prev.slice(0, -1),
            { ...last, content: last.content + text },
          ];
        } else {
          return [...prev, { id: uuid(), role: "ai", content: text }];
        }
      });
    };
    async function send(textInput) {
      const text = textInput || input;
      if (!text.trim()) return;
      if (!auth.isAuthenticated) {
        setMessages(m3 => [
          ...m3,
          {
            id: uuid(),
            role: "ai",
            content: "Please sign in to use the assistant.",
          },
        ]);
        return;
      }
      setInput("");
      setBusy(true);
      setToolActions([]);
      const userMsgId = uuid();
      setMessages(m3 => [
        ...m3,
        { id: userMsgId, role: "user", content: text },
      ]);
      try {
        const run = window.runAssistantStream;
        if (typeof run === "function") {
          const aiMsgId = uuid();
          startToolAction("runAssistantStream", aiMsgId, "Thinking...");
          setMessages(m3 => [...m3, { id: aiMsgId, role: "ai", content: "" }]);
          try {
            await run(
              text,
              chunk => {
                setMessages(prev => {
                  const idx = prev.findIndex(msg => msg.id === aiMsgId);
                  if (idx !== -1) {
                    const updated = [...prev];
                    updated[idx] = {
                      ...updated[idx],
                      content: updated[idx].content + chunk,
                    };
                    return updated;
                  }
                  return prev;
                });
              },
              "text",
              aiMsgId
            );
          } catch (e3) {
            console.error("Stream error:", e3);
            throw e3;
          }
        } else {
          const aiMsgId = uuid();
          setMessages(m3 => [
            ...m3,
            {
              id: aiMsgId,
              role: "ai",
              content: "(runAssistantStream not available)",
            },
          ]);
        }
      } catch (e3) {
        setMessages(m3 => [
          ...m3,
          { id: uuid(), role: "ai", content: "Error: " + String(e3) },
        ]);
      } finally {
        setBusy(false);
      }
    }
    const handleKeyDown = e3 => {
      if (e3.key === "Enter" && !e3.shiftKey) {
        e3.preventDefault();
        send();
      }
    };
    const toggleRecording = async () => {
      const service = window.voiceInputService;
      if (!service) {
        alert("Voice input service not available.");
        return;
      }
      if (isRecording) {
        try {
          const text = await service.stopRecording();
          setIsRecording(false);
          if (text) setInput(text);
        } catch (e3) {
          console.error("Error stopping recording:", e3);
          setIsRecording(false);
        }
      } else {
        try {
          await service.startRecording();
          setIsRecording(true);
        } catch (e3) {
          console.error("Error starting recording:", e3);
        }
      }
    };
    const handleResizeStart = e3 => {
      e3.preventDefault();
      e3.stopPropagation();
      try {
        window.parent.postMessage(
          {
            type: "oasisOverlayResizeStart",
            screenX: e3.screenX,
            screenY: e3.screenY,
          },
          "*"
        );
      } catch (err) {}
    };
    const handleFeedback = () => {
      const feedbackUrl = "https://tally.so/r/3jkNN6";
      if (typeof window.openWebLinkIn === "function") {
        window.openWebLinkIn(feedbackUrl, "tab", {});
      } else if (window.top && window.top.openWebLinkIn) {
        window.top.openWebLinkIn(feedbackUrl, "tab", {});
      } else {
        window.open(feedbackUrl, "_blank");
      }
    };
    const handleLinkClick = e3 => {
      var _a2;
      const target = e3.target;
      const anchor = target.closest("a");
      if (anchor && anchor.href && !anchor.href.startsWith("javascript:")) {
        e3.preventDefault();
        const url = anchor.href;
        if ((_a2 = window.assistantBridge) == null ? void 0 : _a2.openTab) {
          window.assistantBridge.openTab(url);
        } else {
          window.open(url, "_blank");
        }
      }
    };
    const userEmail =
      ((_a = auth.user) == null ? void 0 : _a.email) ||
      (typeof auth.user === "string" ? auth.user : "");
    const handleConfirmationApprove = async () => {
      setPendingConfirmation(null);
      setBusy(true);
      try {
        const run = window.runAssistantStream;
        if (typeof run === "function") {
          const aiMsgId = uuid();
          setMessages(m3 => [...m3, { id: aiMsgId, role: "ai", content: "" }]);
          await run(
            "yes",
            chunk => {
              setMessages(prev => {
                const idx = prev.findIndex(msg => msg.id === aiMsgId);
                if (idx !== -1) {
                  const updated = [...prev];
                  updated[idx] = {
                    ...updated[idx],
                    content: updated[idx].content + chunk,
                  };
                  return updated;
                }
                return prev;
              });
            },
            "text",
            aiMsgId
          );
        }
      } finally {
        setBusy(false);
      }
    };
    const handleConfirmationCancel = async () => {
      setPendingConfirmation(null);
      const clearFn = window.oasisClearPendingConfirmation;
      if (clearFn) clearFn();
      setMessages(m3 => [
        ...m3,
        { id: uuid(), role: "ai", content: "Action cancelled." },
      ]);
    };
    return /* @__PURE__ */ _(
      "div",
      { className: "assistant-container" },
      pendingConfirmation &&
        /* @__PURE__ */ _(ConfirmationModal, {
          data: pendingConfirmation,
          onConfirm: handleConfirmationApprove,
          onCancel: handleConfirmationCancel,
        }),
      /* @__PURE__ */ _(Header, { auth, onShowAuth: () => setView("auth") }),
      /* @__PURE__ */ _(
        "div",
        {
          onPointerDown: handleResizeStart,
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
        /* @__PURE__ */ _(
          "svg",
          {
            width: "20",
            height: "20",
            viewBox: "0 0 20 20",
            fill: "none",
            style: { position: "absolute", bottom: 2, right: 2, opacity: 0.3 },
          },
          /* @__PURE__ */ _("path", {
            d: "M14 14L18 18",
            stroke: "#000",
            strokeWidth: "2",
            strokeLinecap: "round",
          }),
          /* @__PURE__ */ _("path", {
            d: "M10 18L18 10",
            stroke: "#000",
            strokeWidth: "2",
            strokeLinecap: "round",
          })
        )
      ),
      view === "auth"
        ? /* @__PURE__ */ _(Auth, {
            onSuccess: () => setView("chat"),
            onCancel: () => setView("chat"),
          })
        : /* @__PURE__ */ _(
            k,
            null,
            auth.isAuthenticated &&
              userEmail &&
              bannerVisible &&
              /* @__PURE__ */ _(Banner, {
                email: userEmail,
                onClose: () => setBannerVisible(false),
              }),
            /* @__PURE__ */ _(
              "div",
              { className: "chat-log", ref: logRef },
              messages.length === 0 &&
                /* @__PURE__ */ _(
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
                  /* @__PURE__ */ _(
                    "div",
                    {
                      style: {
                        width: "75%",
                        maxWidth: "260px",
                        minWidth: "100px",
                        flexShrink: 0,
                      },
                    },
                    /* @__PURE__ */ _("img", {
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
                  /* @__PURE__ */ _(
                    "div",
                    {
                      style: {
                        color: "#999",
                        fontSize: "13px",
                        lineHeight: "1.4",
                      },
                    },
                    "Welcome to Oasis AI",
                    /* @__PURE__ */ _("br", null),
                    "Browse, summarize, or manage your tabs."
                  )
                ),
              messages.map((m3, i3) => {
                const isLast = i3 === messages.length - 1;
                const isLastAI = isLast && m3.role === "ai";
                if (m3.role === "user") {
                  return /* @__PURE__ */ _(
                    "div",
                    { key: m3.id, className: "message-bubble message-user" },
                    /* @__PURE__ */ _(
                      "div",
                      {
                        className: "message-content",
                        style: { whiteSpace: "pre-wrap" },
                      },
                      m3.content
                    )
                  );
                } else if (m3.role === "ai") {
                  const showTools = isLastAI && toolActions.length > 0;
                  let htmlContent = m3.content;
                  try {
                    const w3 = window;
                    if (w3.marked && w3.DOMPurify) {
                      const raw = w3.marked.parse(m3.content);
                      htmlContent = w3.DOMPurify.sanitize(raw);
                    }
                  } catch (e3) {
                    console.error("Markdown render error:", e3);
                  }
                  return /* @__PURE__ */ _(
                    k,
                    { key: m3.id },
                    showTools &&
                      /* @__PURE__ */ _(ToolActionsGroup, {
                        actions: toolActions,
                      }),
                    /* @__PURE__ */ _(
                      "div",
                      { className: "ai-message-wrapper" },
                      /* @__PURE__ */ _(
                        "div",
                        {
                          className: "ai-response-container",
                          onClick: handleLinkClick,
                        },
                        window.marked
                          ? /* @__PURE__ */ _("div", {
                              className: "markdown-body",
                              dangerouslySetInnerHTML: { __html: htmlContent },
                            })
                          : /* @__PURE__ */ _(
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
                              m3.content
                            )
                      ),
                      isLastAI &&
                        !busy &&
                        /* @__PURE__ */ _(Feedback, { messageId: m3.id })
                    )
                  );
                }
                return null;
              }),
              busy &&
                messages.length > 0 &&
                messages[messages.length - 1].role === "user" &&
                toolActions.length > 0 &&
                /* @__PURE__ */ _(ToolActionsGroup, { actions: toolActions })
            ),
            /* @__PURE__ */ _(
              "div",
              { className: "input-bar" },
              /* @__PURE__ */ _("textarea", {
                className: "input-field",
                value: isRecording ? "Listening..." : input,
                onInput: e3 => setInput(e3.target.value),
                onKeyDown: handleKeyDown,
                placeholder: auth.isAuthenticated
                  ? "Ask me anything..."
                  : "Please sign in...",
                disabled: busy || !auth.isAuthenticated || isRecording,
                rows: 1,
                style: {
                  minHeight: "24px",
                  fontSize: "15px",
                  color: "#333",
                },
              }),
              /* @__PURE__ */ _(
                "div",
                {
                  className: "input-row",
                  style: {
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingLeft: "8px",
                  },
                },
                /* @__PURE__ */ _(
                  "button",
                  {
                    onClick: handleFeedback,
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
                    onMouseEnter: e3 =>
                      (e3.currentTarget.style.backgroundColor = "#F2F4E5"),
                    onMouseLeave: e3 =>
                      (e3.currentTarget.style.backgroundColor = "transparent"),
                  },
                  "Feedback?"
                ),
                /* @__PURE__ */ _(
                  "div",
                  {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    },
                  },
                  isRecording &&
                    /* @__PURE__ */ _(
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
                      [...Array(8)].map((_2, i3) =>
                        /* @__PURE__ */ _("div", {
                          key: i3,
                          className: "wave-bar",
                          style: {
                            width: "2px",
                            height: "8px",
                            background: "#7A9200",
                            borderRadius: "1px",
                            animationDelay: `${i3 * 0.1}s`,
                          },
                        })
                      )
                    ),
                  /* @__PURE__ */ _(
                    "button",
                    {
                      className: "send-btn",
                      onClick: () => window.resetAssistantSession(),
                      title: "Clear Chat History",
                      style: {
                        color: "#666",
                        width: "32px",
                        height: "32px",
                        flex: "none",
                      },
                    },
                    /* @__PURE__ */ _(
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
                      /* @__PURE__ */ _("path", { d: "M23 4v6h-6" }),
                      /* @__PURE__ */ _("path", { d: "M1 20v-6h6" }),
                      /* @__PURE__ */ _("path", {
                        d: "M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
                      })
                    )
                  ),
                  /* @__PURE__ */ _(
                    "button",
                    {
                      className: "send-btn",
                      onClick: toggleRecording,
                      disabled: busy || !auth.isAuthenticated,
                      title: isRecording ? "Stop Recording" : "Voice Input",
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
                    isRecording
                      ? /* @__PURE__ */ _(
                          "svg",
                          {
                            width: "36",
                            height: "36",
                            viewBox: "0 0 36 36",
                            fill: "none",
                            xmlns: "http://www.w3.org/2000/svg",
                          },
                          /* @__PURE__ */ _("rect", {
                            width: "36",
                            height: "36",
                            rx: "18",
                            fill: "#F8FAF2",
                          }),
                          /* @__PURE__ */ _("path", {
                            d: "M17.945 11.75C16.578 11.75 15.475 11.75 14.608 11.867C13.708 11.987 12.95 12.247 12.348 12.848C11.746 13.45 11.488 14.208 11.367 15.108C11.25 15.975 11.25 17.078 11.25 18.445V18.555C11.25 19.922 11.25 21.025 11.367 21.892C11.487 22.792 11.747 23.55 12.348 24.152C12.95 24.754 13.708 25.012 14.608 25.134C15.475 25.25 16.578 25.25 17.945 25.25H18.055C19.422 25.25 20.525 25.25 21.392 25.134C22.292 25.012 23.05 24.754 23.652 24.152C24.254 23.55 24.512 22.792 24.634 21.892C24.75 21.025 24.75 19.922 24.75 18.555V18.445C24.75 17.078 24.75 15.975 24.634 15.108C24.512 14.208 24.254 13.45 23.652 12.848C23.05 12.246 22.292 11.988 21.392 11.867C20.525 11.75 19.422 11.75 18.055 11.75H17.945Z",
                            fill: "#7A9200",
                          })
                        )
                      : /* @__PURE__ */ _(
                          "svg",
                          {
                            width: "36",
                            height: "36",
                            viewBox: "313 0 36 36",
                            fill: "none",
                            xmlns: "http://www.w3.org/2000/svg",
                          },
                          /* @__PURE__ */ _("rect", {
                            x: "313",
                            y: "0",
                            width: "36",
                            height: "36",
                            rx: "18",
                            fill: "#F8FAF2",
                          }),
                          /* @__PURE__ */ _("path", {
                            fillRule: "evenodd",
                            clipRule: "evenodd",
                            d: "M327.958 12.8511C327.958 12.0442 328.278 11.2703 328.849 10.6997C329.419 10.1291 330.193 9.80859 331 9.80859C331.807 9.80859 332.581 10.1291 333.152 10.6997C333.722 11.2703 334.043 12.0442 334.043 12.8511V18.4681C334.043 19.2751 333.722 20.0489 333.152 20.6195C332.581 21.1901 331.807 21.5107 331 21.5107C330.193 21.5107 329.419 21.1901 328.849 20.6195C328.278 20.0489 327.958 19.2751 327.958 18.4681V12.8511ZM331 11.2128C330.566 11.2128 330.149 11.3854 329.842 11.6927C329.534 11.9999 329.362 12.4166 329.362 12.8511V18.4681C329.362 18.9026 329.534 19.3193 329.842 19.6266C330.149 19.9338 330.566 20.1064 331 20.1064C331.435 20.1064 331.851 19.9338 332.159 19.6266C332.466 19.3193 332.638 18.9026 332.638 18.4681V12.8511C332.638 12.4166 332.466 11.9999 332.159 11.6927C331.851 11.3854 331.435 11.2128 331 11.2128ZM326.319 17.766C326.506 17.766 326.684 17.84 326.816 17.9716C326.947 18.1033 327.021 18.2819 327.021 18.4681C327.021 19.5233 327.441 20.5353 328.187 21.2815C328.933 22.0276 329.945 22.4468 331 22.4468C332.055 22.4468 333.067 22.0276 333.814 21.2815C334.56 20.5353 334.979 19.5233 334.979 18.4681C334.979 18.2819 335.053 18.1033 335.184 17.9716C335.316 17.84 335.495 17.766 335.681 17.766C335.867 17.766 336.046 17.84 336.177 17.9716C336.309 18.1033 336.383 18.2819 336.383 18.4681C336.383 19.7742 335.908 21.0357 335.047 22.0176C334.186 22.9995 332.997 23.6348 331.702 23.8052V24.7872H333.809C333.995 24.7872 334.173 24.8612 334.305 24.9929C334.437 25.1246 334.511 25.3031 334.511 25.4894C334.511 25.6756 334.437 25.8542 334.305 25.9858C334.173 26.1175 333.995 26.1915 333.809 26.1915H328.192C328.005 26.1915 327.827 26.1175 327.695 25.9858C327.563 25.8542 327.49 25.6756 327.49 25.4894C327.49 25.3031 327.563 25.1246 327.695 24.9929C327.827 24.8612 328.005 24.7872 328.192 24.7872H330.298V23.8052C329.003 23.6348 327.814 22.9995 326.953 22.0176C326.092 21.0357 325.617 19.7742 325.617 18.4681C325.617 18.2819 325.691 18.1033 325.823 17.9716C325.955 17.84 326.133 17.766 326.319 17.766Z",
                            fill: "#94A833",
                          })
                        )
                  ),
                  /* @__PURE__ */ _(
                    "button",
                    {
                      className: "send-btn",
                      onClick: () => send(),
                      disabled: busy || !auth.isAuthenticated,
                      title: "Send",
                      style: { width: "36px", height: "36px" },
                    },
                    busy
                      ? /* @__PURE__ */ _(
                          "svg",
                          {
                            width: "24",
                            height: "24",
                            viewBox: "0 0 24 24",
                            fill: "none",
                            stroke: "#7A9200",
                            strokeWidth: "2",
                          },
                          /* @__PURE__ */ _("rect", {
                            x: "9",
                            y: "9",
                            width: "6",
                            height: "6",
                          })
                        )
                      : /* @__PURE__ */ _(
                          "svg",
                          {
                            width: "36",
                            height: "36",
                            viewBox: "0 0 36 36",
                            fill: "none",
                            xmlns: "http://www.w3.org/2000/svg",
                          },
                          /* @__PURE__ */ _("circle", {
                            cx: "18",
                            cy: "18",
                            r: "18",
                            fill: "#7A9200",
                          }),
                          /* @__PURE__ */ _("path", {
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
            )
          )
    );
  }

  // src/index.tsx
  var MOUNT_ID = "assistant-preact-root";
  function ensureRoot() {
    let root2 = document.getElementById(MOUNT_ID);
    if (!root2) {
      root2 = document.createElement("div");
      root2.id = MOUNT_ID;
      const log = document.getElementById("log");
      if (log && log.parentElement) {
        log.parentElement.insertBefore(root2, log);
      } else {
        document.body.appendChild(root2);
      }
    }
    return root2;
  }
  var root = ensureRoot();
  G(_(App, {}), root);
})();
