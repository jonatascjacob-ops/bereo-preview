/**
 * BEREO — SISTEMA DE FEEDBACK & ANOTAÇÕES RÁPIDAS (CURADORIA CIRÚRGICA)
 * Permite anotar observações gerais na ficha e cirúrgicas em cada Passo (1, 2, 3 e 4).
 * Auto-save no localStorage, geração de Issue no GitHub e cópia formatada em Markdown.
 */

(function () {
    const NOTES_KEY = 'bereo_curadoria_notes_v2';
    const GENERAL_NOTE_KEY = 'bereo_general_note_v2';
    const GITHUB_REPO = 'jonatascjacob-ops/bereo-preview';

    // Recupera anotações (com migração suave se houver v1)
    function getStoredNotes() {
        try {
            const raw = localStorage.getItem(NOTES_KEY);
            if (raw) return JSON.parse(raw);

            // Migração da v1 se existir
            const oldRaw = localStorage.getItem('bereo_curadoria_notes_v1');
            if (oldRaw) {
                const old = JSON.parse(oldRaw);
                const migrated = {};
                Object.keys(old).forEach(k => {
                    migrated[k] = {
                        id: old[k].id || k,
                        title: old[k].title || k,
                        general: old[k].text || '',
                        steps: {},
                        updatedAt: old[k].updatedAt || new Date().toISOString()
                    };
                });
                localStorage.setItem(NOTES_KEY, JSON.stringify(migrated));
                return migrated;
            }
            return {};
        } catch (e) {
            return {};
        }
    }

    function saveStoredNotes(notes) {
        localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
        updateBadgeCount();
    }

    function getGeneralNote() {
        return localStorage.getItem(GENERAL_NOTE_KEY) || localStorage.getItem('bereo_general_note_v1') || '';
    }

    function saveGeneralNote(text) {
        localStorage.setItem(GENERAL_NOTE_KEY, text);
    }

    function updateBadgeCount() {
        const notes = getStoredNotes();
        const general = getGeneralNote().trim();
        let count = general ? 1 : 0;

        Object.keys(notes).forEach(k => {
            const item = notes[k];
            if (item.general && item.general.trim()) count++;
            if (item.steps) {
                Object.keys(item.steps).forEach(s => {
                    if (item.steps[s] && item.steps[s].trim()) count++;
                });
            }
        });

        const badge = document.getElementById('bereo-notes-badge-count');
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'inline-block' : 'none';
        }
    }

    // Injeta botões cirúrgicos em cada Passo (1, 2, 3 e 4)
    function injectStepNoteButtons() {
        const cards = document.querySelectorAll('.study-card');
        if (!cards || cards.length === 0) return;

        const stored = getStoredNotes();

        cards.forEach((card) => {
            const cardId = card.id || card.querySelector('.study-id')?.textContent.trim() || 'estudo';
            const titleElem = card.querySelector('.study-title');
            const cardTitle = titleElem ? titleElem.textContent.trim() : cardId;

            const stepBoxes = card.querySelectorAll('.step-box');
            stepBoxes.forEach((box, index) => {
                const stepNumElem = box.querySelector('.step-num');
                const stepTitleElem = box.querySelector('h4');
                const stepNum = stepNumElem ? stepNumElem.textContent.trim() : `Passo ${index + 1}`;
                const stepTitleFull = stepTitleElem ? stepTitleElem.textContent.trim() : stepNum;
                
                // Chave única para o passo
                const stepKey = `passo_${index + 1}`;
                const stepLabel = `${stepNum}: ${stepTitleFull.replace(/\s+/g, ' ')}`;

                const cardData = stored[cardId] || { id: cardId, title: cardTitle, general: '', steps: {} };
                const existingStepNote = cardData.steps && cardData.steps[stepKey] ? cardData.steps[stepKey] : '';

                // 1. Cria botão no h4
                if (stepTitleElem && !stepTitleElem.querySelector('.bereo-step-note-btn')) {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = `bereo-step-note-btn ${existingStepNote ? 'has-note' : ''}`;
                    btn.id = `btn-step-${cardId}-${stepKey}`;
                    btn.title = `Anotar observação neste ${stepNum}`;
                    btn.innerHTML = `<span>💬</span> <span class="lbl">${existingStepNote ? 'Anotado ✓' : 'Anotar'}</span>`;
                    stepTitleElem.appendChild(btn);

                    // 2. Cria gaveta no final do step-box
                    const drawer = document.createElement('div');
                    drawer.className = 'bereo-step-note-drawer';
                    drawer.id = `drawer-step-${cardId}-${stepKey}`;
                    drawer.style.display = existingStepNote ? 'block' : 'none';
                    drawer.innerHTML = `
                        <div class="bereo-step-note-header">
                            <span>Anotação em ${escapeHtml(stepNum)}</span>
                            <span style="font-weight:normal; font-size:10px; color:#8B949E; cursor:pointer;" onclick="document.getElementById('drawer-step-${cardId}-${stepKey}').style.display='none'">Fechar ✕</span>
                        </div>
                        <textarea class="bereo-step-note-textarea" placeholder="Observação específica para este passo (ex: pergunta 2 confusa, melhorar clareza)...">${escapeHtml(existingStepNote)}</textarea>
                        <div class="bereo-step-note-footer">
                            <span class="bereo-note-saved-hint" id="hint-step-${cardId}-${stepKey}">Salvo no navegador ✓</span>
                        </div>
                    `;
                    box.appendChild(drawer);

                    const textarea = drawer.querySelector('textarea');
                    const hint = drawer.querySelector('.bereo-note-saved-hint');

                    btn.addEventListener('click', () => {
                        const isHidden = drawer.style.display === 'none';
                        drawer.style.display = isHidden ? 'block' : 'none';
                        if (isHidden) {
                            textarea.focus();
                        }
                    });

                    let timer = null;
                    textarea.addEventListener('input', () => {
                        clearTimeout(timer);
                        timer = setTimeout(() => {
                            const text = textarea.value.trim();
                            const allNotes = getStoredNotes();
                            if (!allNotes[cardId]) {
                                allNotes[cardId] = { id: cardId, title: cardTitle, general: '', steps: {}, updatedAt: new Date().toISOString() };
                            }
                            if (!allNotes[cardId].steps) allNotes[cardId].steps = {};

                            if (text) {
                                allNotes[cardId].steps[stepKey] = text;
                                allNotes[cardId].updatedAt = new Date().toISOString();
                                btn.classList.add('has-note');
                                btn.querySelector('.lbl').textContent = 'Anotado ✓';
                            } else {
                                delete allNotes[cardId].steps[stepKey];
                                btn.classList.remove('has-note');
                                btn.querySelector('.lbl').textContent = 'Anotar';
                            }
                            saveStoredNotes(allNotes);

                            hint.classList.add('show');
                            setTimeout(() => hint.classList.remove('show'), 1500);
                        }, 350);
                    });
                }
            });
        });
    }

    // Injeta campo geral no rodapé da ficha (para notas amplas da passagem)
    function injectCardGeneralNotes() {
        const cards = document.querySelectorAll('.study-card');
        if (!cards || cards.length === 0) return;

        const stored = getStoredNotes();

        cards.forEach((card) => {
            const cardId = card.id || card.querySelector('.study-id')?.textContent.trim() || 'estudo';
            const titleElem = card.querySelector('.study-title');
            const cardTitle = titleElem ? titleElem.textContent.trim() : cardId;
            const footer = card.querySelector('.study-footer');

            if (!footer || card.querySelector('.bereo-card-note-box')) return;

            const existingNote = stored[cardId]?.general || '';
            const box = document.createElement('div');
            box.className = 'bereo-card-note-box';
            box.innerHTML = `
                <button type="button" class="bereo-btn-note-toggle ${existingNote ? 'has-note' : ''}" data-target="drawer-gen-${cardId}">
                    <span>💬</span> <span>${existingNote ? 'Observação geral anotada ✓' : 'Anotar observação geral nesta ficha'}</span>
                </button>
                <div class="bereo-card-note-drawer" id="drawer-gen-${cardId}" style="display: ${existingNote ? 'block' : 'none'};">
                    <textarea class="bereo-card-note-textarea" placeholder="Observação geral da ficha (ex: versículo-âncora, tema central, contexto histórico)...">${escapeHtml(existingNote)}</textarea>
                    <span class="bereo-note-saved-hint" id="hint-gen-${cardId}">Salvo no navegador ✓</span>
                </div>
            `;

            footer.parentNode.insertBefore(box, footer);

            const toggleBtn = box.querySelector('.bereo-btn-note-toggle');
            const drawer = box.querySelector('.bereo-card-note-drawer');
            const textarea = box.querySelector('.bereo-card-note-textarea');
            const hint = box.querySelector('.bereo-note-saved-hint');

            toggleBtn.addEventListener('click', () => {
                const isHidden = drawer.style.display === 'none';
                drawer.style.display = isHidden ? 'block' : 'none';
                if (isHidden) textarea.focus();
            });

            let timer = null;
            textarea.addEventListener('input', () => {
                clearTimeout(timer);
                timer = setTimeout(() => {
                    const text = textarea.value.trim();
                    const allNotes = getStoredNotes();
                    if (!allNotes[cardId]) {
                        allNotes[cardId] = { id: cardId, title: cardTitle, general: '', steps: {}, updatedAt: new Date().toISOString() };
                    }
                    allNotes[cardId].general = text;
                    allNotes[cardId].updatedAt = new Date().toISOString();

                    if (text) {
                        toggleBtn.classList.add('has-note');
                        toggleBtn.querySelector('span:last-child').textContent = 'Observação geral anotada ✓';
                    } else {
                        toggleBtn.classList.remove('has-note');
                        toggleBtn.querySelector('span:last-child').textContent = 'Anotar observação geral nesta ficha';
                    }
                    saveStoredNotes(allNotes);

                    hint.classList.add('show');
                    setTimeout(() => hint.classList.remove('show'), 1500);
                }, 350);
            });
        });
    }

    // Modal Flutuante e Indicador Geral
    function injectFloatingUI() {
        if (document.getElementById('bereo-float-trigger')) return;

        // Botão flutuante
        const floatBtn = document.createElement('button');
        floatBtn.className = 'bereo-notes-float-btn';
        floatBtn.id = 'bereo-float-trigger';
        floatBtn.innerHTML = `
            <span>📝</span>
            <span>Anotações</span>
            <span class="bereo-notes-badge" id="bereo-notes-badge-count" style="display:none;">0</span>
        `;
        document.body.appendChild(floatBtn);

        // Modal
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'bereo-notes-modal-overlay';
        modalOverlay.id = 'bereo-notes-modal-overlay';
        modalOverlay.innerHTML = `
            <div class="bereo-notes-modal">
                <div class="bereo-notes-modal-header">
                    <h3><span>📝</span> Anotações de Curadoria</h3>
                    <button type="button" class="bereo-btn-close-modal" id="bereo-btn-close">&times;</button>
                </div>
                <div class="bereo-notes-modal-body">
                    <div class="bereo-general-note-group">
                        <label>Observação Geral (App / Telas / Visão Geral):</label>
                        <textarea class="bereo-general-textarea" id="bereo-general-input" placeholder="Ex: Modo tablet aprovado; ajustar tamanho das fontes da introdução..."></textarea>
                    </div>
                    <div class="bereo-notes-rendered-section">
                        <h4>Anotações por Ficha e Passos (<span id="bereo-fichas-count">0</span>):</h4>
                        <div id="bereo-modal-notes-container"></div>
                    </div>
                </div>
                <div class="bereo-notes-modal-footer">
                    <button type="button" class="bereo-btn-modal-action bereo-btn-issue" id="bereo-btn-github-issue">
                        <span>🐙</span> Enviar como Issue no GitHub
                    </button>
                    <button type="button" class="bereo-btn-modal-action bereo-btn-copy" id="bereo-btn-copy-clipboard">
                        <span>📋</span> Copiar Anotações
                    </button>
                    <button type="button" class="bereo-btn-clear" id="bereo-btn-clear-all">
                        Limpar Tudo
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modalOverlay);

        // Eventos
        floatBtn.addEventListener('click', openModal);
        document.getElementById('bereo-btn-close').addEventListener('click', closeModal);
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeModal();
        });

        const generalInput = document.getElementById('bereo-general-input');
        generalInput.value = getGeneralNote();
        let genTimer = null;
        generalInput.addEventListener('input', () => {
            clearTimeout(genTimer);
            genTimer = setTimeout(() => {
                saveGeneralNote(generalInput.value);
                updateBadgeCount();
            }, 300);
        });

        document.getElementById('bereo-btn-github-issue').addEventListener('click', sendGitHubIssue);
        document.getElementById('bereo-btn-copy-clipboard').addEventListener('click', copyToClipboard);
        document.getElementById('bereo-btn-clear-all').addEventListener('click', clearAll);

        updateBadgeCount();
    }

    function openModal() {
        const overlay = document.getElementById('bereo-notes-modal-overlay');
        const container = document.getElementById('bereo-modal-notes-container');
        const fichasCount = document.getElementById('bereo-fichas-count');
        const notes = getStoredNotes();

        const stepNames = {
            passo_1: 'Passo 1 (Observar)',
            passo_2: 'Passo 2 (Compreender)',
            passo_3: 'Passo 3 (Praticar / Tríade)',
            passo_4: 'Passo 4 (Minha Oração)'
        };

        const activeCards = Object.keys(notes).filter(k => {
            const item = notes[k];
            const hasGen = item.general && item.general.trim();
            const hasSteps = item.steps && Object.keys(item.steps).some(s => item.steps[s] && item.steps[s].trim());
            return hasGen || hasSteps;
        });

        fichasCount.textContent = activeCards.length;

        if (activeCards.length === 0) {
            container.innerHTML = `
                <p style="color:#8B949E; font-style:italic; padding:10px 0;">
                    Nenhuma anotação individual nas fichas ainda.<br>
                    Você pode tocar em <strong>💬 Anotar</strong> no cabeçalho de qualquer Passo ou no final da ficha.
                </p>
            `;
        } else {
            let html = '';
            activeCards.forEach((k) => {
                const item = notes[k];
                html += `
                    <div class="bereo-note-card-group">
                        <div class="bereo-note-card-title">${escapeHtml(item.title)} <span style="color:#8B949E; font-size:11px; font-weight:normal;">(${escapeHtml(item.id || k)})</span></div>
                `;

                if (item.general && item.general.trim()) {
                    html += `
                        <div class="bereo-note-step-subitem">
                            <div class="bereo-note-step-tag">Observação Geral da Ficha</div>
                            <div class="bereo-note-step-content">${escapeHtml(item.general)}</div>
                        </div>
                    `;
                }

                if (item.steps) {
                    Object.keys(item.steps).forEach(s => {
                        const noteText = item.steps[s];
                        if (noteText && noteText.trim()) {
                            const label = stepNames[s] || s;
                            html += `
                                <div class="bereo-note-step-subitem">
                                    <div class="bereo-note-step-tag">${escapeHtml(label)}</div>
                                    <div class="bereo-note-step-content">${escapeHtml(noteText)}</div>
                                </div>
                            `;
                        }
                    });
                }

                html += `</div>`;
            });
            container.innerHTML = html;
        }

        overlay.style.display = 'flex';
    }

    function closeModal() {
        const overlay = document.getElementById('bereo-notes-modal-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    function generateMarkdown() {
        const notes = getStoredNotes();
        const general = getGeneralNote().trim();

        const stepNames = {
            passo_1: 'Passo 1 (Observar)',
            passo_2: 'Passo 2 (Compreender)',
            passo_3: 'Passo 3 (Praticar)',
            passo_4: 'Passo 4 (Minha Oração)'
        };

        const activeCards = Object.keys(notes).filter(k => {
            const item = notes[k];
            const hasGen = item.general && item.general.trim();
            const hasSteps = item.steps && Object.keys(item.steps).some(s => item.steps[s] && item.steps[s].trim());
            return hasGen || hasSteps;
        });

        if (!general && activeCards.length === 0) {
            return '';
        }

        let md = '## Feedback de Curadoria — Bereo\n\n';
        md += `*Data: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}*\n\n`;

        if (general) {
            md += '### Observações Gerais\n';
            md += general + '\n\n';
        }

        if (activeCards.length > 0) {
            md += `### Anotações por Ficha (${activeCards.length} fichas comentadas)\n\n`;
            activeCards.forEach((k) => {
                const item = notes[k];
                md += `#### [${item.id || k}] ${item.title}\n`;

                if (item.steps) {
                    Object.keys(item.steps).forEach(s => {
                        const noteText = item.steps[s];
                        if (noteText && noteText.trim()) {
                            const label = stepNames[s] || s;
                            md += `- **${label}:** ${noteText.replace(/\n/g, ' ')}\n`;
                        }
                    });
                }

                if (item.general && item.general.trim()) {
                    md += `- **Geral da Ficha:** ${item.general.replace(/\n/g, ' ')}\n`;
                }

                md += '\n';
            });
        }

        return md;
    }

    function sendGitHubIssue() {
        const md = generateMarkdown();
        if (!md) {
            alert('Você ainda não escreveu nenhuma anotação para enviar!');
            return;
        }

        const title = encodeURIComponent('Curadoria Bereo: Anotações Jonatas');
        const body = encodeURIComponent(md);
        const url = `https://github.com/${GITHUB_REPO}/issues/new?title=${title}&body=${body}`;

        window.open(url, '_blank');
    }

    function copyToClipboard() {
        const md = generateMarkdown();
        if (!md) {
            alert('Nenhuma anotação para copiar.');
            return;
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(md).then(() => {
                alert('Anotações copiadas com sucesso!\n\nAgora basta abrir nossa conversa no Antigravity e colar (Ctrl+V ou Colar no celular).');
            }).catch(() => fallbackCopy(md));
        } else {
            fallbackCopy(md);
        }
    }

    function fallbackCopy(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.top = '0';
        ta.style.left = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try {
            document.execCommand('copy');
            alert('Anotações copiadas com sucesso!\n\nAgora basta colar na conversa com a IA.');
        } catch (err) {
            alert('Não foi possível copiar automaticamente. Selecione e copie o texto manualmente.');
        }
        document.body.removeChild(ta);
    }

    function clearAll() {
        if (confirm('Deseja realmente apagar todas as anotações salvas neste navegador?')) {
            localStorage.removeItem(NOTES_KEY);
            localStorage.removeItem(GENERAL_NOTE_KEY);
            localStorage.removeItem('bereo_curadoria_notes_v1');
            localStorage.removeItem('bereo_general_note_v1');
            location.reload();
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function init() {
        injectStepNoteButtons();
        injectCardGeneralNotes();
        injectFloatingUI();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
