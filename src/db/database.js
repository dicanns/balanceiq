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

      CREATE TABLE IF NOT EXISTS checklist_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title_fr TEXT NOT NULL,
        title_en TEXT NOT NULL,
        required INTEGER DEFAULT 0,
        frequency TEXT DEFAULT 'daily',
        category TEXT DEFAULT 'custom',
        sort_order INTEGER DEFAULT 0,
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now','localtime'))
      );

      CREATE TABLE IF NOT EXISTS checklist_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        template_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        completed INTEGER DEFAULT 0,
        completed_by TEXT,
        completed_at TEXT,
        notes TEXT,
        UNIQUE(template_id, date)
      );

      CREATE INDEX IF NOT EXISTS idx_checklist_date ON checklist_entries(date);

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

      CREATE TABLE IF NOT EXISTS forecast_imports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        target_date TEXT NOT NULL,
        imported_at TEXT DEFAULT (datetime('now','localtime')),
        record_count INTEGER,
        replaced INTEGER DEFAULT 0,
        replaced_by INTEGER
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
    try { db.prepare("ALTER TABLE forecast_products ADD COLUMN recipe_id TEXT").run(); } catch(e) {}

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

    // ── Recipe Costing Tables ─────────────────────────────────────────────
    db.prepare(`CREATE TABLE IF NOT EXISTS ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_fr TEXT NOT NULL,
      name_en TEXT DEFAULT '',
      category TEXT DEFAULT 'other',
      default_unit TEXT DEFAULT 'kg',
      current_unit_price REAL,
      last_price_update TEXT,
      supplier_id TEXT DEFAULT '',
      sku TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_ingredients_name ON ingredients(name_fr)`).run();

    db.prepare(`CREATE TABLE IF NOT EXISTS ingredient_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ingredient_id INTEGER NOT NULL,
      alias TEXT NOT NULL,
      supplier_id TEXT DEFAULT '',
      match_count INTEGER DEFAULT 0,
      UNIQUE(alias, supplier_id)
    )`).run();

    db.prepare(`CREATE TABLE IF NOT EXISTS supplier_price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ingredient_id INTEGER NOT NULL,
      supplier_name TEXT DEFAULT '',
      unit_price REAL NOT NULL,
      quantity REAL,
      unit TEXT DEFAULT 'kg',
      invoice_date TEXT NOT NULL,
      invoice_ref TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_price_hist ON supplier_price_history(ingredient_id, invoice_date DESC)`).run();

    db.prepare(`CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_fr TEXT NOT NULL,
      name_en TEXT DEFAULT '',
      category TEXT DEFAULT 'main',
      yield_qty REAL DEFAULT 1,
      yield_unit TEXT DEFAULT 'portions',
      active INTEGER DEFAULT 1,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`).run();

    db.prepare(`CREATE TABLE IF NOT EXISTS recipe_ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL,
      ingredient_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL,
      notes TEXT DEFAULT ''
    )`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_rec_ing ON recipe_ingredients(recipe_id)`).run();

    db.prepare(`CREATE TABLE IF NOT EXISTS invoice_line_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_ref TEXT DEFAULT '',
      invoice_date TEXT DEFAULT '',
      supplier_name TEXT DEFAULT '',
      raw_description TEXT NOT NULL,
      quantity REAL,
      unit TEXT DEFAULT '',
      unit_price REAL,
      extended_price REAL,
      ingredient_id INTEGER,
      match_status TEXT DEFAULT 'unmatched',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_line_items_date ON invoice_line_items(invoice_date)`).run();

    // ── Food Waste Tracking ───────────────────────────────────────────────
    db.prepare(`CREATE TABLE IF NOT EXISTS waste_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      ingredient_id INTEGER,
      category TEXT NOT NULL DEFAULT 'other',
      quantity REAL NOT NULL,
      unit TEXT DEFAULT 'kg',
      reason TEXT NOT NULL DEFAULT 'other',
      shift TEXT DEFAULT 'evening',
      unit_cost REAL,
      dollar_value REAL,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_waste_date ON waste_entries(date)`).run();

    // ── Tip Pooling ───────────────────────────────────────────────────────
    db.prepare(`CREATE TABLE IF NOT EXISTS tip_pool_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      method TEXT NOT NULL DEFAULT 'equal',
      manager_included INTEGER DEFAULT 0,
      roles TEXT DEFAULT '[]',
      notes TEXT DEFAULT ''
    )`).run();
    db.prepare(`CREATE TABLE IF NOT EXISTS tip_pool_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      total_tips REAL NOT NULL,
      method_used TEXT NOT NULL,
      distributions TEXT NOT NULL DEFAULT '[]',
      finalized INTEGER DEFAULT 0,
      finalized_by TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_tip_date ON tip_pool_sessions(date)`).run();
    // ── Écocontribution ──
    db.prepare(`CREATE TABLE IF NOT EXISTS packaging_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_fr TEXT NOT NULL,
      name_en TEXT DEFAULT '',
      material_category TEXT NOT NULL,
      unit_weight_grams REAL NOT NULL DEFAULT 0,
      supplier_id INTEGER,
      active INTEGER DEFAULT 1,
      notes TEXT DEFAULT ''
    )`).run();
    db.prepare(`CREATE TABLE IF NOT EXISTS eco_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      year INTEGER NOT NULL DEFAULT 2025,
      takeout_percentage REAL NOT NULL DEFAULT 80,
      dine_in_percentage REAL NOT NULL DEFAULT 20,
      methodology_notes TEXT DEFAULT '',
      num_quebec_locations INTEGER DEFAULT 1
    )`).run();
    db.prepare(`CREATE TABLE IF NOT EXISTS eco_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      material_category TEXT NOT NULL,
      rate_per_tonne REAL NOT NULL,
      malus_percentage REAL DEFAULT 0,
      recycled_credit_percentage REAL DEFAULT 0,
      UNIQUE(year, material_category)
    )`).run();
    db.prepare(`CREATE TABLE IF NOT EXISTS eco_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      packaging_item_id INTEGER NOT NULL,
      annual_units REAL NOT NULL DEFAULT 0,
      source TEXT DEFAULT 'manual',
      location_id TEXT DEFAULT 'all',
      notes TEXT DEFAULT '',
      UNIQUE(year, packaging_item_id, location_id)
    )`).run();
    // Seed 2025 PFP rates on first run
    const ecoRateCount = db.prepare('SELECT COUNT(*) as cnt FROM eco_rates WHERE year=2025').get();
    if (ecoRateCount.cnt === 0) {
      const ins2025 = db.prepare(`INSERT OR IGNORE INTO eco_rates (year,material_category,rate_per_tonne,malus_percentage) VALUES (?,?,?,?)`);
      [['corrugated',539.67,0],['flat_cardboard',712.91,0],['paper_laminates',1199.99,0],
       ['pp_plastic',1194.26,0],['pet_plastic',1006.09,0],['hdpe_film',1781.92,0],
       ['polystyrene_pvc_pla',3391.42,50],['aluminum',444.57,0],['printed_matter',737.12,0]
      ].forEach(([cat,rate,malus])=>ins2025.run(2025,cat,rate,malus));
    }
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
    INSERT INTO forecast_products (id, name, category, base_quantity, shelf_life_days, weather_sensitivity, active, notes, unit_cost, sell_price, recipe_id)
    VALUES (@id, @name, @category, @base_quantity, @shelf_life_days, @weather_sensitivity, @active, @notes, @unit_cost, @sell_price, @recipe_id)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, category=excluded.category, base_quantity=excluded.base_quantity,
      shelf_life_days=excluded.shelf_life_days, weather_sensitivity=excluded.weather_sensitivity,
      active=excluded.active, notes=excluded.notes,
      unit_cost=excluded.unit_cost, sell_price=excluded.sell_price, recipe_id=excluded.recipe_id
  `).run({ unit_cost: null, sell_price: null, recipe_id: null, ...p });
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

// ── FORECAST: Import log ──
function forecastImportsGetAll() {
  return getDb().prepare('SELECT * FROM forecast_imports ORDER BY imported_at DESC').all();
}
function forecastImportLog(record) {
  const info = getDb().prepare(
    'INSERT INTO forecast_imports (filename, target_date, record_count, replaced) VALUES (?, ?, ?, ?)'
  ).run(record.filename, record.target_date, record.record_count, record.replaced ? 1 : 0);
  return info.lastInsertRowid;
}
function forecastImportDelete(id) {
  getDb().prepare('DELETE FROM forecast_imports WHERE id = ?').run(id);
  return true;
}
function forecastImportMarkReplaced(targetDate, replacedById) {
  getDb().prepare(
    'UPDATE forecast_imports SET replaced = 1, replaced_by = ? WHERE target_date = ? AND replaced = 0 AND id != ?'
  ).run(replacedById, targetDate, replacedById);
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

// ── Checklist Templates ──
function checklistTemplatesGetAll() {
  return getDb().prepare('SELECT * FROM checklist_templates ORDER BY sort_order ASC, id ASC').all();
}
function checklistTemplateUpsert(t) {
  if (t.id) {
    getDb().prepare(`UPDATE checklist_templates SET title_fr=@title_fr, title_en=@title_en, required=@required, frequency=@frequency, category=@category, sort_order=@sort_order, active=@active WHERE id=@id`).run(t);
  } else {
    getDb().prepare(`INSERT INTO checklist_templates (title_fr,title_en,required,frequency,category,sort_order,active) VALUES (@title_fr,@title_en,@required,@frequency,@category,@sort_order,@active)`).run(t);
  }
  return true;
}
function checklistTemplateDelete(id) {
  getDb().prepare('UPDATE checklist_templates SET active=0 WHERE id=?').run(id);
  return true;
}

// ── Checklist Entries ──
function checklistEntriesGetForDate(date) {
  return getDb().prepare('SELECT * FROM checklist_entries WHERE date=?').all(date);
}
function checklistEntriesGetRange(dateFrom, dateTo) {
  return getDb().prepare('SELECT * FROM checklist_entries WHERE date>=? AND date<=? ORDER BY date').all(dateFrom, dateTo);
}
function checklistEntryUpsert(entry) {
  getDb().prepare(`
    INSERT INTO checklist_entries (template_id,date,completed,completed_by,completed_at,notes)
    VALUES (@template_id,@date,@completed,@completed_by,@completed_at,@notes)
    ON CONFLICT(template_id,date) DO UPDATE SET
      completed=excluded.completed, completed_by=excluded.completed_by,
      completed_at=excluded.completed_at, notes=excluded.notes
  `).run(entry);
  return true;
}

// ── Ingredients (Recipe Costing Products) ──
function ingredientsGetAll() {
  return getDb().prepare('SELECT * FROM ingredients WHERE active=1 ORDER BY category, name_fr').all();
}
function ingredientUpsert(p) {
  const db = getDb();
  if (p.id) {
    db.prepare(`UPDATE ingredients SET name_fr=@name_fr, name_en=@name_en, category=@category,
      default_unit=@default_unit, current_unit_price=@current_unit_price, last_price_update=@last_price_update,
      supplier_id=@supplier_id, sku=@sku, notes=@notes, active=@active WHERE id=@id`).run(p);
    return p.id;
  } else {
    const info = db.prepare(`INSERT INTO ingredients (name_fr,name_en,category,default_unit,current_unit_price,last_price_update,supplier_id,sku,notes,active)
      VALUES (@name_fr,@name_en,@category,@default_unit,@current_unit_price,@last_price_update,@supplier_id,@sku,@notes,@active)`).run(p);
    return info.lastInsertRowid;
  }
}
function ingredientDelete(id) {
  getDb().prepare('UPDATE ingredients SET active=0 WHERE id=?').run(id);
  return true;
}

// ── Ingredient Aliases ──
function ingredientAliasesGetForIngredient(ingredientId) {
  return getDb().prepare('SELECT * FROM ingredient_aliases WHERE ingredient_id=? ORDER BY alias').all(ingredientId);
}
function ingredientAliasUpsert(a) {
  getDb().prepare(`INSERT INTO ingredient_aliases (ingredient_id, alias, supplier_id, match_count)
    VALUES (@ingredient_id, @alias, @supplier_id, @match_count)
    ON CONFLICT(alias, supplier_id) DO UPDATE SET match_count=excluded.match_count, ingredient_id=excluded.ingredient_id`).run(a);
  return true;
}
function ingredientAliasDelete(id) {
  getDb().prepare('DELETE FROM ingredient_aliases WHERE id=?').run(id);
  return true;
}
function ingredientAliasFindMatch(alias, supplierName) {
  // Try exact match with supplier first, then any supplier
  const row = getDb().prepare(
    `SELECT a.*, i.name_fr, i.name_en, i.category, i.default_unit, i.current_unit_price
     FROM ingredient_aliases a JOIN ingredients i ON a.ingredient_id=i.id
     WHERE (a.alias=? AND a.supplier_id=?) OR (a.alias=? AND a.supplier_id='')
     ORDER BY CASE WHEN a.supplier_id=? THEN 0 ELSE 1 END LIMIT 1`
  ).get(alias, supplierName||'', alias, supplierName||'');
  return row || null;
}

// ── Supplier Price History ──
function priceHistoryGetForIngredient(ingredientId, limit=20) {
  return getDb().prepare('SELECT * FROM supplier_price_history WHERE ingredient_id=? ORDER BY invoice_date DESC LIMIT ?').all(ingredientId, limit);
}
function priceHistoryGetLastPrice(ingredientId, supplierName) {
  return getDb().prepare(`SELECT * FROM supplier_price_history WHERE ingredient_id=? AND supplier_name=?
    ORDER BY invoice_date DESC LIMIT 1`).get(ingredientId, supplierName||'') || null;
}
function priceHistorySave(record) {
  getDb().prepare(`INSERT INTO supplier_price_history (ingredient_id, supplier_name, unit_price, quantity, unit, invoice_date, invoice_ref)
    VALUES (@ingredient_id, @supplier_name, @unit_price, @quantity, @unit, @invoice_date, @invoice_ref)`).run(record);
  return true;
}

// ── Recipes ──
function recipesGetAll() {
  return getDb().prepare('SELECT * FROM recipes WHERE active=1 ORDER BY category, name_fr').all();
}
function recipeUpsert(r) {
  const db = getDb();
  if (r.id) {
    db.prepare(`UPDATE recipes SET name_fr=@name_fr, name_en=@name_en, category=@category,
      yield_qty=@yield_qty, yield_unit=@yield_unit, active=@active, notes=@notes WHERE id=@id`).run(r);
    return r.id;
  } else {
    const info = db.prepare(`INSERT INTO recipes (name_fr,name_en,category,yield_qty,yield_unit,active,notes)
      VALUES (@name_fr,@name_en,@category,@yield_qty,@yield_unit,@active,@notes)`).run(r);
    return info.lastInsertRowid;
  }
}
function recipeDelete(id) {
  getDb().prepare('UPDATE recipes SET active=0 WHERE id=?').run(id);
  return true;
}

// ── Recipe Ingredients ──
function recipeIngredientsGet(recipeId) {
  return getDb().prepare(`SELECT ri.*, i.name_fr, i.name_en, i.current_unit_price, i.default_unit
    FROM recipe_ingredients ri JOIN ingredients i ON ri.ingredient_id=i.id
    WHERE ri.recipe_id=?`).all(recipeId);
}
function recipeIngredientsSetAll(recipeId, ingredients) {
  const db = getDb();
  db.prepare('DELETE FROM recipe_ingredients WHERE recipe_id=?').run(recipeId);
  const ins = db.prepare(`INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, notes)
    VALUES (@recipe_id, @ingredient_id, @quantity, @unit, @notes)`);
  for (const ri of ingredients) ins.run({ ...ri, recipe_id: recipeId });
  return true;
}

// ── Invoice Line Items ──
function invoiceLineItemsSave(items) {
  const ins = getDb().prepare(`INSERT INTO invoice_line_items
    (invoice_ref, invoice_date, supplier_name, raw_description, quantity, unit, unit_price, extended_price, ingredient_id, match_status)
    VALUES (@invoice_ref, @invoice_date, @supplier_name, @raw_description, @quantity, @unit, @unit_price, @extended_price, @ingredient_id, @match_status)`);
  for (const item of items) ins.run(item);
  return true;
}
function invoiceLineItemsGetForInvoice(invoiceRef) {
  return getDb().prepare('SELECT * FROM invoice_line_items WHERE invoice_ref=? ORDER BY id').all(invoiceRef);
}
function invoiceLineItemsGetRecent(limit=50) {
  return getDb().prepare(`SELECT li.*, i.name_fr FROM invoice_line_items li
    LEFT JOIN ingredients i ON li.ingredient_id=i.id
    ORDER BY li.invoice_date DESC, li.id DESC LIMIT ?`).all(limit);
}

// ── Tip Pooling ──
function tipPoolConfigGet() {
  return getDb().prepare('SELECT * FROM tip_pool_config WHERE id=1').get() || { id:1, method:'equal', manager_included:0, roles:'[]', notes:'' };
}
function tipPoolConfigSave(cfg) {
  getDb().prepare(`INSERT INTO tip_pool_config (id,method,manager_included,roles,notes) VALUES (1,@method,@manager_included,@roles,@notes)
    ON CONFLICT(id) DO UPDATE SET method=excluded.method, manager_included=excluded.manager_included, roles=excluded.roles, notes=excluded.notes`).run(cfg);
  return true;
}
function tipPoolSessionGet(date) {
  return getDb().prepare('SELECT * FROM tip_pool_sessions WHERE date=?').get(date) || null;
}
function tipPoolSessionGetRange(dateFrom, dateTo) {
  return getDb().prepare('SELECT * FROM tip_pool_sessions WHERE date>=? AND date<=? ORDER BY date DESC').all(dateFrom, dateTo);
}
function tipPoolSessionSave(session) {
  getDb().prepare(`INSERT INTO tip_pool_sessions (date,total_tips,method_used,distributions,finalized,finalized_by)
    VALUES (@date,@total_tips,@method_used,@distributions,@finalized,@finalized_by)
    ON CONFLICT(date) DO UPDATE SET total_tips=excluded.total_tips, method_used=excluded.method_used,
      distributions=excluded.distributions, finalized=excluded.finalized, finalized_by=excluded.finalized_by`).run(session);
  return true;
}

// ── Food Waste ──
function wasteGetRange(dateFrom, dateTo) {
  return getDb().prepare('SELECT * FROM waste_entries WHERE date>=? AND date<=? ORDER BY date DESC, id DESC').all(dateFrom, dateTo);
}
function wasteSave(entry) {
  const db = getDb();
  if (entry.id) {
    db.prepare(`UPDATE waste_entries SET date=@date, ingredient_id=@ingredient_id, category=@category, quantity=@quantity, unit=@unit, reason=@reason, shift=@shift, unit_cost=@unit_cost, dollar_value=@dollar_value, notes=@notes WHERE id=@id`).run(entry);
    return entry.id;
  } else {
    const info = db.prepare(`INSERT INTO waste_entries (date,ingredient_id,category,quantity,unit,reason,shift,unit_cost,dollar_value,notes) VALUES (@date,@ingredient_id,@category,@quantity,@unit,@reason,@shift,@unit_cost,@dollar_value,@notes)`).run(entry);
    return info.lastInsertRowid;
  }
}
function wasteDelete(id) {
  getDb().prepare('DELETE FROM waste_entries WHERE id=?').run(id);
  return true;
}

// ── Écocontribution ──
function ecoItemsGetAll() {
  return getDb().prepare('SELECT * FROM packaging_items ORDER BY material_category, name_fr').all();
}
function ecoItemUpsert(item) {
  const db = getDb();
  if (item.id) {
    db.prepare(`UPDATE packaging_items SET name_fr=@name_fr,name_en=@name_en,material_category=@material_category,unit_weight_grams=@unit_weight_grams,supplier_id=@supplier_id,active=@active,notes=@notes WHERE id=@id`).run(item);
    return item.id;
  } else {
    return db.prepare(`INSERT INTO packaging_items (name_fr,name_en,material_category,unit_weight_grams,supplier_id,active,notes) VALUES (@name_fr,@name_en,@material_category,@unit_weight_grams,@supplier_id,@active,@notes)`).run(item).lastInsertRowid;
  }
}
function ecoItemDelete(id) {
  getDb().prepare('UPDATE packaging_items SET active=0 WHERE id=?').run(id);
  return true;
}
function ecoConfigGet() {
  return getDb().prepare('SELECT * FROM eco_config WHERE id=1').get() || {id:1,year:new Date().getFullYear(),takeout_percentage:80,dine_in_percentage:20,methodology_notes:'',num_quebec_locations:1};
}
function ecoConfigSave(cfg) {
  getDb().prepare(`INSERT INTO eco_config (id,year,takeout_percentage,dine_in_percentage,methodology_notes,num_quebec_locations) VALUES (1,@year,@takeout_percentage,@dine_in_percentage,@methodology_notes,@num_quebec_locations)
    ON CONFLICT(id) DO UPDATE SET year=excluded.year,takeout_percentage=excluded.takeout_percentage,dine_in_percentage=excluded.dine_in_percentage,methodology_notes=excluded.methodology_notes,num_quebec_locations=excluded.num_quebec_locations`).run(cfg);
  return true;
}
function ecoRatesGetForYear(year) {
  return getDb().prepare('SELECT * FROM eco_rates WHERE year=? ORDER BY material_category').all(year);
}
function ecoRateUpsert(rate) {
  getDb().prepare(`INSERT INTO eco_rates (year,material_category,rate_per_tonne,malus_percentage,recycled_credit_percentage) VALUES (@year,@material_category,@rate_per_tonne,@malus_percentage,@recycled_credit_percentage)
    ON CONFLICT(year,material_category) DO UPDATE SET rate_per_tonne=excluded.rate_per_tonne,malus_percentage=excluded.malus_percentage,recycled_credit_percentage=excluded.recycled_credit_percentage`).run(rate);
  return true;
}
function ecoUsageGetForYear(year) {
  return getDb().prepare('SELECT * FROM eco_usage WHERE year=?').all(year);
}
function ecoUsageUpsert(usage) {
  getDb().prepare(`INSERT INTO eco_usage (year,packaging_item_id,annual_units,source,location_id,notes) VALUES (@year,@packaging_item_id,@annual_units,@source,@location_id,@notes)
    ON CONFLICT(year,packaging_item_id,location_id) DO UPDATE SET annual_units=excluded.annual_units,source=excluded.source,notes=excluded.notes`).run(usage);
  return true;
}
function ecoUsageDelete(year, packaging_item_id, location_id) {
  getDb().prepare('DELETE FROM eco_usage WHERE year=? AND packaging_item_id=? AND location_id=?').run(year, packaging_item_id, location_id || 'all');
  return true;
}

module.exports = {
  storageGet, storageSet, storageGetAll,
  auditInsert, auditQuery, getDeviceId,
  snapshotSave, snapshotGetByDate, snapshotGetLatest, snapshotListDates,
  forecastProductsGetAll, forecastProductUpsert,
  forecastSalesGetForDate, forecastSalesGetForProduct, forecastSalesGetRange, forecastSalesUpsert, forecastSalesDeleteForDate,
  forecastImportsGetAll, forecastImportLog, forecastImportDelete, forecastImportMarkReplaced,
  forecastWeatherGetRange, forecastWeatherUpsert,
  forecastCsvMappingsGetAll, forecastCsvMappingSave,
  learnedPatternsGetAll, learnedPatternUpsert,
  predAccuracyGetAll, predAccuracyGetForProduct, predAccuracyUpsert,
  insightsGetAll, insightsGetUnreadCount, insightUpsert, insightMarkRead, insightMarkAllRead,
  checklistTemplatesGetAll, checklistTemplateUpsert, checklistTemplateDelete,
  checklistEntriesGetForDate, checklistEntriesGetRange, checklistEntryUpsert,
  ingredientsGetAll, ingredientUpsert, ingredientDelete,
  ingredientAliasesGetForIngredient, ingredientAliasUpsert, ingredientAliasDelete, ingredientAliasFindMatch,
  priceHistoryGetForIngredient, priceHistoryGetLastPrice, priceHistorySave,
  recipesGetAll, recipeUpsert, recipeDelete,
  recipeIngredientsGet, recipeIngredientsSetAll,
  invoiceLineItemsSave, invoiceLineItemsGetForInvoice, invoiceLineItemsGetRecent,
  wasteGetRange, wasteSave, wasteDelete,
  tipPoolConfigGet, tipPoolConfigSave,
  tipPoolSessionGet, tipPoolSessionGetRange, tipPoolSessionSave,
  ecoItemsGetAll, ecoItemUpsert, ecoItemDelete,
  ecoConfigGet, ecoConfigSave,
  ecoRatesGetForYear, ecoRateUpsert,
  ecoUsageGetForYear, ecoUsageUpsert, ecoUsageDelete,
};
