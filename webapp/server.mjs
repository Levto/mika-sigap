import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import ExcelJS from 'exceljs';

const directory = dirname(fileURLToPath(import.meta.url));
const database = new DatabaseSync(join(directory, 'entries.sqlite'));
const port = Number(process.env.PORT) || 3000;
const sourceOptions = [
  'Whatsapp Gateway',
  'Google Review',
  'Email',
  'DM Media Sosial'
];
const statusOptions = ['Sedang Ditindaklanjuti', 'Selesai'];
const questionCategorySeeds = [
  { id: 'alur-pembuatan-paspor', name: 'Alur Pembuatan Paspor' },
  { id: 'syarat-paspor', name: 'Syarat Paspor' }
];
const subtypes = {
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

function createEntriesTable() {
  database.exec(`
    CREATE TABLE entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    subtype TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('Whatsapp Gateway', 'Google Review', 'Email', 'DM Media Sosial')),
    description TEXT NOT NULL DEFAULT '',
    report_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Sedang Ditindaklanjuti' CHECK (status IN ('Sedang Ditindaklanjuti', 'Selesai')),
    follow_up_date DATE NOT NULL DEFAULT '',
    follow_up TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

const entriesTable = database.prepare(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'entries'"
).get();
if (!entriesTable) {
  createEntriesTable();
} else if (!database.prepare('PRAGMA table_info(entries)').all().some((column) => column.name === 'source')) {
  database.exec(`
    BEGIN;
    DROP TABLE entries;
    COMMIT;
  `);
  createEntriesTable();
}
if (!database.prepare('PRAGMA table_info(entries)').all().some((column) => column.name === 'report_date')) {
  database.exec(`
    ALTER TABLE entries ADD COLUMN report_date TEXT;
    UPDATE entries SET report_date = date(created_at) WHERE report_date IS NULL;
  `);
}
if (!database.prepare('PRAGMA table_info(entries)').all().some((column) => column.name === 'status')) {
  database.exec(`
    ALTER TABLE entries ADD COLUMN status TEXT NOT NULL DEFAULT 'Sedang Ditindaklanjuti'
      CHECK (status IN ('Sedang Ditindaklanjuti', 'Selesai'));
  `);
}
if (!database.prepare('PRAGMA table_info(entries)').all().some((column) => column.name === 'follow_up_date')) {
  database.exec("ALTER TABLE entries ADD COLUMN follow_up_date DATE NOT NULL DEFAULT ''");
} else if (database.prepare('PRAGMA table_info(entries)').all().find((column) => column.name === 'follow_up_date').type.toUpperCase() !== 'DATE') {
  const previousSequence = database.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'entries'").get()?.seq || 0;
  database.exec('BEGIN; ALTER TABLE entries RENAME TO entries_follow_up_legacy;');
  createEntriesTable();
  database.exec(`
    INSERT INTO entries (id, type, subtype, source, description, report_date, status, follow_up_date, follow_up, created_at)
      SELECT id, type, subtype, source, description, report_date, status, follow_up_date, follow_up, created_at
      FROM entries_follow_up_legacy;
    DROP TABLE entries_follow_up_legacy;
  `);
  database.prepare("UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = 'entries'").run(previousSequence);
  database.exec('COMMIT;');
}
if (!database.prepare('PRAGMA table_info(entries)').all().some((column) => column.name === 'follow_up')) {
  database.exec("ALTER TABLE entries ADD COLUMN follow_up TEXT NOT NULL DEFAULT ''");
}

function createQuestionCategoriesTable() {
  database.exec(`
    CREATE TABLE IF NOT EXISTS question_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      category_index INTEGER NOT NULL,
      day INTEGER NOT NULL,
      value INTEGER DEFAULT 0,
      libur INTEGER DEFAULT 0,
      UNIQUE(month, category_index, day)
    )
  `);
}
createQuestionCategoriesTable();
database.exec(`
  CREATE TABLE IF NOT EXISTS question_category_catalog (
    category_index INTEGER PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
  )
`);
const addQuestionCategory = database.prepare(
  'INSERT OR IGNORE INTO question_category_catalog (category_index, name, active) VALUES (?, ?, 1)'
);
questionCategorySeeds.forEach((category, categoryIndex) => {
  addQuestionCategory.run(categoryIndex, category.name);
});

function getQuestionCategoryCatalog() {
  return database.prepare(
    'SELECT category_index AS categoryIndex, name, active FROM question_category_catalog ORDER BY category_index'
  ).all();
}

function ensureQuestionCategoryMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const insertDay = database.prepare(
    'INSERT OR IGNORE INTO question_categories (month, category_index, day, value, libur) VALUES (?, ?, ?, 0, 0)'
  );
  const categories = getQuestionCategoryCatalog();
  database.exec('BEGIN IMMEDIATE');
  try {
    categories.forEach(({ categoryIndex }) => {
      for (let day = 1; day <= daysInMonth; day++) {
        insertDay.run(month, categoryIndex, day);
      }
    });
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
  return daysInMonth;
}

function isValidQuestionMonth(month) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

function isValidQuestionDay(month, day) {
  if (!isValidQuestionMonth(month) || !Number.isInteger(day) || day < 1) return false;
  const [year, monthNumber] = month.split('-').map(Number);
  return day <= new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}
function getCurrentQuestionMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
ensureQuestionCategoryMonth(getCurrentQuestionMonth());

const addEntry = database.prepare(
  'INSERT INTO entries (type, subtype, source, description, report_date, status, follow_up_date, follow_up) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
);
const updateEntry = database.prepare(`
  UPDATE entries
  SET type = ?, subtype = ?, source = ?, description = ?, report_date = ?, status = ?, follow_up_date = ?, follow_up = ?
  WHERE id = ?
`);
const deleteEntry = database.prepare('DELETE FROM entries WHERE id = ?');

  const assets = {
    '/': ['index.html', 'text/html; charset=utf-8'],
    '/input': ['index.html', 'text/html; charset=utf-8'],
    '/entries': ['index.html', 'text/html; charset=utf-8'],
    '/pertanyaan': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/chart.umd.js': ['node_modules/chart.js/dist/chart.umd.js', 'text/javascript; charset=utf-8'],
  '/brand-logo.png': ['../logo_mika_sigap_high_resolution.png', 'image/png']
};

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

function isValidReportDate(reportDate) {
  return typeof reportDate === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(reportDate)
    && new Date(`${reportDate}T00:00:00Z`).toISOString().slice(0, 10) === reportDate;
}

function validateEntry(entry, requireFollowUp = false) {
  if (!subtypes[entry.type]?.includes(entry.subtype)) return 'Pilih seksi dan bagian yang sesuai.';
  if (!sourceOptions.includes(entry.source)) return 'Pilih sumber aduan yang valid.';
  if (!isValidReportDate(entry.reportDate)) return 'Pilih Tanggal Aduan yang valid.';
  if (typeof entry.description !== 'string' || entry.description.length > 5000) return 'Deskripsi Aduan maksimal 5.000 karakter.';
  if (!statusOptions.includes(entry.status)) return 'Pilih Status Aduan yang valid.';
  if ((requireFollowUp && !entry.followUpDate) || (entry.followUpDate && !isValidReportDate(entry.followUpDate))) {
    return 'Isi Tanggal Tindak Lanjut dengan tanggal yang valid.';
  }
  if (entry.followUpDate && entry.followUpDate < entry.reportDate) {
    return 'Tanggal Tindak Lanjut tidak boleh sebelum Tanggal Aduan.';
  }
  if (typeof entry.followUp !== 'string' || entry.followUp.length > 5000 || (requireFollowUp && !entry.followUp.trim())) {
    return 'Isi Tindak Lanjut maksimal 5.000 karakter.';
  }
  return null;
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    if (size > 16_000) {
      throw Object.assign(new Error('Request body is too large.'), { status: 413 });
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 });
  }
}

function validateEntryFilters(month, status, sort) {
  if ((month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    || (status !== 'all' && !statusOptions.includes(status))
    || !['newest', 'oldest'].includes(sort)) {
    return 'Filter aduan tidak valid.';
  }
  return null;
}

function getFilteredEntries(month, status, sort) {
  const conditions = [];
  const values = [];
  if (month) {
    const [year, monthNumber] = month.split('-').map(Number);
    const nextMonth = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
    conditions.push('report_date >= ? AND report_date < ?');
    values.push(`${month}-01`, nextMonth);
  }
  if (status !== 'all') {
    conditions.push('status = ?');
    values.push(status);
  }
  const direction = sort === 'oldest' ? 'ASC' : 'DESC';
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return database.prepare(`
    SELECT id, type, subtype, source, description, report_date, status, follow_up_date, follow_up, created_at
    FROM entries
    ${where}
    ORDER BY report_date ${direction}, created_at ${direction}, id ${direction}
  `).all(...values);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'GET' && url.pathname === '/api/entries/export') {
    const month = url.searchParams.get('month') || '';
    const status = url.searchParams.get('status') || 'all';
    const sort = url.searchParams.get('sort') || 'newest';
    const filterError = validateEntryFilters(month, status, sort);
    if (filterError) return sendJson(response, 400, { error: filterError });

    const entries = getFilteredEntries(month, status, sort);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Daftar Aduan');
    worksheet.columns = [
      { header: 'No.', key: 'number', width: 8 },
      { header: 'Tanggal Aduan', key: 'reportDate', width: 18 },
      { header: 'Seksi Terlapor', key: 'type', width: 48 },
      { header: 'Bagian', key: 'subtype', width: 36 },
      { header: 'Sumber Aduan', key: 'source', width: 24 },
      { header: 'Deskripsi', key: 'description', width: 60 },
      { header: 'Status', key: 'status', width: 28 },
      { header: 'Tanggal Tindak Lanjut', key: 'followUpDate', width: 24 },
      { header: 'Tindak Lanjut', key: 'followUp', width: 60 }
    ];
    worksheet.addRows(entries.map((entry, index) => ({
      number: index + 1,
      reportDate: entry.report_date || '-',
      type: entry.type,
      subtype: entry.subtype,
      source: entry.source,
      description: entry.description || '-',
      status: entry.status,
      followUpDate: entry.follow_up_date || '-',
      followUp: entry.follow_up || '-'
    })));
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF01243F' } };
    worksheet.getColumn('description').alignment = { vertical: 'top', wrapText: true };
    worksheet.getColumn('followUp').alignment = { vertical: 'top', wrapText: true };
    worksheet.autoFilter = 'A1:I1';
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    const workbookBuffer = await workbook.xlsx.writeBuffer();
    const filenameStatus = status === 'all' ? 'semua-status' : status.toLowerCase().replaceAll(' ', '-');
    const filename = `daftar-aduan_${month || 'semua-bulan'}_${filenameStatus}.xlsx`;
    response.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': workbookBuffer.length
    });
    return response.end(workbookBuffer);
  }

  if (request.method === 'GET' && url.pathname === '/api/entries') {
    const month = url.searchParams.get('month') || '';
    const status = url.searchParams.get('status') || 'all';
    const sort = url.searchParams.get('sort') || 'newest';
    const filterError = validateEntryFilters(month, status, sort);
    if (filterError) return sendJson(response, 400, { error: filterError });
    return sendJson(response, 200, getFilteredEntries(month, status, sort));
  }

  const entryRoute = url.pathname.match(/^\/api\/entries\/(\d+)$/);
  if (entryRoute && request.method === 'PATCH') {
    try {
      const entry = await readJson(request);
      const validationError = validateEntry(entry, true);
      if (validationError) return sendJson(response, 400, { error: validationError });
      const result = updateEntry.run(
        entry.type,
        entry.subtype,
        entry.source,
        entry.description.trim(),
        entry.reportDate,
        entry.status,
        entry.followUpDate || '',
        entry.followUp,
        Number(entryRoute[1])
      );
      if (!result.changes) return sendJson(response, 404, { error: 'Aduan tidak ditemukan.' });
      const updated = database.prepare(
        'SELECT id, type, subtype, source, description, report_date, status, follow_up_date, follow_up, created_at FROM entries WHERE id = ?'
      ).get(Number(entryRoute[1]));
      return sendJson(response, 200, updated);
    } catch (error) {
      return sendJson(response, error.status || 400, { error: error.message });
    }
  }

  if (entryRoute && request.method === 'DELETE') {
    const result = deleteEntry.run(Number(entryRoute[1]));
    if (!result.changes) return sendJson(response, 404, { error: 'Aduan tidak ditemukan.' });
    return sendJson(response, 200, { deleted: true });
  }

  if (request.method === 'GET' && url.pathname === '/api/dashboard') {
    const month = url.searchParams.get('month') || new Date().toISOString().slice(0, 7);
    const granularity = url.searchParams.get('granularity') || url.searchParams.get('period') || 'month';
    const scope = url.searchParams.get('scope') || 'selected';
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !['month', 'year'].includes(granularity) || !['selected', 'all'].includes(scope)) {
      return sendJson(response, 400, { error: 'Bulan atau periode tidak valid.' });
    }

    const [year, monthNumber] = month.split('-').map(Number);
    const rangeStart = granularity === 'month' ? `${month}-01` : `${year}-01-01`;
    const rangeEnd = granularity === 'month'
      ? new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10)
      : `${year + 1}-01-01`;
    const intervalExpression = granularity === 'month' ? 'report_date' : "substr(report_date, 1, 7)";
    const timelineRows = database.prepare(`
      SELECT ${intervalExpression} AS interval, COUNT(*) AS count
      FROM entries
      WHERE report_date >= ? AND report_date < ?
      GROUP BY interval
    `).all(rangeStart, rangeEnd);
    const intervalCounts = new Map(timelineRows.map((row) => [row.interval, Number(row.count)]));
    const intervalCount = granularity === 'month' ? new Date(Date.UTC(year, monthNumber, 0)).getUTCDate() : 12;
    const timeline = Array.from({ length: intervalCount }, (_, index) => {
      const interval = granularity === 'month'
        ? `${month}-${String(index + 1).padStart(2, '0')}`
        : `${year}-${String(index + 1).padStart(2, '0')}`;
      return { interval, count: intervalCounts.get(interval) || 0 };
    });

    const questionRangeStart = granularity === 'month' ? month : `${year}-01`;
    const questionRangeEnd = granularity === 'month'
      ? new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 7)
      : `${year + 1}-01`;
    const questionIntervalExpression = granularity === 'month'
      ? "category.month || '-' || printf('%02d', category.day)"
      : 'category.month';
    const questionRows = database.prepare(`
      SELECT ${questionIntervalExpression} AS interval, SUM(category.value) AS count
      FROM question_categories AS category
      JOIN question_category_catalog AS catalog
        ON catalog.category_index = category.category_index AND catalog.active = 1
      WHERE category.month >= ? AND category.month < ?
      GROUP BY interval
    `).all(questionRangeStart, questionRangeEnd);
    const questionCounts = new Map(questionRows.map((row) => [row.interval, Number(row.count)]));
    const questionTimeline = timeline.map(({ interval }) => ({
      interval,
      count: questionCounts.get(interval) || 0
    }));
    const questionCategoryRows = database.prepare(`
      SELECT catalog.category_index AS categoryIndex, catalog.name, COALESCE(SUM(category.value), 0) AS count
      FROM question_category_catalog AS catalog
      LEFT JOIN question_categories AS category
        ON category.category_index = catalog.category_index
        AND category.month >= ? AND category.month < ?
      WHERE catalog.active = 1
      GROUP BY catalog.category_index, catalog.name
      ORDER BY catalog.category_index
    `).all(questionRangeStart, questionRangeEnd).map((category) => ({
      ...category,
      count: Number(category.count)
    }));

    const selectedSectionRows = database.prepare(`
      SELECT type, subtype, COUNT(*) AS count
      FROM entries
      WHERE report_date >= ? AND report_date < ?
      GROUP BY type, subtype
    `).all(rangeStart, rangeEnd);
    const allSectionRows = scope === 'all'
      ? database.prepare(`
        SELECT type, subtype, COUNT(*) AS count
        FROM entries
        GROUP BY type, subtype
      `).all()
      : selectedSectionRows;
    const selectedSourceRows = database.prepare(`
      SELECT source, COUNT(*) AS count
      FROM entries
      WHERE report_date >= ? AND report_date < ?
      GROUP BY source
    `).all(rangeStart, rangeEnd);
    const allSourceRows = scope === 'all'
      ? database.prepare('SELECT source, COUNT(*) AS count FROM entries GROUP BY source').all()
      : selectedSourceRows;
    const sections = Object.entries(subtypes).map(([type, options]) => ({
      type,
      count: 0,
      subtypes: options.map((subtype) => ({ subtype, count: 0 }))
    }));
    const sourceCounts = new Map(allSourceRows.map((row) => [row.source, Number(row.count)]));
    const sources = sourceOptions.map((source) => ({ source, count: sourceCounts.get(source) || 0 }));

    for (const row of allSectionRows) {
      const section = sections.find((item) => item.type === row.type);
      if (!section) continue;
      const count = Number(row.count);
      section.count += count;
      const subtype = section.subtypes.find((item) => item.subtype === row.subtype);
      if (subtype) subtype.count = count;
    }

    return sendJson(response, 200, {
      month,
      granularity,
      scope,
      timeline,
      questionTimeline,
      questionCategories: questionCategoryRows,
      questionTotal: questionCategoryRows.reduce((sum, category) => sum + category.count, 0),
      total: sections.reduce((sum, section) => sum + section.count, 0),
      sections,
      sources
    });
  }

  if (request.method === 'POST' && url.pathname === '/api/entries') {
    try {
      const entry = await readJson(request);
      entry.status = 'Sedang Ditindaklanjuti';
      entry.followUpDate = '';
      entry.followUp = '';
      const validationError = validateEntry(entry);
      if (validationError) return sendJson(response, 400, { error: validationError });

      const result = addEntry.run(entry.type, entry.subtype, entry.source, entry.description.trim(), entry.reportDate, entry.status, '', '');
      const savedEntry = database.prepare(
        'SELECT id, type, subtype, source, description, report_date, status, follow_up_date, follow_up, created_at FROM entries WHERE id = ?'
      ).get(result.lastInsertRowid);
      return sendJson(response, 201, savedEntry);
    } catch (error) {
      return sendJson(response, error.status || 400, { error: error.message });
    }
  }

  if (request.method === 'GET' && url.pathname === '/api/question-categories') {
    const month = url.searchParams.get('month') || getCurrentQuestionMonth();
    if (!isValidQuestionMonth(month)) {
      return sendJson(response, 400, { error: 'Bulan tidak valid.' });
    }
    const daysInMonth = ensureQuestionCategoryMonth(month);
    const catalog = getQuestionCategoryCatalog();
    const data = catalog.map((category) => {
      const counts = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const row = database.prepare(
          'SELECT value, libur FROM question_categories WHERE month = ? AND category_index = ? AND day = ?'
        ).get(month, category.categoryIndex, d);
        if (row && row.libur === 1) {
          counts.push(null);
        } else {
          counts.push(row ? row.value : 0);
        }
      }
      return { ...category, active: category.active === 1, counts };
    });
    const holidayDays = Array.from({ length: daysInMonth }, (_, dayIndex) => {
      const holiday = database.prepare(
        'SELECT 1 FROM question_categories WHERE month = ? AND day = ? AND libur = 1 LIMIT 1'
      ).get(month, dayIndex + 1);
      return !!holiday;
    });
    return sendJson(response, 200, {
      month,
      daysInMonth,
      data: data.filter((category) => category.active),
      deactivated: data.filter((category) => !category.active),
      holidayDays
    });
  }

  if (request.method === 'POST' && url.pathname === '/api/question-categories/categories') {
    try {
      const body = await readJson(request);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const month = body.month || getCurrentQuestionMonth();
      if (!name || name.length > 100) {
        return sendJson(response, 400, { error: 'Nama kategori harus berisi 1 sampai 100 karakter.' });
      }
      if (!isValidQuestionMonth(month)) {
        return sendJson(response, 400, { error: 'Bulan tidak valid.' });
      }
      if (database.prepare('SELECT 1 FROM question_category_catalog WHERE name = ? COLLATE NOCASE').get(name)) {
        return sendJson(response, 409, { error: 'Kategori pertanyaan tersebut sudah ada.' });
      }
      const categoryIndex = Number(database.prepare(
        'SELECT COALESCE(MAX(category_index), -1) + 1 AS nextIndex FROM question_category_catalog'
      ).get().nextIndex);
      database.prepare(
        'INSERT INTO question_category_catalog (category_index, name, active) VALUES (?, ?, 1)'
      ).run(categoryIndex, name);
      ensureQuestionCategoryMonth(month);
      return sendJson(response, 201, { categoryIndex, name, active: true });
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return sendJson(response, 409, { error: 'Kategori pertanyaan tersebut sudah ada.' });
      }
      return sendJson(response, error.status || 400, { error: error.message });
    }
  }

  const categoryStatusRoute = url.pathname.match(/^\/api\/question-categories\/categories\/(\d+)$/);
  if (categoryStatusRoute && request.method === 'PATCH') {
    try {
      const body = await readJson(request);
      if (typeof body.active !== 'boolean') {
        return sendJson(response, 400, { error: 'Status kategori tidak valid.' });
      }
      const categoryIndex = Number(categoryStatusRoute[1]);
      const result = database.prepare(
        'UPDATE question_category_catalog SET active = ? WHERE category_index = ?'
      ).run(body.active ? 1 : 0, categoryIndex);
      if (!result.changes) return sendJson(response, 404, { error: 'Kategori pertanyaan tidak ditemukan.' });
      return sendJson(response, 200, { categoryIndex, active: body.active });
    } catch (error) {
      return sendJson(response, error.status || 400, { error: error.message });
    }
  }

  if (categoryStatusRoute && request.method === 'DELETE') {
    const categoryIndex = Number(categoryStatusRoute[1]);
    if (!Number.isSafeInteger(categoryIndex)) {
      return sendJson(response, 400, { error: 'Kategori pertanyaan tidak valid.' });
    }
    database.exec('BEGIN IMMEDIATE');
    try {
      const category = database.prepare(
        'SELECT active FROM question_category_catalog WHERE category_index = ?'
      ).get(categoryIndex);
      if (!category) {
        database.exec('ROLLBACK');
        return sendJson(response, 404, { error: 'Kategori pertanyaan tidak ditemukan.' });
      }
      if (category.active !== 0) {
        database.exec('ROLLBACK');
        return sendJson(response, 409, { error: 'Hanya kategori nonaktif yang dapat dihapus.' });
      }
      const deletedRows = database.prepare(
        'DELETE FROM question_categories WHERE category_index = ?'
      ).run(categoryIndex);
      database.prepare(
        'DELETE FROM question_category_catalog WHERE category_index = ?'
      ).run(categoryIndex);
      database.exec('COMMIT');
      return sendJson(response, 200, {
        categoryIndex,
        deleted: true,
        deletedEntries: deletedRows.changes
      });
    } catch (error) {
      database.exec('ROLLBACK');
      return sendJson(response, error.status || 500, { error: error.message });
    }
  }

  if (request.method === 'GET' && url.pathname === '/api/question-categories/export') {
    const month = url.searchParams.get('month') || '';
    const categoryStatus = url.searchParams.get('categoryStatus') || '';
    if (!isValidQuestionMonth(month) || !['active', 'deactivated'].includes(categoryStatus)) {
      return sendJson(response, 400, { error: 'Filter ekspor data pertanyaan tidak valid.' });
    }
    const daysInMonth = ensureQuestionCategoryMonth(month);
    const active = categoryStatus === 'active';
    const catalog = getQuestionCategoryCatalog().filter((category) => (category.active === 1) === active);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(active ? 'Kategori Aktif' : 'Kategori Nonaktif');
    worksheet.columns = [
      { header: 'Jenis Pertanyaan', key: 'name', width: 40 },
      ...Array.from({ length: daysInMonth }, (_, index) => ({
        header: `${index + 1}${database.prepare(
          'SELECT 1 FROM question_categories WHERE month = ? AND day = ? AND libur = 1 LIMIT 1'
        ).get(month, index + 1) ? ' (Libur)' : ''}`,
        key: `day${index + 1}`,
        width: 13
      })),
      { header: 'Total', key: 'total', width: 14 }
    ];
    const readCount = database.prepare(
      'SELECT value, libur FROM question_categories WHERE month = ? AND category_index = ? AND day = ?'
    );
    worksheet.addRows(catalog.map((category) => {
      const row = { name: category.name };
      let total = 0;
      for (let day = 1; day <= daysInMonth; day++) {
        const entry = readCount.get(month, category.categoryIndex, day);
        const value = entry && entry.libur === 0 ? entry.value : 0;
        row[`day${day}`] = value;
        total += value;
      }
      row.total = total;
      return row;
    }));
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF01243F' } };
    worksheet.getColumn(1).alignment = { vertical: 'top', wrapText: true };
    worksheet.autoFilter = `A1:${worksheet.getColumn(worksheet.columnCount).letter}1`;
    worksheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
    const workbookBuffer = await workbook.xlsx.writeBuffer();
    const filename = `pertanyaan-${categoryStatus}-${month}.xlsx`;
    response.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': workbookBuffer.length
    });
    return response.end(workbookBuffer);
  }

  const questionDayRoute = url.pathname.match(/^\/api\/question-categories\/(\d{4}-\d{2})\/(\d+)$/);
  if (questionDayRoute && request.method === 'PATCH') {
    const [, month, dayValue] = questionDayRoute;
    if (!isValidQuestionMonth(month)) {
      return sendJson(response, 400, { error: 'Bulan tidak valid.' });
    }
    const day = Number(dayValue);
    if (!isValidQuestionDay(month, day)) {
      return sendJson(response, 400, { error: 'Tanggal tidak valid.' });
    }
    try {
      const body = await readJson(request);
      const { status, values } = body;
      if (status !== 'Hari Kerja' && status !== 'Libur') {
        return sendJson(response, 400, { error: 'Status harus berupa Hari Kerja atau Libur.' });
      }
      const catalog = getQuestionCategoryCatalog();
      const activeCategories = catalog.filter((category) => category.active === 1);
      if (status === 'Hari Kerja' && (!Array.isArray(values) ||
        values.length !== activeCategories.length ||
        values.some((value) => typeof value !== 'number' || value < 0 || !Number.isInteger(value)))) {
        return sendJson(response, 400, { error: 'Jumlah pertanyaan harus berupa bilangan bulat non-negatif untuk setiap kategori.' });
      }

      const isLibur = status === 'Libur';
      const upsertCategory = database.prepare(
        'INSERT INTO question_categories (month, category_index, day, value, libur) VALUES (?, ?, ?, ?, ?) ' +
        'ON CONFLICT(month, category_index, day) DO UPDATE SET value = excluded.value, libur = excluded.libur'
      );
      const readExisting = database.prepare(
        'SELECT value FROM question_categories WHERE month = ? AND category_index = ? AND day = ?'
      );
      const activeValues = new Map(activeCategories.map((category, index) => [category.categoryIndex, values?.[index]]));
      ensureQuestionCategoryMonth(month);
      database.exec('BEGIN IMMEDIATE');
      try {
        catalog.forEach((category) => {
          const value = isLibur
            ? 0
            : activeValues.has(category.categoryIndex)
              ? activeValues.get(category.categoryIndex)
              : readExisting.get(month, category.categoryIndex, day)?.value || 0;
          upsertCategory.run(month, category.categoryIndex, day, value, isLibur ? 1 : 0);
        });
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
      return sendJson(response, 200, { month, day, status });
    } catch (error) {
      return sendJson(response, error.status || 400, { error: error.message });
    }
  }

  const questionCellRoute = url.pathname.match(/^\/api\/question-categories\/(\d{4}-\d{2})\/(\d+)\/(\d+)$/);
  if (questionCellRoute && request.method === 'PATCH') {
    const [, month, categoryIndex, day] = questionCellRoute;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return sendJson(response, 400, { error: 'Bulan tidak valid.' });
    }
    try {
      const body = await readJson(request);
      const { value, status, libur } = body;
      if (status !== undefined && status !== 'Hari Kerja' && status !== 'Libur') {
        return sendJson(response, 400, { error: 'Status harus berupa Hari Kerja atau Libur.' });
      }
      const isLibur = status !== undefined ? status === 'Libur' : !!libur;
      const storedValue = isLibur ? null : value;
      if (!isLibur && (typeof storedValue !== 'number' || storedValue < 0 || !Number.isInteger(storedValue))) {
        return sendJson(response, 400, { error: 'Jumlah pertanyaan harus berupa bilangan bulat non-negatif untuk status Hari Kerja.' });
      }
      database.prepare(
        'INSERT INTO question_categories (month, category_index, day, value, libur) VALUES (?, ?, ?, ?, ?) ' +
        'ON CONFLICT(month, category_index, day) DO UPDATE SET value = excluded.value, libur = excluded.libur'
      ).run(month, Number(categoryIndex), Number(day), storedValue !== null ? storedValue : 0, isLibur ? 1 : 0);
      return sendJson(response, 200, {
        month,
        categoryIndex: Number(categoryIndex),
        day: Number(day),
        value: storedValue,
        status: isLibur ? 'Libur' : 'Hari Kerja',
        libur: isLibur
      });
    } catch (error) {
      return sendJson(response, error.status || 400, { error: error.message });
    }
  }

  if (request.method === 'GET' && assets[url.pathname]) {
    const [filename, contentType] = assets[url.pathname];
    try {
      const content = await readFile(join(directory, filename));
      response.writeHead(200, { 'Content-Type': contentType });
      return response.end(content);
    } catch {
      return sendJson(response, 500, { error: 'Halaman tidak dapat dimuat.' });
    }
  }

  return sendJson(response, 404, { error: 'Halaman tidak ditemukan.' });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Entry Register is running at http://localhost:${port}`);
});