(function () {
  "use strict";

  /* ═══════════════════════════════════════════════════════════════════
     ANIM · wrapper sobre GSAP
     ─────────────────────────────────────────────────────────────────
     Helpers reutilizaveis pra animacoes sutis e elegantes.
     Respeita prefers-reduced-motion (vira no-op).
     Usa easings variados por intencao (snap/swell/lift/in).

     API publica (window.Anim):
       fadeUpStagger(elements, opts)  — entrada de listas com stagger
       hoverLift(el)                  — micro-elevacao no hover de card
       captureSlide(panel, open)      — slide vertical do capture inline
       toastIn(el) / toastOut(el)
       listEnter(container, selector) — scaneia filhos e anima
       pulse(el)                      — atencao breve
       killAll(el)                    — cancela animacoes pendentes
     ═══════════════════════════════════════════════════════════════════ */

  function hasGsap() {
    return typeof window.gsap !== "undefined" && window.gsap;
  }

  function reduce() {
    try {
      return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) { return false; }
  }

  // Mapa de easings — espelha refresh.css
  const EASE = {
    out:   "power3.out",
    snap:  "power2.inOut",
    swell: "power4.out",
    lift:  "back.out(1.4)",
    in:    "power2.in"
  };

  function ensureReady(el) {
    if (!el) return;
    if (el.setAttribute) el.setAttribute("data-anim-state", "ready");
  }

  function ensureReadyAll(list) {
    if (!list) return;
    Array.from(list).forEach(ensureReady);
  }

  /* ────── fadeUpStagger ────── */
  function fadeUpStagger(elements, opts) {
    if (!elements || !elements.length) return null;
    const list = Array.isArray(elements) ? elements : Array.from(elements);
    if (!hasGsap() || reduce()) {
      ensureReadyAll(list);
      return null;
    }
    const config = Object.assign({
      duration: 0.42,
      ease: EASE.swell,
      stagger: 0.04,
      delay: 0
    }, opts || {});

    list.forEach((el) => { el.setAttribute("data-anim-state", "initial"); });
    return window.gsap.to(list, {
      opacity: 1,
      y: 0,
      duration: config.duration,
      ease: config.ease,
      stagger: config.stagger,
      delay: config.delay,
      clearProps: "transform,opacity",
      onComplete: () => ensureReadyAll(list)
    });
  }

  /* ────── hoverLift ────── */
  // Aplica enter/leave que faz o card subir 1-2px com sombra adicional.
  // Stateful: só registra uma vez por elemento.
  function hoverLift(el, opts) {
    if (!el || el.getAttribute("data-anim-hover-bound") === "true") return;
    if (!hasGsap() || reduce()) return;
    const config = Object.assign({ y: -2, duration: 0.18, scale: 1 }, opts || {});
    el.setAttribute("data-anim-hover-bound", "true");

    el.addEventListener("mouseenter", () => {
      window.gsap.to(el, {
        y: config.y,
        scale: config.scale,
        duration: config.duration,
        ease: EASE.lift,
        overwrite: "auto"
      });
    });
    el.addEventListener("mouseleave", () => {
      window.gsap.to(el, {
        y: 0,
        scale: 1,
        duration: config.duration,
        ease: EASE.out,
        overwrite: "auto"
      });
    });
  }

  function bindHoverLiftAll(selector, root, opts) {
    const scope = root || document;
    const nodes = scope.querySelectorAll(selector);
    nodes.forEach((node) => hoverLift(node, opts));
  }

  /* ────── captureSlide ────── */
  // panel é o slot do capture (data-open="true|false")
  function captureSlide(panel, open) {
    if (!panel) return null;
    if (!hasGsap() || reduce()) {
      panel.setAttribute("data-open", open ? "true" : "false");
      return null;
    }
    const inner = panel.firstElementChild;
    if (!inner) return null;

    if (open) {
      panel.setAttribute("data-open", "true");
      window.gsap.fromTo(inner,
        { opacity: 0, y: -10 },
        { opacity: 1, y: 0, duration: 0.28, ease: EASE.swell, clearProps: "transform" }
      );
    } else {
      window.gsap.to(inner, {
        opacity: 0,
        y: -10,
        duration: 0.18,
        ease: EASE.in,
        onComplete: () => { panel.setAttribute("data-open", "false"); }
      });
    }
  }

  /* ────── toastIn / toastOut ────── */
  function toastIn(el) {
    if (!el) return null;
    if (!hasGsap() || reduce()) return null;
    return window.gsap.fromTo(el,
      { opacity: 0, y: 16, scale: 0.98 },
      { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: EASE.swell, clearProps: "transform" }
    );
  }

  function toastOut(el) {
    if (!el) return null;
    if (!hasGsap() || reduce()) return null;
    return window.gsap.to(el, {
      opacity: 0,
      y: 8,
      duration: 0.18,
      ease: EASE.in
    });
  }

  /* ────── listEnter ────── */
  // Escaneia filhos diretos de container com seletor opcional, anima
  function listEnter(container, selector, opts) {
    if (!container) return null;
    const sel = selector || ":scope > *";
    let nodes;
    try { nodes = container.querySelectorAll(sel); }
    catch (e) { nodes = container.children; }
    return fadeUpStagger(nodes, opts);
  }

  /* ────── pulse ────── */
  function pulse(el) {
    if (!el || !hasGsap() || reduce()) return null;
    return window.gsap.fromTo(el,
      { scale: 1 },
      { scale: 1.04, duration: 0.18, ease: EASE.swell, yoyo: true, repeat: 1 }
    );
  }

  /* ────── killAll ────── */
  function killAll(el) {
    if (!el || !hasGsap()) return;
    window.gsap.killTweensOf(el);
  }

  /* ────── pageEnter ────── */
  // entrada quando uma <main> deixa de ficar oculta
  function pageEnter(main) {
    if (!main) return null;
    if (!hasGsap() || reduce()) return null;
    const blocks = main.querySelectorAll(":scope > section, :scope > article, :scope > header");
    if (!blocks.length) {
      return window.gsap.fromTo(main, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.32, ease: EASE.swell, clearProps: "transform" });
    }
    return fadeUpStagger(blocks, { stagger: 0.05, duration: 0.42 });
  }

  window.Anim = {
    EASE,
    fadeUpStagger,
    hoverLift,
    bindHoverLiftAll,
    captureSlide,
    toastIn,
    toastOut,
    listEnter,
    pulse,
    pageEnter,
    killAll,
    hasGsap,
    reduce
  };

  console.log("[anim] inicializado", hasGsap() ? "(GSAP " + (window.gsap.version || "?") + ")" : "(GSAP ausente)");
})();
