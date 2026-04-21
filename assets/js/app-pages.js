/* Page renderers extracted from app-core. */

    function renderMetricGrid(items, options = {}) {

      const className = options.className || "summary-grid";

      const marginTop = options.marginTop ? ` style="margin-top: ${options.marginTop};"` : "";

      return `

        <div class="${className}"${marginTop}>

          ${items.map((item) => `

            <div class="metric">

              <div class="label">${escapeHtml(item.label)}</div>

              <div class="value">${item.value}</div>

              <div class="subvalue">${escapeHtml(item.subvalue)}</div>

            </div>

          `).join("")}

        </div>

      `;

    }



    function renderDetailList(items, options = {}) {

      const className = options.className || "small-list";

      const marginTop = options.marginTop ? ` style="margin-top: ${options.marginTop};"` : "";

      const valueOnly = options.valueOnly === true;

      return `

        <ul class="${className}"${marginTop}>

          ${items.map((item) => `

            <li>${valueOnly ? `<span class="muted">${item.value}</span>` : `<strong>${escapeHtml(item.label)}</strong><span class="muted">${item.value}</span>`}</li>

          `).join("")}

        </ul>

      `;

    }

function renderMainTask(plan, referenceDate) {

      if (!plan) {

        elements.mainTaskCard.innerHTML = `

          <div class="focus-topline">

            <h3 class="card-title">Matéria do dia</h3>

          </div>

          <div class="empty-state">Nenhuma tarefa pendente apareceu na janela ativa. Se isso acontecer no seu semestre, recalcule ou marque novas tarefas como não concluídas para a matéria voltar ao topo.</div>

        `;

        return;

      }



      const { subject, task, pinned } = plan;

      const phase = getPhase(subject, task.phaseId);

      const nextExam = getNextExam(subject, referenceDate);

      const risk = getRiskLabel(subjectScore(subject, referenceDate));

      const reasons = getReasonChips(task, subject, referenceDate);

      const sessionLabel = getSessionLabel(task.id);

      const stepItems = getTaskSteps(task)

        .map((step, index) => `

          <li>

            <span class="step-index">${index + 1}</span>

            <div>

              <strong>Passo ${index + 1}</strong>

              <div class="muted">${escapeHtml(step)}</div>

            </div>

          </li>

        `)

        .join("");

      const whyText = [subject.summary, task.why].join(" ");

      const reasonChips = reasons.map((reason) => `<span class="chip neutral">${escapeHtml(reason)}</span>`).join("");

      const sourceChips = task.source.slice(0, 3).map((name) => `<span class="chip neutral">${escapeHtml(name)}</span>`).join("");

      const extraSourceCount = Math.max(0, task.source.length - 3);

      const lightDelayCount = getTaskMeta(task.id).lightDelayCount || 0;



      elements.mainTaskCard.innerHTML = `

        <div class="focus-topline">

          <h3 class="card-title">Matéria do dia</h3>

          <div class="chip-row">

            <span class="chip ${risk.tone}">Risco ${risk.label}</span>

            <span class="chip accent">${task.phaseId}</span>

            <span class="chip neutral">${modeLabel()}</span>

            ${lightDelayCount > 0 ? `<span class="chip warning">atraso leve ${lightDelayCount}d</span>` : ""}

            ${pinned ? `<span class="chip warning">mantida por débito aberto</span>` : ""}

            ${sessionLabel ? `<span class="chip success">${escapeHtml(sessionLabel)}</span>` : ""}

            <button class="btn btn-ghost btn-inline-toggle" type="button" data-action="toggle-dashboard-focus">${state.dashboardFocusMode ? "Sair do foco" : "Modo foco"}</button>

          </div>

        </div>



        <div class="focus-layout">

          <div class="focus-copy">

            <div class="focus-code">${escapeHtml(subject.code)} · ${escapeHtml(subject.shortName)}</div>

            <h2 class="main-subject">${escapeHtml(subject.name)}</h2>

            <h3 class="main-task-title">${escapeHtml(task.title)}</h3>

            <p class="lede">${escapeHtml(getTaskText(task))}</p>



            <div class="focus-callout">

              <div class="focus-callout-title">Por que essa matéria foi escolhida</div>

              <div class="muted">${escapeHtml(whyText)}</div>

              <div class="chip-row">${reasonChips}</div>

            </div>



            <div class="subsection-title">O que fazer agora</div>

            <ul class="step-list step-grid">

              ${stepItems}

            </ul>



            <div class="action-row">

              <button class="btn btn-primary" data-action="start" data-task-id="${task.id}">COMEÇAR AGORA</button>

              <button class="btn btn-soft" data-action="complete" data-task-id="${task.id}">Concluí</button>

              <button class="btn btn-ghost" data-action="skip" data-task-id="${task.id}">Não rolou hoje</button>

              <button class="btn btn-add-planner" data-action="add-to-planner" data-task-id="${task.id}" title="Adicionar ao planner de hoje">+ Planner</button>

              <button class="btn btn-ghost" data-action="next-same" data-task-id="${task.id}">Próxima da mesma matéria</button>

            </div>

          </div>



          <aside class="focus-side">

            <div class="snapshot-grid">

              <div class="snapshot">

                <div class="label">Tempo estimado</div>

                <div class="value">${getTaskMinutes(task)} min</div>

                <div class="subvalue">modo ${modeLabel().toLowerCase()}</div>

              </div>

              <div class="snapshot">

                <div class="label">Próxima prova</div>

                <div class="value">${nextExam ? escapeHtml(nextExam.label) : "—"}</div>

                <div class="subvalue">${nextExam ? `${formatDate(parseDate(nextExam.examDate))} · ${Math.max(0, daysBetween(referenceDate, parseDate(nextExam.examDate)))} dias` : "sem prova futura"}</div>

              </div>

              <div class="snapshot">

                <div class="label">Peso pendente</div>

                <div class="value">${Math.round(getRemainingWeight(subject, referenceDate))}%</div>

                <div class="subvalue">${escapeHtml(subject.outsideDependency)}</div>

              </div>

              <div class="snapshot">

                <div class="label">Fase ativa</div>

                <div class="value">${escapeHtml(phase.label)}</div>

                <div class="subvalue">${formatDateLong(parseDate(phase.examDate))}</div>

              </div>

            </div>



            <div class="mini-card">

              <div class="focus-callout-title">Abrir primeiro</div>

              <div class="key-sources">

                ${sourceChips}

                ${extraSourceCount > 0 ? `<span class="chip neutral">+${extraSourceCount} fonte${extraSourceCount > 1 ? "s" : ""}</span>` : ""}

              </div>

              <div class="mini">Arquivo principal: ${escapeHtml(task.source[0])}</div>

            </div>

          </aside>

        </div>

      `;

    }



    function renderExecutiveSummary(plan, referenceDate) {

      const nextExamAcross = DATA.subjects

        .map((subject) => {

          const exam = getNextExam(subject, referenceDate);

          if (!exam) return null;

          return { subject, exam, dateObj: parseDate(exam.examDate) };

        })

        .filter(Boolean)

        .sort((a, b) => a.dateObj - b.dateObj)[0];



      const mostCritical = DATA.subjects

        .map((subject) => ({ subject, score: subjectScore(subject, referenceDate) }))

        .sort((a, b) => b.score - a.score)[0];



      const pendingCount = getPendingCount(referenceDate);

      const recentHours = getTotalRecentHours(referenceDate);

      const daysSince = mostCritical ? getDaysSinceLastStudy(mostCritical.subject.code, referenceDate) : 0;

      const nextExamDays = nextExamAcross ? Math.max(0, daysBetween(referenceDate, nextExamAcross.dateObj)) : null;

      const summaryMetrics = [
        {
          label: "Total pendente",
          value: String(pendingCount),
          subvalue: "tarefas ativas na janela atual"
        },
        {
          label: "Horas recentes",
          value: formatHours(recentHours),
          subvalue: "últimos 7 dias registrados"
        },
        {
          label: "Matéria crítica",
          value: mostCritical ? escapeHtml(mostCritical.subject.shortName) : "—",
          subvalue: mostCritical ? getRiskLabel(mostCritical.score).label.toLowerCase() : "—"
        },
        {
          label: "Última prática",
          value: daysSince >= 999 ? "nunca" : `${daysSince} d`,
          subvalue: "na matéria mais crítica"
        }
      ];

      const summaryDetails = [
        {
          label: "Data considerada",
          value: `${escapeHtml(formatDateLong(referenceDate))} · o sistema usa a data do seu dispositivo`
        },
        {
          label: "Modo atual",
          value: `${escapeHtml(modeLabel())} · fila curta para reduzir abandono`
        },
        {
          label: "Matéria do dia",
          value: plan
            ? `${escapeHtml(plan.subject.shortName)} · ${escapeHtml(plan.task.title)}`
            : "nenhuma tarefa pendente"
        }
      ];



      elements.executiveSummary.innerHTML = `

        <div class="main-task-header">

          <h3 class="card-title">Resumo executivo</h3>

          <span class="chip neutral">${modeLabel()}</span>

        </div>



        <div class="summary-hero">

          <div class="label">Próxima prova do semestre</div>

          <div class="title">${nextExamAcross ? `${escapeHtml(nextExamAcross.subject.shortName)} · ${escapeHtml(nextExamAcross.exam.label)}` : "Sem prova futura"}</div>

          <div class="subvalue">${nextExamAcross ? `${formatDateLong(nextExamAcross.dateObj)} · ${nextExamDays} ${nextExamDays === 1 ? "dia" : "dias"}` : "Sem data futura no cronograma extraído."}</div>

        </div>



        ${renderMetricGrid(summaryMetrics, { marginTop: "14px" })}

        ${renderDetailList(summaryDetails, { marginTop: "14px" })}

      `;

    }



    function renderWhatIf(plan, referenceDate) {

      if (!plan) {

        elements.whatIfCard.innerHTML = `<h3 class="card-title">Se eu não concluir</h3><div class="empty-state">Sem tarefa principal ativa agora.</div>`;

        return;

      }



      const { task, subject } = plan;

      const currentMeta = getTaskMeta(task.id);

      const futureText = describeNoFinish(task, subject, referenceDate);

      const skipCount = currentMeta.skipCount || 0;

      const shrinkWillHappen = skipCount >= 1 || state.mode === "exausto" || state.mode === "m30";



      elements.whatIfCard.innerHTML = `

        <div class="main-task-header">

          <h3 class="card-title">Se eu não concluir</h3>

          <span class="chip warning">${skipCount > 0 ? `${skipCount} adiamento${skipCount > 1 ? "s" : ""}` : "sem débito acumulado"}</span>

        </div>

        <h2 style="margin: 4px 0 8px; font-size: 24px; line-height: 1.08; letter-spacing: -0.03em;">Se travar, o sistema corta atrito.</h2>

        <p class="lede">${escapeHtml(futureText)}</p>



        <ul class="note-list" style="margin-top: 14px;">

          <li>

            <strong>Regra prática</strong>

            <span class="muted">${escapeHtml(subject.shortName)} continua no topo até você destravar ou até outra prova claramente mais urgente ultrapassar o risco dela.</span>

          </li>

          <li>

            <strong>Adaptação automática</strong>

            <span class="muted">${shrinkWillHappen ? `A próxima versão já fica menor (${task.minutes.exausto || Math.round(task.minutes.normal * 0.5)} min).` : "Se travar por 2 dias, a tarefa é quebrada automaticamente em uma versão menor."}</span>

          </li>

          <li>

            <strong>Sem culpa artificial</strong>

            <span class="muted">A fila máxima continua curta. O sistema prefere manter movimento real a fingir organização perfeita.</span>

          </li>

        </ul>

      `;

    }



    function renderTodayQueue(queue, referenceDate) {

      if (!queue.length) {

        elements.todayQueue.innerHTML = `<h3 class="card-title">Hoje</h3><div class="empty-state">Sem fila ativa agora.</div>`;

        return;

      }



      const totalMinutes = queue.reduce((acc, item) => acc + getTaskMinutes(item.task), 0);



      elements.todayQueue.innerHTML = `

        <div class="main-task-header">

          <h3 class="card-title">Hoje</h3>

          <div class="chip-row">

            <span class="chip accent">${queue.length} tarefa${queue.length > 1 ? "s" : ""}</span>

            <span class="chip neutral">${totalMinutes} min totais</span>

          </div>

        </div>

        <div class="mini">Fila curta por desenho. O objetivo é você abrir e agir, não organizar demais.</div>

        <div class="queue-list" style="margin-top: 14px;">

          ${queue.map((item, index) => {

            const meta = getTaskMeta(item.task.id);

            const statusTone = item.slot === "Agora" ? "accent" : item.slot === "Depois" ? "warning" : "neutral";

            const risk = getRiskLabel(subjectScore(item.subject, referenceDate));

            return `

              <div class="queue-item queue-item--${statusTone}">

                <div class="queue-item-top">

                  <div>

                    <div class="queue-meta" style="margin-bottom: 8px;">

                      <span class="chip ${statusTone}">${escapeHtml(item.slot)}</span>

                      <span class="chip neutral">${escapeHtml(item.subject.shortName)}</span>

                      <span class="chip ${risk.tone}">${risk.label}</span>

                      ${meta.lightDelayCount > 0 ? `<span class="chip warning">${meta.lightDelayCount}d sem registro</span>` : ""}

                      ${meta.startedCount > 0 && !meta.done ? `<span class="chip warning">já aberta</span>` : ""}

                    </div>

                    <h4>${escapeHtml(item.task.title)}</h4>

                    <p>${escapeHtml(getTaskText(item.task))}</p>

                  </div>

                  <span class="pill">${getTaskMinutes(item.task)}m</span>

                </div>

                <div class="mini">Arquivo de apoio: ${escapeHtml(item.task.source[0])}</div>

                <div class="queue-actions">

                  <button class="btn btn-soft" data-action="complete" data-task-id="${item.task.id}">Concluí</button>

                  <button class="btn btn-ghost" data-action="start" data-task-id="${item.task.id}">${index === 0 ? "Começar" : "Abrir"}</button>

                  <button class="btn btn-ghost" data-action="skip" data-task-id="${item.task.id}">Não rolou</button>

                </div>

              </div>

            `;

          }).join("")}

        </div>

      `;

    }



    function renderSubjects(referenceDate) {

      const ordered = DATA.subjects

        .map((subject) => ({ subject, score: subjectScore(subject, referenceDate) }))

        .sort((a, b) => b.score - a.score);



      elements.subjectGrid.innerHTML = ordered.map(({ subject, score }) => {

        const nextExam = getNextExam(subject, referenceDate);

        const risk = getRiskLabel(score);

        const progress = getProgress(subject, referenceDate);

        const remaining = Math.round(getRemainingWeight(subject, referenceDate));

        const lastStudy = getDaysSinceLastStudy(subject.code, referenceDate);

        const activePhase = getCurrentOrNextPhase(subject, referenceDate);



        return `

          <article class="subject-card subject-card--${risk.tone}">

            <div class="subject-headline">

              <div>

                <p class="subject-code">${escapeHtml(subject.code)}</p>

                <h3>${escapeHtml(subject.name)}</h3>

                <p>${escapeHtml(subject.programFile)}</p>

              </div>

              <div class="subject-badges">

                <span class="chip ${risk.tone}">${risk.label}</span>

                ${subject.inferred ? `<span class="chip warning">peso inferido</span>` : ""}

              </div>

            </div>



            <div class="subject-kpi-grid">

              <div class="subject-kpi">

                <span>Próxima prova</span>

                <strong>${nextExam ? escapeHtml(nextExam.label) : "—"}</strong>

                <div class="mini">${nextExam ? formatDateLong(parseDate(nextExam.examDate)) : "sem data futura no cronograma"}</div>

              </div>

              <div class="subject-kpi">

                <span>Peso pendente</span>

                <strong>${remaining}%</strong>

                <div class="mini">${escapeHtml(subject.outsideDependency)}</div>

              </div>

              <div class="subject-kpi">

                <span>Última prática</span>

                <strong>${lastStudy >= 999 ? "nunca" : `${lastStudy} d`}</strong>

                <div class="mini">${escapeHtml(subject.phaseNowHint)}</div>

              </div>

              <div class="subject-kpi">

                <span>Fase atual</span>

                <strong>${escapeHtml(activePhase.id)}</strong>

                <div class="mini">provas: ${subject.counts.P1}/${subject.counts.P2}/${subject.counts.P3}</div>

              </div>

            </div>



            <div class="progress-block">

              <div class="progress-row">

                <span>progresso útil da janela atual</span>

                <span>${progress}%</span>

              </div>

              <div class="progress"><span style="width:${progress}%"></span></div>

            </div>



            <div class="subject-note">${escapeHtml(subject.singularity)}</div>



            <div class="mini"><strong>Tópicos CORE:</strong> ${escapeHtml(subject.coreTopics.slice(0, 4).join(" · "))}</div>

            <div class="mini"><strong>Regra de avaliação:</strong> ${escapeHtml(subject.examSchemeNote)}</div>

          </article>

        `;

      }).join("");

    }



    function renderSources() {

      elements.sourcesBlock.innerHTML = DATA.subjects.map((subject) => {

        return `

          <details class="source-card">

            <summary>

              <div>

                <h3>${escapeHtml(subject.name)}</h3>

                <p>${escapeHtml(subject.code)} · ${escapeHtml(subject.summary)}</p>

              </div>

              <div class="source-summary-right">

                <span class="mini">${subject.sources.length} arquivo${subject.sources.length > 1 ? "s" : ""}</span>

                <span class="source-summary-caret">›</span>

              </div>

            </summary>

            <div class="details-body">

              <ul class="source-list">

                ${subject.sources.map((source) => `

                  <li>

                    <div class="source-topline">

                      <strong>${escapeHtml(source.name)}</strong>

                      <div class="inline-chips">

                        <span class="chip neutral">${escapeHtml(source.kind)}</span>

                        <span class="chip accent">retorno ${escapeHtml(source.value)}</span>

                      </div>

                    </div>

                    <span class="muted">${escapeHtml(source.why)}</span>

                  </li>

                `).join("")}

              </ul>

            </div>

          </details>

        `;

      }).join("");

    }



    function renderMobileFocusbar(plan) {

      if (!plan) {

        elements.mobileFocusbar.innerHTML = "";

        elements.mobileFocusbar.setAttribute("hidden", "");

        return;

      }



      const { subject, task } = plan;

      elements.mobileFocusbar.removeAttribute("hidden");

      elements.mobileFocusbar.innerHTML = `

        <div class="mobile-focusbar__text">

          <div class="mobile-focusbar__eyebrow">agora · ${escapeHtml(subject.shortName)} · ${getTaskMinutes(task)} min</div>

          <div class="mobile-focusbar__title">${escapeHtml(task.title)}</div>

          <div class="mobile-focusbar__meta">${escapeHtml(task.source[0])}</div>

        </div>

        <button class="btn btn-primary" data-action="start" data-task-id="${task.id}">Começar</button>

      `;

    }

    function getTaskMetaFromState(sourceState, taskId) {
      return (sourceState.taskMeta && sourceState.taskMeta[taskId]) || {};
    }

    function setTaskMetaOnState(sourceState, taskId, patch) {
      sourceState.taskMeta = sourceState.taskMeta || {};
      sourceState.taskMeta[taskId] = {
        ...getTaskMetaFromState(sourceState, taskId),
        ...patch
      };
    }

    function isTaskDoneInState(sourceState, taskId) {
      return !!getTaskMetaFromState(sourceState, taskId).done;
    }

    function getDaysSinceLastStudyFromState(sourceState, subjectCode, referenceDate) {
      const logs = (sourceState.logs || [])
        .filter((log) => log.subjectCode === subjectCode)
        .map((log) => parseDate(log.date))
        .sort((a, b) => b - a);
      if (!logs.length) return 999;
      return Math.max(0, daysBetween(logs[0], referenceDate));
    }

    function getActiveTasksForSubjectFromState(sourceState, subject, referenceDate) {
      const currentPhase = getCurrentOrNextPhase(subject, referenceDate);
      const currentIndex = subject.phases.findIndex((phase) => phase.id === currentPhase.id);
      return DATA.tasks.filter((task) => {
        if (task.subjectCode !== subject.code) return false;
        const taskPhaseIndex = subject.phases.findIndex((phase) => phase.id === task.phaseId);
        if (taskPhaseIndex === -1) return false;
        const phase = subject.phases[taskPhaseIndex];
        const phaseStart = parseDate(phase.start);
        const phaseExam = parseDate(phase.examDate);
        const inWindow = referenceDate >= phaseStart && referenceDate <= phaseExam;
        const carryAfter = task.carryForward && taskPhaseIndex < currentIndex;
        const previewNext = taskPhaseIndex === currentIndex + 1 && daysBetween(referenceDate, phaseStart) <= 6;
        if (inWindow) return true;
        if (carryAfter) return true;
        if (previewNext) return true;
        if (currentIndex === subject.phases.length - 1 && taskPhaseIndex === currentIndex) return true;
        return false;
      });
    }

    function getPendingTasksForSubjectFromState(sourceState, subject, referenceDate) {
      return getActiveTasksForSubjectFromState(sourceState, subject, referenceDate)
        .filter((task) => !isTaskDoneInState(sourceState, task.id));
    }

    function subjectScoreFromState(sourceState, subject, referenceDate) {
      const pendingTasks = getPendingTasksForSubjectFromState(sourceState, subject, referenceDate);
      const currentPhase = getCurrentOrNextPhase(subject, referenceDate);
      const nextExam = getNextExam(subject, referenceDate);
      const remainingWeight = getRemainingWeight(subject, referenceDate);
      const stalenessDays = getDaysSinceLastStudyFromState(sourceState, subject.code, referenceDate);
      const carryover = pendingTasks.some((task) => {
        const meta = getTaskMetaFromState(sourceState, task.id);
        return meta.startedCount > 0 || meta.skipCount > 0 || meta.lightDelayCount > 0;
      });
      const examUrgency = nextExam ? clamp((45 - daysBetween(referenceDate, parseDate(nextExam.examDate))) / 45, 0, 1) : 0.12;
      const pendingRatio = pendingTasks.length
        ? clamp(
          pendingTasks.reduce((acc, task) => acc + (task.core ? 1.2 : 0.8), 0) /
          Math.max(1, getActiveTasksForSubjectFromState(sourceState, subject, referenceDate).length),
          0,
          1.4
        )
        : 0;
      const remainingWeightScore = clamp(remainingWeight / 100, 0, 1);
      const stalenessScore = clamp(stalenessDays / 10, 0, 1);
      const phaseBoost = currentPhase.id === "P1" ? 0.06 : currentPhase.id === "P2" ? 0.1 : 0.15;
      const extraRisk = (subject.extras || []).length ? 0.08 : 0;
      return (
        examUrgency * 0.36 +
        pendingRatio * 0.24 +
        remainingWeightScore * 0.16 +
        stalenessScore * 0.12 +
        subject.baseRisk * 0.10 +
        phaseBoost +
        extraRisk +
        (carryover ? 0.12 : 0)
      );
    }

    function taskScoreFromState(sourceState, task, subject, referenceDate) {
      const phase = getPhase(subject, task.phaseId);
      const daysToPhaseExam = daysBetween(referenceDate, parseDate(phase.examDate));
      const meta = getTaskMetaFromState(sourceState, task.id);
      const startedBoost = meta.startedCount > 0 ? 0.18 : 0;
      const skipBoost = meta.skipCount > 0 ? 0.12 : 0;
      const lightDelayBoost = clamp((meta.lightDelayCount || 0) * 0.07, 0, 0.18);
      const coreBoost = task.core ? 0.28 : 0.12;
      const recurrenceBoost = task.recurring ? 0.16 : 0.06;
      const priorityBoost = task.priorityBase / 20;
      const urgencyBoost = clamp((30 - daysToPhaseExam) / 30, 0, 1) * 0.22;
      const durationPenalty = getTaskMinutes(task) > 50 && sourceState.mode === "exausto" ? 0.18 : 0;
      return coreBoost + recurrenceBoost + priorityBoost + urgencyBoost + startedBoost + skipBoost + lightDelayBoost - durationPenalty;
    }

    function getSortedTasksForSubjectFromState(sourceState, subject, referenceDate) {
      return getPendingTasksForSubjectFromState(sourceState, subject, referenceDate)
        .sort((a, b) => taskScoreFromState(sourceState, b, subject, referenceDate) - taskScoreFromState(sourceState, a, subject, referenceDate));
    }

    function selectMainTaskFromState(sourceState, referenceDate, ignorePinned) {
      if (!ignorePinned && sourceState.pinnedTaskId) {
        const pinnedTask = getTask(sourceState.pinnedTaskId);
        if (pinnedTask && !isTaskDoneInState(sourceState, pinnedTask.id)) {
          const pinnedSubject = getSubject(pinnedTask.subjectCode);
          const isActive = getActiveTasksForSubjectFromState(sourceState, pinnedSubject, referenceDate).some((task) => task.id === pinnedTask.id);
          if (isActive) return { subject: pinnedSubject, task: pinnedTask, pinned: true };
        }
      }
      const best = DATA.subjects
        .map((subject) => ({ subject, score: subjectScoreFromState(sourceState, subject, referenceDate) }))
        .sort((a, b) => b.score - a.score)[0];
      if (!best) return null;
      const task = getSortedTasksForSubjectFromState(sourceState, best.subject, referenceDate)[0] || null;
      if (!task) return null;
      return { subject: best.subject, task, pinned: false };
    }

    function buildTodayQueueFromState(sourceState, referenceDate, ignorePinned) {
      const main = selectMainTaskFromState(sourceState, referenceDate, ignorePinned);
      if (!main) return [];
      const queue = [{ task: main.task, subject: main.subject, slot: "Agora" }];
      const pushIfValid = (task, subject, slot) => {
        if (!task) return;
        if (queue.some((item) => item.task.id === task.id)) return;
        queue.push({ task, subject, slot });
      };
      const subjectTasks = getSortedTasksForSubjectFromState(sourceState, main.subject, referenceDate)
        .filter((task) => task.id !== main.task.id);
      const nextExam = getNextExam(main.subject, referenceDate);
      const subjectGap = nextExam ? daysBetween(referenceDate, parseDate(nextExam.examDate)) : 999;
      if (sourceState.mode === "foco") {
        pushIfValid(subjectTasks[0], main.subject, "Depois");
        return queue.filter(Boolean).slice(0, 2);
      }
      if (sourceState.mode === "exausto" || sourceState.mode === "m30") {
        return queue;
      }
      if (subjectGap <= 14) {
        pushIfValid(subjectTasks[0], main.subject, "Depois");
      } else {
        const secondBest = DATA.subjects
          .filter((subject) => subject.code !== main.subject.code)
          .map((subject) => ({ subject, score: subjectScoreFromState(sourceState, subject, referenceDate) }))
          .sort((a, b) => b.score - a.score)[0];
        if (secondBest) {
          const secondTask = getSortedTasksForSubjectFromState(sourceState, secondBest.subject, referenceDate)[0];
          pushIfValid(secondTask, secondBest.subject, "Depois");
        } else {
          pushIfValid(subjectTasks[0], main.subject, "Depois");
        }
      }
      pushIfValid(subjectTasks[0], main.subject, queue.length === 1 ? "Depois" : "Reserva");
      if (queue.length < 3) {
        const fallback = DATA.subjects
          .filter((subject) => subject.code !== main.subject.code)
          .map((subject) => ({ subject, task: getSortedTasksForSubjectFromState(sourceState, subject, referenceDate)[0] }))
          .find((pair) => pair.task && !queue.some((item) => item.task.id === pair.task.id));
        if (fallback) pushIfValid(fallback.task, fallback.subject, "Reserva");
      }
      return queue.slice(0, 3);
    }

    function buildForecast(referenceDate, totalDays = 30) {
      const simulatedState = structuredClone(state);
      simulatedState.activeSession = null;
      simulatedState.pinnedTaskId = null;
      simulatedState.pinnedSubjectCode = null;
      const forecast = [];
      for (let i = 0; i < totalDays; i++) {
        const date = addDays(referenceDate, i);
        const plan = selectMainTaskFromState(simulatedState, date, true);
        const queue = buildTodayQueueFromState(simulatedState, date, true);
        forecast.push({
          date,
          plan,
          queue: queue.map((item) => ({
            slot: item.slot,
            task: item.task,
            subject: item.subject
          }))
        });
        if (plan && plan.task) {
          setTaskMetaOnState(simulatedState, plan.task.id, {
            done: true,
            completedAt: toIsoDate(date),
            lastTouched: toIsoDate(date),
            skipCount: 0,
            lightDelayCount: 0,
            lastLightDelayAt: null
          });
        }
      }
      return forecast;
    }

    function buildForecastMap(referenceDate, endDate) {

      if (endDate < referenceDate) return new Map();

      return new Map(

        buildForecast(referenceDate, daysBetween(referenceDate, endDate) + 1)

          .map((entry) => [toIsoDate(entry.date), entry])

      );

    }



    function getExamEventsOnDate(date) {

      const events = [];

      DATA.subjects.forEach((subject) => {

        subject.phases.forEach((phase) => {

          const examDate = parseDate(phase.examDate);

          if (isSameDay(examDate, date)) {

            events.push({

              subject,

              phase

            });

          }

        });

      });



      return events.sort((a, b) => a.subject.code.localeCompare(b.subject.code));

    }



    function renderCalendarPage(referenceDate) {
      if (!elements.monthCalendarGrid) return;

      const selectedMonth = getCalendarAnchorDate(referenceDate);
      const currentMonth = startOfMonth(referenceDate);
      const monthStart = startOfMonth(selectedMonth);
      const monthEnd = endOfMonth(selectedMonth);
      const firstWeekday = monthStart.getDay();
      const totalDays = monthEnd.getDate();
      const forecastMap = buildForecastMap(referenceDate, monthEnd);
      const markerLabels = CALENDAR_UI.markerLabels || {};

      elements.calendarMonthTitle.textContent = `Calendário de ${formatMonthYear(selectedMonth)}`;
      elements.calendarMonthSubtitle.textContent = CALENDAR_UI.monthSubtitle || "Mostra o mês selecionado com blocos de estudo, provas oficiais e entregas.";
      elements.monthPrevBtn.disabled = monthStart <= currentMonth;
      elements.monthTodayBtn.disabled = monthStart.getTime() === currentMonth.getTime();
      if (elements.monthLegend) elements.monthLegend.hidden = !state.calendarLegendVisible;
      if (elements.calendarLegendToggleBtn) {
        elements.calendarLegendToggleBtn.textContent = state.calendarLegendVisible ? "Ocultar legenda" : "Mostrar legenda";
        elements.calendarLegendToggleBtn.setAttribute("aria-pressed", state.calendarLegendVisible ? "true" : "false");
      }

      const cells = [];
      for (let i = 0; i < firstWeekday; i++) {
        cells.push('<div class="month-cell month-cell--blank" aria-hidden="true"></div>');
      }

      for (let dayNumber = 1; dayNumber <= totalDays; dayNumber++) {
        const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), dayNumber);
        const iso = toIsoDate(date);
        const forecastDay = forecastMap.get(iso);
        const exams = getExamEventsOnDate(date);
        const deadlines = getDeadlinesOnDate(date);
        const isToday = isSameDay(date, referenceDate);
        const isPast = date < referenceDate;
        const hasStudy = !!(forecastDay && forecastDay.plan);

        const classes = ['month-cell'];
        if (isToday) classes.push('month-cell--today');
        if (isPast) classes.push('month-cell--past');
        if (hasStudy) classes.push('month-cell--study');
        if (exams.length) classes.push('month-cell--exam');
        if (deadlines.length) classes.push('month-cell--deadline');

        const markers = [
          hasStudy ? `<span class="month-marker month-marker--study" title="${escapeHtml(markerLabels.study || "Estudo")}" aria-label="${escapeHtml(markerLabels.study || "Estudo")}"></span>` : '',
          exams.length ? `<span class="month-marker month-marker--exam" title="${escapeHtml(markerLabels.exam || "Prova")}" aria-label="${escapeHtml(markerLabels.exam || "Prova")}"></span>` : '',
          deadlines.length ? `<span class="month-marker month-marker--deadline" title="${escapeHtml(markerLabels.deadline || "Entrega")}" aria-label="${escapeHtml(markerLabels.deadline || "Entrega")}"></span>` : ''
        ].join('');

        const studyHtml = hasStudy ? `
          <div class="month-item month-item--study">
            <strong>${escapeHtml(forecastDay.plan.subject.shortName)}</strong>
          </div>
        ` : '';

        const examsHtml = exams.map((exam) => `
          <div class="month-item month-item--exam">
            <strong>${escapeHtml(exam.subject.shortName)}</strong>
            <span>${escapeHtml(exam.phase.label)}</span>
          </div>
        `).join('');

        const deadlinesHtml = deadlines.map((deadline) => {
          const subject = getDeadlineSubject(deadline);
          const status = getDeadlineStatus(deadline, referenceDate);
          const itemClass = deadline.deliveredAt ? 'month-item month-item--done' : 'month-item month-item--deadline';
          const metaBits = [];
          if (subject) metaBits.push(subject.shortName);
          if (deadline.dueTime) metaBits.push(formatTime(deadline.dueTime));
          metaBits.push(status.label);
          return `
            <div class="${itemClass}">
              <strong>${escapeHtml(deadline.title)}</strong>
              <span>${escapeHtml(metaBits.join(' • '))}</span>
            </div>
          `;
        }).join('');

        cells.push(`
          <article class="${classes.join(' ')}">
            <div class="month-cell__top">
              <div class="month-cell__date">
                <div class="month-cell__day">${dayNumber}</div>
                <div class="month-cell__weekday">${escapeHtml(new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(date))}</div>
              </div>
              <div class="month-cell__markers">${markers}</div>
            </div>
            <div class="month-stack">
              ${studyHtml}
              ${examsHtml}
              ${deadlinesHtml}
            </div>
          </article>
        `);
      }

      elements.monthCalendarGrid.innerHTML = cells.join('');
    }

    function renderNotes() {
      const noteItems = Array.isArray(NOTES_UI.items) ? NOTES_UI.items : [];
      elements.notesBlock.innerHTML = `
        <ul class="note-list" style="margin-top:0;">
          ${noteItems.map((item) => `
            <li>
              <strong>${escapeHtml(item.title)}</strong>
              <span class="muted">${escapeHtml(item.body)}</span>
            </li>
          `).join("")}
        </ul>
      `;
    }
