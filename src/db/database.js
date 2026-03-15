const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');
const crypto = require('crypto');

let db;

function getDb() {
  if (!db) {
    const dbPath = path.join(app.getPath('userData'), 'balanceiq.db');
    db = new Database(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        device_id TEXT NOT NULL,
        user_name TEXT DEFAULT 'local',
        module TEXT NOT NULL,
        action TEXT NOT NULL,
        record_type TEXT NOT NULL,
        record_id TEXT NOT NULL,
        field_name TEXT,
        old_value TEXT,
        new_value TEXT,
        reason TEXT,
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_audit_module    ON audit_log(module);
      CREATE INDEX IF NOT EXISTS idx_audit_record    ON audit_log(record_type, record_id);
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);

      CREATE TABLE IF NOT EXISTS daily_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        snapshot_timestamp TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        data TEXT NOT NULL,
        device_id TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_snap_date ON daily_snapshots(date);

      CREATE TABLE IF NOT EXISTS forecast_products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT DEFAULT '',
        base_quantity INTEGER DEFAULT 0,
        shelf_life_days INTEGER DEFAULT 1,
        weather_sensitivity INTEGER DEFAULT 0,
        active INTEGER DEFAULT 1,
        notes TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now','localtime'))
      );

      CREATE TABLE IF NOT EXISTS forecast_daily_sales (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        date TEXT NOT NULL,
        quantity_made INTEGER,
        quantity_sold INTEGER NOT NULL,
        quantity_remaining INTEGER,
        stockout INTEGER DEFAULT 0,
        source TEXT DEFAULT 'manual',
        entered_at TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (product_id) REFERENCES forecast_products(id),
        UNIQUE(product_id, date)
      );

      CREATE INDEX IF NOT EXISTS idx_fcast_sales_date ON forecast_daily_sales(date);
      CREATE INDEX IF NOT EXISTS idx_fcast_sales_prod ON forecast_daily_sales(product_id);

      CREATE TABLE IF NOT EXISTS forecast_csv_mappings (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        mapping TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now','localtime'))
      );

      CREATE TABLE IF NOT EXISTS forecast_weather (
        date TEXT PRIMARY KEY,
        temp_max REAL,
        temp_min REAL,
        precipitation REAL,
        weather_code INTEGER,
        source TEXT DEFAULT 'auto',
        fetched_at TEXT DEFAULT (datetime('now','localtime'))
      );
    `);

    // ── Column migrations (safe — columns may already exist) ─────────────────
    try { db.prepare("ALTER TABLE forecast_products ADD COLUMN unit_cost REAL").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE forecast_products ADD COLUMN sell_price REAL").run(); } catch(e) {}

    // ── Learning Engine Tables ──────────────────────────────────────────────

    db.prepare(`CREATE TABLE IF NOT EXISTS learned_patterns (
      id TEXT PRIMARY KEY,
      pattern_type TEXT NOT NULL,
      entity TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      confidence REAL DEFAULT 0,
      sample_size INTEGER DEFAULT 0,
      last_updated TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(pattern_type, entity, key)
    )`).run();

    db.prepare(`CREATE INDEX IF NOT EXISTS idx_patterns_type ON learned_patterns(pattern_type)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_patterns_entity ON learned_patterns(entity)`).run();

    db.prepare(`CREATE TABLE IF NOT EXISTS prediction_accuracy (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      date TEXT NOT NULL,
      predicted INTEGER,
      actual INTEGER,
      error_pct REAL,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(product_id, date)
    )`).run();

    db.prepare(`CREATE TABLE IF NOT EXISTS learning_insights (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      entity TEXT,
      message_fr TEXT NOT NULL,
      message_en TEXT NOT NULL,
      severity TEXT DEFAULT 'info',
      read INTEGER DEFAULT 0,
      financial_impact REAL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`).run();
    // TODO: add rush_hour pattern when POS hourly data is available
  }
  return db;
}

// Returns the persistent device UUID, creating it on first call
function getDeviceId() {
  const db = getDb();
  const row = db.prepare('SELECT value FROM kv_store WHERE key = ?').get('balanceiq-device-id');
  if (row) return row.value;
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO kv_store (key, value) VALUES (?, ?)').run('balanceiq-device-id', id);
  return id;
}

// Insert one audit entry — APPEND ONLY, never update or delete
function auditInsert(entry) {
  const deviceId = getDeviceId();
  getDb().prepare(`
    INSERT INTO audit_log
      (device_id, user_name, module, action, record_type, record_id,
       field_name, old_value, new_value, reason, metadata)
    VALUES
      (@deviceId, @userName, @module, @action, @recordType, @recordId,
       @fieldName, @oldValue, @newValue, @reason, @metadata)
  `).run({
    deviceId,
    userName:   entry.userName   ?? 'local',
    module:     entry.module,
    action:     entry.action,
    recordType: entry.recordType,
    recordId:   String(entry.recordId),
    fieldName:  entry.fieldName  ?? null,
    oldValue:   entry.oldValue   != null ? String(entry.oldValue) : null,
    newValue:   entry.newValue   != null ? String(entry.newValue) : null,
    reason:     entry.reason     ?? null,
    metadata:   entry.metadata   != null ? (typeof entry.metadata === 'string' ? entry.metadata : JSON.stringify(entry.metadata)) : null,
  });
  return true;
}

// Query audit entries with optional filters
function auditQuery({ module, action, recordType, recordId, dateFrom, dateTo, limit, offset } = {}) {
  let sql = 'SELECT * FROM audit_log WHERE 1=1';
  const params = [];
  if (module)     { sql += ' AND module = ?';      params.push(module); }
  if (action)     { sql += ' AND action = ?';      params.push(action); }
  if (recordType) { sql += ' AND record_type = ?'; params.push(recordType); }
  if (recordId)   { sql += ' AND record_id = ?';   params.push(String(recordId)); }
  if (dateFrom)   { sql += ' AND timestamp >= ?';  params.push(dateFrom); }
  if (dateTo)     { sql += ' AND timestamp <= ?';  params.push(dateTo); }
  sql += ' ORDER BY timestamp DESC';
  if (limit)  { sql += ` LIMIT ${parseInt(limit, 10)}`; }
  if (offset) { sql += ` OFFSET ${parseInt(offset, 10)}`; }
  return getDb().prepare(sql).all(...params);
}

function storageGet(key) {
  const row = getDb().prepare('SELECT value FROM kv_store WHERE key = ?').get(key);
  return row ? { key, value: row.value } : null;
}

function storageSet(key, value) {
  getDb().prepare('INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)').run(key, value);
  return true;
}

function storageGetAll() {
  const rows = getDb().prepare('SELECT key, value FROM kv_store').all();
  const result = {};
  rows.forEach(row => {
    try { result[row.key] = JSON.parse(row.value); } catch { result[row.key] = row.value; }
  });
  return result;
}

// Save an immutable daily snapshot — APPEND ONLY, never update or delete
function snapshotSave(date, data) {
  const deviceId = getDeviceId();
  getDb().prepare(`
    INSERT INTO daily_snapshots (date, data, device_id) VALUES (?, ?, ?)
  `).run(date, typeof data === 'string' ? data : JSON.stringify(data), deviceId);
  return true;
}

// Get all snapshots for a date (newest first)
function snapshotGetByDate(date) {
  return getDb().prepare('SELECT * FROM daily_snapshots WHERE date = ? ORDER BY snapshot_timestamp DESC').all(date);
}

// Get latest snapshot for a date
function snapshotGetLatest(date) {
  return getDb().prepare('SELECT * FROM daily_snapshots WHERE date = ? ORDER BY snapshot_timestamp DESC LIMIT 1').get(date);
}

// List all dates that have at least one snapshot
function snapshotListDates() {
  return getDb().prepare('SELECT date, COUNT(*) as count, MAX(snapshot_timestamp) as latest FROM daily_snapshots GROUP BY date ORDER BY date DESC').all();
}

// ── FORECAST: Products ──
function forecastProductsGetAll() {
  return getDb().prepare('SELECT * FROM forecast_products ORDER BY category, name').all();
}
function forecastProductUpsert(p) {
  getDb().prepare(`
    INSERT INTO forecast_products (id, name, category, base_quantity, shelf_life_days, weather_sensitivity, active, notes, unit_cost, sell_price)
    VALUES (@id, @name, @category, @base_quantity, @shelf_life_days, @weather_sensitivity, @active, @notes, @unit_cost, @sell_price)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, category=excluded.category, base_quantity=excluded.base_quantity,
      shelf_life_days=excluded.shelf_life_days, weather_sensitivity=excluded.weather_sensitivity,
      active=excluded.active, notes=excluded.notes,
      unit_cost=excluded.unit_cost, sell_price=excluded.sell_price
  `).run({ unit_cost: null, sell_price: null, ...p });
  return true;
}

// ── FORECAST: Daily Sales ──
function forecastSalesGetForDate(date) {
  return getDb().prepare('SELECT * FROM forecast_daily_sales WHERE date = ?').all(date);
}
function forecastSalesGetForProduct(productId, limit = 90) {
  return getDb().prepare('SELECT * FROM forecast_daily_sales WHERE product_id = ? ORDER BY date DESC LIMIT ?').all(productId, limit);
}
function forecastSalesGetRange(dateFrom, dateTo) {
  return getDb().prepare('SELECT * FROM forecast_daily_sales WHERE date >= ? AND date <= ? ORDER BY date').all(dateFrom, dateTo);
}
function forecastSalesUpsert(record) {
  getDb().prepare(`
    INSERT INTO forecast_daily_sales (id, product_id, date, quantity_made, quantity_sold, quantity_remaining, stockout, source)
    VALUES (@id, @product_id, @date, @quantity_made, @quantity_sold, @quantity_remaining, @stockout, @source)
    ON CONFLICT(product_id, date) DO UPDATE SET
      quantity_made=excluded.quantity_made, quantity_sold=excluded.quantity_sold,
      quantity_remaining=excluded.quantity_remaining, stockout=excluded.stockout,
      source=excluded.source, entered_at=datetime('now','localtime')
  `).run(record);
  return true;
}
function forecastSalesDeleteForDate(date) {
  getDb().prepare('DELETE FROM forecast_daily_sales WHERE date = ?').run(date);
  return true;
}

// ── FORECAST: Weather ──
function forecastWeatherGetRange(dateFrom, dateTo) {
  return getDb().prepare('SELECT * FROM forecast_weather WHERE date >= ? AND date <= ?').all(dateFrom, dateTo);
}
function forecastWeatherUpsert(record) {
  getDb().prepare(`
    INSERT INTO forecast_weather (date, temp_max, temp_min, precipitation, weather_code, source, fetched_at)
    VALUES (@date, @temp_max, @temp_min, @precipitation, @weather_code, @source, datetime('now','localtime'))
    ON CONFLICT(date) DO UPDATE SET
      temp_max=excluded.temp_max, temp_min=excluded.temp_min,
      precipitation=excluded.precipitation, weather_code=excluded.weather_code,
      source=excluded.source, fetched_at=datetime('now','localtime')
  `).run(record);
  return true;
}

// ── FORECAST: CSV Mappings ──
function forecastCsvMappingsGetAll() {
  return getDb().prepare('SELECT * FROM forecast_csv_mappings ORDER BY created_at DESC').all();
}
function forecastCsvMappingSave(mapping) {
  getDb().prepare(`
    INSERT INTO forecast_csv_mappings (id, name, mapping) VALUES (@id, @name, @mapping)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, mapping=excluded.mapping
  `).run(mapping);
  return true;
}

// ── Learned Patterns ──
function learnedPatternsGetAll() {
  return getDb().prepare("SELECT * FROM learned_patterns").all();
}
function learnedPatternUpsert(p) {
  getDb().prepare(`INSERT INTO learned_patterns (id,pattern_type,entity,key,value,confidence,sample_size,last_updated)
    VALUES (@id,@pattern_type,@entity,@key,@value,@confidence,@sample_size,datetime('now','localtime'))
    ON CONFLICT(pattern_type,entity,key) DO UPDATE SET
      value=excluded.value, confidence=excluded.confidence,
      sample_size=excluded.sample_size, last_updated=excluded.last_updated`).run(p);
  return true;
}

// ── Prediction Accuracy ──
function predAccuracyGetAll() {
  return getDb().prepare("SELECT * FROM prediction_accuracy ORDER BY date DESC").all();
}
function predAccuracyGetForProduct(productId) {
  return getDb().prepare("SELECT * FROM prediction_accuracy WHERE product_id=? ORDER BY date DESC LIMIT 60").all(productId);
}
function predAccuracyUpsert(r) {
  getDb().prepare(`INSERT INTO prediction_accuracy (id,product_id,date,predicted,actual,error_pct)
    VALUES (@id,@product_id,@date,@predicted,@actual,@error_pct)
    ON CONFLICT(product_id,date) DO UPDATE SET
      predicted=COALESCE(excluded.predicted,predicted),
      actual=COALESCE(excluded.actual,actual),
      error_pct=excluded.error_pct`).run(r);
  return true;
}

// ── Learning Insights ──
function insightsGetAll() {
  return getDb().prepare("SELECT * FROM learning_insights ORDER BY read ASC, CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 WHEN 'suggestion' THEN 2 ELSE 3 END ASC, financial_impact DESC NULLS LAST, created_at DESC").all();
}
function insightsGetUnreadCount() {
  return getDb().prepare("SELECT COUNT(*) as count FROM learning_insights WHERE read=0").get().count;
}
function insightUpsert(ins) {
  getDb().prepare(`INSERT OR IGNORE INTO learning_insights (id,type,entity,message_fr,message_en,severity,read,financial_impact)
    VALUES (@id,@type,@entity,@message_fr,@message_en,@severity,0,@financial_impact)`).run(ins);
  return true;
}
function insightMarkRead(id) {
  getDb().prepare("UPDATE learning_insights SET read=1 WHERE id=?").run(id);
  return true;
}
function insightMarkAllRead() {
  getDb().prepare("UPDATE learning_insights SET read=1").run();
  return true;
}

module.exports = {
  storageGet, storageSet, storageGetAll,
  auditInsert, auditQuery, getDeviceId,
  snapshotSave, snapshotGetByDate, snapshotGetLatest, snapshotListDates,
  forecastProductsGetAll, forecastProductUpsert,
  forecastSalesGetForDate, forecastSalesGetForProduct, forecastSalesGetRange, forecastSalesUpsert, forecastSalesDeleteForDate,
  forecastWeatherGetRange, forecastWeatherUpsert,
  forecastCsvMappingsGetAll, forecastCsvMappingSave,
  learnedPatternsGetAll, learnedPatternUpsert,
  predAccuracyGetAll, predAccuracyGetForProduct, predAccuracyUpsert,
  insightsGetAll, insightsGetUnreadCount, insightUpsert, insightMarkRead, insightMarkAllRead,
};
