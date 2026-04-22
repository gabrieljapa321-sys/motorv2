(function () {
  "use strict";

  let lastHomePlan = null;
  let lastHomeQueue = [];
  let lastHomeReferenceDate = null;
  let homeVisitRecorded = false;

  function renderHeader() {
    const el = document.getElementById("hpHeader");
    if (!el) return;

    const now = new Date();
    const weekday = ["Domingo", "Segunda-feira", "Terca-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sabado"][now.getDay()];
    const months = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const dateLabel = now.getDate() + " de " + months[now.getMonth()] + " de " + now.getFullYear();

    el.innerHTML =
      '<div class="hp-header-copy">' +
        '<span class="hp-eyebrow">' + escapeText(weekday) + " | " + escapeText(dateLabel) + "</span>" +
        '<h1 class="hp-title">' + escapeText(greetingFor(now.getHours())) + "</h1>" +
        '<p class="hp-sub">Uma leitura curta para decidir o proximo movimento entre trabalho e estudos.</p>' +
      "</div>" +
      '<div class="hp-header-actions">' +
        '<button type="button" class="hp-btn hp-btn--ghost" data-home-nav="work">Abrir Trabalho</button>' +
        '<button type="button" class="hp-btn hp-btn--ghost" data-home-nav="studies">Abrir Estudos</button>' +
        '<button type="button" class="hp-btn hp-btn--ghost" data-home-nav="news">Abrir Noticias</button>' +
      "</div>";
  }

  function renderKpis(referenceDate) {
    const el = document.getElementById("hpKpis");
    if (!el) return;

    const metrics = computeKpiMetrics(referenceDate || new Date());

    el.innerHTML =
      '<div class="hp-kpi-group" data-scope="work">' +
        '<div class="hp-kpi-group-label">Trabalho</div>' +
        '<div class="hp-kpi-grid">' +
          kpiCard({
            label: "Hoje",
            value: metrics.work.today,
            sub: metrics.work.todayLabel,
            tone: metrics.work.today > 0 ? "accent" : "quiet",
            filter: "today"
          }) +
          kpiCard({
            label: "Atrasadas",
            value: metrics.work.overdue,
            sub: metrics.work.overdueLabel,
            tone: metrics.work.overdue > 0 ? "danger" : "quiet",
            filter: "overdue"
          }) +
          kpiCard({
            label: "Aguardando",
            value: metrics.work.waiting,
            sub: metrics.work.waitingLabel,
            tone: metrics.work.waiting > 0 ? "warning" : "quiet",
            filter: "waiting"
          }) +
        "</div>" +
      "</div>" +
      '<div class="hp-kpi-group" data-scope="study">' +
        '<div class="hp-kpi-group-label">Estudos</div>' +
        '<div class="hp-kpi-grid">' +
          kpiCard({
            label: "Entregas (7d)",
            value: metrics.study.deadlines7d,
            sub: metrics.study.deadlinesLabel,
            tone: metrics.study.overdueDeadlines > 0 ? "danger" : (metrics.study.deadlines7d > 0 ? "accent" : "quiet"),
            nav: "studies"
          }) +
          kpiCard({
            label: "Proxima prova",
            value: metrics.study.nextExamValue,
            sub: metrics.study.nextExamSub,
            tone: metrics.study.nextExamTone,
            nav: "studies"
          }) +
          kpiCard({
            label: "Materias no radar",
            value: metrics.study.radar,
            sub: metrics.study.radarLabel,
            tone: metrics.study.radar > 0 ? "accent" : "quiet",
            nav: "studies"
          }) +
        "</div>" +
      "</div>";
  }

  function kpiCard(cfg) {
    const tone = cfg.tone || "quiet";
    const navAttr = cfg.nav ? ' data-home-nav="' + escapeText(cfg.nav) + '"' : "";
    const filterAttr = cfg.filter ? ' data-home-work-filter="' + escapeText(cfg.filter) + '"' : "";
    const tag = (cfg.nav || cfg.filter) ? "button" : "div";
    const typeAttr = tag === "button" ? ' type="button"' : "";
    return "<" + tag + ' class="hp-kpi" data-tone="' + escapeText(tone) + '"' + typeAttr + navAttr + filterAttr + ">" +
      '<span class="hp-kpi-label">' + escapeText(cfg.label) + "</span>" +
      '<span class="hp-kpi-value">' + escapeText(String(cfg.value)) + "</span>" +
      '<span class="hp-kpi-sub">' + escapeText(cfg.sub || "") + "</span>" +
    "</" + tag + ">";
  }

  function computeKpiMetrics(referenceDate) {
    const now = referenceDate || new Date();
    const todayIso = toIso(now);
    const workTasks = Array.isArray(state && state.workTasks) ? state.workTasks : [];
    const WD = window.WorkDomain;

    let todayCount = 0;
    let overdueCount = 0;
    let waitingCount = 0;
    if (WD) {
      const open = workTasks.filter(WD.isOpen);
      todayCount = open.filter(function (task) { return WD.isToday(task, todayIso); }).length;
      overdueCount = open.filter(function (task) { return WD.isOverdue(task, todayIso); }).length;
      waitingCount = open.filter(WD.isWaiting).length;
    }

    const deadlines = Array.isArray(state && state.deadlines) ? state.deadlines : [];
    const pendingDeadlines = deadlines.filter(function (deadline) {
      return deadline && deadline.dueDate && !deadline.deliveredAt;
    });
    const inSevenDays = addDaysIso(todayIso, 7);
    const deadlines7d = pendingDeadlines.filter(function (deadline) {
      return deadline.dueDate >= todayIso && deadline.dueDate <= inSevenDays;
    }).length;
    const overdueDeadlines = pendingDeadlines.filter(function (deadline) {
      return deadline.dueDate < todayIso;
    }).length;

    let nextExamValue = "--";
    let nextExamSub = "Sem prova agendada";
    let nextExamTone = "quiet";

    if (window.DATA && Array.isArray(window.DATA.subjects)) {
      const nextExamCandidate = window.DATA.subjects
        .map(function (subject) {
          const exam = getNextExamForSubject(subject, now);
          if (!exam || !exam.examDate) return null;
          return { subject: subject, examDate: exam.examDate };
        })
        .filter(Boolean)
        .sort(function (a, b) {
          return a.examDate < b.examDate ? -1 : a.examDate > b.examDate ? 1 : 0;
        })[0] || null;

      if (nextExamCandidate) {
        const days = diffDaysIso(todayIso, nextExamCandidate.examDate);
        if (days === 0) {
          nextExamValue = "hoje";
          nextExamTone = "danger";
        } else if (days === 1) {
          nextExamValue = "amanha";
          nextExamTone = "warning";
        } else if (days <= 7) {
          nextExamValue = days + "d";
          nextExamTone = "warning";
        } else {
          nextExamValue = days + "d";
          nextExamTone = "accent";
        }
        const subjectName = nextExamCandidate.subject.shortName || nextExamCandidate.subject.name || nextExamCandidate.subject.code || "Prova";
        nextExamSub = subjectName + " | " + formatIsoShort(nextExamCandidate.examDate);
      }
    }

    let radarCount = 0;
    if (window.DATA && Array.isArray(window.DATA.subjects)) {
      const deadlineSubjects = new Set(pendingDeadlines.map(function (deadline) {
        return deadline.subjectCode;
      }).filter(Boolean));

      radarCount = window.DATA.subjects.filter(function (subject) {
        if (deadlineSubjects.has(subject.code)) return true;
        const exam = getNextExamForSubject(subject, now);
        if (!exam || !exam.examDate) return false;
        const days = diffDaysIso(todayIso, exam.examDate);
        return days >= 0 && days <= 45;
      }).length;
    }

    return {
      work: {
        today: todayCount,
        todayLabel: todayCount > 0 ? "planejadas para hoje" : "nenhuma para hoje",
        overdue: overdueCount,
        overdueLabel: overdueCount > 0 ? "prazo vencido" : "sem atraso",
        waiting: waitingCount,
        waitingLabel: waitingCount > 0 ? "com terceiros" : "sem pendencia externa"
      },
      study: {
        deadlines7d: deadlines7d,
        overdueDeadlines: overdueDeadlines,
        deadlinesLabel: overdueDeadlines > 0 ? overdueDeadlines + " atrasadas" : (deadlines7d > 0 ? "nos proximos 7 dias" : "nenhuma"),
        nextExamValue: nextExamValue,
        nextExamSub: nextExamSub,
        nextExamTone: nextExamTone,
        radar: radarCount,
        radarLabel: radarCount > 0 ? "com entrega ou prova proxima" : "fluxo limpo"
      }
    };
  }

  function renderFocus(plan, queue, referenceDate) {
    const el = document.getElementById("hpFocus");
    if (!el) return;

    const now = referenceDate || new Date();
    const mode = state && state.mode ? state.mode : "normal";
    const focus = buildFocusModel(plan, queue, now);
    const primary = focus.primary;

    const supportHtml = focus.support.map(function (item) {
      return '<article class="hp-focus-insight">' +
        '<span class="hp-focus-insight-label">' + escapeText(item.label) + "</span>" +
        '<strong class="hp-focus-insight-value">' + escapeText(item.value) + "</strong>" +
        '<span class="hp-focus-insight-meta">' + escapeText(item.meta) + "</span>" +
      "</article>";
    }).join("");

    const alternativesHtml = focus.alternatives.length
      ? focus.alternatives.map(function (item) {
          return '<article class="hp-alt-card" data-tone="' + escapeText(item.tone || "quiet") + '">' +
            '<span class="hp-alt-prefix">' + escapeText(item.prefix) + "</span>" +
            '<strong class="hp-alt-title">' + escapeText(item.title) + "</strong>" +
            '<span class="hp-alt-meta">' + escapeText(item.meta || item.reason) + "</span>" +
          "</article>";
        }).join("")
      : '<div class="hp-alt-empty">Sem outra frente urgente agora.</div>';

    if (!primary) {
      el.innerHTML =
        '<section class="hp-focus-shell" data-mode="' + escapeText(mode) + '">' +
          '<article class="hp-focus-panel hp-focus-panel--empty">' +
            '<div class="hp-focus-top">' +
              '<span class="hp-focus-prefix">Sem pressao critica</span>' +
              '<span class="hp-focus-tag">Foco de hoje</span>' +
            "</div>" +
            "<h2>O painel esta limpo.</h2>" +
            '<p class="hp-focus-reason">Use a janela atual para manter o ritmo, nao para inventar urgencia.</p>' +
            '<div class="hp-focus-actions">' +
              '<button type="button" class="hp-btn hp-btn--primary" data-home-nav="studies">Revisar fila academica</button>' +
              '<button type="button" class="hp-btn hp-btn--ghost" data-home-capture-open>Abrir captura rapida</button>' +
            "</div>" +
          "</article>" +
          '<aside class="hp-focus-rail">' + supportHtml + "</aside>" +
        "</section>" +
        '<section class="hp-focus-alt">' +
          '<div class="hp-section-head">' +
            '<span class="hp-section-label">Backups imediatos</span>' +
            '<span class="hp-section-copy">Nada em chamas. Escolha pelo menor atrito.</span>' +
          "</div>" +
          '<div class="hp-alt-grid">' + alternativesHtml + "</div>" +
        "</section>";
      return;
    }

    const compactMode = mode === "foco";
    const exaustoMode = mode === "exausto";

    el.innerHTML =
      '<section class="hp-focus-shell" data-mode="' + escapeText(mode) + '">' +
        '<article class="hp-focus-panel" data-tone="' + escapeText(primary.tone || "accent") + '">' +
          '<div class="hp-focus-top">' +
            '<span class="hp-focus-prefix">' + escapeText(primary.prefix) + "</span>" +
            '<span class="hp-focus-tag">Foco de hoje</span>' +
          "</div>" +
          "<h2>" + escapeText(primary.title) + "</h2>" +
          (compactMode ? "" : '<p class="hp-focus-reason">' + escapeText(primary.reason) + "</p>") +
          '<div class="hp-focus-actions">' +
            '<button type="button" class="hp-btn hp-btn--primary" ' + primary.actionAttrs + ">" + escapeText(primary.actionLabel) + "</button>" +
            '<button type="button" class="hp-btn hp-btn--ghost" data-home-capture-open>Abrir captura rapida</button>' +
          "</div>" +
        "</article>" +
        (compactMode ? "" : '<aside class="hp-focus-rail">' + supportHtml + "</aside>") +
      "</section>" +
      (compactMode || exaustoMode ? "" :
        '<section class="hp-focus-alt">' +
          '<div class="hp-section-head">' +
            '<span class="hp-section-label">Se nao for essa</span>' +
            '<span class="hp-section-copy">Outras entradas validas sem trocar todo o contexto.</span>' +
          "</div>" +
          '<div class="hp-alt-grid">' + alternativesHtml + "</div>" +
        "</section>");
  }

  function buildFocusModel(plan, queue, referenceDate) {
    const todayIso = toIso(referenceDate);
    const WD = window.WorkDomain;
    const workTasks = Array.isArray(state && state.workTasks) ? state.workTasks : [];
    const weekAnchor = state && state.workWeekAnchor ? state.workWeekAnchor : todayIso;
    const buckets = WD ? WD.dashboardBuckets(workTasks, todayIso, weekAnchor) : { today: [], overdue: [], waiting: [], critical: [] };
    const studyDeadlines = getStudyDeadlineItems(referenceDate);
    const usefulWindow = getUsefulWindow(referenceDate);
    const mode = state && state.mode ? state.mode : "normal";
    const candidates = [];

    if (plan && plan.task && plan.subject) {
      const studyMinutes = getTaskMinutes(plan.task);
      const studyDeadline = studyDeadlines.find(function (item) { return item.subjectCode === plan.subject.code; }) || null;
      const nextExam = getNextExamForSubject(plan.subject, referenceDate);
      let score = 62;
      let reason = studyMinutes <= 30
        ? "Fila curta: " + studyMinutes + " min de friccao baixa."
        : "Mantem a materia andando antes de virar urgencia.";

      if (studyDeadline) {
        const deadlineDays = diffDaysIso(todayIso, studyDeadline.dueDate);
        if (deadlineDays <= 1) {
          score += 24;
          reason = studyDeadline.title + " vence " + studyDeadline.countdown + ".";
        } else if (deadlineDays <= 3) {
          score += 12;
          reason = studyDeadline.title + " entra na janela curta em " + deadlineDays + " dias.";
        }
      } else if (nextExam) {
        const examDays = diffDaysIso(todayIso, nextExam.examDate);
        if (examDays <= 7) {
          score += 10;
          reason = nextExam.label + " em " + Math.max(0, examDays) + " dias.";
        }
      }

      if (mode === "m30") score += studyMinutes <= 30 ? 22 : -12;
      if (mode === "exausto") score += studyMinutes <= 30 ? 8 : -6;

      candidates.push({
        key: "study-task-" + plan.task.id,
        prefix: plan.subject.shortName,
        title: plan.task.title,
        reason: reason,
        actionLabel: mode === "m30" ? "Iniciar pomodoro curto" : "Iniciar pomodoro (25 min)",
        actionAttrs: 'data-home-start-task="' + escapeText(plan.task.id) + '"',
        tone: "accent",
        score: score,
        meta: studyMinutes + " min"
      });
    }

    const overdueTask = (buckets.overdue || [])[0] || null;
    if (overdueTask && WD) {
      candidates.push({
        key: "work-task-" + overdueTask.id,
        prefix: overdueTask.scope === "company" ? WD.companyName(overdueTask.companyId) : "Geral",
        title: overdueTask.title,
        reason: overdueTask.dueDate ? "Atrasada " + getDueMeta(overdueTask.dueDate, null, referenceDate).label + "." : "Ja deveria ter andado e ainda esta aberta.",
        actionLabel: "Marcar como concluida",
        actionAttrs: 'data-home-complete-work="' + escapeText(overdueTask.id) + '"',
        tone: "danger",
        score: mode === "exausto" ? 80 : 92,
        meta: "trabalho"
      });
    }

    const dueSoonTask = (buckets.critical || []).find(function (task) {
      return task && task.dueDate;
    }) || null;
    if (dueSoonTask && WD) {
      candidates.push({
        key: "work-task-" + dueSoonTask.id,
        prefix: dueSoonTask.scope === "company" ? WD.companyName(dueSoonTask.companyId) : "Geral",
        title: dueSoonTask.title,
        reason: "Prazo " + getDueMeta(dueSoonTask.dueDate, null, referenceDate).label + ".",
        actionLabel: "Marcar como concluida",
        actionAttrs: 'data-home-complete-work="' + escapeText(dueSoonTask.id) + '"',
        tone: "warning",
        score: mode === "exausto" ? 70 : 82,
        meta: "prazo curto"
      });
    }

    const todayTask = (buckets.today || [])[0] || null;
    if (todayTask && WD) {
      candidates.push({
        key: "work-task-" + todayTask.id,
        prefix: todayTask.scope === "company" ? WD.companyName(todayTask.companyId) : "Geral",
        title: todayTask.title,
        reason: todayTask.nextAction || "Ja cabe hoje, sem depender de outra frente.",
        actionLabel: "Marcar como concluida",
        actionAttrs: 'data-home-complete-work="' + escapeText(todayTask.id) + '"',
        tone: "accent",
        score: mode === "m30" ? 74 : 68,
        meta: "para hoje"
      });
    }

    const sorted = candidates.sort(function (a, b) { return b.score - a.score; });
    const alternatives = sorted.slice(1, 4);

    if (!alternatives.length && Array.isArray(queue)) {
      queue.slice(1, 4).forEach(function (item) {
        if (!item || !item.task || !item.subject) return;
        alternatives.push({
          key: "study-queue-" + item.task.id,
          prefix: item.subject.shortName,
          title: item.task.title,
          reason: "Fila do dia em posicao util para entrar sem atrito.",
          tone: "accent",
          meta: getTaskMinutes(item.task) + " min"
        });
      });
    }

    return {
      primary: sorted[0] || null,
      alternatives: alternatives,
      support: [
        {
          label: usefulWindow.label,
          value: usefulWindow.value,
          meta: usefulWindow.detail
        },
        {
          label: "Aguardando",
          value: String((buckets.waiting || []).length),
          meta: (buckets.waiting || []).length ? "dependencias externas abertas" : "caixa limpa"
        },
        {
          label: "Ritmo",
          value: getModeLabel(),
          meta: mode === "foco" ? "uma frente por vez" : (mode === "exausto" ? "preservar energia" : (mode === "m30" ? "janela curta" : "ritmo normal"))
        }
      ]
    };
  }

  function renderAside(referenceDate) {
    const el = document.getElementById("hpAside");
    if (!el) return;

    const now = referenceDate || new Date();
    const todayIso = toIso(now);
    const WD = window.WorkDomain;
    const workTasks = Array.isArray(state && state.workTasks) ? state.workTasks : [];
    const studyDeadlines = getStudyDeadlineItems(now);
    const timeline = getTimelineTickets(now, studyDeadlines, workTasks);
    const changes = getChangesSinceLastSeen(now, state && state.lastHomeOpenAt, workTasks).slice(0, 3);
    const stuck = getStuckItems(now, workTasks).slice(0, 2);
    const weekAnchor = state && state.workWeekAnchor ? state.workWeekAnchor : todayIso;
    const buckets = WD ? WD.dashboardBuckets(workTasks, todayIso, weekAnchor) : { overdue: [], waiting: [] };

    const changesHtml = changes.length
      ? changes.map(function (item) {
          return '<article class="hp-pulse-item">' +
            '<div class="hp-pulse-item-top">' +
              '<strong>' + escapeText(item.title) + "</strong>" +
              '<span>' + escapeText(item.stamp) + "</span>" +
            "</div>" +
            '<p>' + escapeText(item.meta) + "</p>" +
          "</article>";
        }).join("")
      : '<div class="hp-pulse-empty">Nada novo desde a ultima leitura.</div>';

    const stuckHtml = stuck.length
      ? '<div class="hp-stuck-list">' + stuck.map(function (item) {
          return '<div class="hp-stuck-item">' +
            '<strong>' + escapeText(item.title) + "</strong>" +
            '<span>' + escapeText(item.meta) + "</span>" +
          "</div>";
        }).join("") + "</div>"
      : '<div class="hp-stuck-empty">Nada envelhecendo no inbox ou aguardando.</div>';

    el.innerHTML =
      '<div class="hp-aside-stack">' +
        '<article class="hp-side-card hp-side-card--radar">' +
          '<div class="hp-side-head">' +
            '<span class="hp-side-eyebrow">Radar curto</span>' +
            '<div>' +
              '<h3 class="hp-side-title">Proximas 72h</h3>' +
              '<p class="hp-side-copy">Prazos, provas e frentes que entraram de vez no horizonte imediato.</p>' +
            "</div>" +
          "</div>" +
          renderTicketList(timeline) +
        "</article>" +

        '<article class="hp-side-card hp-side-card--pulse">' +
          '<div class="hp-side-head">' +
            '<span class="hp-side-eyebrow">Pulse</span>' +
            '<div>' +
              '<h3 class="hp-side-title">Desde a ultima abertura</h3>' +
              '<p class="hp-side-copy">So o que mudou desde a sua ultima leitura da home.</p>' +
            "</div>" +
          "</div>" +
          '<div class="hp-pulse-list">' + changesHtml + "</div>" +
        "</article>" +

        '<article class="hp-side-card hp-side-card--actions">' +
          '<div class="hp-side-head">' +
            '<span class="hp-side-eyebrow">Apoio rapido</span>' +
            '<div>' +
              '<h3 class="hp-side-title">Atalhos uteis</h3>' +
              '<p class="hp-side-copy">Entradas curtas para agir sem abrir um painel inteiro.</p>' +
            "</div>" +
          "</div>" +
          '<div class="hp-shortcut-grid">' +
            renderShortcutCard("Capturar tarefa", "Registrar algo novo de trabalho.", 'data-home-capture-open', "accent") +
            renderShortcutCard("Ver atrasadas", (buckets.overdue || []).length ? (buckets.overdue || []).length + " no vermelho" : "nenhuma agora", 'data-home-work-filter="overdue"', (buckets.overdue || []).length ? "danger" : "quiet") +
            renderShortcutCard("Ver aguardando", (buckets.waiting || []).length ? (buckets.waiting || []).length + " com terceiros" : "caixa limpa", 'data-home-work-filter="waiting"', (buckets.waiting || []).length ? "warning" : "quiet") +
            renderShortcutCard("Abrir estudos", studyDeadlines.length ? studyDeadlines.length + " prazo(s) em aberto" : "fila academica", 'data-home-nav="studies"', "accent") +
          "</div>" +
          '<div class="hp-stuck-box">' +
            '<span class="hp-stuck-title">Parado ha 7 dias</span>' +
            stuckHtml +
          "</div>" +
        "</article>" +
      "</div>";
  }

  function renderTicketList(items) {
    if (!items.length) {
      return '<div class="hp-ticket-empty">Nada pressiona as proximas 72h.</div>';
    }
    return '<div class="hp-ticket-list">' + items.map(function (item) {
      return '<article class="hp-ticket" data-tone="' + escapeText(item.tone || "accent") + '">' +
        '<div class="hp-ticket-top">' +
          '<span class="hp-ticket-label">' + escapeText(item.label) + "</span>" +
          '<span class="hp-ticket-countdown">' + escapeText(item.countdown) + "</span>" +
        "</div>" +
        '<strong class="hp-ticket-title">' + escapeText(item.title) + "</strong>" +
        '<p class="hp-ticket-meta">' + escapeText(item.meta) + "</p>" +
      "</article>";
    }).join("") + "</div>";
  }

  function renderShortcutCard(title, meta, attrs, tone) {
    return '<button type="button" class="hp-shortcut" data-tone="' + escapeText(tone || "quiet") + '" ' + attrs + ">" +
      '<span class="hp-shortcut-title">' + escapeText(title) + "</span>" +
      '<span class="hp-shortcut-meta">' + escapeText(meta) + "</span>" +
    "</button>";
  }

  function getTimelineTickets(referenceDate, studyDeadlines, workTasks) {
    const horizonMs = 72 * 60 * 60 * 1000;
    const studyTickets = studyDeadlines.map(function (item) {
      return {
        key: item.key,
        label: item.prefix,
        title: item.title,
        meta: item.meta,
        countdown: item.countdown,
        tone: item.tone,
        dueAtMs: item.dueAtMs
      };
    });

    const workTickets = (workTasks || [])
      .filter(function (task) { return task && task.status !== "done" && task.dueDate; })
      .map(function (task) {
        const dueMeta = getDueMeta(task.dueDate, null, referenceDate);
        return {
          key: "work-ticket-" + task.id,
          label: task.scope === "company" && window.WorkDomain ? window.WorkDomain.companyName(task.companyId) : "Geral",
          title: task.title,
          meta: task.nextAction || "sem proxima acao registrada",
          countdown: dueMeta.label,
          tone: dueMeta.tone,
          dueAtMs: dueMeta.dueAtMs
        };
      })
      .filter(function (item) {
        return item.dueAtMs - referenceDate.getTime() <= horizonMs;
      });

    return studyTickets
      .concat(workTickets)
      .sort(function (a, b) { return a.dueAtMs - b.dueAtMs; })
      .slice(0, 4);
  }

  function getChangesSinceLastSeen(referenceDate, lastSeenAt, workTasks) {
    const fallbackCutoff = referenceDate.getTime() - (24 * 60 * 60 * 1000);
    const lastSeenMs = new Date(lastSeenAt).getTime();
    const cutoffMs = Number.isFinite(lastSeenMs) ? lastSeenMs : fallbackCutoff;
    const changes = [];

    (state.deadlines || []).forEach(function (deadline) {
      const timestamp = getHomeRecordTimestamp(deadline);
      if (timestamp <= cutoffMs) return;
      const subject = deadline.subjectCode ? getSubjectByCode(deadline.subjectCode) : null;
      const action = deadline.createdAt && new Date(deadline.createdAt).getTime() > cutoffMs
        ? "Novo prazo"
        : deadline.deliveredAt && new Date(deadline.deliveredAt).getTime() > cutoffMs
          ? "Entrega concluida"
          : "Prazo atualizado";

      changes.push({
        title: (subject ? subject.shortName : (deadline.type || "Estudo")) + ": " + (deadline.title || "Entrega"),
        meta: action + " | " + (deadline.dueDate ? formatIsoShort(deadline.dueDate) : "sem data"),
        stamp: formatStamp(timestamp),
        timestamp: timestamp
      });
    });

    (workTasks || []).forEach(function (task) {
      const timestamp = getHomeRecordTimestamp(task);
      if (timestamp <= cutoffMs) return;
      const company = task.scope === "company" && window.WorkDomain ? window.WorkDomain.companyName(task.companyId) : "Geral";
      const action = task.createdAt && new Date(task.createdAt).getTime() > cutoffMs
        ? "Nova tarefa"
        : task.status === "done"
          ? "Concluida"
          : task.status === "waiting"
            ? "Aguardando retorno"
            : "Atualizada";

      changes.push({
        title: company + ": " + task.title,
        meta: action + " | " + (task.nextAction || "sem proxima acao registrada"),
        stamp: formatStamp(timestamp),
        timestamp: timestamp
      });
    });

    return changes.sort(function (a, b) { return b.timestamp - a.timestamp; });
  }

  function getStuckItems(referenceDate, workTasks) {
    const cutoffMs = referenceDate.getTime() - (7 * 24 * 60 * 60 * 1000);
    return (workTasks || [])
      .filter(function (task) { return task && (task.status === "inbox" || task.status === "waiting"); })
      .map(function (task) {
        const timestamp = getHomeRecordTimestamp(task);
        const company = task.scope === "company" && window.WorkDomain ? window.WorkDomain.companyName(task.companyId) : "Geral";
        const days = Math.max(7, Math.floor((referenceDate.getTime() - timestamp) / (24 * 60 * 60 * 1000)));
        return {
          title: company + ": " + task.title,
          meta: (task.status === "waiting" ? "Aguardando" : "Inbox") + " | parado ha " + days + " dias",
          timestamp: timestamp
        };
      })
      .filter(function (item) { return item.timestamp <= cutoffMs; })
      .sort(function (a, b) { return a.timestamp - b.timestamp; });
  }

  function getHomeRecordTimestamp(record) {
    if (!record || typeof record !== "object") return 0;
    return [
      record.updatedAt,
      record.createdAt,
      record.deliveredAt,
      record.waitingSince,
      record.completedAt
    ]
      .filter(Boolean)
      .map(function (value) { return new Date(value).getTime(); })
      .filter(function (value) { return Number.isFinite(value); })
      .sort(function (a, b) { return b - a; })[0] || 0;
  }

  function markHomeOpenAfterRender() {
    const page = document.getElementById("homePage");
    if (!page || page.hidden) {
      homeVisitRecorded = false;
      return;
    }
    if (homeVisitRecorded) return;
    state.lastHomeOpenAt = new Date().toISOString();
    if (typeof saveState === "function") saveState();
    homeVisitRecorded = true;
  }

  function syncHomeVisitState() {
    const page = document.getElementById("homePage");
    if (!page || page.hidden) homeVisitRecorded = false;
  }

  function renderHomeDashboardV2(plan, queue, referenceDate) {
    const root = document.getElementById("homeDashboardRoot");
    if (!root) return;

    if (typeof plan !== "undefined") lastHomePlan = plan;
    if (typeof queue !== "undefined") lastHomeQueue = Array.isArray(queue) ? queue : [];
    if (referenceDate) lastHomeReferenceDate = referenceDate;

    const safeReferenceDate = lastHomeReferenceDate || new Date();
    const page = document.getElementById("homePage");
    if (page) page.dataset.homeMode = state && state.mode ? state.mode : "normal";

    renderHeader();
    renderKpis(safeReferenceDate);
    renderFocus(lastHomePlan, lastHomeQueue, safeReferenceDate);
    renderAside(safeReferenceDate);
    markHomeOpenAfterRender();
  }

  function formatHomeDuration(ms) {
    const totalMinutes = Math.max(1, Math.round(Math.abs(ms) / 60000));
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;
    if (days > 0) return hours > 0 ? days + "d " + hours + "h" : days + "d";
    if (hours > 0) return minutes > 0 ? hours + "h" + String(minutes).padStart(2, "0") : hours + "h";
    return Math.max(1, minutes) + "min";
  }

  function getUsefulWindow(referenceDate) {
    const now = new Date(referenceDate || new Date());
    const start = new Date(now);
    const end = new Date(now);
    start.setHours(7, 0, 0, 0);
    end.setHours(22, 0, 0, 0);
    if (now >= end) {
      return {
        label: "Janela util",
        value: "encerrada hoje",
        detail: "Feche o dia sem abrir novas frentes."
      };
    }
    if (now < start) {
      return {
        label: "Janela util",
        value: formatHomeDuration(end - start) + " hoje",
        detail: "O dia ainda esta inteiro para escolher com calma."
      };
    }
    return {
      label: "Janela util",
      value: formatHomeDuration(end - now) + " restante",
      detail: "Proteja uma unica frente principal."
    };
  }

  function getDueMeta(dueDate, dueTime, referenceDate) {
    if (!dueDate) {
      return {
        label: "sem prazo",
        tone: "quiet",
        dueAtMs: Number.POSITIVE_INFINITY
      };
    }
    const safeTime = dueTime && /^\d{2}:\d{2}$/.test(dueTime) ? dueTime : "23:59";
    const dueDay = new Date(dueDate + "T00:00:00");
    const dueAt = new Date(dueDate + "T" + safeTime + ":00");
    const diffMs = dueAt.getTime() - referenceDate.getTime();
    let label = diffMs < 0 ? "ha " + formatHomeDuration(diffMs) : "em " + formatHomeDuration(diffMs);
    if (diffMs >= 0 && isSameDay(referenceDate, dueDay)) label = dueTime ? "hoje " + dueTime : "hoje";
    return {
      label: label,
      tone: diffMs < 0 ? "danger" : (diffMs <= 86400000 ? "warning" : "accent"),
      dueAtMs: dueAt.getTime()
    };
  }

  function getStudyDeadlineItems(referenceDate) {
    const deadlines = Array.isArray(state && state.deadlines) ? state.deadlines : [];
    return deadlines
      .filter(function (deadline) { return deadline && deadline.dueDate && !deadline.deliveredAt; })
      .map(function (deadline) {
        const subject = deadline.subjectCode ? getSubjectByCode(deadline.subjectCode) : null;
        const dueMeta = getDueMeta(deadline.dueDate, deadline.dueTime, referenceDate);
        return {
          key: "study-deadline-" + deadline.id,
          title: deadline.title || "Entrega",
          prefix: subject ? subject.shortName : (deadline.type || "Estudo"),
          subjectCode: subject ? subject.code : (deadline.subjectCode || null),
          dueDate: deadline.dueDate,
          countdown: dueMeta.label,
          dueAtMs: dueMeta.dueAtMs,
          tone: dueMeta.tone,
          meta: (subject ? subject.shortName : (deadline.type || "Estudo")) + " | " + dueMeta.label
        };
      })
      .sort(function (a, b) { return a.dueAtMs - b.dueAtMs; });
  }

  function getTaskMinutes(task) {
    if (!task || !task.minutes) return 25;
    const mode = state && state.mode ? state.mode : "normal";
    if (mode === "foco") return task.minutes.foco || task.minutes.normal || 25;
    if (mode === "exausto") return task.minutes.exausto || Math.round((task.minutes.normal || 25) * 0.5);
    if (mode === "m30") return task.minutes.m30 || 30;
    return task.minutes.normal || 25;
  }

  function getModeLabel() {
    const mode = state && state.mode ? state.mode : "normal";
    if (mode === "exausto") return "Exausto";
    if (mode === "m30") return "30 min";
    if (mode === "foco") return "Foco extremo";
    return "Normal";
  }

  function getSubjectByCode(subjectCode) {
    if (!window.DATA || !Array.isArray(window.DATA.subjects)) return null;
    return window.DATA.subjects.find(function (subject) {
      return subject.code === subjectCode;
    }) || null;
  }

  function getNextExamForSubject(subject, referenceDate) {
    if (!subject || !Array.isArray(subject.phases)) return null;
    return subject.phases
      .map(function (phase) {
        const dateObj = phase.examDate ? new Date(phase.examDate + "T00:00:00") : null;
        return dateObj ? { label: phase.label, examDate: phase.examDate, dateObj: dateObj } : null;
      })
      .filter(Boolean)
      .filter(function (phase) { return phase.dateObj >= referenceDate; })
      .sort(function (a, b) { return a.dateObj - b.dateObj; })[0] || null;
  }

  function formatIsoShort(iso) {
    const parts = iso.split("-");
    const dt = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    return dt.getDate() + " " + months[dt.getMonth()];
  }

  function formatStamp(timestamp) {
    const dt = new Date(timestamp);
    return String(dt.getHours()).padStart(2, "0") + ":" + String(dt.getMinutes()).padStart(2, "0");
  }

  function toIso(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function addDaysIso(iso, days) {
    const parts = iso.split("-");
    const dt = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    dt.setDate(dt.getDate() + days);
    return toIso(dt);
  }

  function diffDaysIso(a, b) {
    const da = new Date(a + "T00:00:00");
    const db = new Date(b + "T00:00:00");
    return Math.round((db - da) / 86400000);
  }

  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }

  function greetingFor(hour) {
    if (hour < 5) return "Ainda e madrugada.";
    if (hour < 12) return "Bom dia.";
    if (hour < 18) return "Boa tarde.";
    return "Boa noite.";
  }

  function escapeText(value) {
    if (value == null) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  document.addEventListener("click", function (event) {
    const navBtn = event.target && event.target.closest ? event.target.closest("[data-home-nav]") : null;
    if (navBtn && typeof openPage === "function") {
      openPage(navBtn.getAttribute("data-home-nav") || "home");
    }
  });

  window.addEventListener("hashchange", function () {
    setTimeout(syncHomeVisitState, 0);
  });

  window.renderHomeDashboard = renderHomeDashboardV2;

  if (window.StudyApp && typeof window.StudyApp.onStateReplaced === "function") {
    window.StudyApp.onStateReplaced(function () {
      const page = document.getElementById("homePage");
      if (page && !page.hidden) renderHomeDashboardV2();
      else syncHomeVisitState();
    });
  }

  if (window.StudyApp && typeof window.StudyApp.onReady === "function") {
    window.StudyApp.onReady(function () {
      syncHomeVisitState();
      const page = document.getElementById("homePage");
      if (page && !page.hidden) renderHomeDashboardV2();
    });
  }

  console.log("[home-panel] v2 inicializado (Passos 1-4)");
})();
