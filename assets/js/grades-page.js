/* Grades page extracted from app-pages. */

function makeGradeEntryId() {

      return `grade-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    }



    function getSubjectGradeComponents(subject) {

      const phases = (subject.phases || []).map((phase) => ({

        key: `PHASE:${phase.id}`,

        label: phase.label,

        weight: Number(phase.weight || 0),

        weightLabel: phase.weightLabel || null,

        role: phase.gradeRole || null,

        optional: phase.optional === true,

        phaseId: phase.id,

        type: "phase"

      }));



      const extras = (subject.extras || []).map((extra, index) => ({

        key: `EXTRA:${index}:${normalizeKey(extra.label)}`,

        label: extra.label,

        weight: Number(extra.weight || 0),

        weightLabel: extra.weightLabel || null,

        role: extra.gradeRole || null,

        optional: extra.optional === true,

        type: "extra"

      }));



      return [...phases, ...extras];

    }



    function getComponentWeightText(component) {

      if (!component) return "—";

      if (component.weightLabel) return component.weightLabel;

      return formatWeight(component.weight);

    }



    function getSubjectGradeModel(subject) {

      return subject && subject.gradeModel && typeof subject.gradeModel === "object"

        ? subject.gradeModel

        : { type: "linear" };

    }



    function buildComponentScoreMap(components) {

      return Object.fromEntries((components || []).map((component) => [

        component.key,

        component.score == null ? null : Number(component.score)

      ]));

    }



    function clampGradeValue(value) {

      if (!Number.isFinite(value)) return null;

      return Math.max(0, Math.min(10, value));

    }



    function evaluatePme0100Formula(subject, scoreMap) {

      const components = getSubjectGradeComponents(subject);

      const byRole = Object.fromEntries(components.filter((component) => component.role).map((component) => [component.role, component.key]));

      const p1 = Number(scoreMap[byRole.p1]);

      const p2 = Number(scoreMap[byRole.p2]);

      const p3 = Number(scoreMap[byRole.p3]);

      const activity = Number(scoreMap[byRole.activityAverage]);

      const psub = Number(scoreMap[byRole.substituteExam]);

      const recovery = Number(scoreMap[byRole.recoveryExam]);

      const hasP1 = Number.isFinite(p1);

      const hasP2 = Number.isFinite(p2);

      const hasP3 = Number.isFinite(p3);

      let weightedExamAverage = null;

      if (hasP1 && hasP2 && hasP3) {

        const examEntries = [

          { score: p1, weight: 2 },

          { score: p2, weight: 2 },

          { score: p3, weight: 3 }

        ];

        if (Number.isFinite(psub)) {

          let lowestIndex = 0;

          examEntries.forEach((entry, index) => {

            if (entry.score < examEntries[lowestIndex].score) lowestIndex = index;

          });

          examEntries[lowestIndex] = {

            ...examEntries[lowestIndex],

            score: psub

          };

        }

        const weightedSum = examEntries.reduce((sum, entry) => sum + entry.score * entry.weight, 0);

        weightedExamAverage = weightedSum / 7;

      }

      let firstEvaluation = null;

      if (weightedExamAverage != null) {

        if (weightedExamAverage <= 3) {

          firstEvaluation = weightedExamAverage;

        } else if (Number.isFinite(activity)) {

          firstEvaluation = (15 * weightedExamAverage - 3 * activity) / (12 + weightedExamAverage - activity);

        }

      }

      const recoveryEligible = firstEvaluation != null && firstEvaluation >= 3 && firstEvaluation < 5;

      const secondEvaluation = recoveryEligible && Number.isFinite(recovery)

        ? Math.max(firstEvaluation, (firstEvaluation + recovery) / 2)

        : null;

      const finalGrade = secondEvaluation != null ? secondEvaluation : firstEvaluation;

      const finalGradeClosed = finalGrade != null && (!recoveryEligible || secondEvaluation != null);

      return {

        weightedExamAverage: clampGradeValue(weightedExamAverage),

        activityAverage: Number.isFinite(activity) ? clampGradeValue(activity) : null,

        firstEvaluation: clampGradeValue(firstEvaluation),

        recoveryEligible,

        recoveryScore: Number.isFinite(recovery) ? clampGradeValue(recovery) : null,

        secondEvaluation: clampGradeValue(secondEvaluation),

        substituteScore: Number.isFinite(psub) ? clampGradeValue(psub) : null,

        finalGrade: clampGradeValue(finalGrade),

        finalGradeClosed

      };

    }



    function getPme0100RequiredAverage(status, target, overrides = {}) {

      const baseScores = buildComponentScoreMap(status.components);

      Object.entries(overrides || {}).forEach(([key, value]) => {

        const numeric = Number(value);

        if (Number.isFinite(numeric)) baseScores[key] = numeric;

      });

      const remaining = (status.remainingComponents || []).filter((component) => !Number.isFinite(Number(overrides[component.key])));

      const evaluateWithFill = (fillValue) => {

        const scoreMap = { ...baseScores };

        remaining.forEach((component) => {

          scoreMap[component.key] = fillValue;

        });

        const evaluation = evaluatePme0100Formula(status.subject, scoreMap);

        return evaluation.finalGrade;

      };

      if (!remaining.length) {

        const evaluation = evaluatePme0100Formula(status.subject, baseScores);

        return evaluation.finalGradeClosed ? null : 11;

      }

      const atZero = evaluateWithFill(0);

      if (atZero != null && atZero >= target) return 0;

      const atTen = evaluateWithFill(10);

      if (atTen == null || atTen < target) return 11;

      let low = 0;

      let high = 10;

      for (let step = 0; step < 40; step += 1) {

        const mid = (low + high) / 2;

        const current = evaluateWithFill(mid);

        if (current == null || current < target) {

          low = mid;

        } else {

          high = mid;

        }

      }

      return high;

    }



    function getPme0100GradeStatus(subject) {

      const components = getSubjectGradeComponents(subject).map((component) => {

        const entries = getGradeEntriesForComponent(subject.code, component.key).slice().sort((a, b) => {

          const aDate = a.entryDate || "9999-12-31";

          const bDate = b.entryDate || "9999-12-31";

          if (aDate === bDate) return a.createdAt > b.createdAt ? -1 : 1;

          return aDate > bDate ? -1 : 1;

        });

        return {

          ...component,

          entries,

          score: getWeightedEntryAverage(entries)

        };

      });

      const evaluation = evaluatePme0100Formula(subject, buildComponentScoreMap(components));

      const mandatoryComponents = components.filter((component) => !component.optional && component.role !== "recoveryExam" && component.role !== "substituteExam");

      let remainingComponents = mandatoryComponents.filter((component) => component.score == null);

      const recoveryComponent = components.find((component) => component.role === "recoveryExam");

      if (!remainingComponents.length && evaluation.recoveryEligible && recoveryComponent && recoveryComponent.score == null) {

        remainingComponents = [recoveryComponent];

      }

      const knownComponents = components.filter((component) => component.score != null);

      const knownScores = mandatoryComponents.filter((component) => component.score != null).map((component) => Number(component.score));

      const knownAverage = knownScores.length

        ? knownScores.reduce((sum, score) => sum + score, 0) / knownScores.length

        : null;

      const zeroFilledScoreMap = buildComponentScoreMap(components);

      mandatoryComponents.forEach((component) => {

        if (zeroFilledScoreMap[component.key] == null) zeroFilledScoreMap[component.key] = 0;

      });

      const zeroFilledEvaluation = evaluatePme0100Formula(subject, zeroFilledScoreMap);

      let projectedMaintain = null;

      if (knownAverage != null) {

        const projectedScoreMap = buildComponentScoreMap(components);

        mandatoryComponents.forEach((component) => {

          if (projectedScoreMap[component.key] == null) projectedScoreMap[component.key] = knownAverage;

        });

        const projectedEvaluation = evaluatePme0100Formula(subject, projectedScoreMap);

        projectedMaintain = projectedEvaluation.finalGrade;

      }

      const requiredForFive = getPme0100RequiredAverage({ subject, components, remainingComponents }, 5);

      const requiredForSix = getPme0100RequiredAverage({ subject, components, remainingComponents }, 6);

      return {

        modelType: "pme0100_formula_2026",

        scenarioDisabled: true,

        subject,

        components,

        knownComponents,

        remainingComponents,

        knownContribution: 0,

        knownWeight: 0,

        remainingWeight: 0,

        currentLockedGrade: zeroFilledEvaluation.finalGrade == null ? 0 : zeroFilledEvaluation.finalGrade,

        finalGrade: evaluation.finalGradeClosed ? evaluation.finalGrade : null,

        knownAverage,

        projectedMaintain,

        requiredForFive,

        requiredForSix,

        weightedExamAverage: evaluation.weightedExamAverage,

        activityAverage: evaluation.activityAverage,

        firstEvaluation: evaluation.firstEvaluation,

        secondEvaluation: evaluation.secondEvaluation,

        recoveryEligible: evaluation.recoveryEligible,

        substituteScore: evaluation.substituteScore,

        recoveryScore: evaluation.recoveryScore

      };

    }



    function getGradeEntriesForSubject(subjectCode) {

      return (state.gradeEntries || []).filter((entry) => entry.subjectCode === subjectCode);

    }



    function getGradeEntriesForComponent(subjectCode, componentKey) {

      return getGradeEntriesForSubject(subjectCode).filter((entry) => entry.componentKey === componentKey);

    }



    function getWeightedEntryAverage(entries) {

      if (!entries.length) return null;

      let weightedSum = 0;

      let totalWeight = 0;



      entries.forEach((entry) => {

        const score = Number(entry.score);

        const weight = Number(entry.internalWeight || 1);

        if (!Number.isFinite(score) || !Number.isFinite(weight) || weight <= 0) return;

        weightedSum += score * weight;

        totalWeight += weight;

      });



      if (!totalWeight) return null;

      return weightedSum / totalWeight;

    }



    function getKnownAverage(knownContribution, knownWeight) {

      if (!knownWeight) return null;

      return knownContribution / knownWeight;

    }



    function getRequiredAverageForTarget(target, knownContribution, remainingWeight) {

      if (remainingWeight <= 0) return null;

      return (target * 100 - knownContribution) / remainingWeight;

    }



    function getRequiredAverageForStatus(target, status, overrides = {}) {

      if (status && status.modelType === "pme0100_formula_2026") {

        return getPme0100RequiredAverage(status, target, overrides);

      }

      return getRequiredAverageForTarget(target, status.knownContribution, status.remainingWeight);

    }



    function getRequirementTone(requiredAverage) {

      if (requiredAverage == null) return "neutral";

      if (requiredAverage <= 0) return "success";

      if (requiredAverage <= 5) return "success";

      if (requiredAverage <= 6.5) return "accent";

      if (requiredAverage <= 8) return "warning";

      return "danger";

    }



    function describeRequirement(requiredAverage, target, finalGrade) {

      if (requiredAverage == null) {

        return `Fechado em ${formatScore(finalGrade || 0)}`;

      }



      if (requiredAverage <= 0) {

        return `Já bate ${String(target).replace(".", ",")}`;

      }



      if (requiredAverage > 10) {

        return "Impossível só com o que falta";

      }



      return `${formatScore(requiredAverage)} em média`;

    }



    function buildBalancedPlanText(remainingComponents, requiredAverage) {

      if (!remainingComponents.length) return "Tudo dessa matéria já foi lançado.";

      if (requiredAverage == null) return "Sem itens pendentes.";

      if (requiredAverage <= 0) return "Mesmo zerando o que falta, a meta já foi alcançada com o que foi lançado.";

      if (requiredAverage > 10) return "Mesmo com 10,0 em todos os itens restantes, a meta não fecha.";

      return remainingComponents.map((component) => `${component.label} ≈ ${formatScore(requiredAverage)}`).join(" · ");

    }



    function getSubjectGradeStatus(subject) {

      const gradeModel = getSubjectGradeModel(subject);

      if (gradeModel.type === "pme0100_formula_2026") {

        return getPme0100GradeStatus(subject);

      }

      const components = getSubjectGradeComponents(subject).map((component) => {

        const entries = getGradeEntriesForComponent(subject.code, component.key).slice().sort((a, b) => {

          const aDate = a.entryDate || "9999-12-31";

          const bDate = b.entryDate || "9999-12-31";

          if (aDate === bDate) return a.createdAt > b.createdAt ? -1 : 1;

          return aDate > bDate ? -1 : 1;

        });

        return {

          ...component,

          entries,

          score: getWeightedEntryAverage(entries)

        };

      });



      const knownComponents = components.filter((component) => component.score != null);

      const remainingComponents = components.filter((component) => component.score == null);

      const knownContribution = knownComponents.reduce((sum, component) => sum + component.score * component.weight, 0);

      const knownWeight = knownComponents.reduce((sum, component) => sum + component.weight, 0);

      const remainingWeight = Math.max(0, 100 - knownWeight);

      const currentLockedGrade = knownContribution / 100;

      const finalGrade = remainingWeight === 0 ? currentLockedGrade : null;

      const knownAverage = getKnownAverage(knownContribution, knownWeight);

      const projectedMaintain = knownAverage == null ? null : (knownContribution + remainingWeight * knownAverage) / 100;

      const requiredForFive = getRequiredAverageForTarget(5, knownContribution, remainingWeight);

      const requiredForSix = getRequiredAverageForTarget(6, knownContribution, remainingWeight);



      return {

        subject,

        components,

        knownComponents,

        remainingComponents,

        knownContribution,

        knownWeight,

        remainingWeight,

        currentLockedGrade,

        finalGrade,

        knownAverage,

        projectedMaintain,

        requiredForFive,

        requiredForSix

      };

    }



    function removeGradeEntry(entryId) {

      const before = state.gradeEntries.length;

      state.gradeEntries = state.gradeEntries.filter((entry) => entry.id !== entryId);

      if (state.gradeEntries.length === before) return;

      if (state.editingGradeEntryId === entryId) state.editingGradeEntryId = null;

      saveState();

      showToast("Nota removida.");

      render();

    }



    function getGradeEntryById(entryId) {

      return (state.gradeEntries || []).find((entry) => entry.id === entryId) || null;

    }



    function startEditGradeEntry(entryId) {

      const entry = getGradeEntryById(entryId);

      if (!entry) return;

      state.editingGradeEntryId = entryId;

      state.gradeDraftSubjectCode = entry.subjectCode;

      state.gradeOverviewSubjectCode = entry.subjectCode;

      saveState();

      showToast("Nota carregada para edição.");

      render();

    }



    function cancelEditGradeEntry() {

      state.editingGradeEntryId = null;

      saveState();

      render();

    }





function upsertGradeEntryFromForm(form) {

  const editingId = state.editingGradeEntryId;

  const formData = new FormData(form);

  const subjectCode = String(formData.get("subjectCode") || "").trim();

  const componentKey = String(formData.get("componentKey") || "").trim();

  const label = String(formData.get("label") || "").trim();

  const entryType = String(formData.get("entryType") || "").trim() || "Lançamento";

  const notes = String(formData.get("notes") || "").trim();

  const entryDate = String(formData.get("entryDate") || "").trim();

  const score = Number(String(formData.get("score") || "").replace(",", "."));

  const internalWeight = Number(String(formData.get("internalWeight") || "1").replace(",", "."));



  if (!subjectCode || !componentKey || !Number.isFinite(score) || score < 0 || score > 10 || !Number.isFinite(internalWeight) || internalWeight <= 0) {

    showToast("Revise matéria, componente, nota e peso interno.");

    return;

  }



  if (editingId) {

    state.gradeEntries = state.gradeEntries.map((entry) => entry.id === editingId ? {

      ...entry,

      subjectCode,

      componentKey,

      label: label || entryType,

      entryType,

      notes,

      entryDate: entryDate || null,

      score,

      internalWeight,

      updatedAt: new Date().toISOString()

    } : entry);

    state.editingGradeEntryId = null;

    state.gradeDraftSubjectCode = subjectCode;

    saveState();

    showToast("Nota atualizada.");

    render();

    return;

  }



  state.gradeEntries.push({

    id: makeGradeEntryId(),

    subjectCode,

    componentKey,

    label: label || entryType,

    entryType,

    notes,

    entryDate: entryDate || null,

    score,

    internalWeight,

    createdAt: new Date().toISOString()

  });

  state.gradeDraftSubjectCode = subjectCode;

  saveState();

  form.reset();

  const dateInput = form.querySelector('input[name="entryDate"]');

  if (dateInput) dateInput.value = toIsoDate(today());

  const weightInput = form.querySelector('input[name="internalWeight"]');

  if (weightInput) weightInput.value = "1";

  const typeSelect = form.querySelector('select[name="entryType"]');

  if (typeSelect) typeSelect.value = "Prova";

  showToast("Nota adicionada.");

  render();

}





function getGradeDraftSubjectCode(preferredCode = null) {

  if (preferredCode && getSubject(preferredCode)) return preferredCode;

  if (getSubject(state.gradeDraftSubjectCode)) return state.gradeDraftSubjectCode;

  if (getSubject(state.gradeOverviewSubjectCode)) return state.gradeOverviewSubjectCode;

  return DATA.subjects[0].code;

}



function getGradeFocusSubjectCode(preferredCode = null) {

  if (preferredCode && getSubject(preferredCode)) return preferredCode;

  if (getSubject(state.gradeOverviewSubjectCode)) return state.gradeOverviewSubjectCode;

  if (getSubject(state.gradeDraftSubjectCode)) return state.gradeDraftSubjectCode;

  return DATA.subjects[0].code;

}



function renderGradeFormCard(referenceDate) {

  const editing = state.editingGradeEntryId ? getGradeEntryById(state.editingGradeEntryId) : null;

  const selectedSubjectCode = getGradeDraftSubjectCode(editing && editing.subjectCode ? editing.subjectCode : null);

  const selectedSubject = getSubject(selectedSubjectCode);

  const components = getSubjectGradeComponents(selectedSubject);

  const todayIso = toIsoDate(referenceDate);



  elements.gradeFormCard.innerHTML = `

    <div class="grade-form-stack">

      <div>

        <h3 class="card-title">${editing ? 'Editar nota' : 'Adicionar nota'}</h3>

        <div class="summary-hero">

          <span class="label">Lançamento flexível</span>

          <div class="title">Prova, trabalho, lista ou exercício</div>

          <div class="subvalue">Os lançamentos dentro do mesmo componente viram uma média ponderada pelo peso interno. Isso serve para exercícios em quantidade incerta ou trabalhos divididos em mais de uma entrega.${editing ? ' Você está editando um lançamento existente.' : ''}</div>

        </div>

      </div>



      <form id="gradeForm" class="deadline-form" style="margin-top: 14px;">

        <label class="field field--full">

          <span>Descrição curta</span>

          <input type="text" name="label" placeholder="Ex.: P2, Lista 4, Relatório 1, Exercício aula 3" value="${editing ? escapeHtml(editing.label || '') : ''}" required />

        </label>



        <div class="deadline-form-grid">

          <label class="field">

            <span>Matéria</span>

            <select name="subjectCode" id="gradeSubjectSelect" required>

              ${DATA.subjects.map((subject) => `<option value="${subject.code}" ${subject.code === selectedSubjectCode ? "selected" : ""}>${subject.shortName}</option>`).join("")}

            </select>

          </label>



          <label class="field">

            <span>Componente</span>

            <select name="componentKey" id="gradeComponentSelect" required>

              ${components.map((component) => `<option value="${component.key}" ${editing && editing.componentKey === component.key ? 'selected' : ''}>${escapeHtml(component.label)} · ${escapeHtml(getComponentWeightText(component))}</option>`).join("")}

            </select>

          </label>



          <label class="field">

            <span>Nota (0 a 10)</span>

            <input type="number" name="score" min="0" max="10" step="0.01" placeholder="6,5" value="${editing ? escapeHtml(String(editing.score).replace('.', ',')) : ''}" required />

          </label>



          <label class="field">

            <span>Peso interno</span>

            <input type="number" name="internalWeight" min="0.01" step="0.01" value="${editing ? escapeHtml(String(editing.internalWeight || 1).replace('.', ',')) : '1'}" required />

          </label>



          <label class="field">

            <span>Data do lançamento</span>

            <input type="date" name="entryDate" value="${editing ? escapeHtml(editing.entryDate || todayIso) : todayIso}" />

          </label>



          <label class="field">

            <span>Tipo</span>

            <select name="entryType">

              ${['Prova','Trabalho','Lista','Exercício','Relatório','Outro'].map((type) => `<option value="${type}" ${editing && editing.entryType === type ? 'selected' : (!editing && type === 'Prova' ? 'selected' : '')}>${type}</option>`).join('')}

            </select>

          </label>

        </div>



        <label class="field field--full">

          <span>Observação</span>

          <input type="text" name="notes" placeholder="Ex.: valendo metade, plataforma X, com consulta, professor Y" value="${editing ? escapeHtml(editing.notes || '') : ''}" />

        </label>



        <div class="deadline-actions">

          <button type="submit" class="btn btn-primary">${editing ? 'Salvar alteração' : 'Adicionar nota'}</button>

          ${editing ? '<button type="button" class="btn btn-ghost" id="cancelGradeEditBtn">Cancelar edição</button>' : ''}

        </div>

      </form>



      <ul class="grade-help-list">

        <li><strong>Provas:</strong> normalmente basta um lançamento em P1, P2 e P3.</li>

        <li><strong>Exercícios, listas e relatórios:</strong> pode lançar quantos quiser no mesmo componente; o motor atualiza a média daquele bloco.</li>

        <li><strong>Peso interno:</strong> use 1 quando todos valem igual; use 2, 3 etc. se um item valer mais que outro dentro do mesmo componente.</li>

      </ul>

    </div>

  `;

}





function getGradeScenarioDraft(subjectCode) {

  return state.gradeScenarioDrafts && state.gradeScenarioDrafts[subjectCode] ? state.gradeScenarioDrafts[subjectCode] : {};

}



function saveGradeScenarioDraft(subjectCode, draft, options = {}) {

  const nextDrafts = { ...(state.gradeScenarioDrafts || {}) };

  if (draft && Object.keys(draft).length) {

    nextDrafts[subjectCode] = draft;

  } else {

    delete nextDrafts[subjectCode];

  }

  state.gradeScenarioDrafts = nextDrafts;

  saveState();

  if (!options.silent) showToast(options.message || "Cenário salvo.");

  render();

}



function clearGradeScenarioDraft(subjectCode, options = {}) {

  saveGradeScenarioDraft(subjectCode, {}, { silent: options.silent, message: options.message || "Cenário limpo." });

}



function buildGradeScenarioPreset(status, target, strategy) {

  const components = status.remainingComponents || [];

  if (!components.length) return {};

  const requiredAverage = getRequiredAverageForStatus(target, status);

  if (requiredAverage == null) return {};

  if (requiredAverage <= 0) {

    return Object.fromEntries(components.map((component) => [component.key, 0]));

  }

  if (components.length === 1 || strategy === "balanced") {

    return Object.fromEntries(components.map((component) => [component.key, clamp(requiredAverage, 0, 10)]));

  }



  const plan = {};

  const earlierComponents = components.slice(0, -1);

  const finalComponent = components[components.length - 1];

  const shift = strategy === "frontload" ? 0.8 : -0.8;

  earlierComponents.forEach((component) => {

    plan[component.key] = clamp(requiredAverage + shift, 0, 10);

  });

  const contributionBeforeFinal = earlierComponents.reduce((sum, component) => sum + component.weight * plan[component.key], 0);

  const finalNeeded = (target * 100 - status.knownContribution - contributionBeforeFinal) / finalComponent.weight;

  plan[finalComponent.key] = clamp(finalNeeded, 0, 10);

  return plan;

}



function getGradeScenarioStatus(status, subjectCode) {

  const targets = getGradeTargets();

  const draft = getGradeScenarioDraft(subjectCode);

  const simulatedComponents = status.remainingComponents.map((component) => {

    const numeric = Number(draft[component.key]);

    return {

      ...component,

      simulatedScore: Number.isFinite(numeric) ? numeric : null

    };

  });

  const simulatedContribution = status.knownContribution + simulatedComponents.reduce((sum, component) => sum + (component.simulatedScore == null ? 0 : component.simulatedScore * component.weight), 0);

  const simulatedWeight = status.knownWeight + simulatedComponents.reduce((sum, component) => sum + (component.simulatedScore == null ? 0 : component.weight), 0);

  const remainingAfterDraftWeight = Math.max(0, 100 - simulatedWeight);

  const exactFinal = simulatedWeight === 100 ? simulatedContribution / 100 : null;

  return {

    draft,

    simulatedComponents,

    simulatedContribution,

    simulatedWeight,

    remainingAfterDraftWeight,

    exactFinal,

    currentScenarioBase: simulatedContribution / 100,

    primaryNeedAfterDraft: getRequiredAverageForTarget(targets.primary, simulatedContribution, remainingAfterDraftWeight),

    secondaryNeedAfterDraft: getRequiredAverageForTarget(targets.secondary, simulatedContribution, remainingAfterDraftWeight)

  };

}



function describeScenarioNeed(requiredAverage, target, exactFinal) {

  if (requiredAverage == null) {

    return exactFinal == null ? `Meta ${formatScore(target)} ainda em aberto` : `Cenário fecha em ${formatScore(exactFinal)}`;

  }

  if (requiredAverage <= 0) return `Meta ${formatScore(target)} já coberta`;

  if (requiredAverage > 10) return `Meta ${formatScore(target)} ainda impossível`;

  return `Faltam ${formatScore(requiredAverage)} em média no resto`;

}



function saveGradeScenarioFromForm(form) {

  const subjectCode = form.dataset.subjectCode;

  if (!subjectCode) return;

  const draft = {};

  let invalid = false;

  form.querySelectorAll('[data-sim-component]').forEach((input) => {

    const raw = String(input.value || '').trim().replace(',', '.');

    if (!raw) return;

    const numeric = Number(raw);

    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 10) {

      invalid = true;

      return;

    }

    draft[input.dataset.simComponent] = numeric;

  });

  if (invalid) {

    showToast('Use notas entre 0 e 10 no simulador.');

    return;

  }

  saveGradeScenarioDraft(subjectCode, draft, { message: 'Cenário atualizado.' });

}



function applyGradeScenarioPreset(subjectCode, strategy, targetType) {

  const subject = getSubject(subjectCode);

  if (!subject) return;

  const status = getSubjectGradeStatus(subject);

  const targets = getGradeTargets();

  const target = targetType === 'secondary' ? targets.secondary : targets.primary;

  const preset = buildGradeScenarioPreset(status, target, strategy);

  saveGradeScenarioDraft(subjectCode, preset, {

    message:

      strategy === 'frontload'

        ? 'Preset aplicado: aliviar componente final.'

        : strategy === 'backload'

          ? 'Preset aplicado: empurrar mais nota para o final.'

          : 'Preset aplicado: plano equilibrado.'

  });

}



function getGradeOverviewModel(subjectCode) {

  const subject = getSubject(subjectCode);

  if (!subject) return null;



  const targets = getGradeTargets();

  const status = getSubjectGradeStatus(subject);

  const requiredPrimary = getRequiredAverageForStatus(targets.primary, status);

  const requiredSecondary = getRequiredAverageForStatus(targets.secondary, status);



  return {

    subject,

    targets,

    status,

    requiredPrimary,

    requiredSecondary,

    tonePrimary: getRequirementTone(requiredPrimary),

    toneSecondary: getRequirementTone(requiredSecondary),

    remainingLabels: status.remainingComponents.length

      ? status.remainingComponents.map((component) => `<span class="chip neutral">${escapeHtml(component.label)} · ${escapeHtml(getComponentWeightText(component))}</span>`).join("")

      : '<span class="chip success">Tudo lançado</span>',

    scenario: status.scenarioDisabled ? null : getGradeScenarioStatus(status, subject.code)

  };

}



function renderGradeScenarioInputs(model) {

  if (model.status.scenarioDisabled) {

    return '<div class="grade-empty">Simulador automático desativado para esta matéria: a nota usa fórmula própria com P, E, PSUB e PREC. Lance os componentes reais para ver o cálculo correto.</div>';

  }

  if (!model.status.remainingComponents.length) {

    return '<div class="grade-empty">Sem componentes pendentes para simular.</div>';

  }



  return `

    <form class="inline-form-grid gradeScenarioForm" data-subject-code="${model.subject.code}" style="margin-top: 12px;">

      ${model.status.remainingComponents.map((component) => `

        <label class="field">

          <span>${escapeHtml(component.label)} · ${escapeHtml(getComponentWeightText(component))}</span>

          <input type="number" min="0" max="10" step="0.1" data-sim-component="${component.key}" value="${model.scenario.draft[component.key] == null ? '' : escapeHtml(String(model.scenario.draft[component.key]).replace('.', ','))}" placeholder="${model.requiredPrimary != null && model.requiredPrimary > 0 && model.requiredPrimary <= 10 ? formatScore(model.requiredPrimary) : '0,0'}" />

        </label>

      `).join('')}

      <div class="field field--full">

        <span>Preset rápido para a meta principal (${formatScore(model.targets.primary)})</span>

        <div class="scenario-actions">

          <button type="submit" class="btn btn-soft">Salvar cenário</button>

          <button type="button" class="btn btn-ghost" data-scenario-preset="balanced" data-scenario-target="primary" data-subject-code="${model.subject.code}">Equilibrar</button>

          <button type="button" class="btn btn-ghost" data-scenario-preset="frontload" data-scenario-target="primary" data-subject-code="${model.subject.code}">Aliviar final</button>

          <button type="button" class="btn btn-ghost" data-scenario-preset="backload" data-scenario-target="primary" data-subject-code="${model.subject.code}">Empurrar para o final</button>

          <button type="button" class="btn btn-ghost" data-scenario-clear="1" data-subject-code="${model.subject.code}">Limpar</button>

        </div>

      </div>

    </form>

  `;

}



function renderGradeEntryList(component) {

  if (!component.entries.length) {

    return `<div class="grade-empty">Nenhum lançamento ainda neste componente.</div>`;

  }



  return `<div class="grade-entry-list">${component.entries.map((entry) => `

    <div class="grade-entry-item">

      <div class="grade-entry-top">

        <div>

          <h5>${escapeHtml(entry.label || component.label)}</h5>

          <p>${escapeHtml(entry.entryType || "Lançamento")}${entry.entryDate ? ` · ${escapeHtml(formatDateLong(parseDate(entry.entryDate)))}` : ""}${entry.notes ? ` · ${escapeHtml(entry.notes)}` : ""}</p>

        </div>

        <div class="grade-entry-actions">

          <span class="chip accent">${formatScore(entry.score)}</span>

          <span class="chip neutral">peso ${Number(entry.internalWeight || 1).toString().replace(".", ",")}</span>

          <button class="btn btn-soft" data-grade-action="edit" data-grade-entry-id="${entry.id}">Editar</button>

          <button class="btn btn-ghost" data-grade-action="delete" data-grade-entry-id="${entry.id}">Excluir</button>

        </div>

      </div>

    </div>

  `).join("")}</div>`;

}



function renderGradeComponentItem(component) {

  const scoreText = component.score == null ? "Sem nota lançada" : `Média lançada ${formatScore(component.score)}`;

  return `

    <div class="grade-component-item">

      <div class="grade-component-top">

        <div>

          <h4>${escapeHtml(component.label)}</h4>

          <p>${scoreText} · ${component.entries.length} lançamento(s)</p>

        </div>

        <div class="grade-inline-actions">

          <span class="chip neutral">${escapeHtml(getComponentWeightText(component))}</span>

          ${component.score == null ? '<span class="chip warning">pendente</span>' : `<span class="chip success">${formatScore(component.score)}</span>`}

        </div>

      </div>

      ${renderGradeEntryList(component)}

    </div>

  `;

}



function renderGradeSubjectCard(model) {

  const { subject, status, targets, requiredPrimary, requiredSecondary, tonePrimary, toneSecondary, scenario, remainingLabels } = model;
  if (status.modelType === "pme0100_formula_2026") {

    return renderCustomGradeSubjectCard(model);

  }
  const normalizedQuery = String(state.notesSearchTerm || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const visibleComponents = !normalizedQuery
    ? status.components
    : status.components.filter((component) => {
        const haystack = [
          subject.name,
          subject.shortName,
          subject.code,
          component.label,
          component.type,
          ...(component.entries || []).map((entry) => `${entry.title || ""} ${entry.entryType || ""} ${entry.label || ""}`)
        ]
          .join(" ")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        return haystack.includes(normalizedQuery);
      });

  return `

    <article class="grade-subject-card">

      <div class="grade-subject-header">

        <div>

          <h3>${escapeHtml(subject.name)}</h3>

          <p class="muted">${escapeHtml(subject.examSchemeNote)}</p>

        </div>

        <div class="chip-row">

          <span class="chip accent">Peso lançado ${formatWeight(status.knownWeight)}</span>

          <span class="chip neutral">Peso faltante ${formatWeight(status.remainingWeight)}</span>

        </div>

      </div>

      <div class="grade-meta-grid">

        <div class="grade-metric">

          <span class="label">Contribuição já lançada</span>

          <strong>${formatScore(status.currentLockedGrade)}</strong>

          <p>É a parte da nota final já capturada pelos lançamentos feitos até agora.</p>

        </div>

        <div class="grade-metric">

          <span class="label">Média dos itens lançados</span>

          <strong>${status.knownAverage == null ? '—' : formatScore(status.knownAverage)}</strong>

          <p>Útil para projetar o semestre sem assumir nota zero no que ainda falta.</p>

        </div>

        <div class="grade-metric">

          <span class="label">Projeção se repetir a média atual</span>

          <strong>${status.projectedMaintain == null ? '—' : formatScore(status.projectedMaintain)}</strong>

          <p>Projeção simples: usa a média já lançada como referência para os itens restantes.</p>

        </div>

        <div class="grade-metric">

          <span class="label">Nota final fechada</span>

          <strong>${status.finalGrade == null ? 'Em aberto' : formatScore(status.finalGrade)}</strong>

          <p>${status.finalGrade == null ? 'Ainda há componentes sem nota lançada.' : 'Todos os componentes com nota registrada.'}</p>

        </div>

      </div>

      <div class="grade-target-grid">

        <div class="grade-target">

          <span class="label">Meta ${formatScore(targets.primary)}</span>

          <strong>${describeRequirement(requiredPrimary, targets.primary, status.finalGrade)}</strong>

          <p>${buildBalancedPlanText(status.remainingComponents, requiredPrimary)}</p>

          <div class="chip-row"><span class="chip ${tonePrimary}">Plano equilibrado</span></div>

        </div>

        <div class="grade-target">

          <span class="label">Meta ${formatScore(targets.secondary)}</span>

          <strong>${describeRequirement(requiredSecondary, targets.secondary, status.finalGrade)}</strong>

          <p>${buildBalancedPlanText(status.remainingComponents, requiredSecondary)}</p>

          <div class="chip-row"><span class="chip ${toneSecondary}">Plano equilibrado</span></div>

        </div>

      </div>

      <div class="grade-component-item">

        <div class="grade-component-top">

          <div>

            <h4>Simulador de cenário</h4>

            <p>Preencha só o que falta ou use um preset rápido para ver combinações menos pesadas.</p>

          </div>

          <div class="grade-inline-actions">

            <span class="chip accent">Base do cenário ${formatScore(scenario.currentScenarioBase)}</span>

            ${scenario.exactFinal == null ? `<span class="chip neutral">Faltam ${formatWeight(scenario.remainingAfterDraftWeight)}</span>` : `<span class="chip success">Final ${formatScore(scenario.exactFinal)}</span>`}

          </div>

        </div>

        ${renderGradeScenarioInputs(model)}

        <div class="scenario-summary">

          <div class="grade-target-grid">

            <div class="grade-target">

              <span class="label">Cenário atual</span>

              <strong>${scenario.exactFinal == null ? formatScore(scenario.currentScenarioBase) : formatScore(scenario.exactFinal)}</strong>

              <p>${scenario.exactFinal == null ? `Cenário parcial: faltam ${formatWeight(scenario.remainingAfterDraftWeight)} para fechar a simulação completa.` : 'Cenário completo com nota final exata.'}</p>

            </div>

            <div class="grade-target">

              <span class="label">Depois do cenário · meta ${formatScore(targets.primary)}</span>

              <strong>${describeScenarioNeed(scenario.primaryNeedAfterDraft, targets.primary, scenario.exactFinal)}</strong>

              <p>${buildBalancedPlanText(scenario.simulatedComponents.filter((component) => component.simulatedScore == null), scenario.primaryNeedAfterDraft)}</p>

            </div>

            <div class="grade-target">

              <span class="label">Depois do cenário · meta ${formatScore(targets.secondary)}</span>

              <strong>${describeScenarioNeed(scenario.secondaryNeedAfterDraft, targets.secondary, scenario.exactFinal)}</strong>

              <p>${buildBalancedPlanText(scenario.simulatedComponents.filter((component) => component.simulatedScore == null), scenario.secondaryNeedAfterDraft)}</p>

            </div>

          </div>

        </div>

      </div>

      <div class="chip-row">${remainingLabels}</div>

      ${normalizedQuery ? `<div class="grade-filter-hint">Filtro ativo: <strong>${escapeHtml(state.notesSearchTerm)}</strong> · ${visibleComponents.length} componente${visibleComponents.length === 1 ? "" : "s"} visível${visibleComponents.length === 1 ? "" : "is"}</div>` : ""}

      <div class="grade-component-list">

        ${visibleComponents.length
          ? visibleComponents.map((component) => renderGradeComponentItem(component)).join("")
          : `<div class="grade-empty">Nenhum componente dessa matéria combina com o filtro atual.</div>`}

      </div>

    </article>

  `;

}



function renderGradeScenarioBlock(model) {

  const { status, targets, scenario } = model;

  if (status.scenarioDisabled) {

    const chips = [

      status.weightedExamAverage == null ? "P em aberto" : `P ${formatScore(status.weightedExamAverage)}`,

      status.activityAverage == null ? "E em aberto" : `E ${formatScore(status.activityAverage)}`,

      status.firstEvaluation == null ? "M1 em aberto" : `M1 ${formatScore(status.firstEvaluation)}`

    ];

    if (status.finalGrade != null) {

      chips.push(`Fechamento ${formatScore(status.finalGrade)}`);

    } else if (status.recoveryEligible) {

      chips.push("PREC ainda pode fechar a matéria");

    }

    return `

      <div class="grade-component-item">

        <div class="grade-component-top">

          <div>

            <h4>Fórmula especial da disciplina</h4>

            <p>PME0100 usa P, E, PSUB e PREC. O app calcula o fechamento exato a partir dos lançamentos reais.</p>

          </div>

        </div>

        <div class="grade-empty">Use os componentes abaixo para lançar P1, P2, P3, Atividades (E), PSUB e PREC. O simulador genérico foi ocultado para evitar projeção errada.</div>

        <div class="chip-row" style="margin-top: 12px;">

          ${chips.map((chip) => `<span class="chip neutral">${escapeHtml(chip)}</span>`).join("")}

        </div>

      </div>

    `;

  }

  return `

      <div class="grade-component-item">

        <div class="grade-component-top">

          <div>

            <h4>Simulador de cenário</h4>

            <p>Preencha só o que falta ou use um preset rápido para ver combinações menos pesadas.</p>

          </div>

          <div class="grade-inline-actions">

            <span class="chip accent">Base do cenário ${formatScore(scenario.currentScenarioBase)}</span>

            ${scenario.exactFinal == null ? `<span class="chip neutral">Faltam ${formatWeight(scenario.remainingAfterDraftWeight)}</span>` : `<span class="chip success">Final ${formatScore(scenario.exactFinal)}</span>`}

          </div>

        </div>

        ${renderGradeScenarioInputs(model)}

        <div class="scenario-summary">

          <div class="grade-target-grid">

            <div class="grade-target">

              <span class="label">Cenário atual</span>

              <strong>${scenario.exactFinal == null ? formatScore(scenario.currentScenarioBase) : formatScore(scenario.exactFinal)}</strong>

              <p>${scenario.exactFinal == null ? `Cenário parcial: faltam ${formatWeight(scenario.remainingAfterDraftWeight)} para fechar a simulação completa.` : 'Cenário completo com nota final exata.'}</p>

            </div>

            <div class="grade-target">

              <span class="label">Depois do cenário · meta ${formatScore(targets.primary)}</span>

              <strong>${describeScenarioNeed(scenario.primaryNeedAfterDraft, targets.primary, scenario.exactFinal)}</strong>

              <p>${buildBalancedPlanText(scenario.simulatedComponents.filter((component) => component.simulatedScore == null), scenario.primaryNeedAfterDraft)}</p>

            </div>

            <div class="grade-target">

              <span class="label">Depois do cenário · meta ${formatScore(targets.secondary)}</span>

              <strong>${describeScenarioNeed(scenario.secondaryNeedAfterDraft, targets.secondary, scenario.exactFinal)}</strong>

              <p>${buildBalancedPlanText(scenario.simulatedComponents.filter((component) => component.simulatedScore == null), scenario.secondaryNeedAfterDraft)}</p>

            </div>

          </div>

        </div>

      </div>

    `;

}



function renderCustomGradeSubjectCard(model) {

  const { subject, status, targets, requiredPrimary, requiredSecondary, tonePrimary, toneSecondary, remainingLabels } = model;
  const normalizedQuery = String(state.notesSearchTerm || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const visibleComponents = !normalizedQuery
    ? status.components
    : status.components.filter((component) => {
        const haystack = [
          subject.name,
          subject.shortName,
          subject.code,
          component.label,
          component.type,
          ...(component.entries || []).map((entry) => `${entry.title || ""} ${entry.entryType || ""} ${entry.label || ""}`)
        ]
          .join(" ")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        return haystack.includes(normalizedQuery);
      });

  return `

    <article class="grade-subject-card">

      <div class="grade-subject-header">

        <div>

          <h3>${escapeHtml(subject.name)}</h3>

          <p class="muted">${escapeHtml(subject.examSchemeNote)}</p>

        </div>

        <div class="chip-row">

          <span class="chip accent">${status.weightedExamAverage == null ? 'P em aberto' : `P ${formatScore(status.weightedExamAverage)}`}</span>

          <span class="chip neutral">${status.activityAverage == null ? 'E em aberto' : `E ${formatScore(status.activityAverage)}`}</span>

          ${status.recoveryEligible ? '<span class="chip warning">Faixa de recuperação</span>' : ''}

        </div>

      </div>

      <div class="grade-meta-grid">

        <div class="grade-metric">

          <span class="label">Base com faltantes zerados</span>

          <strong>${formatScore(status.currentLockedGrade)}</strong>

          <p>Piso da matéria se o que falta ficar zerado nos componentes obrigatórios.</p>

        </div>

        <div class="grade-metric">

          <span class="label">Média simples dos itens lançados</span>

          <strong>${status.knownAverage == null ? '—' : formatScore(status.knownAverage)}</strong>

          <p>Referência simples para preencher o restante; não substitui a fórmula oficial.</p>

        </div>

        <div class="grade-metric">

          <span class="label">Projeção repetindo a média atual</span>

          <strong>${status.projectedMaintain == null ? '—' : formatScore(status.projectedMaintain)}</strong>

          <p>Preenche os componentes obrigatórios pendentes com a sua média atual e aplica a regra real.</p>

        </div>

        <div class="grade-metric">

          <span class="label">Fechamento atual</span>

          <strong>${status.finalGrade == null ? 'Em aberto' : formatScore(status.finalGrade)}</strong>

          <p>${status.finalGrade == null
            ? (status.recoveryEligible ? 'M1 caiu na faixa de recuperação; PREC ainda pode definir o fechamento.' : 'Ainda faltam componentes determinantes para fechar a disciplina.')
            : 'Regra oficial aplicada com PSUB/PREC quando lançados.'}</p>

        </div>

      </div>

      <div class="grade-target-grid">

        <div class="grade-target">

          <span class="label">Meta ${formatScore(targets.primary)}</span>

          <strong>${describeRequirement(requiredPrimary, targets.primary, status.finalGrade)}</strong>

          <p>${buildBalancedPlanText(status.remainingComponents, requiredPrimary)}</p>

          <div class="chip-row"><span class="chip ${tonePrimary}">Plano equilibrado</span></div>

        </div>

        <div class="grade-target">

          <span class="label">Meta ${formatScore(targets.secondary)}</span>

          <strong>${describeRequirement(requiredSecondary, targets.secondary, status.finalGrade)}</strong>

          <p>${buildBalancedPlanText(status.remainingComponents, requiredSecondary)}</p>

          <div class="chip-row"><span class="chip ${toneSecondary}">Plano equilibrado</span></div>

        </div>

      </div>

      ${renderGradeScenarioBlock(model)}

      <div class="chip-row">${remainingLabels}</div>

      ${normalizedQuery ? `<div class="grade-filter-hint">Filtro ativo: <strong>${escapeHtml(state.notesSearchTerm)}</strong> · ${visibleComponents.length} componente${visibleComponents.length === 1 ? "" : "s"} visível${visibleComponents.length === 1 ? "" : "is"}</div>` : ""}

      <div class="grade-component-list">

        ${visibleComponents.length
          ? visibleComponents.map((component) => renderGradeComponentItem(component)).join("")
          : `<div class="grade-empty">Nenhum componente dessa matéria combina com o filtro atual.</div>`}

      </div>

    </article>

  `;

}



function renderGradeOverviewHero(model) {

  const guideList = Array.isArray(GRADE_UI.guideItems) && GRADE_UI.guideItems.length
    ? renderDetailList(
        GRADE_UI.guideItems.map((item) => ({
          value: escapeHtml(item)
        })),
        { className: "note-list grade-help-list", valueOnly: true }
      )
    : "";

  return `

    <div class="grade-hero">

      <span class="label">${escapeHtml(GRADE_UI.heroLabel || "Notas e metas")}</span>

      <h2>${escapeHtml(GRADE_UI.heroTitle || "Selecione a matéria para analisar notas e simular cenários")}</h2>

      <div class="subvalue">${escapeHtml(GRADE_UI.heroSubtitle || "A análise detalhada agora fica focada em uma matéria por vez, reduzindo ruído visual sem perder o simulador e as metas.")}</div>

      <form id="gradeTargetsForm" class="inline-form-grid" style="margin-top: 10px;">

        <label class="field">

          <span>Matéria em foco</span>

          <select id="gradeOverviewSubjectSelect">

            ${DATA.subjects.map((item) => `<option value="${item.code}" ${item.code === model.subject.code ? "selected" : ""}>${item.shortName}</option>`).join("")}

          </select>

        </label>

        <label class="field">

          <span>Meta principal</span>

          <input type="number" name="primaryTarget" min="0" max="10" step="0.1" value="${model.targets.primary}" required />

        </label>

        <label class="field">

          <span>Meta secundária</span>

          <input type="number" name="secondaryTarget" min="0" max="10" step="0.1" value="${model.targets.secondary}" required />

        </label>

        <label class="field">

          <span>Busca rápida</span>

          <input type="search" id="gradeNotesSearchInput" value="${escapeHtml(state.notesSearchTerm || "")}" placeholder="Filtrar por componente, prova ou matéria" />

        </label>

        <button type="submit" class="btn btn-soft">Salvar metas</button>

      </form>

      ${guideList ? `
        <div class="grade-component-item">
          <div class="grade-component-top">
            <div>
              <h4>${escapeHtml(GRADE_UI.guideTitle || "Como usar sem se perder")}</h4>
              <p>Fluxo curto para atualizar notas sem transformar essa aba num painel pesado.</p>
            </div>
          </div>
          ${guideList}
        </div>
      ` : ""}

    </div>

  `;

}



function renderGradesPage(referenceDate) {

  renderGradeFormCard(referenceDate);



  const model = getGradeOverviewModel(getGradeFocusSubjectCode());

  if (!model) {

    elements.gradesSummaryCard.innerHTML = `<div class="grade-empty">${escapeHtml(GRADE_UI.emptySubject || "Nenhuma matéria disponível.")}</div>`;

    return;

  }



  elements.gradesSummaryCard.innerHTML = `

    <div class="grade-stack">

      ${renderGradeOverviewHero(model)}

      <div class="grade-subject-list">

        ${renderGradeSubjectCard(model)}

      </div>

    </div>

  `;

}
