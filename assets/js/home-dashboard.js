/* Home dashboard extracted from app-core. */

function renderHomeList(items, emptyText, options = {}) {
      if (!items.length) return `<div class="home-empty">${escapeHtml(emptyText)}</div>`;
      const itemClass = options.itemClass ? ` ${options.itemClass}` : "";
      return `<div class="home-list-card">${items.map((item) => `
        <div class="home-list-item${itemClass}">
          ${item.stamp ? `<span class="home-pulse-stamp">${escapeHtml(item.stamp)}</span>` : ""}
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.meta || "")}</span>
        </div>
      `).join("")}</div>`;
    }

    function renderHomeSectionMetrics(items) {
      return `<div class="home-metric-row">${items.map((item) => `
        <div class="home-section-metric">
          <span class="home-metric-label">${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(String(item.value))}</strong>
        </div>
      `).join("")}</div>`;
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
        .map((value) => new Date(value).getTime())
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => b - a)[0] || 0;
    }

    function formatHomeDuration(ms) {
      const totalMinutes = Math.max(0, Math.round(ms / 60000));
      const days = Math.floor(totalMinutes / (60 * 24));
      const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
      const minutes = totalMinutes % 60;
      if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
      if (hours > 0) return minutes > 0 ? `${hours}h${String(minutes).padStart(2, "0")}` : `${hours}h`;
      return `${Math.max(1, minutes)}min`;
    }

    function getHomeUsefulWindow(referenceDate) {
      const startHour = 7;
      const endHour = 22;
      const now = new Date(referenceDate);
      const windowStart = new Date(now);
      const windowEnd = new Date(now);
      windowStart.setHours(startHour, 0, 0, 0);
      windowEnd.setHours(endHour, 0, 0, 0);

      if (now >= windowEnd) {
        return {
          label: "Janela util",
          value: "encerrada hoje",
          detail: "Feche o dia sem abrir novas frentes."
        };
      }

      if (now < windowStart) {
        return {
          label: "Janela util",
          value: `${formatHomeDuration(windowEnd - windowStart)} hoje`,
          detail: "O dia ainda esta inteiro para escolher com calma."
        };
      }

      return {
        label: "Janela util",
        value: `${formatHomeDuration(windowEnd - now)} restante`,
        detail: "Proteja uma unica frente principal."
      };
    }

    function getHomeDueMeta(dueDate, dueTime, referenceDate) {
      if (!dueDate) {
        return { label: "Sem prazo", tone: "accent", dueAtMs: Number.POSITIVE_INFINITY };
      }
      const safeTime = dueTime && /^\d{2}:\d{2}$/.test(dueTime) ? dueTime : "23:59";
      const dueDay = parseDate(dueDate);
      const dueAt = new Date(`${dueDate}T${safeTime}:00`);
      const diffMs = dueAt.getTime() - referenceDate.getTime();
      const tone = diffMs < 0 ? "danger" : diffMs <= 24 * 60 * 60 * 1000 ? "warning" : "accent";
      let label = diffMs < 0 ? `ha ${formatHomeDuration(Math.abs(diffMs))}` : `em ${formatHomeDuration(diffMs)}`;
      if (diffMs >= 0 && isSameDay(referenceDate, dueDay)) {
        label = dueTime ? `hoje ${dueTime}` : "hoje";
      }
      return { label, tone, dueAtMs: dueAt.getTime() };
    }

    function formatWorkTaskMeta(task, todayIso) {
      if (!task) return "";
      const WD = window.WorkDomain;
      const company = task.scope === "company" && WD ? WD.companyName(task.companyId) : "Geral";
      const due = task.dueDate
        ? (task.dueDate < todayIso ? `atrasada desde ${task.dueDate}` : task.dueDate === todayIso ? "vence hoje" : `prazo ${task.dueDate}`)
        : "sem prazo";
      const next = task.nextAction ? ` | ${task.nextAction}` : "";
      return `${company} | ${due}${next}`;
    }

    function getStudyDeadlineItems(referenceDate) {
      return (state.deadlines || [])
        .filter((deadline) => deadline && !deadline.deliveredAt && deadline.dueDate)
        .map((deadline) => {
          const subject = deadline.subjectCode ? getSubject(deadline.subjectCode) : null;
          const dueMeta = getHomeDueMeta(deadline.dueDate, deadline.dueTime, referenceDate);
          return {
            key: `study-deadline-${deadline.id}`,
            kind: "study-deadline",
            title: deadline.title || "Entrega",
            prefix: subject ? subject.shortName : (deadline.type || "Estudo"),
            subjectCode: subject ? subject.code : (deadline.subjectCode || null),
            meta: `${subject ? subject.shortName : (deadline.type || "Estudo")} | ${dueMeta.label}`,
            dueDate: deadline.dueDate,
            dueTime: deadline.dueTime || null,
            dueAtMs: dueMeta.dueAtMs,
            countdown: dueMeta.label,
            tone: dueMeta.tone
          };
        })
        .sort((a, b) => a.dueAtMs - b.dueAtMs);
    }

    function getHomeTimelineTickets(referenceDate, studyDeadlines, workTasks) {
      const horizonMs = 72 * 60 * 60 * 1000;
      const studyTickets = studyDeadlines.map((item) => ({
        key: item.key,
        label: item.prefix,
        title: item.title,
        meta: item.meta,
        countdown: item.countdown,
        tone: item.tone,
        dueAtMs: item.dueAtMs
      }));
      const workTickets = (workTasks || [])
        .filter((task) => task && task.status !== "done" && task.dueDate)
        .map((task) => {
          const dueMeta = getHomeDueMeta(task.dueDate, null, referenceDate);
          return {
            key: `work-deadline-${task.id}`,
            label: task.scope === "company" && window.WorkDomain ? window.WorkDomain.companyName(task.companyId) : "Geral",
            companyId: task.scope === "company" ? task.companyId : null,
            title: task.title,
            meta: task.nextAction || formatWorkTaskMeta(task, toIsoDate(referenceDate)),
            countdown: dueMeta.label,
            tone: dueMeta.tone,
            dueAtMs: dueMeta.dueAtMs
          };
        })
        .filter((item) => item.dueAtMs - referenceDate.getTime() <= horizonMs);

      const merged = [...studyTickets, ...workTickets].sort((a, b) => a.dueAtMs - b.dueAtMs);
      if (merged.length <= 6) return merged;
      return [...merged.slice(0, 5), {
        key: "timeline-overflow",
        label: "Mais",
        title: `+ ${merged.length - 5} itens no horizonte`,
        meta: "Abra estudos e trabalho para ver o restante.",
        countdown: "overflow",
        tone: "accent",
        dueAtMs: Number.POSITIVE_INFINITY
      }];
    }

    function getHomeChangesSinceLastSeen(referenceDate, lastSeenAt, workTasks) {
      const fallbackCutoff = referenceDate.getTime() - (24 * 60 * 60 * 1000);
      const lastSeenMs = new Date(lastSeenAt).getTime();
      const cutoffMs = Number.isFinite(lastSeenMs) ? lastSeenMs : fallbackCutoff;
      const changes = [];

      (state.deadlines || []).forEach((deadline) => {
        const timestamp = getHomeRecordTimestamp(deadline);
        if (timestamp <= cutoffMs) return;
        const subject = deadline.subjectCode ? getSubject(deadline.subjectCode) : null;
        const action = deadline.createdAt && new Date(deadline.createdAt).getTime() > cutoffMs
          ? "Novo prazo"
          : deadline.deliveredAt && new Date(deadline.deliveredAt).getTime() > cutoffMs
            ? "Entrega concluida"
            : "Prazo atualizado";
        changes.push({
          title: `${subject ? subject.shortName : (deadline.type || "Estudo")}: ${deadline.title || "Entrega"}`,
          meta: `${action} | ${deadline.dueDate ? formatDateLong(parseDate(deadline.dueDate)) : "sem data"}`,
          stamp: formatDateTimeShort(new Date(timestamp).toISOString()),
          timestamp
        });
      });

      (workTasks || []).forEach((task) => {
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
          title: `${company}: ${task.title}`,
          meta: `${action} | ${task.nextAction || "sem proxima acao registrada"}`,
          stamp: formatDateTimeShort(new Date(timestamp).toISOString()),
          timestamp
        });
      });

      return changes.sort((a, b) => b.timestamp - a.timestamp).slice(0, 4);
    }

    function getHomeStuckItems(referenceDate, workTasks) {
      const cutoffMs = referenceDate.getTime() - (7 * 24 * 60 * 60 * 1000);
      return (workTasks || [])
        .filter((task) => task && (task.status === "inbox" || task.status === "waiting"))
        .map((task) => {
          const timestamp = getHomeRecordTimestamp(task);
          const company = task.scope === "company" && window.WorkDomain ? window.WorkDomain.companyName(task.companyId) : "Geral";
          const days = Math.max(7, Math.floor((referenceDate.getTime() - timestamp) / (24 * 60 * 60 * 1000)));
          return {
            title: `${company}: ${task.title}`,
            meta: `${task.status === "waiting" ? "Aguardando" : "Inbox"} | parado ha ${days} dias`,
            stamp: task.status === "waiting" ? "waiting" : "inbox",
            timestamp
          };
        })
        .filter((item) => item.timestamp <= cutoffMs)
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(0, 4);
    }

    function getHomeNextExamAcross(referenceDate) {
      return DATA.subjects
        .map((subject) => {
          const exam = getNextExam(subject, referenceDate);
          if (!exam) return null;
          return { subject, exam, dateObj: parseDate(exam.examDate) };
        })
        .filter(Boolean)
        .sort((a, b) => a.dateObj - b.dateObj)[0] || null;
    }

    function getHomeRadarSubjects(referenceDate, studyDeadlines) {
      const deadlineSubjects = new Set(studyDeadlines.map((item) => item.subjectCode).filter(Boolean));
      return DATA.subjects.filter((subject) => {
        if (deadlineSubjects.has(subject.code)) return true;
        const exam = getNextExam(subject, referenceDate);
        return exam ? daysBetween(referenceDate, parseDate(exam.examDate)) <= 45 : false;
      }).length;
    }

    function buildHomePrimaryDecision(plan, studyDeadlines, buckets, referenceDate) {
      const candidates = [];
      const activeTask = state.activeSession ? getTask(state.activeSession.taskId) : null;
      const activeSubject = activeTask ? getSubject(activeTask.subjectCode) : null;

      if (activeTask && activeSubject) {
        candidates.push({
          key: `study-task-${activeTask.id}`,
          type: "study",
          prefix: activeSubject.shortName,
          title: activeTask.title,
          reason: "Sessao ja iniciada. Continue a frente aberta antes de trocar de contexto.",
          actionLabel: "Continuar sessao",
          actionAttrs: `data-home-open-studies`,
          score: 999
        });
      }

      if (plan) {
        const studyMinutes = getTaskMinutes(plan.task);
        const studyDeadline = studyDeadlines.find((item) => item.subjectCode === plan.subject.code) || null;
        const nextExam = getNextExam(plan.subject, referenceDate);
        let score = 62;
        let reason = studyMinutes <= 30
          ? `Fila curta: ${studyMinutes} min de friccao baixa.`
          : "Mantem a materia andando antes de virar urgencia.";
        if (studyDeadline) {
          const deadlineDays = daysBetween(referenceDate, parseDate(studyDeadline.dueDate));
          if (deadlineDays <= 1) {
            score += 24;
            reason = `${studyDeadline.title} vence ${studyDeadline.countdown}.`;
          } else if (deadlineDays <= 3) {
            score += 12;
            reason = `${studyDeadline.title} entra na janela curta em ${deadlineDays} dias.`;
          }
        } else if (nextExam) {
          const examDays = daysBetween(referenceDate, parseDate(nextExam.examDate));
          if (examDays <= 7) {
            score += 10;
            reason = `${nextExam.label} em ${Math.max(0, examDays)} dias.`;
          }
        }
        if (state.mode === "m30") score += studyMinutes <= 30 ? 22 : -12;
        if (state.mode === "exausto") score += studyMinutes <= 30 ? 8 : -6;
        candidates.push({
          key: `study-task-${plan.task.id}`,
          type: "study",
          prefix: plan.subject.shortName,
          title: plan.task.title,
          reason,
          actionLabel: state.mode === "m30" ? "Iniciar pomodoro curto" : "Iniciar pomodoro (25 min)",
          actionAttrs: `data-home-start-task="${escapeHtml(plan.task.id)}"`,
          score
        });
      }

      const overdueTask = (buckets.overdue || [])[0] || null;
      if (overdueTask) {
        const company = overdueTask.scope === "company" && window.WorkDomain ? window.WorkDomain.companyName(overdueTask.companyId) : "Geral";
        candidates.push({
          key: `work-task-${overdueTask.id}`,
          type: "work",
          prefix: company,
          companyId: overdueTask.scope === "company" ? overdueTask.companyId : null,
          title: overdueTask.title,
          reason: overdueTask.dueDate ? `Atrasada ${getHomeDueMeta(overdueTask.dueDate, null, referenceDate).label}.` : "Ja deveria ter andado e ainda esta aberta.",
          actionLabel: "Marcar como concluida",
          actionAttrs: `data-home-complete-work="${escapeHtml(overdueTask.id)}"`,
          score: state.mode === "exausto" ? 80 : 92
        });
      }

      const dueSoonTask = (buckets.critical || []).find((task) => task && task.dueDate) || null;
      if (dueSoonTask) {
        const company = dueSoonTask.scope === "company" && window.WorkDomain ? window.WorkDomain.companyName(dueSoonTask.companyId) : "Geral";
        candidates.push({
          key: `work-task-${dueSoonTask.id}`,
          type: "work",
          prefix: company,
          companyId: dueSoonTask.scope === "company" ? dueSoonTask.companyId : null,
          title: dueSoonTask.title,
          reason: `Prazo ${getHomeDueMeta(dueSoonTask.dueDate, null, referenceDate).label}.`,
          actionLabel: "Marcar como concluida",
          actionAttrs: `data-home-complete-work="${escapeHtml(dueSoonTask.id)}"`,
          score: state.mode === "exausto" ? 70 : 82
        });
      }

      const todayTask = (buckets.today || [])[0] || null;
      if (todayTask) {
        const company = todayTask.scope === "company" && window.WorkDomain ? window.WorkDomain.companyName(todayTask.companyId) : "Geral";
        candidates.push({
          key: `work-task-${todayTask.id}`,
          type: "work",
          prefix: company,
          companyId: todayTask.scope === "company" ? todayTask.companyId : null,
          title: todayTask.title,
          reason: todayTask.nextAction || "Ja cabe hoje, sem depender de outra frente.",
          actionLabel: "Marcar como concluida",
          actionAttrs: `data-home-complete-work="${escapeHtml(todayTask.id)}"`,
          score: state.mode === "m30" ? 74 : 68
        });
      }

      const sorted = candidates.sort((a, b) => b.score - a.score);
      return {
        primary: sorted[0] || null,
        alternatives: sorted.slice(1, 3)
      };
    }

    function syncHomeCaptureModalOptions(WD) {
      if (!WD) return;
      if (elements.homeCaptureCompany) {
        const companyOptions = WD.COMPANIES.map((company) => `<option value="${company.id}">${escapeHtml(company.name)}</option>`).join("");
        elements.homeCaptureCompany.innerHTML = `<option value="">Geral</option>${companyOptions}`;
      }
      if (elements.homeCapturePriority) {
        elements.homeCapturePriority.innerHTML = WD.PRIORITIES.map((priority) => `
          <option value="${priority.value}"${priority.value === "medium" ? " selected" : ""}>${escapeHtml(priority.label)}</option>
        `).join("");
      }
    }

    function renderHomeDashboard(plan, queue, referenceDate) {
      const WD = window.WorkDomain;
      const root = elements.homeDashboardRoot || elements.homePage;
      if (!root) return;

      const todayIso = toIsoDate(referenceDate);
      const weekAnchor = state.workWeekAnchor || todayIso;
      const workTasks = state.workTasks || [];
      const buckets = WD ? WD.dashboardBuckets(workTasks, todayIso, weekAnchor) : { today: [], overdue: [], waiting: [], critical: [], companies: [] };
      const studyDeadlines = getStudyDeadlineItems(referenceDate);
      const studyQueueItems = (queue || []).slice(0, 6).map((item) => ({
        key: `study-task-${item.task.id}`,
        title: `${item.subject.shortName}: ${item.task.title}`,
        meta: `${getTaskMinutes(item.task)} min | fila de hoje`
      }));
      const timelineTickets = getHomeTimelineTickets(referenceDate, studyDeadlines, workTasks);
      const lastHomeOpenAt = state.lastHomeOpenAt;
      const changesSinceLastSeen = getHomeChangesSinceLastSeen(referenceDate, lastHomeOpenAt, workTasks);
      const stuckItems = getHomeStuckItems(referenceDate, workTasks);
      const decision = buildHomePrimaryDecision(plan, studyDeadlines, buckets, referenceDate);
      const primary = decision.primary;
      const usefulWindow = getHomeUsefulWindow(referenceDate);
      const nextExamAcross = getHomeNextExamAcross(referenceDate);
      const nextStudyDeadline = studyDeadlines[0] || null;
      const nextOverdueTask = (buckets.overdue || [])[0] || null;
      const nextWaitingTask = (buckets.waiting || [])[0] || null;
      const radarSubjects = getHomeRadarSubjects(referenceDate, studyDeadlines);
      const weekOpenTasks = workTasks.filter((task) => task && task.status !== "done" && task.scheduledDayIso && task.scheduledDayIso >= weekAnchor && task.scheduledDayIso <= toIsoDate(addDays(parseDate(weekAnchor), 6))).length;
      const timelineKeys = new Set(timelineTickets.map((item) => item.key));
      const primaryKey = primary ? primary.key : null;
      const studyScopeItems = [
        ...studyQueueItems,
        ...studyDeadlines.map((item) => ({ key: item.key, title: `${item.prefix}: ${item.title}`, meta: item.meta }))
      ].filter((item) => item.key !== primaryKey && !timelineKeys.has(item.key)).slice(0, 4);
      const workScopeItems = [
        ...(buckets.overdue || []).map((task) => ({ key: `work-task-${task.id}`, title: task.title, meta: formatWorkTaskMeta(task, todayIso) })),
        ...(buckets.today || []).map((task) => ({ key: `work-task-${task.id}`, title: task.title, meta: formatWorkTaskMeta(task, todayIso) })),
        ...(buckets.waiting || []).map((task) => ({ key: `work-task-${task.id}`, title: task.title, meta: task.nextAction || "Aguardando retorno" }))
      ].filter((item) => item.key !== primaryKey && !timelineKeys.has(item.key)).slice(0, 4);
      const companyChips = (buckets.companies || []).map((summary) => ({
        id: summary.company.id,
        title: summary.company.name,
        count: summary.openCount
      })).filter((item) => item.count > 0);

      const nextExamDays = nextExamAcross ? Math.max(0, daysBetween(referenceDate, nextExamAcross.dateObj)) : null;
      const heroBriefItems = [
        {
          label: "Prova mais proxima",
          value: nextExamAcross ? nextExamAcross.subject.shortName : "sem prova curta",
          meta: nextExamAcross ? `${nextExamAcross.exam.label} em ${nextExamDays}d` : "nenhuma dentro do radar"
        },
        {
          label: "Entrega mais proxima",
          value: nextStudyDeadline ? nextStudyDeadline.prefix : "sem entrega curta",
          meta: nextStudyDeadline ? `${nextStudyDeadline.title} · ${nextStudyDeadline.countdown}` : "nenhum prazo academico imediato"
        },
        {
          label: "Trabalho no vermelho",
          value: String((buckets.overdue || []).length),
          meta: nextOverdueTask ? nextOverdueTask.title : "sem atraso relevante agora"
        },
        {
          label: "Aguardando",
          value: String((buckets.waiting || []).length),
          meta: nextWaitingTask ? nextWaitingTask.title : "sem dependencia externa aberta"
        }
      ];

      const supportList = decision.alternatives.length
        ? decision.alternatives.map((item) => ({
            label: item.prefix,
            companyId: item.companyId || null,
            title: item.title,
            meta: item.reason
          }))
        : [
            nextStudyDeadline
              ? {
                  label: nextStudyDeadline.prefix,
                  title: nextStudyDeadline.title,
                  meta: nextStudyDeadline.countdown
                }
              : null,
            nextOverdueTask
              ? {
                  label: nextOverdueTask.scope === "company" && WD ? WD.companyName(nextOverdueTask.companyId) : "Geral",
                  companyId: nextOverdueTask.scope === "company" ? nextOverdueTask.companyId : null,
                  title: nextOverdueTask.title,
                  meta: nextOverdueTask.dueDate ? `Atrasada desde ${nextOverdueTask.dueDate}` : "Ja deveria ter andado"
                }
              : null
          ].filter(Boolean);

      const currentModeLabel = typeof modeLabel === "function" ? modeLabel() : "Normal";
      const modeMeta = state.mode === "foco"
        ? "sem troca de contexto"
        : state.mode === "exausto"
          ? "energia preservada"
          : state.mode === "m30"
            ? "janela curta de execucao"
            : "ritmo normal do dia";
      const supportLead = supportList[0] || null;
      const pressureCard = nextStudyDeadline
        ? {
            label: "Pressao academica",
            value: nextStudyDeadline.prefix,
            meta: `${nextStudyDeadline.title} · ${nextStudyDeadline.countdown}`
          }
        : nextExamAcross
          ? {
              label: "Proxima prova",
              value: nextExamAcross.subject.shortName,
              meta: `${nextExamAcross.exam.label} em ${nextExamDays}d`
            }
          : {
              label: "Radar academico",
              value: `${radarSubjects} materia(s)`,
              meta: "em horizonte curto"
            };
      const focusInsights = [
        {
          label: "Janela",
          value: usefulWindow.value || usefulWindow.label,
          meta: usefulWindow.detail
        },
        pressureCard,
        supportLead
          ? {
              label: "Plano B",
              value: supportLead.label,
              meta: supportLead.title
            }
          : {
              label: "Ritmo",
              value: currentModeLabel,
              meta: modeMeta
            }
      ];

      syncHomeCaptureModalOptions(WD);
      elements.homePage.dataset.homeMode = state.mode;

      const heroCopy = state.mode === "exausto"
        ? (primary ? "Proteja energia. Resolva apenas uma frente com o menor atrito possivel." : "Hoje a regra e simplificar, nao expandir.")
        : state.mode === "foco"
          ? ""
          : (primary ? primary.reason : "Sem urgencia real agora. Use a home para manter clareza, nao para criar ansiedade.");
      root.innerHTML = `
        <section class="home-layer home-layer--hero">
          <article class="home-card home-hero-card">
            <div class="home-hero-shell">
              <div class="home-hero-main">
                <div class="home-focus-board">
                  <div class="home-focus-head">
                    <div class="home-window-pill">
                      <span class="home-window-kicker">${escapeHtml(usefulWindow.label)}</span>
                      <strong class="home-window-value">${escapeHtml(usefulWindow.value || usefulWindow.label)}</strong>
                    </div>
                    <span class="home-focus-kicker">Foco central</span>
                  </div>
                  <div class="home-focus-body">
                    <div class="home-focus-grid">
                      <div class="home-focus-copy">
                        <div class="home-focus-meta">
                          <span class="home-hero-prefix"${primary && primary.companyId ? ` data-company-id="${escapeHtml(primary.companyId)}"` : ""}>${escapeHtml(primary ? primary.prefix : "Painel principal")}</span>
                          <span class="home-focus-context">${escapeHtml(primary ? "frente que mais importa agora" : "estado geral do dia")}</span>
                        </div>
                        <h2>${escapeHtml(primary ? primary.title : "Nenhuma frente critica por enquanto.")}</h2>
                        <p class="home-hero-reason">${escapeHtml(heroCopy || usefulWindow.detail)}</p>
                        <div class="home-hero-actions">
                          ${primary ? `<button class="btn btn-primary home-primary-action" type="button" ${primary.actionAttrs}>${escapeHtml(primary.actionLabel)}</button>` : `<button class="btn btn-primary home-primary-action" type="button" data-home-open-studies>Revisar fila academica</button>`}
                          <button class="home-secondary-link" type="button" data-home-capture-open>Abrir captura rapida</button>
                        </div>
                      </div>
                      <div class="home-focus-rail">
                        ${focusInsights.map((item) => `
                          <article class="home-focus-insight">
                            <span class="home-focus-insight-label">${escapeHtml(item.label)}</span>
                            <strong class="home-focus-insight-value">${escapeHtml(item.value)}</strong>
                            <span class="home-focus-insight-meta">${escapeHtml(item.meta)}</span>
                          </article>
                        `).join("")}
                        <article class="home-focus-insight home-focus-insight--mode">
                          <span class="home-focus-insight-label">Ritmo</span>
                          <strong class="home-focus-insight-value">${escapeHtml(currentModeLabel)}</strong>
                          <span class="home-focus-insight-meta">${escapeHtml(modeMeta)}</span>
                        </article>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="home-brief-ribbon">
                  <div class="home-brief-ribbon-top">
                    <span class="home-card-eyebrow">Leitura rapida</span>
                    <span class="home-brief-ribbon-copy">4 sinais para decidir sem abrir outras abas.</span>
                  </div>
                  <div class="home-hero-brief">
                    ${heroBriefItems.map((item) => `
                      <article class="home-brief-card">
                        <span class="home-brief-label">${escapeHtml(item.label)}</span>
                        <strong class="home-brief-value">${escapeHtml(item.value)}</strong>
                        <span class="home-brief-meta">${escapeHtml(item.meta)}</span>
                      </article>
                    `).join("")}
                  </div>
                </div>
              </div>
              <div class="home-hero-side home-hero-support">
                <div class="home-hero-meta">
                  <div class="home-metric" data-tone="study">
                    <span class="home-metric-label">Estudos</span>
                    <strong class="home-metric-value">${escapeHtml(String(studyQueueItems.length))}</strong>
                    <span class="home-metric-copy">${escapeHtml(studyDeadlines.length ? `${studyDeadlines.length} prazo(s) em aberto` : "sem prazo academico aberto")}</span>
                  </div>
                  <div class="home-metric" data-tone="study">
                    <span class="home-metric-label">Proxima prova</span>
                    <strong class="home-metric-value">${escapeHtml(nextExamAcross ? nextExamAcross.subject.shortName : "--")}</strong>
                    <span class="home-metric-copy">${escapeHtml(nextExamAcross ? `${nextExamAcross.exam.label} em ${nextExamDays}d` : "nenhuma prova no curto prazo")}</span>
                  </div>
                  <div class="home-metric" data-tone="work">
                    <span class="home-metric-label">Trabalho hoje</span>
                    <strong class="home-metric-value">${escapeHtml(String((buckets.overdue || []).length + (buckets.today || []).length))}</strong>
                    <span class="home-metric-copy">${escapeHtml((buckets.overdue || []).length ? `${(buckets.overdue || []).length} atrasada(s)` : "sem item no vermelho")}</span>
                  </div>
                  <div class="home-metric" data-tone="work">
                    <span class="home-metric-label">Aguardando</span>
                    <strong class="home-metric-value">${escapeHtml(String((buckets.waiting || []).length))}</strong>
                    <span class="home-metric-copy">${escapeHtml((buckets.waiting || []).length ? "dependencias externas abertas" : "caixa limpa")}</span>
                  </div>
                </div>
                <div class="home-side-panel">
                  <div class="home-side-panel-top">
                    <span class="home-card-eyebrow">Se nao for essa</span>
                    <h3>Plano B imediato</h3>
                    <p class="home-card-copy">Entradas curtas para voce nao perder o fio quando mudar de contexto.</p>
                  </div>
                  ${supportList.length ? `<div class="home-side-list">${supportList.map((item) => `
                    <div class="home-side-item">
                      <span class="home-side-item-label"${item.companyId ? ` data-company-id="${escapeHtml(item.companyId)}"` : ""}>${escapeHtml(item.label)}</span>
                      <strong>${escapeHtml(item.title)}</strong>
                      <span>${escapeHtml(item.meta)}</span>
                    </div>
                  `).join("")}</div>` : `<div class="home-empty">Sem segunda frente relevante agora.</div>`}
                </div>
              </div>
            </div>
          </article>
        </section>

        <section class="home-layer home-layer--timeline">
          <article class="home-card home-timeline-card">
            <div class="home-card-top">
              <div>
                <span class="home-card-eyebrow">Radar curto</span>
                <h3>Proximas 72h</h3>
                <p class="home-card-copy">Prazos, provas e frentes que entraram de vez no horizonte imediato.</p>
              </div>
              <span class="chip accent">${escapeHtml(String(timelineTickets.filter((item) => item.key !== "timeline-overflow").length))}</span>
            </div>
            ${timelineTickets.length ? `<div class="home-ticket-list">${timelineTickets.map((item) => `
              <article class="home-ticket${item.key === "timeline-overflow" ? " home-ticket-overflow" : ""}" data-tone="${escapeHtml(item.tone || "accent")}"${item.companyId ? ` data-company-id="${escapeHtml(item.companyId)}"` : ""}>
                ${item.key === "timeline-overflow"
                  ? `<strong class="home-ticket-title">${escapeHtml(item.title)}</strong><span class="home-ticket-meta">${escapeHtml(item.meta)}</span>`
                  : `<div class="home-ticket-top"><span class="home-ticket-label"${item.companyId ? ` data-company-id="${escapeHtml(item.companyId)}"` : ""}>${escapeHtml(item.label)}</span><span class="home-ticket-countdown">${escapeHtml(item.countdown)}</span></div><strong class="home-ticket-title">${escapeHtml(item.title)}</strong><p class="home-ticket-meta">${escapeHtml(item.meta)}</p>`}
              </article>
            `).join("")}</div>` : `<div class="home-empty">Nada pressiona as proximas 72h.</div>`}
          </article>
        </section>

        <section class="home-layer home-layer--pulse-new">
          <article class="home-card home-section-card">
            <div class="home-card-top">
              <div>
                <span class="home-card-eyebrow">Pulse</span>
                <h3>Desde a ultima abertura</h3>
                <p class="home-card-copy">${escapeHtml(lastHomeOpenAt ? "So o que entrou ou mudou desde a sua ultima leitura." : "Primeira leitura desta versao. A partir de agora o app marca so mudancas novas.")}</p>
              </div>
              <span class="chip accent">${escapeHtml(String(changesSinceLastSeen.length))}</span>
            </div>
            ${renderHomeList(changesSinceLastSeen, "Nada novo. Sem surpresas desde a ultima abertura.", { itemClass: "home-list-item--pulse" })}
          </article>
        </section>

        <section class="home-layer home-layer--pulse-stuck">
          <article class="home-card home-section-card">
            <div class="home-card-top">
              <div>
                <span class="home-card-eyebrow">Higiene</span>
                <h3>Parado ha 7 dias</h3>
                <p class="home-card-copy">Inbox e aguardando que ficaram velhos demais para continuar invisiveis.</p>
              </div>
              <span class="chip warning">${escapeHtml(String(stuckItems.length))}</span>
            </div>
            ${renderHomeList(stuckItems, "Inbox limpa. Nenhum item envelhecendo sem toque.", { itemClass: "home-list-item--stuck" })}
          </article>
        </section>

        <section class="home-layer home-layer--study">
          <article class="home-card home-section-card">
            <div class="home-card-top">
              <div>
                <span class="home-card-eyebrow">Estudos</span>
                <h3>Escopo academico</h3>
                <p class="home-card-copy">Fila curta, prova mais proxima e materias que seguem no radar.</p>
              </div>
            </div>
            ${renderHomeSectionMetrics([
              { label: "Materias no radar", value: radarSubjects || 0 },
              { label: "Fila de hoje", value: studyQueueItems.length },
              { label: "Proxima prova", value: nextExamAcross ? nextExamAcross.subject.shortName : "--" }
            ])}
            ${renderHomeList(studyScopeItems, "Sem acao academica alem da decisao principal.")}
          </article>
        </section>

        <section class="home-layer home-layer--work">
          <article class="home-card home-section-card">
            <div class="home-card-top">
              <div>
                <span class="home-card-eyebrow">Trabalho</span>
                <h3>Escopo executivo</h3>
                <p class="home-card-copy">Semana aberta, pendencias atrasadas e pontos travados fora de voce.</p>
              </div>
            </div>
            ${renderHomeSectionMetrics([
              { label: "Abertas na semana", value: weekOpenTasks },
              { label: "Atrasadas", value: (buckets.overdue || []).length },
              { label: "Aguardando", value: (buckets.waiting || []).length }
            ])}
            ${renderHomeList(workScopeItems, "Sem outra frente executiva puxando prioridade agora.")}
          </article>
        </section>

        <section class="home-layer home-layer--portfolio">
          <article class="home-card home-portfolio-card">
            <div class="home-portfolio-intro">
              <span class="home-card-eyebrow">Portfolio</span>
              <h3>Empresas em foco</h3>
            </div>
            ${companyChips.length ? companyChips.map((item) => `
              <button type="button" class="home-portfolio-chip" data-home-work-filter="${escapeHtml(item.id)}" data-company-id="${escapeHtml(item.id)}">
                <span>${escapeHtml(item.title)}</span>
                <span class="home-portfolio-chip-count">${escapeHtml(String(item.count))}</span>
              </button>
            `).join("") : `<div class="home-empty">Nenhuma empresa com demanda aberta agora.</div>`}
          </article>
        </section>
      `;

      state.lastHomeOpenAt = new Date().toISOString();
      saveState();
    }

    function openHomeCaptureModal() {
      if (!elements.homeCaptureModalBackdrop) return;
      elements.homeCaptureModalBackdrop.setAttribute("data-open", "true");
      elements.homeCaptureModalBackdrop.setAttribute("aria-hidden", "false");
      const input = elements.homeCaptureModalBackdrop.querySelector('input[name="title"]');
      if (input) setTimeout(() => input.focus(), 20);
    }

    function closeHomeCaptureModal() {
      if (!elements.homeCaptureModalBackdrop) return;
      elements.homeCaptureModalBackdrop.removeAttribute("data-open");
      elements.homeCaptureModalBackdrop.setAttribute("aria-hidden", "true");
      const form = elements.homeCaptureModalBackdrop.querySelector("#homeQuickCaptureForm");
      if (form) form.reset();
    }

    function renderPageVisibility(referenceDate) {
      const currentPage = getPrimaryPage();
      const studySection = getStudySection();
      const onHome = currentPage === "home";
      const onStudies = currentPage === "studies";
      const onWork = currentPage === "work";
      const onNews = currentPage === "news";
      const onStudyDashboard = onStudies && studySection === "dashboard";
      const onWeek = onStudies && studySection === "week";
      const onFc = onStudies && studySection === "fc";
      const onCalendar = onStudies && studySection === "calendar";
      const onGrades = onStudies && studySection === "grades";
      const shellFrame = onStudies ? `studies-${studySection}` : currentPage;

      document.body.setAttribute("data-primary-page", currentPage);
      document.body.setAttribute("data-page-shell", shellFrame);
      if (onStudies) {
        document.body.setAttribute("data-study-page", studySection);
      } else {
        document.body.removeAttribute("data-study-page");
      }

      if (elements.homePage) elements.homePage.hidden = !onHome;
      if (elements.homeCaptureFab) elements.homeCaptureFab.hidden = !onHome;
      if (!onHome) closeHomeCaptureModal();
      if (elements.newsPage) elements.newsPage.hidden = !onNews;
      if (elements.studyNavBar) elements.studyNavBar.hidden = !onStudies;
      if (elements.workPage) elements.workPage.hidden = !onWork;
      if (elements.dashboardPage) elements.dashboardPage.hidden = !onStudyDashboard;
      if (elements.dashboardPage) elements.dashboardPage.dataset.focusMode = onStudyDashboard && state.dashboardFocusMode ? "true" : "false";
      if (elements.weekPage) elements.weekPage.hidden = !onWeek;
      if (elements.fcPage) elements.fcPage.hidden = !onFc;
      if (elements.calendarPage) elements.calendarPage.hidden = !onCalendar;
      if (elements.gradesPage) elements.gradesPage.hidden = !onGrades;
      elements.navButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.navPage === currentPage);
      });
      elements.studyNavButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.studyPage === studySection);
        button.setAttribute("aria-selected", button.dataset.studyPage === studySection ? "true" : "false");
      });
      updatePageHeader(onStudies ? studySection : currentPage, referenceDate);

      if (!onStudyDashboard && elements.mobileFocusbar) {
        elements.mobileFocusbar.innerHTML = "";
        elements.mobileFocusbar.setAttribute("hidden", "");
      }
    }

    function openPage(page) {
      if (STUDY_SECTIONS.includes(page)) {
        state.currentPage = "studies";
        state.studySection = page;
      } else if (PRIMARY_PAGES.includes(page)) {
        state.currentPage = page;
        if (page === "studies") state.studySection = getStudySection();
      } else {
        state.currentPage = "home";
      }
      saveState();
      render();
      syncHashFromState();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function openStudySection(section) {
      state.currentPage = "studies";
      state.studySection = normalizeStudySection(section, "dashboard");
      saveState();
      render();
      syncHashFromState();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function setStudyMode(mode) {
      state.mode = ["normal", "exausto", "m30", "foco"].includes(mode) ? mode : "normal";
      saveState();
      render();
    }

    function shiftCalendarMonth(referenceDate, delta) {
      const currentMonth = startOfMonth(referenceDate);
      const nextMonth = addMonths(getCalendarAnchorDate(referenceDate), delta);
      const safeMonth = nextMonth < currentMonth ? currentMonth : nextMonth;
      setCalendarAnchorDate(safeMonth);
      state.currentPage = "studies";
      state.studySection = "calendar";
      saveState();
      render();
    }

    function resetCalendarMonth(referenceDate) {
      setCalendarAnchorDate(startOfMonth(referenceDate));
      state.currentPage = "studies";
      state.studySection = "calendar";
      saveState();
      render();
    }


function safeRenderStep(label, fn) {
      try {
        fn();
      } catch (error) {
        console.error(`[render] ${label}`, error);
        showCompatHint(`Falha ao renderizar ${label}. Veja o console do navegador para detalhes.`);
      }
    }


    function render(ignorePinned = false) {
      const referenceDate = today();
      applyLightDelayForMissedDays(referenceDate);
      if (!state.calendarMonthAnchor) setCalendarAnchorDate(startOfMonth(referenceDate), { persist: false });
      renderPageVisibility(referenceDate);
      syncModeControls();
      let plan = null;
      let queue = [];

      safeRenderStep("planejamento principal", () => {
        plan = selectMainTask(referenceDate, ignorePinned);
        queue = buildTodayQueue(referenceDate, ignorePinned);
      });

      const primaryPage = getPrimaryPage();
      const studySection = getStudySection();

      if (primaryPage === "home") {
        safeRenderStep("tela principal", () => renderHomeDashboard(plan, queue, referenceDate));
        safeRenderStep("contadores", () => updateCollapseCounts());
        if (elements.mobileFocusbar) {
          elements.mobileFocusbar.innerHTML = "";
          elements.mobileFocusbar.setAttribute("hidden", "");
        }
        return;
      }

      if (primaryPage === "work") {
        safeRenderStep("trabalho", () => {
          if (window.WorkPlanner && typeof window.WorkPlanner.render === "function") window.WorkPlanner.render();
        });
        safeRenderStep("contadores", () => updateCollapseCounts());
        if (elements.mobileFocusbar) {
          elements.mobileFocusbar.innerHTML = "";
          elements.mobileFocusbar.setAttribute("hidden", "");
        }
        return;
      }

      if (primaryPage === "news") {
        safeRenderStep("notícias", () => {
          if (window.NewsFeed && typeof window.NewsFeed.render === "function") window.NewsFeed.render();
        });
        safeRenderStep("contadores", () => updateCollapseCounts());
        if (elements.mobileFocusbar) {
          elements.mobileFocusbar.innerHTML = "";
          elements.mobileFocusbar.setAttribute("hidden", "");
        }
        return;
      }

      const previousRenderPage = state.currentPage;
      state.currentPage = studySection;
      if (studySection !== "dashboard") plan = null;

      if (state.currentPage === "dashboard") {
        safeRenderStep("card principal", () => renderMainTask(plan, referenceDate));
        safeRenderStep("resumo executivo", () => renderExecutiveSummary(plan, referenceDate));
        safeRenderStep("cenário de atraso", () => renderWhatIf(plan, referenceDate));
        safeRenderStep("fila de hoje", () => renderTodayQueue(queue, referenceDate));
        safeRenderStep("prazos", () => renderDeadlinesCard(referenceDate));
        safeRenderStep("formulário de prazos", () => renderDeadlineFormCard(referenceDate));
        safeRenderStep("backup", () => renderBackupStatusCard(referenceDate));
        safeRenderStep("importação", () => renderImportPreviewCard(referenceDate));
        safeRenderStep("matérias", () => renderSubjects(referenceDate));
        safeRenderStep("fontes", () => renderSources());
        safeRenderStep("notas do motor", () => renderNotes());
      }

      if (state.currentPage === "calendar") {
        safeRenderStep("calendário", () => renderCalendarPage(referenceDate));
      }

      if (state.currentPage === "grades") {
        safeRenderStep("notas", () => renderGradesPage(referenceDate));
      }

      safeRenderStep("barra de foco mobile", () => renderMobileFocusbar(plan));
      safeRenderStep("contadores", () => updateCollapseCounts());
      state.currentPage = previousRenderPage;
    }

    function showCompatHint(message) {
      if (!elements.compatHint) return;
      elements.compatHint.style.display = "block";
      elements.compatHint.innerHTML = message;
    }


    function applyResponsiveLayout() {
      return THEME_API.applyResponsiveLayout(document.body, window.innerWidth);
    }

    try {
      const testKey = "__poli_test__";
      localStorage.setItem(testKey, "1");
      localStorage.removeItem(testKey);
    } catch (error) {
      showCompatHint("O navegador abriu o arquivo, mas o armazenamento local está bloqueado. Os conteúdos devem aparecer, porém seus dados e progresso podem não ser salvos. Abra no Chrome, Safari, Edge ou Firefox fora do preview do app.");
    }

    function initEvents() {
      document.querySelectorAll(".collapse-toggle").forEach((button) => {
        button.addEventListener("click", () => {
          const section = button.closest(".collapse-section");
          if (!section) return;
          const isOpen = section.getAttribute("data-open") === "true";
          if (isOpen) section.removeAttribute("data-open");
          else section.setAttribute("data-open", "true");
        });
      });

      if (elements.modeSelect) {
        elements.modeSelect.addEventListener("change", (event) => {
          setStudyMode(event.target.value);
        });
      }

      elements.navButtons.forEach((button) => {
        button.addEventListener("click", () => openPage(button.dataset.navPage));
      });
      elements.studyNavButtons.forEach((button) => {
        button.addEventListener("click", () => openStudySection(button.dataset.studyPage));
      });
      document.addEventListener("click", (event) => {
        const studyBtn = event.target && event.target.closest ? event.target.closest("[data-home-open-studies]") : null;
        if (studyBtn) openPage("studies");
        const startStudyBtn = event.target && event.target.closest ? event.target.closest("[data-home-start-task]") : null;
        if (startStudyBtn) {
          startTask(startStudyBtn.getAttribute("data-home-start-task"));
          openStudySection("dashboard");
        }
        const completeWorkBtn = event.target && event.target.closest ? event.target.closest("[data-home-complete-work]") : null;
        if (completeWorkBtn && window.WorkPlanner && typeof window.WorkPlanner.updateTask === "function") {
          window.WorkPlanner.updateTask(completeWorkBtn.getAttribute("data-home-complete-work"), { status: "done" }, "Tarefa concluida.");
        }
        const homeCaptureOpenBtn = event.target && event.target.closest ? event.target.closest("[data-home-capture-open]") : null;
        if (homeCaptureOpenBtn) openHomeCaptureModal();
      });

      if (elements.homeCaptureFab) elements.homeCaptureFab.addEventListener("click", openHomeCaptureModal);
      if (elements.homeCaptureCancel) elements.homeCaptureCancel.addEventListener("click", closeHomeCaptureModal);
      if (elements.homeCaptureModalBackdrop) {
        elements.homeCaptureModalBackdrop.addEventListener("click", (event) => {
          if (event.target === elements.homeCaptureModalBackdrop) closeHomeCaptureModal();
        });
      }
      document.addEventListener("submit", (event) => {
        const captureForm = event.target && event.target.closest ? event.target.closest("#homeQuickCaptureForm") : null;
        if (captureForm) closeHomeCaptureModal();
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeHomeCaptureModal();
      });

      if (elements.themeToggle) elements.themeToggle.addEventListener("click", toggleTheme);
      if (elements.recalcBtn) elements.recalcBtn.addEventListener("click", recalcPlan);
      if (elements.exportBtn) elements.exportBtn.addEventListener("click", exportStateBackup);
      if (elements.importBtn) elements.importBtn.addEventListener("click", () => elements.importFileInput && elements.importFileInput.click());
      if (elements.importFileInput) elements.importFileInput.addEventListener("change", (event) => {
        const [file] = event.target.files || [];
        importStateBackupFromFile(file);
        event.target.value = "";
      });
      if (elements.monthPrevBtn) elements.monthPrevBtn.addEventListener("click", () => shiftCalendarMonth(today(), -1));
      if (elements.monthTodayBtn) elements.monthTodayBtn.addEventListener("click", () => resetCalendarMonth(today()));
      if (elements.calendarLegendToggleBtn) elements.calendarLegendToggleBtn.addEventListener("click", toggleCalendarLegend);
      if (elements.monthNextBtn) elements.monthNextBtn.addEventListener("click", () => shiftCalendarMonth(today(), 1));

      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleThemeChange = () => {
        if (state.theme === "auto") applyTheme();
      };
      if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", handleThemeChange);
      } else if (typeof mediaQuery.addListener === "function") {
        mediaQuery.addListener(handleThemeChange);
      }
      window.addEventListener("hashchange", () => {
        if (routeHashLock) return;
        if (!applyRouteFromHash()) return;
        saveState();
        render();
      });
    }

    function getStateSnapshot() {
      return STORE_API.cloneState(state);
    }
