const typeOptions = {
  'Seksi Pelayanan dan Verifikasi Dokumen Perjalanan': [
    'Petugas Wawancara',
    'Customer Service',
    'Pengambilan Paspor'
  ],
  'Seksi Intelijen dan Penindakan Keimigrasian': [
    'Petugas BAP Paspor',
    'Petugas BAP WNA',
    'Petugas Pengawasan Keimigrasian'
  ],
  'Seksi Izin Tinggal dan Status Keimigrasian': [
    'Petugas Foto dan Biometrik Asing'
  ],
  'Seksi Teknologi Informasi dan Komunikasi Keimigrasian': [
    'Petugas WA Gateway/Medsos',
    'Petugas Layanan Asing'
  ],
  'Tata Usaha': ['Kepegawaian', 'Keuangan', 'Umum', 'Kepala Kantor']
};
const sourceOptions = ['Whatsapp Gateway', 'Google Review', 'Email', 'DM Media Sosial'];
const statusOptions = ['Sedang Ditindaklanjuti', 'Selesai'];
const page = window.location.pathname === '/entries'
  ? 'entries'
  : window.location.pathname === '/pertanyaan' ? 'pertanyaan'
  : window.location.pathname === '/' ? 'dashboard' : 'create';
const isEntriesPage = page === 'entries';
const content = document.querySelector('#page-content');
const dashboardCharts = [];

document.querySelectorAll('[data-route]').forEach((link) => {
  const active = link.dataset.route === page;
  link.classList.toggle('active', active);
  if (active) link.setAttribute('aria-current', 'page');
});

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapChartLabel(label, maxLength) {
  const lines = [];
  let line = '';
  for (const word of label.split(/\s+/)) {
    if (line && `${line} ${word}`.length > maxLength) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function localDateValue() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function displayDate(value) {
  return value
    ? new Date(`${value}T00:00:00Z`).toLocaleDateString('id-ID', { timeZone: 'UTC' })
    : '-';
}

async function getEntries(filters = {}) {
  const params = new URLSearchParams();
  if (filters.month) params.set('month', filters.month);
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.sort) params.set('sort', filters.sort);
  const response = await fetch(`/api/entries?${params}`);
  if (!response.ok) throw new Error('Daftar aduan tidak dapat dimuat.');
  return response.json();
}

async function getDashboard(month, granularity, scope) {
  const params = new URLSearchParams({ month, granularity, scope });
  const response = await fetch(`/api/dashboard?${params}`);
  if (!response.ok) throw new Error('Statistik tidak dapat dimuat.');
  return response.json();
}

async function getQuestionCategories(month) {
  const params = new URLSearchParams({ month });
  const response = await fetch(`/api/question-categories?${params}`);
  if (!response.ok) throw new Error('Data pertanyaan tidak dapat dimuat.');
  return response.json();
}

function loadChartLibrary() {
  if (window.Chart) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/chart.umd.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Komponen grafik tidak dapat dimuat.'));
    document.head.append(script);
  });
}

function renderForm() {
  content.innerHTML = `
    <section class="intro">
      <p class="eyebrow"><span class="eyebrow-dot"></span> FORMULIR PETUGAS</p>
      <h1>Input Aduan</h1>
      <p class="intro-copy">Masukan detail aduan pada form yang tersedia.</p>
    </section>
    <section class="form-panel" aria-labelledby="form-heading">
      <div class="panel-heading"><h2 id="form-heading">Informasi Aduan</h2></div>
      <form id="entry-form">
        <div class="field-row">
          <label class="field"><span class="field-label">Seksi Terlapor <span class="required">*</span></span>
            <select id="type" name="type" required></select>
          </label>
          <label class="field"><span class="field-label">Bagian <span class="required">*</span></span>
            <select id="subtype" name="subtype" required></select>
          </label>
        </div>
        <div class="field-row source-date-row">
          <label class="field source-field"><span class="field-label">Sumber Aduan <span class="required">*</span></span>
            <select id="source" name="source" required></select>
          </label>
          <label class="field"><span class="field-label">Tanggal Aduan <span class="required">*</span></span>
            <input id="report-date" name="reportDate" type="date" required />
          </label>
        </div>
        <label class="field description-field"><span class="field-label">Deskripsi Aduan <span class="optional">OPSIONAL</span></span>
          <textarea id="description" name="description" rows="5" maxlength="5000" placeholder="Tuliskan detail aduan..."></textarea>
          <span class="field-hint"><span>Maksimal 5.000 karakter.</span><span id="char-count">0 / 5000</span></span>
        </label>
        <div class="form-bottom">
          <p id="form-message" class="form-message" role="status" aria-live="polite"></p>
          <button class="submit-button" type="submit"><span>Simpan Aduan</span><span aria-hidden="true">↗</span></button>
        </div>
      </form>
    </section>
    <aside class="side-note"><span class="note-mark" aria-hidden="true">✳</span><p>Data aduan tersimpan di basis data lokal pada perangkat ini.</p></aside>
  `;

  const form = document.querySelector('#entry-form');
  const type = document.querySelector('#type');
  const subtype = document.querySelector('#subtype');
  const source = document.querySelector('#source');
  const reportDate = document.querySelector('#report-date');
  const description = document.querySelector('#description');
  const count = document.querySelector('#char-count');
  const message = document.querySelector('#form-message');
  const button = form.querySelector('button');
  reportDate.value = localDateValue();

  for (const value of Object.keys(typeOptions)) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    type.append(option);
  }
  for (const value of sourceOptions) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    source.append(option);
  }

  function updateSubtypes() {
    subtype.replaceChildren(...typeOptions[type.value].map((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      return option;
    }));
  }

  type.addEventListener('change', updateSubtypes);
  description.addEventListener('input', () => {
    count.textContent = `${description.value.length} / 5000`;
  });
  updateSubtypes();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = '';
    button.disabled = true;
    button.querySelector('span').textContent = 'Menyimpan...';
    try {
      const response = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: type.value,
          subtype: subtype.value,
          source: source.value,
          reportDate: reportDate.value,
          description: description.value
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Aduan tidak dapat disimpan.');
      form.reset();
      updateSubtypes();
      reportDate.value = localDateValue();
      count.textContent = '0 / 5000';
      message.textContent = 'Aduan berhasil disimpan.';
      message.classList.add('success');
    } catch (error) {
      message.textContent = error.message;
      message.classList.remove('success');
    } finally {
      button.disabled = false;
      button.querySelector('span').textContent = 'Simpan Aduan';
    }
  });
}

function renderEntries(entries, filters = {}) {
  const activeFilters = { month: '', status: 'all', sort: 'newest', ...filters };
  content.innerHTML = `
    <section class="entries-heading">
      <div>
        <h1>Daftar Aduan</h1>
      </div>
      <div class="entries-header-actions">
        <button class="export-button" type="button" ${entries.length ? '' : 'disabled'}>Export Excel (.xlsx)</button>
        <a class="dashboard-input-button" href="/input">Input Aduan <span aria-hidden="true">↗</span></a>
      </div>
    </section>
    <div class="entries-meta"><span>ADUAN TERBARU</span><span class="entry-count">${entries.length} ADUAN</span></div>
    <div class="entry-filters">
      <form id="entry-filter-form" class="entry-filter-form">
        <label class="filter-field"><span>Bulan Aduan</span><input id="entry-month-filter" type="month" /></label>
        <button class="filter-apply" type="submit">Filter Bulan</button>
        <label class="filter-field status-filter"><span>Status Aduan</span>
          <select id="entry-status-filter">
            <option value="all">Semua Status</option>
            <option value="Sedang Ditindaklanjuti">Sedang Ditindaklanjuti</option>
            <option value="Selesai">Selesai</option>
          </select>
        </label>
      </form>
      <div class="entry-sort" role="group" aria-label="Urutkan aduan">
        <span class="sort-label">URUTAN TANGGAL</span>
        <button type="button" data-entry-sort="newest" aria-pressed="true">Terbaru</button>
        <button type="button" data-entry-sort="oldest" aria-pressed="false">Terlama</button>
      </div>
    </div>
    <div id="entry-list" class="entries-table-wrap" aria-label="Daftar aduan"></div>
    <dialog id="edit-entry-dialog" class="edit-dialog">
      <form id="edit-entry-form" method="dialog">
        <div class="dialog-heading">
          <div><h2>Edit Aduan</h2></div>
          <button class="dialog-close" type="button" aria-label="Tutup">×</button>
        </div>
        <div class="dialog-fields">
          <label class="field"><span class="field-label">Seksi Terlapor <span class="required">*</span></span><select name="type" required></select></label>
          <label class="field"><span class="field-label">Bagian <span class="required">*</span></span><select name="subtype" required></select></label>
          <label class="field"><span class="field-label">Sumber Aduan <span class="required">*</span></span><select name="source" required></select></label>
          <label class="field"><span class="field-label">Tanggal Aduan <span class="required">*</span></span><input name="reportDate" type="date" required /></label>
          <label class="field dialog-description"><span class="field-label">Deskripsi Aduan</span><textarea name="description" rows="4" maxlength="5000"></textarea></label>
          <label class="field"><span class="field-label">Status Aduan <span class="required">*</span></span><select name="status" required></select></label>
          <label class="field"><span class="field-label">Tanggal Tindak Lanjut <span class="required">*</span></span><input name="followUpDate" type="date" required /></label>
          <label class="field dialog-follow-up"><span class="field-label">Tindak Lanjut <span class="required">*</span></span><textarea name="followUp" rows="4" maxlength="5000" required></textarea></label>
        </div>
        <p id="edit-message" class="form-message" role="status" aria-live="polite"></p>
        <div class="dialog-actions">
          <button class="cancel-button" type="button">Batal</button>
          <button class="submit-button" type="submit"><span>Simpan Perubahan</span></button>
        </div>
      </form>
    </dialog>
  `;

  const list = document.querySelector('#entry-list');
  const dialog = document.querySelector('#edit-entry-dialog');
  const editForm = document.querySelector('#edit-entry-form');
  const editMessage = document.querySelector('#edit-message');
  const editType = editForm.elements.type;
  const editSubtype = editForm.elements.subtype;
  let editingId = null;
  const monthFilter = document.querySelector('#entry-month-filter');
  const statusFilter = document.querySelector('#entry-status-filter');
  monthFilter.value = activeFilters.month;
  statusFilter.value = activeFilters.status;
  document.querySelector('.export-button').addEventListener('click', () => {
    const params = new URLSearchParams();
    if (activeFilters.month) params.set('month', activeFilters.month);
    if (activeFilters.status !== 'all') params.set('status', activeFilters.status);
    params.set('sort', activeFilters.sort);
    const link = document.createElement('a');
    link.href = `/api/entries/export?${params}`;
    document.body.append(link);
    link.click();
    link.remove();
  });

  async function refreshEntries(nextFilters = activeFilters) {
    try {
      renderEntries(await getEntries(nextFilters), nextFilters);
    } catch (error) {
      const errorMessage = element('p', 'load-error', error.message);
      document.querySelector('#entry-list').replaceChildren(errorMessage);
    }
  }

  document.querySelector('#entry-filter-form').addEventListener('submit', (event) => {
    event.preventDefault();
    refreshEntries({ ...activeFilters, month: monthFilter.value });
  });
  statusFilter.addEventListener('change', () => {
    refreshEntries({ ...activeFilters, status: statusFilter.value });
  });
  document.querySelectorAll('[data-entry-sort]').forEach((button) => {
    const active = button.dataset.entrySort === activeFilters.sort;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    button.addEventListener('click', () => {
      refreshEntries({ ...activeFilters, sort: button.dataset.entrySort });
    });
  });

  for (const value of Object.keys(typeOptions)) {
    editType.add(new Option(value, value));
  }
  for (const value of sourceOptions) editForm.elements.source.add(new Option(value, value));
  for (const value of statusOptions) editForm.elements.status.add(new Option(value, value));

  function updateEditSubtypes(selectedValue) {
    editSubtype.replaceChildren(...typeOptions[editType.value].map((value) => new Option(value, value)));
    if (selectedValue && typeOptions[editType.value].includes(selectedValue)) editSubtype.value = selectedValue;
  }

  editType.addEventListener('change', () => updateEditSubtypes());
  const reportDateInput = editForm.elements.reportDate;
  const followUpDateInput = editForm.elements.followUpDate;
  function validateFollowUpDate() {
    followUpDateInput.min = reportDateInput.value;
    followUpDateInput.setCustomValidity(
      followUpDateInput.value && followUpDateInput.value < reportDateInput.value
        ? 'Tanggal Tindak Lanjut tidak boleh sebelum Tanggal Aduan.'
        : ''
    );
  }
  reportDateInput.addEventListener('input', validateFollowUpDate);
  followUpDateInput.addEventListener('input', validateFollowUpDate);
  document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  editForm.querySelector('.cancel-button').addEventListener('click', () => dialog.close());

  if (entries.length === 0) {
    const empty = element('div', 'empty-state');
    empty.append(element('span', 'empty-symbol', '∅'));
    empty.append(element('h2', '', 'Belum ada aduan.'));
    empty.append(element('p', '', 'Aduan yang dikirim akan muncul di sini.'));
    const link = element('a', 'text-link', 'Buat aduan pertama ↗');
    link.href = '/input';
    empty.append(link);
    list.append(empty);
    return;
  }

  const table = document.createElement('table');
  table.className = 'entries-table';
  table.innerHTML = `
    <thead><tr>
      <th>NO.</th>
      <th>TANGGAL ADUAN</th>
      <th>SEKSI TERLAPOR</th>
      <th>BAGIAN</th>
      <th>SUMBER ADUAN</th>
      <th>DESKRIPSI</th>
      <th>STATUS</th>
      <th>TANGGAL TINDAK LANJUT</th>
      <th>TINDAK LANJUT</th>
      <th>AKSI</th>
    </tr></thead>
    <tbody></tbody>
  `;
  const tableBody = table.querySelector('tbody');
  list.append(table);

  entries.forEach((entry, entryIndex) => {
    const row = document.createElement('tr');
    row.append(
      element('td', 'table-number', String(entryIndex + 1)),
      element('td', '', displayDate(entry.report_date)),
      element('td', 'table-section', entry.type),
      element('td', '', entry.subtype),
      element('td', '', entry.source),
      element('td', 'table-description', entry.description || '-')
    );
    const statusCell = document.createElement('td');
    statusCell.append(element('span', `status-tag${entry.status === 'Selesai' ? ' complete' : ''}`, entry.status));
    row.append(statusCell);
    row.append(
      element('td', '', displayDate(entry.follow_up_date)),
      element('td', 'follow-up-cell', entry.follow_up || '-')
    );
    const actions = element('div', 'entry-actions');
    const editButton = element('button', 'entry-action edit-action', 'Edit');
    editButton.type = 'button';
    const deleteButton = element('button', 'entry-action delete-action', 'Hapus');
    deleteButton.type = 'button';
    actions.append(editButton, deleteButton);
    const actionCell = document.createElement('td');
    actionCell.className = 'table-actions-cell';
    actionCell.append(actions);
    row.append(actionCell);
    tableBody.append(row);

    editButton.addEventListener('click', () => {
      editingId = entry.id;
      editType.value = entry.type;
      updateEditSubtypes(entry.subtype);
      editForm.elements.source.value = entry.source;
      reportDateInput.value = entry.report_date;
      editForm.elements.status.value = entry.status || statusOptions[0];
      followUpDateInput.value = entry.follow_up_date || '';
      validateFollowUpDate();
      editForm.elements.followUp.value = entry.follow_up || '';
      editForm.elements.description.value = entry.description;
      editMessage.textContent = '';
      dialog.showModal();
    });

    deleteButton.addEventListener('click', async () => {
      if (!window.confirm('Hapus aduan ini? Tindakan ini tidak dapat dibatalkan.')) return;
      try {
        const response = await fetch(`/api/entries/${entry.id}`, { method: 'DELETE' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Aduan tidak dapat dihapus.');
        await refreshEntries();
      } catch (error) {
        window.alert(error.message);
      }
    });
  });

  editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    editMessage.textContent = '';
    const saveButton = editForm.querySelector('button[type="submit"]');
    saveButton.disabled = true;
    try {
      const response = await fetch(`/api/entries/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(editForm).entries()))
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Aduan tidak dapat diperbarui.');
      dialog.close();
      await refreshEntries();
    } catch (error) {
      editMessage.textContent = error.message;
    } finally {
      saveButton.disabled = false;
    }
  });
}

function renderDashboard() {
  content.innerHTML = `
    <section class="dashboard-heading">
      <div>
        <p class="eyebrow"><span class="eyebrow-dot"></span> STATISTIK ADUAN</p>
        <h1>Dashboard Statistik Aduan</h1>
      </div>
      <a class="dashboard-input-button" href="/input">Input Aduan <span aria-hidden="true">↗</span></a>
    </section>
    <section class="chart-panel daily-panel" aria-labelledby="daily-heading">
      <div class="chart-panel-heading">
        <div><p class="eyebrow" id="timeline-eyebrow">STATISTIK BULANAN</p><h2 id="daily-heading">Jumlah Aduan per Hari</h2></div>
        <div class="timeline-controls">
          <div class="period-control" role="group" aria-label="Periode statistik">
            <button type="button" data-period="month" class="active" aria-pressed="true">Bulanan</button>
            <button type="button" data-period="year" aria-pressed="false">Tahunan</button>
          </div>
          <div class="month-control" aria-label="Pilih periode grafik">
          <button class="month-step" type="button" data-month-step="-1" aria-label="Bulan sebelumnya">‹</button>
          <label class="month-label"><span id="period-name"></span><input id="dashboard-month" type="month" aria-label="Pilih bulan" /><input id="dashboard-year" type="number" min="2000" step="1" aria-label="Pilih tahun" hidden /></label>
          <button class="month-step" type="button" data-month-step="1" aria-label="Bulan berikutnya">›</button>
          </div>
        </div>
      </div>
      <div class="daily-chart-wrap"><canvas id="daily-chart" role="img" aria-label="Grafik jumlah aduan per hari"></canvas></div>
    </section>
    <section class="chart-panel distribution-panel" aria-labelledby="distribution-heading">
      <div class="chart-panel-heading distribution-heading">
        <div><p class="eyebrow">TOTAL ADUAN</p><h2 id="distribution-heading">Jumlah Aduan per Seksi</h2></div>
        <div class="scope-control" role="group" aria-label="Rentang total aduan">
          <button type="button" data-scope="selected" class="active" aria-pressed="true">Periode Terpilih</button>
          <button type="button" data-scope="all" aria-pressed="false">Semua Waktu</button>
        </div>
      </div>
      <div class="distribution-content">
        <div class="pie-chart-wrap"><canvas id="section-chart" role="img" aria-label="Diagram pie jumlah aduan per seksi"></canvas></div>
        <div class="distribution-legend" id="section-legend"></div>
        <div class="distribution-total"><span class="total-label">Total Aduan</span><strong id="summary-total">0</strong><span id="summary-period">PERIODE TERPILIH</span></div>
      </div>
    </section>
    <section class="subsection-area" aria-labelledby="subsection-heading">
      <div class="subsection-heading">
        <div><p class="eyebrow">RINCIAN ADUAN</p><h2 id="subsection-heading">Aduan per Seksi</h2></div>
      </div>
      <div class="subsection-grid" id="subsection-grid"></div>
    </section>
    <section class="chart-panel distribution-panel source-distribution-panel" aria-labelledby="source-distribution-heading">
      <div class="chart-panel-heading">
        <div><p class="eyebrow">SUMBER ADUAN</p><h2 id="source-distribution-heading">Jumlah Aduan per Sumber</h2></div>
      </div>
      <div class="distribution-content">
        <div class="pie-chart-wrap"><canvas id="source-chart" role="img" aria-label="Diagram pie jumlah aduan per sumber"></canvas></div>
        <div class="distribution-legend" id="source-legend"></div>
        <div class="distribution-total"><span class="total-label">Total Aduan</span><strong id="source-summary-total">0</strong><span id="source-summary-period">PERIODE TERPILIH</span></div>
      </div>
    </section>
    <section class="chart-panel question-chart-panel" aria-labelledby="question-timeline-heading">
      <div class="chart-panel-heading">
        <div><p class="eyebrow" id="question-timeline-eyebrow">STATISTIK BULANAN</p><h2 id="question-timeline-heading">Jumlah Pertanyaan per Hari</h2></div>
      </div>
      <div class="daily-chart-wrap"><canvas id="question-timeline-chart" role="img" aria-label="Grafik jumlah pertanyaan per hari"></canvas></div>
    </section>
    <section class="chart-panel distribution-panel question-distribution-panel" aria-labelledby="question-distribution-heading">
      <div class="chart-panel-heading">
        <div><p class="eyebrow">PERTANYAAN MASYARAKAT</p><h2 id="question-distribution-heading">Jumlah Pertanyaan per Jenis</h2></div>
      </div>
      <div class="distribution-content">
        <div class="pie-chart-wrap"><canvas id="question-category-chart" role="img" aria-label="Diagram pie jumlah pertanyaan per kategori"></canvas></div>
        <div class="distribution-legend" id="question-category-legend"></div>
        <div class="distribution-total"><span class="total-label">Total Pertanyaan</span><strong id="question-summary-total">0</strong><span id="question-summary-period">PERIODE TERPILIH</span></div>
      </div>
    </section>
    <p class="dashboard-message" id="dashboard-message" role="status" aria-live="polite"></p>
  `;

  const monthInput = document.querySelector('#dashboard-month');
  const yearInput = document.querySelector('#dashboard-year');
  const periodName = document.querySelector('#period-name');
  const timelineEyebrow = document.querySelector('#timeline-eyebrow');
  const timelineHeading = document.querySelector('#daily-heading');
  const message = document.querySelector('#dashboard-message');
  let selectedMonth = new Date().toISOString().slice(0, 7);
  let selectedPeriod = 'month';
  let selectedScope = 'selected';
  monthInput.value = selectedMonth;
  yearInput.value = selectedMonth.slice(0, 4);

  function updatePeriodControls() {
    const yearly = selectedPeriod === 'year';
    document.querySelector('.month-label').classList.toggle('yearly', yearly);
    monthInput.hidden = yearly;
    yearInput.hidden = !yearly;
    monthInput.value = selectedMonth;
    yearInput.value = selectedMonth.slice(0, 4);
    yearInput.max = new Date().toISOString().slice(0, 4);
    periodName.textContent = yearly
      ? selectedMonth.slice(0, 4)
      : new Date(`${selectedMonth}-01T00:00:00Z`).toLocaleDateString('id-ID', {
        month: 'long', year: 'numeric', timeZone: 'UTC'
      });
    timelineEyebrow.textContent = yearly ? 'STATISTIK TAHUNAN' : 'STATISTIK BULANAN';
    timelineHeading.textContent = yearly ? 'Jumlah Aduan per Bulan' : 'Jumlah Aduan per Hari';
    document.querySelector('#question-timeline-eyebrow').textContent = yearly ? 'STATISTIK TAHUNAN' : 'STATISTIK BULANAN';
    document.querySelector('#question-timeline-heading').textContent = yearly ? 'Jumlah Pertanyaan per Bulan' : 'Jumlah Pertanyaan per Hari';
    document.querySelector('.month-control').setAttribute('aria-label', yearly ? 'Pilih tahun grafik' : 'Pilih bulan grafik');
    monthInput.setAttribute('aria-label', yearly ? 'Pilih tahun' : 'Pilih bulan');
    document.querySelector('[data-month-step="-1"]').setAttribute('aria-label', yearly ? 'Tahun sebelumnya' : 'Bulan sebelumnya');
    document.querySelector('[data-month-step="1"]').setAttribute('aria-label', yearly ? 'Tahun berikutnya' : 'Bulan berikutnya');
    document.querySelector('#daily-chart').setAttribute('aria-label', yearly ? 'Grafik jumlah aduan per bulan' : 'Grafik jumlah aduan per hari');
    document.querySelector('#question-timeline-chart').setAttribute('aria-label', yearly ? 'Grafik jumlah pertanyaan per bulan' : 'Grafik jumlah pertanyaan per hari');
    document.querySelectorAll('[data-period]').forEach((button) => {
      const active = button.dataset.period === selectedPeriod;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const currentPeriod = new Date().toISOString().slice(0, yearly ? 4 : 7);
    const selectedPeriodValue = yearly ? selectedMonth.slice(0, 4) : selectedMonth;
    document.querySelector('[data-month-step="1"]').disabled = selectedPeriodValue >= currentPeriod;
  }

  async function refresh() {
    message.textContent = '';
    try {
      drawDashboard(await getDashboard(selectedMonth, selectedPeriod, selectedScope));
    } catch (error) {
      message.textContent = error.message;
    }
  }

  document.querySelectorAll('[data-month-step]').forEach((button) => {
    button.addEventListener('click', () => {
      const [year, month] = selectedMonth.split('-').map(Number);
      const step = Number(button.dataset.monthStep);
      const next = selectedPeriod === 'year'
        ? new Date(Date.UTC(year + step, month - 1, 1))
        : new Date(Date.UTC(year, month - 1 + step, 1));
      const value = next.toISOString().slice(0, 7);
      const nextPeriodValue = selectedPeriod === 'year' ? value.slice(0, 4) : value;
      const currentPeriod = new Date().toISOString().slice(0, selectedPeriod === 'year' ? 4 : 7);
      if (nextPeriodValue <= currentPeriod) {
        selectedMonth = value;
        updatePeriodControls();
        refresh();
      }
    });
  });
  monthInput.addEventListener('change', () => {
    if (monthInput.value && monthInput.value <= new Date().toISOString().slice(0, 7)) {
      selectedMonth = monthInput.value;
      updatePeriodControls();
      refresh();
    } else {
      monthInput.value = selectedMonth;
    }
  });
  yearInput.addEventListener('change', () => {
    const year = Number(yearInput.value);
    const currentYear = Number(new Date().toISOString().slice(0, 4));
    if (year >= 2000 && year <= currentYear) {
      selectedMonth = `${year}-${selectedMonth.slice(5, 7)}`;
      updatePeriodControls();
      refresh();
    } else {
      yearInput.value = selectedMonth.slice(0, 4);
    }
  });
  document.querySelectorAll('[data-period]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedPeriod = button.dataset.period;
      updatePeriodControls();
      refresh();
    });
  });
  document.querySelectorAll('[data-scope]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedScope = button.dataset.scope;
      document.querySelectorAll('[data-scope]').forEach((scopeButton) => {
        const active = scopeButton === button;
        scopeButton.classList.toggle('active', active);
        scopeButton.setAttribute('aria-pressed', String(active));
      });
      refresh();
    });
  });

  loadChartLibrary()
    .then(() => {
      updatePeriodControls();
      refresh();
    })
    .catch((error) => { message.textContent = error.message; });
}

function drawDashboard(stats) {
  while (dashboardCharts.length) dashboardCharts.pop().destroy();

  const palette = ['#01243F', '#E4BD6B', '#35546B', '#B28D43', '#8196A3'];
  const gridColor = '#e1e7eb';
  const tickColor = '#647988';
  const month = document.querySelector('#dashboard-month').value;
  const yearly = stats.granularity === 'year';
  const monthText = new Date(`${month}-01T00:00:00Z`).toLocaleDateString('id-ID', {
    month: 'long', year: 'numeric', timeZone: 'UTC'
  });
  const timelineLabels = stats.timeline.map((item) => yearly
    ? new Date(`${item.interval}-01T00:00:00Z`).toLocaleDateString('id-ID', { month: 'short', timeZone: 'UTC' })
    : item.interval.slice(-2));
  const questionTimelineLabels = stats.questionTimeline.map((item) => yearly
    ? new Date(`${item.interval}-01T00:00:00Z`).toLocaleDateString('id-ID', { month: 'short', timeZone: 'UTC' })
    : item.interval.slice(-2));

  dashboardCharts.push(new window.Chart(document.querySelector('#daily-chart'), {
    type: 'bar',
    data: {
      labels: timelineLabels,
      datasets: [{
        data: stats.timeline.map((item) => item.count),
        backgroundColor: '#01243F',
        hoverBackgroundColor: '#E4BD6B',
        borderRadius: 3,
        maxBarThickness: 24
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          titleFont: { size: 13 },
          bodyFont: { size: 13 },
          callbacks: {
            title: (items) => yearly
              ? `${items[0].label} ${month.slice(0, 4)}`
              : `${monthText} ${items[0].label}`
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: tickColor, maxTicksLimit: 16, font: { size: 13 } } },
        y: { beginAtZero: true, ticks: { color: tickColor, precision: 0, stepSize: 1, font: { size: 13 } }, grid: { color: gridColor } }
      }
    }
  }));

  const colors = stats.sections.map((_, index) => palette[index % palette.length]);
  dashboardCharts.push(new window.Chart(document.querySelector('#section-chart'), {
    type: 'pie',
    data: {
      labels: stats.sections.map((section) => section.type),
      datasets: [{ data: stats.sections.map((section) => section.count), backgroundColor: colors, borderWidth: 2, borderColor: '#fffefa' }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  }));

  const legend = document.querySelector('#section-legend');
  legend.replaceChildren();
  stats.sections.forEach((section, index) => {
    const row = element('div', 'legend-row');
    const swatch = element('span', 'legend-swatch');
    swatch.style.backgroundColor = colors[index];
    row.append(swatch, element('span', 'legend-name', section.type), element('strong', '', section.count.toLocaleString('id-ID')));
    legend.append(row);
  });
  document.querySelector('#summary-total').textContent = stats.total.toLocaleString('id-ID');
  document.querySelector('#summary-period').textContent = stats.scope === 'all'
    ? 'SEMUA WAKTU'
    : yearly ? `TAHUN ${month.slice(0, 4)}` : monthText.toLocaleUpperCase('id-ID');

  const grid = document.querySelector('#subsection-grid');
  grid.replaceChildren();
  stats.sections.forEach((section, index) => {
    const panel = element('article', 'subsection-panel');
    const heading = element('div', 'subsection-card-heading');
    heading.append(element('h3', '', section.type), element('span', 'subsection-total', `${section.count.toLocaleString('id-ID')} Aduan`));
    const canvasWrap = element('div', 'subsection-chart-wrap');
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `Jumlah aduan per bagian: ${section.type}`);
    canvasWrap.append(canvas);
    panel.append(heading, canvasWrap);
    grid.append(panel);

    dashboardCharts.push(new window.Chart(canvas, {
      type: 'bar',
      data: {
        labels: section.subtypes.map((item) => item.subtype),
        datasets: [{ data: section.subtypes.map((item) => item.count), backgroundColor: palette[index % palette.length], borderRadius: 3, maxBarThickness: 22 }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            titleFont: { size: 13 },
            bodyFont: { size: 13 },
            callbacks: { label: (context) => `${context.label}: ${context.raw}` }
          }
        },
        scales: {
          x: { beginAtZero: true, ticks: { precision: 0, stepSize: 1, color: tickColor, font: { size: 12 } }, grid: { color: gridColor } },
          y: {
            grid: { display: false },
            ticks: {
              color: tickColor,
              font: { size: 12 },
              callback(value) {
                const label = this.getLabelForValue(value);
                return wrapChartLabel(label, 20);
              }
            }
          }
        }
      }
    }));
  });

  const sourceColors = stats.sources.map((_, index) => palette[index % palette.length]);
  dashboardCharts.push(new window.Chart(document.querySelector('#source-chart'), {
    type: 'pie',
    data: {
      labels: stats.sources.map((item) => item.source),
      datasets: [{ data: stats.sources.map((item) => item.count), backgroundColor: sourceColors, borderWidth: 2, borderColor: '#fffefa' }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  }));

  const sourceLegend = document.querySelector('#source-legend');
  sourceLegend.replaceChildren();
  stats.sources.forEach((source, index) => {
    const row = element('div', 'legend-row');
    const swatch = element('span', 'legend-swatch');
    swatch.style.backgroundColor = sourceColors[index];
    row.append(swatch, element('span', 'legend-name', source.source), element('strong', '', source.count.toLocaleString('id-ID')));
    sourceLegend.append(row);
  });
  document.querySelector('#source-summary-total').textContent = stats.sources
    .reduce((sum, source) => sum + source.count, 0).toLocaleString('id-ID');
  document.querySelector('#source-summary-period').textContent = stats.scope === 'all'
    ? 'SEMUA WAKTU'
    : yearly ? `TAHUN ${month.slice(0, 4)}` : monthText.toLocaleUpperCase('id-ID');

  dashboardCharts.push(new window.Chart(document.querySelector('#question-timeline-chart'), {
    type: 'bar',
    data: {
      labels: questionTimelineLabels,
      datasets: [{
        data: stats.questionTimeline.map((item) => item.count),
        backgroundColor: '#35546B',
        hoverBackgroundColor: '#E4BD6B',
        borderRadius: 3,
        maxBarThickness: 24
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          titleFont: { size: 13 },
          bodyFont: { size: 13 },
          callbacks: {
            title: (items) => yearly
              ? `${items[0].label} ${month.slice(0, 4)}`
              : `${monthText} ${items[0].label}`,
            label: (context) => `Jumlah Pertanyaan: ${context.raw.toLocaleString('id-ID')}`
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: tickColor, maxTicksLimit: 16, font: { size: 13 } } },
        y: { beginAtZero: true, ticks: { color: tickColor, precision: 0, stepSize: 1, font: { size: 13 } }, grid: { color: gridColor } }
      }
    }
  }));

  const questionColors = stats.questionCategories.map((_, index) => palette[index % palette.length]);
  dashboardCharts.push(new window.Chart(document.querySelector('#question-category-chart'), {
    type: 'pie',
    data: {
      labels: stats.questionCategories.map((category) => category.name),
      datasets: [{
        data: stats.questionCategories.map((category) => category.count),
        backgroundColor: questionColors,
        borderWidth: 2,
        borderColor: '#fffefa'
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  }));

  const questionLegend = document.querySelector('#question-category-legend');
  questionLegend.replaceChildren();
  stats.questionCategories.forEach((category, index) => {
    const row = element('div', 'legend-row');
    const swatch = element('span', 'legend-swatch');
    swatch.style.backgroundColor = questionColors[index];
    row.append(swatch, element('span', 'legend-name', category.name), element('strong', '', category.count.toLocaleString('id-ID')));
    questionLegend.append(row);
  });
  document.querySelector('#question-summary-total').textContent = stats.questionTotal.toLocaleString('id-ID');
  document.querySelector('#question-summary-period').textContent = yearly
    ? `TAHUN ${month.slice(0, 4)}`
    : monthText.toLocaleUpperCase('id-ID');
}

function renderQuestionCategories(stats) {
  const { month, daysInMonth, data, deactivated = [] } = stats;
  const [year, monthNumber] = month.split('-').map(Number);
  const monthLabel = new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const liburDays = stats.holidayDays || Array.from({ length: daysInMonth }, (_, dayIndex) =>
    [...data, ...deactivated].some((category) => category.counts[dayIndex] === null)
  );
  const activeMonthlyTotal = data.reduce((sum, category) =>
    sum + category.counts.reduce((categoryTotal, count) => categoryTotal + (count ?? 0), 0), 0);
  const dailyTotals = Array.from({ length: daysInMonth }, (_, dayIndex) =>
    data.reduce((sum, category) => sum + (category.counts[dayIndex] ?? 0), 0));
  const renderCategoryTable = (categories, isActive) => {
    const header = `<tr><th>Jenis Pertanyaan</th>${Array.from({ length: daysInMonth }, (_, i) => `<th${liburDays[i] ? ' class="holiday-day-cell"' : ''}>${i + 1}</th>`).join('')}<th>Aksi</th><th>Total</th></tr>`;
    const rows = categories.map((category) => {
      const total = category.counts.reduce((sum, count) => sum + (count ?? 0), 0);
      const cells = category.counts.map((count, dayIndex) => {
        const isLibur = count === null;
        const cellClass = ['count-cell', isLibur && 'libur-cell', liburDays[dayIndex] && 'holiday-day-cell'].filter(Boolean).join(' ');
        return `<td class="${cellClass}" data-category="${category.categoryIndex}" data-day="${dayIndex + 1}">${isLibur ? 0 : count}</td>`;
      }).join('');
      const actionLabel = isActive ? 'Nonaktifkan' : 'Aktifkan';
      const deleteButton = isActive
        ? ''
        : `<button class="category-action category-delete-action" type="button" data-category-index="${category.categoryIndex}" data-category-name="${escapeHtml(category.name)}">Hapus</button>`;
      return `<tr><td class="category-name">${escapeHtml(category.name)}</td>${cells}<td class="category-action-cell"><div class="category-actions"><button class="category-action" type="button" data-category-index="${category.categoryIndex}" data-active="${!isActive}">${actionLabel}</button>${deleteButton}</div></td><td class="total-cell">${total}</td></tr>`;
    }).join('');
    const editRow = isActive
      ? `<tr class="daily-total-row"><td class="category-name">Total Harian</td>${dailyTotals.map((total, index) => `<td class="daily-total-cell${liburDays[index] ? ' holiday-day-cell' : ''}">${total.toLocaleString('id-ID')}</td>`).join('')}<td></td><td class="total-cell">${activeMonthlyTotal.toLocaleString('id-ID')}</td></tr><tr><td class="category-name edit-row-label">Edit Data</td>${Array.from({ length: daysInMonth }, (_, i) => `<td${liburDays[i] ? ' class="holiday-day-cell"' : ''}><button class="edit-btn" type="button" data-day="${i + 1}" aria-label="Edit hari ${i + 1}">✎</button></td>`).join('')}<td></td><td></td></tr>`
      : '';
    const emptyRow = categories.length
      ? ''
      : `<tr><td class="category-empty-cell" colspan="${daysInMonth + 3}">${isActive ? 'Belum ada kategori aktif.' : 'Belum ada kategori nonaktif.'}</td></tr>`;
    return `<table class="category-table"><thead>${header}</thead><tbody>${rows}${emptyRow}${editRow}</tbody></table>`;
  };

  content.innerHTML = `
    <section class="intro">
      <p class="eyebrow"><span class="eyebrow-dot"></span> PERTANYAAN MASYARAKAT</p>
      <h1>Frekuensi Pertanyaan per Hari</h1>
      <p class="intro-copy">Tabel di bawah ini menampilkan jumlah kali setiap kategori pertanyaan disebutkan dalam setiap hari pada bulan yang dipilih. Tekan ikon pensil pada sel untuk mengubah nilai atau menandai sebagai libur.</p>
    </section>
    <div class="category-controls">
      <label class="filter-field"><span>Bulan</span><select id="category-month-select"></select></label>
      <span class="category-note">Menampilkan data untuk <strong id="category-month-label">${monthLabel}</strong></span>
    </div>
    <section class="question-category-section" aria-labelledby="active-categories-heading">
      <div class="question-category-heading"><h2 id="active-categories-heading">Jenis Pertanyaan Aktif</h2></div>
      <p class="category-month-total">Total Pertanyaan ${monthLabel}: <strong>${activeMonthlyTotal.toLocaleString('id-ID')}</strong></p>
      <div class="category-table-wrap">${renderCategoryTable(data, true)}</div>
      <div class="category-management-actions">
        <button id="add-question-category" class="filter-apply" type="button">Tambah Jenis Pertanyaan</button>
        <a class="export-button" href="/api/question-categories/export?month=${encodeURIComponent(month)}&categoryStatus=active">Export Excel Aktif (.xlsx)</a>
      </div>
    </section>
    <section class="question-category-section deactivated-categories-section" aria-labelledby="deactivated-categories-heading">
      <div class="question-category-heading"><h2 id="deactivated-categories-heading">Jenis Pertanyaan Nonaktif</h2></div>
      <div class="category-table-wrap">${renderCategoryTable(deactivated, false)}</div>
      <div class="category-management-actions">
        <a class="export-button" href="/api/question-categories/export?month=${encodeURIComponent(month)}&categoryStatus=deactivated">Export Excel Nonaktif (.xlsx)</a>
      </div>
    </section>
    <p class="category-message" id="category-message" role="status" aria-live="polite"></p>
    <dialog id="category-add-dialog" class="edit-dialog">
      <form id="category-add-form" method="dialog">
        <div class="dialog-heading">
          <div><h2>Tambah Jenis Pertanyaan</h2></div>
          <button class="dialog-close" type="button" aria-label="Tutup">×</button>
        </div>
        <label class="field"><span class="field-label">Nama Jenis Pertanyaan <span class="required">*</span></span><input name="name" type="text" maxlength="100" required /></label>
        <p id="category-add-message" class="form-message" role="status" aria-live="polite"></p>
        <div class="dialog-actions">
          <button class="cancel-button" type="button">Batal</button>
          <button class="submit-button" type="submit">Tambah</button>
        </div>
      </form>
    </dialog>
    <dialog id="category-edit-dialog" class="edit-dialog">
      <form id="category-edit-form" method="dialog">
        <div class="dialog-heading">
          <div><h2>Input Jumlah Pertanyaan</h2></div>
          <button class="dialog-close" type="button" aria-label="Tutup">×</button>
        </div>
        <p id="category-edit-info" class="dialog-edit-info"></p>
        <div class="dialog-fields">
          <div class="field status-picker">
            <span class="field-label" id="category-status-label">Status <span class="required">*</span></span>
            <input type="hidden" name="status" value="Hari Kerja" />
            <div class="status-dropdown">
              <button class="status-dropdown-trigger" type="button" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="category-status-label category-status-value">
                <span id="category-status-value">Hari Kerja</span><span class="status-dropdown-arrow" aria-hidden="true">⌄</span>
              </button>
              <div class="status-dropdown-options" role="listbox" aria-labelledby="category-status-label" hidden>
                <button type="button" role="option" aria-selected="true" data-status="Hari Kerja">Hari Kerja</button>
                <button type="button" role="option" aria-selected="false" data-status="Libur">Libur</button>
              </div>
            </div>
          </div>
          <div id="category-fields-container">
            ${data.map((cat, i) => `<label class="field"><span class="field-label">${escapeHtml(cat.name)} <span class="required">*</span></span><input name="cat-${i}" type="number" min="0" required /></label>`).join('')}
          </div>
        </div>
        <p id="category-edit-message" class="form-message" role="status" aria-live="polite"></p>
        <div class="dialog-actions">
          <button class="cancel-button" type="button">Batal</button>
          <button class="submit-button" type="submit">Simpan</button>
        </div>
      </form>
    </dialog>
  `;

  const monthSelect = document.querySelector('#category-month-select');
  const message = document.querySelector('#category-message');

  const months = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1));
    months.push(d.toISOString().slice(0, 7));
  }
  monthSelect.replaceChildren(...months.map((m) => {
    const [y, mo] = m.split('-').map(Number);
    const label = new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const option = document.createElement('option');
    option.value = m;
    option.textContent = label;
    if (m === month) option.selected = true;
    return option;
  }));

  const dialog = document.querySelector('#category-edit-dialog');
  const editForm = document.querySelector('#category-edit-form');
  const editInfo = document.querySelector('#category-edit-info');
  const editMessage = document.querySelector('#category-edit-message');
  const editStatus = editForm.elements.status;
  const statusDropdown = dialog.querySelector('.status-dropdown');
  const statusTrigger = statusDropdown.querySelector('.status-dropdown-trigger');
  const statusValue = statusDropdown.querySelector('#category-status-value');
  const statusOptionsList = statusDropdown.querySelector('.status-dropdown-options');
  const categoryContainer = document.querySelector('#category-fields-container');
  const categoryMessage = document.querySelector('#category-message');
  const addDialog = document.querySelector('#category-add-dialog');
  const addForm = document.querySelector('#category-add-form');
  const addMessage = document.querySelector('#category-add-message');
  let editTarget = null;

  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  editForm.querySelector('.cancel-button').addEventListener('click', () => dialog.close());
  addDialog.querySelector('.dialog-close').addEventListener('click', () => addDialog.close());
  addForm.querySelector('.cancel-button').addEventListener('click', () => addDialog.close());

  document.querySelector('#add-question-category').addEventListener('click', () => {
    addForm.reset();
    addMessage.textContent = '';
    addDialog.showModal();
    addForm.elements.name.focus();
  });

  addForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    addMessage.textContent = '';
    const submitButton = addForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
      const response = await fetch('/api/question-categories/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addForm.elements.name.value, month })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Kategori tidak dapat ditambahkan.');
      addDialog.close();
      renderQuestionCategories(await getQuestionCategories(month));
    } catch (error) {
      addMessage.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });

  document.querySelectorAll('.category-action').forEach((button) => {
    button.addEventListener('click', async () => {
      if (button.classList.contains('category-delete-action')) {
        const categoryName = button.dataset.categoryName;
        if (!window.confirm(`Hapus kategori "${categoryName}" secara permanen beserta seluruh data historisnya?`)) return;
        button.disabled = true;
        categoryMessage.textContent = '';
        try {
          const response = await fetch(`/api/question-categories/categories/${button.dataset.categoryIndex}`, {
            method: 'DELETE'
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Kategori tidak dapat dihapus.');
          renderQuestionCategories(await getQuestionCategories(monthSelect.value));
        } catch (error) {
          categoryMessage.textContent = error.message;
          button.disabled = false;
        }
        return;
      }

      button.disabled = true;
      categoryMessage.textContent = '';
      try {
        const response = await fetch(`/api/question-categories/categories/${button.dataset.categoryIndex}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: button.dataset.active === 'true' })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Status kategori tidak dapat diperbarui.');
        renderQuestionCategories(await getQuestionCategories(month));
      } catch (error) {
        categoryMessage.textContent = error.message;
        button.disabled = false;
      }
    });
  });

  function setStatus(status) {
    editStatus.value = status;
    statusValue.textContent = status;
    statusOptionsList.querySelectorAll('[role="option"]').forEach((option) => {
      option.setAttribute('aria-selected', String(option.dataset.status === status));
    });
    statusOptionsList.hidden = true;
    statusTrigger.setAttribute('aria-expanded', 'false');
    const isLibur = editStatus.value === 'Libur';
    categoryContainer.hidden = isLibur;
    categoryContainer.querySelectorAll('input').forEach((input) => {
      input.disabled = isLibur;
      input.required = !isLibur;
      if (isLibur) input.value = '0';
    });
  }

  statusTrigger.addEventListener('click', () => {
    const expanded = statusTrigger.getAttribute('aria-expanded') === 'true';
    statusTrigger.setAttribute('aria-expanded', String(!expanded));
    statusOptionsList.hidden = expanded;
  });
  statusOptionsList.querySelectorAll('[role="option"]').forEach((option) => {
    option.addEventListener('click', () => setStatus(option.dataset.status));
  });
  statusDropdown.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      statusOptionsList.hidden = true;
      statusTrigger.setAttribute('aria-expanded', 'false');
      statusTrigger.focus();
    }
  });

  document.querySelectorAll('.edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const day = Number(btn.dataset.day);
      const [year, monthNumber] = month.split('-').map(Number);
      const dateLabel = new Date(Date.UTC(year, monthNumber - 1, day)).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
      editTarget = { day, month };
      editInfo.textContent = `Input data untuk ${dateLabel}`;
      setStatus('Hari Kerja');
      categoryContainer.querySelectorAll('input').forEach((input, index) => {
        input.value = String(data[index].counts[day - 1] ?? 0);
      });
      editMessage.textContent = '';
      dialog.showModal();
    });
  });

  editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    editMessage.textContent = '';
    const saveButton = editForm.querySelector('button[type="submit"]');
    saveButton.disabled = true;
    try {
      const isLibur = editStatus.value === 'Libur';
      const body = { status: editStatus.value };
      if (!isLibur) {
        body.values = [...categoryContainer.querySelectorAll('input')].map((input, index) => {
          const rawValue = input.value;
          const value = Number(rawValue);
          if (rawValue === '' || value < 0 || !Number.isInteger(value)) throw new Error(`Masukkan nilai yang valid untuk ${data[index].name}.`);
          return value;
        });
      }
      const response = await fetch(`/api/question-categories/${month}/${editTarget.day}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Data pertanyaan tidak dapat disimpan.');
      }
      dialog.close();
      const next = await getQuestionCategories(month);
      renderQuestionCategories(next);
    } catch (error) {
      editMessage.textContent = error.message;
    } finally {
      saveButton.disabled = false;
    }
  });

  async function refresh() {
    message.textContent = '';
    try {
      const selectedMonth = monthSelect.value;
      const next = await getQuestionCategories(selectedMonth);
      renderQuestionCategories(next);
    } catch (error) {
      message.textContent = error.message;
    }
  }

  monthSelect.addEventListener('change', refresh);
}

if (isEntriesPage) {
  getEntries()
    .then(renderEntries)
    .catch((error) => {
      content.append(element('p', 'load-error', error.message));
    });
} else if (page === 'dashboard') {
  renderDashboard();
} else if (page === 'pertanyaan') {
  getQuestionCategories(localDateValue().slice(0, 7))
    .then(renderQuestionCategories)
    .catch((error) => {
      content.append(element('p', 'load-error', error.message));
    });
} else {
  renderForm();
}