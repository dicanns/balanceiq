const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');
const crypto = require('crypto');

let db;

// ── Schema Migration System ──────────────────────────────────────────────────
// Each entry runs exactly once, in version order.
// Version 1 = baseline covering all tables through v1.23.0.
// New tables for Items 2–6 and beyond go here as new migrations — never as
// raw CREATE TABLE calls scattered through getDb().
const MIGRATIONS = [
  {
    version: 1,
    description: 'Baseline schema — all tables through v1.23.0 (POS scan module)',
    up: (_db) => {
      // All tables already exist via CREATE TABLE IF NOT EXISTS in getDb().
      // This entry just stamps the version on new and existing databases.
    },
  },
  {
    version: 2,
    description: 'Upgrade prompt dismissals table (Item 2 — outcome-based prompts)',
    up: (database) => {
      database.prepare(`CREATE TABLE IF NOT EXISTS upgrade_prompt_dismissals (
        prompt_key TEXT NOT NULL PRIMARY KEY,
        dismissed_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      )`).run();
    },
  },
  {
    version: 3,
    description: 'Onboarding checklist progress table (Item 5)',
    up: (database) => {
      database.prepare(`CREATE TABLE IF NOT EXISTS onboarding_progress (
        item_key TEXT PRIMARY KEY,
        completed INTEGER DEFAULT 0,
        completed_at TEXT
      )`).run();
    },
  },
  {
    version: 4,
    description: 'P&L supplier invoice history for vendor price intelligence (Item 6)',
    up: (database) => {
      database.prepare(`CREATE TABLE IF NOT EXISTS pl_invoice_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_key TEXT NOT NULL,
        supplier_name TEXT NOT NULL,
        amount REAL NOT NULL,
        bill_date TEXT DEFAULT '',
        note TEXT DEFAULT '',
        month_key TEXT NOT NULL,
        bill_id TEXT NOT NULL UNIQUE,
        recorded_at TEXT DEFAULT (datetime('now','localtime'))
      )`).run();
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_pl_inv_hist_key
        ON pl_invoice_history(supplier_key, recorded_at DESC)`).run();
    },
  },
  {
    version: 5,
    description: 'Global search — FTS5 indexes for ingredients + forecast_products + search_history table',
    up: (database) => {
      // FTS5 virtual tables (shadow indexes — real data stays in source tables)
      database.prepare(`CREATE VIRTUAL TABLE IF NOT EXISTS fts_ingredients USING fts5(
        name_fr, name_en, category,
        content='ingredients', content_rowid='id'
      )`).run();
      database.prepare(`CREATE VIRTUAL TABLE IF NOT EXISTS fts_forecast_products USING fts5(
        name, category,
        content='forecast_products', content_rowid='id'
      )`).run();

      // Populate FTS5 from existing rows (one-time, ignore if empty)
      try { database.prepare(`INSERT INTO fts_ingredients(rowid, name_fr, name_en, category)
        SELECT id, name_fr, COALESCE(name_en,''), COALESCE(category,'') FROM ingredients`).run(); } catch(_) {}
      try { database.prepare(`INSERT INTO fts_forecast_products(rowid, name, category)
        SELECT id, name, COALESCE(category,'') FROM forecast_products`).run(); } catch(_) {}

      // Sync triggers — ingredients
      database.prepare(`CREATE TRIGGER IF NOT EXISTS fts_ing_insert AFTER INSERT ON ingredients BEGIN
        INSERT INTO fts_ingredients(rowid, name_fr, name_en, category)
        VALUES (new.id, new.name_fr, COALESCE(new.name_en,''), COALESCE(new.category,''));
      END`).run();
      database.prepare(`CREATE TRIGGER IF NOT EXISTS fts_ing_update AFTER UPDATE ON ingredients BEGIN
        UPDATE fts_ingredients SET name_fr=new.name_fr, name_en=COALESCE(new.name_en,''), category=COALESCE(new.category,'')
        WHERE rowid=old.id;
      END`).run();
      database.prepare(`CREATE TRIGGER IF NOT EXISTS fts_ing_delete AFTER DELETE ON ingredients BEGIN
        DELETE FROM fts_ingredients WHERE rowid=old.id;
      END`).run();

      // Sync triggers — forecast_products
      database.prepare(`CREATE TRIGGER IF NOT EXISTS fts_fp_insert AFTER INSERT ON forecast_products BEGIN
        INSERT INTO fts_forecast_products(rowid, name, category) VALUES (new.id, new.name, COALESCE(new.category,''));
      END`).run();
      database.prepare(`CREATE TRIGGER IF NOT EXISTS fts_fp_update AFTER UPDATE ON forecast_products BEGIN
        UPDATE fts_forecast_products SET name=new.name, category=COALESCE(new.category,'') WHERE rowid=old.id;
      END`).run();
      database.prepare(`CREATE TRIGGER IF NOT EXISTS fts_fp_delete AFTER DELETE ON forecast_products BEGIN
        DELETE FROM fts_forecast_products WHERE rowid=old.id;
      END`).run();

      // Search history (last 20 queries with their result destination)
      database.prepare(`CREATE TABLE IF NOT EXISTS search_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT NOT NULL,
        result_type TEXT,
        result_id TEXT,
        searched_at TEXT DEFAULT (datetime('now','localtime'))
      )`).run();
    },
  },
  {
    version: 6,
    description: 'Rebuild FTS5 tables with unicode61 tokenizer for accent-insensitive French search (été→ete, caïsse→caisse)',
    up: (database) => {
      // Drop old tables and triggers created without the unicode61 tokenizer
      database.prepare(`DROP TRIGGER IF EXISTS fts_ing_insert`).run();
      database.prepare(`DROP TRIGGER IF EXISTS fts_ing_update`).run();
      database.prepare(`DROP TRIGGER IF EXISTS fts_ing_delete`).run();
      database.prepare(`DROP TRIGGER IF EXISTS fts_fp_insert`).run();
      database.prepare(`DROP TRIGGER IF EXISTS fts_fp_update`).run();
      database.prepare(`DROP TRIGGER IF EXISTS fts_fp_delete`).run();
      database.prepare(`DROP TABLE IF EXISTS fts_ingredients`).run();
      database.prepare(`DROP TABLE IF EXISTS fts_forecast_products`).run();

      // Recreate with unicode61 — remove_diacritics=1 is the default, so
      // "ete" matches "été", "caisse" matches "caïsse", etc.
      database.prepare(`CREATE VIRTUAL TABLE IF NOT EXISTS fts_ingredients USING fts5(
        name_fr, name_en, category,
        content='ingredients', content_rowid='id',
        tokenize='unicode61'
      )`).run();
      database.prepare(`CREATE VIRTUAL TABLE IF NOT EXISTS fts_forecast_products USING fts5(
        name, category,
        content='forecast_products', content_rowid='id',
        tokenize='unicode61'
      )`).run();

      // Repopulate from existing data
      try { database.prepare(`INSERT INTO fts_ingredients(rowid, name_fr, name_en, category)
        SELECT id, name_fr, COALESCE(name_en,''), COALESCE(category,'') FROM ingredients`).run(); } catch(_) {}
      try { database.prepare(`INSERT INTO fts_forecast_products(rowid, name, category)
        SELECT id, name, COALESCE(category,'') FROM forecast_products`).run(); } catch(_) {}

      // Recreate sync triggers — ingredients
      database.prepare(`CREATE TRIGGER IF NOT EXISTS fts_ing_insert AFTER INSERT ON ingredients BEGIN
        INSERT INTO fts_ingredients(rowid, name_fr, name_en, category)
        VALUES (new.id, new.name_fr, COALESCE(new.name_en,''), COALESCE(new.category,''));
      END`).run();
      database.prepare(`CREATE TRIGGER IF NOT EXISTS fts_ing_update AFTER UPDATE ON ingredients BEGIN
        UPDATE fts_ingredients SET name_fr=new.name_fr, name_en=COALESCE(new.name_en,''), category=COALESCE(new.category,'')
        WHERE rowid=old.id;
      END`).run();
      database.prepare(`CREATE TRIGGER IF NOT EXISTS fts_ing_delete AFTER DELETE ON ingredients BEGIN
        DELETE FROM fts_ingredients WHERE rowid=old.id;
      END`).run();

      // Recreate sync triggers — forecast_products
      database.prepare(`CREATE TRIGGER IF NOT EXISTS fts_fp_insert AFTER INSERT ON forecast_products BEGIN
        INSERT INTO fts_forecast_products(rowid, name, category) VALUES (new.id, new.name, COALESCE(new.category,''));
      END`).run();
      database.prepare(`CREATE TRIGGER IF NOT EXISTS fts_fp_update AFTER UPDATE ON forecast_products BEGIN
        UPDATE fts_forecast_products SET name=new.name, category=COALESCE(new.category,'') WHERE rowid=old.id;
      END`).run();
      database.prepare(`CREATE TRIGGER IF NOT EXISTS fts_fp_delete AFTER DELETE ON forecast_products BEGIN
        DELETE FROM fts_forecast_products WHERE rowid=old.id;
      END`).run();
    },
  },
  {
    version: 9,
    description: 'General Ledger Core (Grand livre) — Sprint 2 Accounting Suite',
    up: (database) => {
      database.prepare(`CREATE TABLE IF NOT EXISTS accounting_periods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        period_type TEXT NOT NULL,
        fiscal_year INTEGER NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        closed_at TEXT,
        closed_by_device_uuid TEXT,
        reopened_at TEXT,
        reopened_by_device_uuid TEXT,
        reopen_reason TEXT,
        location_id INTEGER,
        UNIQUE(period_type, start_date, end_date, location_id)
      )`).run();
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_ap_year ON accounting_periods(fiscal_year, status)`).run();

      database.prepare(`CREATE TABLE IF NOT EXISTS journal_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_number TEXT UNIQUE NOT NULL,
        entry_date TEXT NOT NULL,
        posting_date TEXT,
        period_id INTEGER NOT NULL,
        description TEXT,
        source_type TEXT NOT NULL,
        source_id INTEGER,
        source_formula_version TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        posted_at TEXT,
        posted_by_device_uuid TEXT,
        reversed_by_entry_id INTEGER,
        reverses_entry_id INTEGER,
        reversal_reason TEXT,
        reversed_at TEXT,
        reversed_by_device_uuid TEXT,
        device_uuid TEXT NOT NULL,
        location_id INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (period_id) REFERENCES accounting_periods(id),
        FOREIGN KEY (reversed_by_entry_id) REFERENCES journal_entries(id),
        FOREIGN KEY (reverses_entry_id) REFERENCES journal_entries(id)
      )`).run();
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_je_period ON journal_entries(period_id, status)`).run();
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_je_source ON journal_entries(source_type, source_id)`).run();
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_je_date   ON journal_entries(entry_date)`).run();

      database.prepare(`CREATE TABLE IF NOT EXISTS journal_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id INTEGER NOT NULL,
        line_number INTEGER NOT NULL,
        account_id INTEGER NOT NULL,
        debit_cents INTEGER NOT NULL DEFAULT 0,
        credit_cents INTEGER NOT NULL DEFAULT 0,
        memo TEXT,
        location_id INTEGER,
        contact_id INTEGER,
        tax_code TEXT,
        FOREIGN KEY (entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
        FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id),
        CHECK (debit_cents >= 0 AND credit_cents >= 0),
        CHECK (debit_cents = 0 OR credit_cents = 0),
        CHECK (debit_cents + credit_cents > 0)
      )`).run();
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_jl_entry   ON journal_lines(entry_id)`).run();
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_jl_account ON journal_lines(account_id, entry_id)`).run();

      // Trigger: reject any INSERT/UPDATE that would produce an imbalanced posted entry.
      // The application layer validates first; this is the safety net.
      database.prepare(`
        CREATE TRIGGER IF NOT EXISTS trg_je_balance_insert
        AFTER INSERT ON journal_lines
        BEGIN
          SELECT CASE
            WHEN (
              SELECT status FROM journal_entries WHERE id = NEW.entry_id
            ) = 'posted'
            AND (
              SELECT ABS(SUM(debit_cents) - SUM(credit_cents))
              FROM journal_lines WHERE entry_id = NEW.entry_id
            ) > 0
            THEN RAISE(ABORT, 'Écriture déséquilibrée: total débit ≠ total crédit')
          END;
        END
      `).run();
    },
  },
  {
    version: 8,
    description: 'Chart of Accounts (Plan comptable) — Sprint 1 Accounting Suite',
    up: (database) => {
      database.prepare(`CREATE TABLE IF NOT EXISTS chart_of_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_number TEXT UNIQUE NOT NULL,
        name_fr TEXT NOT NULL,
        name_en TEXT NOT NULL,
        type TEXT NOT NULL,
        parent_account_id INTEGER,
        is_contra INTEGER DEFAULT 0,
        is_archived INTEGER DEFAULT 0,
        is_system INTEGER DEFAULT 0,
        is_simplified INTEGER DEFAULT 0,
        tax_hint TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`).run();
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_coa_number ON chart_of_accounts(account_number)`).run();
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_coa_type ON chart_of_accounts(type)`).run();

      // Seed all 70+ accounts. Columns: account_number, name_fr, name_en, type, is_contra, is_simplified, tax_hint
      const ins = database.prepare(`INSERT OR IGNORE INTO chart_of_accounts
        (account_number, name_fr, name_en, type, is_contra, is_simplified, is_system, tax_hint)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?)`);

      const seed = [
        // ── ACTIFS (assets) ──────────────────────────────────────────────────
        ['1010','Encaisse (banque opération)','Cash (operating bank account)','asset',0,1,null],
        ['1020','Encaisse (banque épargne)','Cash (savings account)','asset',0,0,null],
        ['1030','Petite caisse','Petty cash','asset',0,0,null],
        ['1100','Comptes clients','Accounts receivable','asset',0,1,null],
        ['1110','Provision pour créances douteuses','Allowance for doubtful accounts','asset',1,0,null],
        ['1200','Stock de marchandises','Merchandise inventory','asset',0,1,null],
        ['1210','Stock de nourriture et boissons','Food and beverage inventory','asset',0,0,null],
        ['1300','Frais payés d\'avance','Prepaid expenses','asset',0,0,null],
        ['1400','TPS à recevoir (CTI)','GST receivable (ITC)','asset',0,1,'tps'],
        ['1410','TVQ à recevoir (RTI)','QST receivable (ITR)','asset',0,1,'tvq'],
        ['1500','Équipement de cuisine','Kitchen equipment','asset',0,1,null],
        ['1510','Amortissement cumulé - équipement','Accumulated depreciation - equipment','asset',1,0,null],
        ['1520','Améliorations locatives','Leasehold improvements','asset',0,0,null],
        ['1530','Amortissement cumulé - améliorations','Accumulated depreciation - improvements','asset',1,0,null],
        ['1540','Mobilier et agencements','Furniture and fixtures','asset',0,0,null],
        ['1550','Amortissement cumulé - mobilier','Accumulated depreciation - furniture','asset',1,0,null],
        ['1560','Véhicules','Vehicles','asset',0,0,null],
        ['1570','Amortissement cumulé - véhicules','Accumulated depreciation - vehicles','asset',1,0,null],
        // ── PASSIFS (liabilities) ────────────────────────────────────────────
        ['2010','Comptes fournisseurs','Accounts payable','liability',0,1,null],
        ['2100','TPS à payer','GST payable','liability',0,1,'tps'],
        ['2110','TVQ à payer','QST payable','liability',0,1,'tvq'],
        ['2120','Retenues à la source (salaires)','Payroll withholdings','liability',0,0,null],
        ['2130','Cotisations employeur à payer','Employer contributions payable','liability',0,0,null],
        ['2200','Marge de crédit','Line of credit','liability',0,0,null],
        ['2210','Carte de crédit','Credit card','liability',0,1,null],
        ['2300','Emprunts à court terme','Short-term loans','liability',0,0,null],
        ['2400','Emprunts à long terme','Long-term loans','liability',0,0,null],
        ['2500','Dépôts de clients (acomptes)','Customer deposits (deposits)','liability',0,0,null],
        // ── CAPITAUX PROPRES (equity) ─────────────────────────────────────────
        ['3000','Capital-actions','Share capital','equity',0,1,null],
        ['3100','Bénéfices non répartis','Retained earnings','equity',0,1,null],
        ['3200','Prélèvements du propriétaire','Owner drawings','equity',0,0,null],
        ['3300','Mises de fonds du propriétaire','Owner contributions','equity',0,0,null],
        // ── REVENUS (revenue) ────────────────────────────────────────────────
        ['4000','Ventes - repas','Sales - meals','revenue',0,1,null],
        ['4010','Ventes - boissons','Sales - beverages','revenue',0,0,null],
        ['4020','Ventes - livraisons (brut)','Sales - delivery (gross)','revenue',0,1,null],
        ['4030','Ventes - alcool','Sales - alcohol','revenue',0,0,null],
        ['4040','Autres revenus','Other revenue','revenue',0,0,null],
        ['4100','Remises et remboursements','Sales returns and allowances','revenue',1,0,null],
        // ── COÛT DES MARCHANDISES VENDUES (cogs) ─────────────────────────────
        ['5000','Achats - nourriture','Purchases - food','cogs',0,1,'both'],
        ['5010','Achats - boissons non alcoolisées','Purchases - non-alcoholic beverages','cogs',0,0,'both'],
        ['5020','Achats - alcool','Purchases - alcohol','cogs',0,0,'both'],
        ['5030','Emballages et fournitures','Packaging and supplies','cogs',0,0,'both'],
        ['5040','Commissions - livraisons','Delivery commissions (DoorDash, Uber, Skip)','cogs',0,1,'both'],
        ['5100','Variation du stock','Inventory change (period adjustment)','cogs',0,0,null],
        // ── FRAIS D\'EXPLOITATION (expense) ──────────────────────────────────
        ['6000','Salaires et avantages (production)','Wages and benefits (production)','expense',0,1,null],
        ['6010','Salaires et avantages (administration)','Wages and benefits (administration)','expense',0,0,null],
        ['6020','CNESST','CNESST (workers\' compensation)','expense',0,0,null],
        ['6030','Avantages sociaux','Employee benefits','expense',0,0,null],
        ['6100','Loyer','Rent','expense',0,1,'both'],
        ['6110','Hydro-Québec','Hydro-Quebec (electricity)','expense',0,1,'both'],
        ['6120','Gaz naturel','Natural gas','expense',0,1,'both'],
        ['6130','Télécommunications','Telecommunications','expense',0,0,'both'],
        ['6140','Internet','Internet','expense',0,0,'both'],
        ['6200','Entretien et réparations - équipement','Equipment maintenance and repairs','expense',0,1,'both'],
        ['6210','Entretien et réparations - bâtiment','Building maintenance and repairs','expense',0,0,'both'],
        ['6220','Nettoyage et buanderie','Cleaning and laundry','expense',0,0,'both'],
        ['6300','Publicité et marketing','Advertising and marketing','expense',0,1,'both'],
        ['6310','Cartes-cadeaux et promotions','Gift cards and promotions','expense',0,0,'both'],
        ['6400','Frais bancaires','Bank charges','expense',0,1,null],
        ['6410','Frais de cartes de crédit (merchant)','Merchant credit card fees','expense',0,0,null],
        ['6420','Intérêts payés','Interest paid','expense',0,0,null],
        ['6500','Assurances','Insurance','expense',0,1,null],
        ['6510','Permis et licences','Permits and licences','expense',0,0,'both'],
        ['6520','Honoraires professionnels','Professional fees (accountant, lawyer)','expense',0,0,'both'],
        ['6530','Frais informatiques et logiciels','IT and software expenses','expense',0,0,'both'],
        ['6600','Fournitures de bureau','Office supplies','expense',0,0,'both'],
        ['6610','Fournitures d\'exploitation','Operating supplies','expense',0,0,'both'],
        ['6700','Amortissement','Depreciation','expense',0,0,null],
        ['6800','Déplacements et représentation','Travel and entertainment','expense',0,0,'both'],
        ['6900','Divers','Miscellaneous','expense',0,1,'both'],
      ];

      database.transaction(() => {
        for (const row of seed) ins.run(...row);
      })();
    },
  },
  {
    version: 7,
    description: 'Fix FTS5 forecast_products — UUID ids cannot be FTS5 rowids; switch to standalone table with fp_id column',
    up: (database) => {
      database.prepare(`DROP TRIGGER IF EXISTS fts_fp_insert`).run();
      database.prepare(`DROP TRIGGER IF EXISTS fts_fp_update`).run();
      database.prepare(`DROP TRIGGER IF EXISTS fts_fp_delete`).run();
      database.prepare(`DROP TABLE IF EXISTS fts_forecast_products`).run();

      database.prepare(`CREATE VIRTUAL TABLE IF NOT EXISTS fts_forecast_products USING fts5(
        fp_id UNINDEXED, name, category, tokenize='unicode61'
      )`).run();

      try {
        database.prepare(`INSERT INTO fts_forecast_products(fp_id, name, category)
          SELECT id, name, COALESCE(category,'') FROM forecast_products`).run();
      } catch(_) {}

      database.prepare(`CREATE TRIGGER IF NOT EXISTS fts_fp_insert AFTER INSERT ON forecast_products BEGIN
        INSERT INTO fts_forecast_products(fp_id, name, category) VALUES (new.id, new.name, COALESCE(new.category,''));
      END`).run();
      database.prepare(`CREATE TRIGGER IF NOT EXISTS fts_fp_update AFTER UPDATE ON forecast_products BEGIN
        INSERT INTO fts_forecast_products(fts_forecast_products, rowid, fp_id, name, category)
          SELECT 'delete', rowid, fp_id, name, category FROM fts_forecast_products WHERE fp_id=old.id LIMIT 1;
        INSERT INTO fts_forecast_products(fp_id, name, category) VALUES (new.id, new.name, COALESCE(new.category,''));
      END`).run();
      database.prepare(`CREATE TRIGGER IF NOT EXISTS fts_fp_delete AFTER DELETE ON forecast_products BEGIN
        INSERT INTO fts_forecast_products(fts_forecast_products, rowid, fp_id, name, category)
          SELECT 'delete', rowid, fp_id, name, category FROM fts_forecast_products WHERE fp_id=old.id LIMIT 1;
      END`).run();
    },
  },
  {
    version: 10,
    description: 'Bank Reconciliation (Rapprochement bancaire) — Sprint 3 Accounting Suite',
    up: (database) => {
      database.prepare(`CREATE TABLE IF NOT EXISTS bank_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        account_type TEXT NOT NULL DEFAULT 'bank',
        coa_account_id INTEGER NOT NULL,
        opening_balance REAL NOT NULL DEFAULT 0,
        opening_date TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'CAD',
        csv_column_map TEXT,
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (coa_account_id) REFERENCES chart_of_accounts(id)
      )`).run();

      database.prepare(`CREATE TABLE IF NOT EXISTS bank_statements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bank_account_id INTEGER NOT NULL,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        ending_balance REAL NOT NULL,
        imported_at TEXT DEFAULT CURRENT_TIMESTAMP,
        source_file_hash TEXT,
        reconciled INTEGER NOT NULL DEFAULT 0,
        reconciled_at TEXT,
        FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id)
      )`).run();
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_bs_account ON bank_statements(bank_account_id)`).run();

      database.prepare(`CREATE TABLE IF NOT EXISTS bank_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bank_account_id INTEGER NOT NULL,
        bank_statement_id INTEGER,
        transaction_date TEXT NOT NULL,
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        running_balance REAL,
        match_status TEXT NOT NULL DEFAULT 'unmatched',
        matched_entity_type TEXT,
        matched_entity_id INTEGER,
        coa_account_id INTEGER,
        notes TEXT,
        reconciled INTEGER NOT NULL DEFAULT 0,
        journal_entry_id INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id),
        FOREIGN KEY (bank_statement_id) REFERENCES bank_statements(id),
        FOREIGN KEY (coa_account_id) REFERENCES chart_of_accounts(id),
        FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id)
      )`).run();
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_bt_account_date ON bank_transactions(bank_account_id, transaction_date)`).run();
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_bt_status ON bank_transactions(match_status)`).run();

      database.prepare(`CREATE TABLE IF NOT EXISTS bank_match_learned (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        description_pattern TEXT NOT NULL,
        coa_account_id INTEGER NOT NULL,
        match_count INTEGER NOT NULL DEFAULT 1,
        last_used_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(description_pattern, coa_account_id)
      )`).run();
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_bml_pattern ON bank_match_learned(description_pattern)`).run();
    },
  },
  {
    version: 11,
    description: 'CTI/RTI Input Tax Credits — Sprint 4 Accounting Suite',
    up: (database) => {
      // Add tax tracking columns to bank_transactions
      database.prepare(`ALTER TABLE bank_transactions ADD COLUMN tax_claimable INTEGER DEFAULT 0`).run();
      database.prepare(`ALTER TABLE bank_transactions ADD COLUMN suspense_entry_id INTEGER`).run();

      database.prepare(`CREATE TABLE IF NOT EXISTS supplier_tax_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_name TEXT NOT NULL,
        tps_rate REAL DEFAULT 0.05,
        tvq_rate REAL DEFAULT 0.09975,
        applies_tps INTEGER DEFAULT 1,
        applies_tvq INTEGER DEFAULT 1,
        notes TEXT,
        UNIQUE(supplier_name)
      )`).run();

      database.prepare(`CREATE TABLE IF NOT EXISTS tax_periods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        period_type TEXT NOT NULL DEFAULT 'quarterly',
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        tps_collected REAL DEFAULT 0,
        tvq_collected REAL DEFAULT 0,
        tps_cti REAL DEFAULT 0,
        tvq_rti REAL DEFAULT 0,
        net_tps_owed REAL DEFAULT 0,
        net_tvq_owed REAL DEFAULT 0,
        status TEXT DEFAULT 'open',
        filed_at TEXT,
        paid_at TEXT,
        confirmation_number TEXT,
        journal_entry_id INTEGER,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`).run();

      database.prepare(`CREATE TABLE IF NOT EXISTS tax_calc_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tax_period_id INTEGER,
        calculation_type TEXT NOT NULL,
        formula_version TEXT NOT NULL DEFAULT 'v1.0-2026',
        input_snapshot TEXT,
        result REAL NOT NULL,
        calculated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`).run();
    },
  },
  {
    version: 12,
    description: 'Balance Sheet + AP Tracking + CCA Depreciation — Sprint 6 Accounting Suite',
    up: (database) => {
      database.prepare(`CREATE TABLE IF NOT EXISTS supplier_bills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        month_key TEXT NOT NULL,
        supplier_name TEXT NOT NULL,
        category TEXT,
        amount REAL NOT NULL,
        bill_date TEXT,
        note TEXT DEFAULT '',
        bill_id TEXT UNIQUE,
        amount_before_tax REAL,
        tps_paid REAL DEFAULT 0,
        tvq_paid REAL DEFAULT 0,
        tax_profile_id INTEGER,
        coa_account_id INTEGER,
        business_use_pct REAL DEFAULT 100.0,
        vault_document_id INTEGER,
        journal_entry_id INTEGER,
        invoice_number TEXT,
        due_date TEXT,
        paid INTEGER DEFAULT 0,
        payment_date TEXT,
        payment_method TEXT,
        bank_transaction_id INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`).run();
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_sb_month ON supplier_bills(month_key)`).run();
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_sb_paid  ON supplier_bills(paid, due_date)`).run();

      database.prepare(`CREATE TABLE IF NOT EXISTS supplier_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_bill_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        payment_date TEXT NOT NULL,
        payment_method TEXT,
        reference TEXT,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_bill_id) REFERENCES supplier_bills(id)
      )`).run();

      database.prepare(`CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        coa_account_id INTEGER NOT NULL,
        cca_class TEXT NOT NULL,
        acquisition_date TEXT NOT NULL,
        acquisition_cost REAL NOT NULL,
        personal_use_pct REAL DEFAULT 0,
        disposal_date TEXT,
        disposal_proceeds REAL,
        notes TEXT,
        source_document_id INTEGER,
        is_archived INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (coa_account_id) REFERENCES chart_of_accounts(id)
      )`).run();

      database.prepare(`CREATE TABLE IF NOT EXISTS cca_class_rates (
        class TEXT PRIMARY KEY,
        rate REAL,
        method TEXT NOT NULL,
        description_fr TEXT,
        description_en TEXT,
        first_year_rule TEXT,
        effective_from TEXT,
        effective_to TEXT
      )`).run();

      const ccaIns = database.prepare(
        `INSERT OR IGNORE INTO cca_class_rates (class, rate, method, description_fr, description_en, first_year_rule, effective_from)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      ccaIns.run('8',  0.20, 'declining',    'Equipement divers (20%)',           'Miscellaneous equipment (20%)',  'half_year', '2024-01-01');
      ccaIns.run('10', 0.30, 'declining',    'Vehicules automobiles (30%)',        'Automobiles and vehicles (30%)', 'half_year', '2024-01-01');
      ccaIns.run('12', 1.00, 'full_year',    'Petits outils et uniformes (100%)',  'Small tools and uniforms (100%)','full_year', '2024-01-01');
      ccaIns.run('13', null, 'straight_line','Ameliorations locatives',            'Leasehold improvements',         'pro_rata',  '2024-01-01');
      ccaIns.run('50', 0.55, 'declining',    'Materiel informatique (55%)',        'Computer equipment (55%)',       'half_year', '2024-01-01');

      database.prepare(`CREATE TABLE IF NOT EXISTS asset_depreciation_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_id INTEGER NOT NULL,
        fiscal_year INTEGER NOT NULL,
        ucc_opening REAL NOT NULL,
        additions REAL DEFAULT 0,
        disposals REAL DEFAULT 0,
        cca_claimed REAL NOT NULL,
        ucc_closing REAL NOT NULL,
        formula_version TEXT NOT NULL,
        calculated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (asset_id) REFERENCES assets(id)
      )`).run();
      database.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_adl_asset_year ON asset_depreciation_log(asset_id, fiscal_year)`).run();

      database.prepare(`CREATE TABLE IF NOT EXISTS balance_sheet_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_date TEXT NOT NULL,
        fiscal_year INTEGER,
        status TEXT NOT NULL DEFAULT 'draft',
        data TEXT NOT NULL,
        total_assets_cents INTEGER,
        total_liabilities_cents INTEGER,
        total_equity_cents INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`).run();
    },
  },
  {
    version: 13,
    description: 'Source Document Vault + Recurring Transactions — Sprint 7 Accounting Suite',
    up: (database) => {
      database.prepare(`CREATE TABLE IF NOT EXISTS source_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        mime_type TEXT,
        size_bytes INTEGER,
        sha256 TEXT NOT NULL,
        ocr_text TEXT,
        uploaded_to_cloud INTEGER DEFAULT 0,
        cloud_url TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`).run();
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_sd_entity ON source_documents(entity_type, entity_id)`).run();
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_sd_sha256 ON source_documents(sha256)`).run();

      database.prepare(`CREATE VIRTUAL TABLE IF NOT EXISTS document_search USING fts5(
        file_name,
        ocr_text,
        content=source_documents,
        content_rowid=id
      )`).run();

      database.prepare(`CREATE TRIGGER IF NOT EXISTS sd_ai AFTER INSERT ON source_documents BEGIN
        INSERT INTO document_search(rowid, file_name, ocr_text) VALUES (new.id, new.file_name, new.ocr_text);
      END`).run();
      database.prepare(`CREATE TRIGGER IF NOT EXISTS sd_ad AFTER DELETE ON source_documents BEGIN
        INSERT INTO document_search(document_search, rowid, file_name, ocr_text) VALUES ('delete', old.id, old.file_name, old.ocr_text);
      END`).run();
      database.prepare(`CREATE TRIGGER IF NOT EXISTS sd_au AFTER UPDATE ON source_documents BEGIN
        INSERT INTO document_search(document_search, rowid, file_name, ocr_text) VALUES ('delete', old.id, old.file_name, old.ocr_text);
        INSERT INTO document_search(rowid, file_name, ocr_text) VALUES (new.id, new.file_name, new.ocr_text);
      END`).run();

      database.prepare(`CREATE TABLE IF NOT EXISTS recurring_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rule_type TEXT NOT NULL,
        name TEXT NOT NULL,
        frequency TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT,
        day_of_month INTEGER,
        day_of_week INTEGER,
        template_json TEXT NOT NULL,
        auto_approve INTEGER DEFAULT 0,
        last_run_at TEXT,
        next_run_at TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`).run();
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_rr_next_run ON recurring_rules(next_run_at, is_active)`).run();

      database.prepare(`CREATE TABLE IF NOT EXISTS recurring_generated (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rule_id INTEGER NOT NULL,
        scheduled_for TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        entity_type TEXT,
        entity_id INTEGER,
        template_snapshot TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        approved_at TEXT,
        FOREIGN KEY (rule_id) REFERENCES recurring_rules(id)
      )`).run();
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_rg_rule ON recurring_generated(rule_id, status)`).run();
    },
  },
  {
    version: 14,
    description: 'Sprint 9 — Reminder Ladder + Deposit Schedules',
    up: (database) => {
      database.prepare(`CREATE TABLE IF NOT EXISTS reminder_ladder (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        is_default INTEGER DEFAULT 0,
        applies_to_client_id INTEGER,
        is_active INTEGER DEFAULT 1
      )`).run();

      database.prepare(`CREATE TABLE IF NOT EXISTS reminder_steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ladder_id INTEGER NOT NULL,
        days_after_due INTEGER NOT NULL,
        subject_fr TEXT,
        subject_en TEXT,
        body_fr TEXT,
        body_en TEXT,
        attach_pdf INTEGER DEFAULT 1,
        include_payment_link INTEGER DEFAULT 1,
        FOREIGN KEY (ladder_id) REFERENCES reminder_ladder(id)
      )`).run();

      database.prepare(`CREATE TABLE IF NOT EXISTS reminder_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id TEXT NOT NULL,
        step_id INTEGER NOT NULL,
        sent_at TEXT DEFAULT CURRENT_TIMESTAMP,
        sent_to TEXT,
        status TEXT
      )`).run();
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_rl_invoice ON reminder_log(invoice_id)`).run();

      database.prepare(`CREATE TABLE IF NOT EXISTS deposit_schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        commande_id TEXT NOT NULL,
        label TEXT NOT NULL,
        percentage REAL,
        fixed_amount REAL,
        trigger_type TEXT NOT NULL,
        trigger_date TEXT,
        generated_invoice_id TEXT,
        status TEXT DEFAULT 'pending',
        sort_order INTEGER DEFAULT 0
      )`).run();
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_ds_commande ON deposit_schedules(commande_id)`).run();

      // Seed the default 5-step reminder ladder
      const ladderId = database.prepare(
        `INSERT INTO reminder_ladder (name, is_default, is_active) VALUES ('Défaut', 1, 1)`
      ).run().lastInsertRowid;
      const steps = [
        { days: 3,  sfr: 'Rappel amical — Facture {numero}',          sen: 'Friendly reminder — Invoice {numero}',
          bfr: 'Bonjour {client_name},\n\nNous vous rappelons que la facture {numero} d\'un montant de {amount_due} est due depuis {days_overdue} jour(s).\n\nMerci de votre règlement rapide.\n\n{company_name}',
          ben: 'Hello {client_name},\n\nThis is a friendly reminder that invoice {numero} for {amount_due} has been due for {days_overdue} day(s).\n\nThank you for your prompt payment.\n\n{company_name}' },
        { days: 7,  sfr: 'Rappel ferme — Facture {numero}',           sen: 'Payment reminder — Invoice {numero}',
          bfr: 'Bonjour {client_name},\n\nNous n\'avons pas encore reçu le paiement de la facture {numero} ({amount_due}), maintenant en retard de {days_overdue} jour(s).\n\nVeuillez procéder au paiement dès que possible.\n\n{company_name}',
          ben: 'Hello {client_name},\n\nWe have not yet received payment for invoice {numero} ({amount_due}), now {days_overdue} day(s) overdue.\n\nPlease arrange payment at your earliest convenience.\n\n{company_name}' },
        { days: 14, sfr: 'Compte en retard — Facture {numero}',       sen: 'Past due — Invoice {numero}',
          bfr: 'Bonjour {client_name},\n\nLa facture {numero} ({amount_due}) est maintenant en retard de {days_overdue} jours. Des intérêts peuvent s\'appliquer conformément à nos conditions.\n\nCommuniquez avec nous pour régulariser la situation.\n\n{company_name}',
          ben: 'Hello {client_name},\n\nInvoice {numero} ({amount_due}) is now {days_overdue} days past due. Interest charges may apply per our terms.\n\nPlease contact us to resolve this matter.\n\n{company_name}' },
        { days: 30, sfr: 'Dernier avis — Facture {numero}',           sen: 'Final notice — Invoice {numero}',
          bfr: 'Bonjour {client_name},\n\nCeci est un dernier avis concernant la facture {numero} ({amount_due}), maintenant en retard de {days_overdue} jours.\n\nSans règlement sous 7 jours, nous devrons transmettre ce dossier à notre service de recouvrement.\n\n{company_name}',
          ben: 'Hello {client_name},\n\nThis is a final notice regarding invoice {numero} ({amount_due}), now {days_overdue} days past due.\n\nIf payment is not received within 7 days, we will refer this matter to collections.\n\n{company_name}' },
        { days: 60, sfr: 'Mise en demeure — Facture {numero}',        sen: 'Collection notice — Invoice {numero}',
          bfr: 'Bonjour {client_name},\n\nMalgré nos rappels précédents, la facture {numero} ({amount_due}) demeure impayée depuis {days_overdue} jours.\n\nCe dossier sera remis à notre service juridique si aucun règlement n\'est effectué d\'ici 5 jours ouvrables.\n\n{company_name}',
          ben: 'Hello {client_name},\n\nDespite previous notices, invoice {numero} ({amount_due}) remains unpaid for {days_overdue} days.\n\nThis matter will be referred to our legal department if payment is not received within 5 business days.\n\n{company_name}' },
      ];
      const ins = database.prepare(
        `INSERT INTO reminder_steps (ladder_id, days_after_due, subject_fr, subject_en, body_fr, body_en, attach_pdf, include_payment_link)
         VALUES (?, ?, ?, ?, ?, ?, 1, 1)`
      );
      for (const s of steps) ins.run(ladderId, s.days, s.sfr, s.sen, s.bfr, s.ben);
    },
  },
  {
    version: 15,
    description: 'Sprint 12 — Document Number Registry + Payment Plans',
    up: (database) => {
      database.prepare(`CREATE TABLE IF NOT EXISTS document_number_registry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_type TEXT NOT NULL,
        document_number TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(document_type, document_number)
      )`).run();
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_dnr_type ON document_number_registry(document_type)`).run();

      database.prepare(`CREATE TABLE IF NOT EXISTS payment_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_invoice_id TEXT UNIQUE NOT NULL,
        total_installments INTEGER NOT NULL,
        cadence TEXT NOT NULL,
        start_date TEXT NOT NULL,
        use_pad INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`).run();
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_pp_parent ON payment_plans(parent_invoice_id)`).run();
    },
  },
  {
    version: 16,
    description: 'Sprint 13 — Invoice Inventory Deductions',
    up: (database) => {
      database.prepare(`CREATE TABLE IF NOT EXISTS invoice_inventory_deductions (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL,
        invoice_numero TEXT,
        product_id TEXT NOT NULL,
        quantity REAL NOT NULL,
        revenue REAL DEFAULT 0,
        sale_date TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        UNIQUE(invoice_id, product_id)
      )`).run();
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_iid_product ON invoice_inventory_deductions(product_id)`).run();
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_iid_date ON invoice_inventory_deductions(sale_date)`).run();
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_iid_invoice ON invoice_inventory_deductions(invoice_id)`).run();
    },
  },
];

// Runs all pending migrations in ascending version order.
// If any migration fails the error is re-thrown — the app must not start
// with a partially-migrated schema.
function runMigrations(database) {
  const currentVersion = database.pragma('user_version', { simple: true });
  const pending = MIGRATIONS
    .filter(m => m.version > currentVersion)
    .sort((a, b) => a.version - b.version);

  if (pending.length === 0) return;

  for (const migration of pending) {
    console.log(`[DB] Running migration v${migration.version}: ${migration.description}`);
    try {
      database.transaction(() => {
        migration.up(database);
        database.pragma(`user_version = ${migration.version}`);
      })();
      console.log(`[DB] Migration v${migration.version} complete.`);
    } catch (err) {
      const msg = `[DB] Migration v${migration.version} FAILED: ${err.message}`;
      console.error(msg);
      throw new Error(msg);
    }
  }
}

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
    // ── POS Report Scan ─────────────────────────────────────────────────────
    db.prepare(`CREATE TABLE IF NOT EXISTS pos_scan_templates (
      id TEXT PRIMARY KEY,
      pos_system TEXT NOT NULL,
      pos_version TEXT DEFAULT '',
      language TEXT DEFAULT 'fr',
      patterns TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      is_community INTEGER DEFAULT 0,
      uploaded INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_pos_tpl_system ON pos_scan_templates(pos_system)`).run();

    db.prepare(`CREATE TABLE IF NOT EXISTS pos_scan_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date_key TEXT NOT NULL,
      caisse_index INTEGER DEFAULT 0,
      template_id TEXT,
      raw_text TEXT,
      extracted_values TEXT DEFAULT '{}',
      applied_values TEXT DEFAULT '{}',
      corrections_made INTEGER DEFAULT 0,
      scan_source TEXT DEFAULT 'file',
      ocr_engine TEXT DEFAULT 'tesseract',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_pos_hist_date ON pos_scan_history(date_key)`).run();

    // Seed 2025 PFP rates on first run
    const ecoRateCount = db.prepare('SELECT COUNT(*) as cnt FROM eco_rates WHERE year=2025').get();
    if (ecoRateCount.cnt === 0) {
      const ins2025 = db.prepare(`INSERT OR IGNORE INTO eco_rates (year,material_category,rate_per_tonne,malus_percentage) VALUES (?,?,?,?)`);
      [['corrugated',539.67,0],['flat_cardboard',712.91,0],['paper_laminates',1199.99,0],
       ['pp_plastic',1194.26,0],['pet_plastic',1006.09,0],['hdpe_film',1781.92,0],
       ['polystyrene_pvc_pla',3391.42,50],['aluminum',444.57,0],['printed_matter',737.12,0]
      ].forEach(([cat,rate,malus])=>ins2025.run(2025,cat,rate,malus));
    }

    // Run pending schema migrations (sequential, version-ordered, transactional)
    runMigrations(db);
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

// Maximum byte length for a kv_store value (10 MB). Guards against runaway payloads
// from bugs or malicious input writing unbounded data into SQLite.
const KV_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// Maximum length for individual text fields stored inside JSON values.
// Enforced at write time so no single field can bloat the DB.
const FIELD_MAX_LEN = 500;

// Clamp free-text fields inside a parsed object to FIELD_MAX_LEN characters.
// Only touches known free-text keys; numeric and date fields are left alone.
const FREE_TEXT_KEYS = new Set([
  'notes', 'note', 'nom', 'name', 'prénom', 'reason', 'description',
  'adresse', 'address', 'ville', 'city', 'telephone', 'email', 'courriel',
  'companyName', 'nomEntreprise', 'footerText', 'defaultNotes',
  'whiteLabelName', 'cashierName', 'caissierNom',
]);

function clampFreeTextFields(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(clampFreeTextFields);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && FREE_TEXT_KEYS.has(k) && v.length > FIELD_MAX_LEN) {
      out[k] = v.slice(0, FIELD_MAX_LEN);
    } else if (typeof v === 'object' && v !== null) {
      out[k] = clampFreeTextFields(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function storageGet(key) {
  const row = getDb().prepare('SELECT value FROM kv_store WHERE key = ?').get(key);
  return row ? { key, value: row.value } : null;
}

function storageSet(key, value) {
  if (typeof value !== 'string') {
    throw new TypeError(`storageSet: value must be a JSON string, got ${typeof value}`);
  }
  if (Buffer.byteLength(value, 'utf8') > KV_MAX_BYTES) {
    throw new RangeError(`storageSet: value for key "${key}" exceeds ${KV_MAX_BYTES / 1024 / 1024} MB limit`);
  }
  // Clamp free-text fields to prevent unbounded string storage
  let sanitised = value;
  try {
    const parsed = JSON.parse(value);
    sanitised = JSON.stringify(clampFreeTextFields(parsed));
  } catch {
    // Not JSON (e.g. raw string values) — store as-is, size already checked above
  }
  getDb().prepare('INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)').run(key, sanitised);
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

// ── FORECAST: Clear all demo data ──
function forecastClearAll() {
  const db = getDb();
  db.prepare('DELETE FROM forecast_daily_sales').run();
  db.prepare('DELETE FROM forecast_products').run();
  db.prepare('DELETE FROM forecast_weather').run();
  db.prepare('DELETE FROM learned_patterns').run();
  db.prepare('DELETE FROM learning_insights').run();
  db.prepare('DELETE FROM prediction_accuracy').run();
  return true;
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

function searchWasteEntries(query, limit = 5) {
  try {
    const q = `%${query.toLowerCase()}%`;
    return getDb().prepare(`
      SELECT w.id, w.date, w.category, w.reason, w.notes, w.quantity, w.unit, w.dollar_value,
             i.name_fr, i.name_en
      FROM waste_entries w
      LEFT JOIN ingredients i ON i.id = w.ingredient_id
      WHERE lower(w.reason) LIKE ? OR lower(w.notes) LIKE ? OR lower(w.category) LIKE ?
         OR lower(i.name_fr) LIKE ? OR lower(i.name_en) LIKE ?
      ORDER BY w.date DESC
      LIMIT ?
    `).all(q, q, q, q, q, limit);
  } catch (_) { return []; }
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

// ── POS Scan Templates ───────────────────────────────────────────────────────
function posScanTemplatesGetAll() {
  return getDb().prepare('SELECT * FROM pos_scan_templates ORDER BY pos_system, created_at').all();
}
function posScanTemplateSave(tpl) {
  const db = getDb();
  if (tpl.id) {
    const existing = db.prepare('SELECT id FROM pos_scan_templates WHERE id=?').get(tpl.id);
    if (existing) {
      db.prepare(`UPDATE pos_scan_templates SET pos_system=@pos_system, pos_version=@pos_version, language=@language, patterns=@patterns, metadata=@metadata, is_community=@is_community, uploaded=@uploaded, updated_at=datetime('now','localtime') WHERE id=@id`).run(tpl);
      return tpl.id;
    }
  }
  db.prepare(`INSERT INTO pos_scan_templates (id,pos_system,pos_version,language,patterns,metadata,is_community,uploaded) VALUES (@id,@pos_system,@pos_version,@language,@patterns,@metadata,@is_community,@uploaded)`).run(tpl);
  return tpl.id;
}
function posScanTemplateDelete(id) {
  getDb().prepare('DELETE FROM pos_scan_templates WHERE id=?').run(id);
  return true;
}
function posScanTemplateMarkUploaded(id) {
  getDb().prepare("UPDATE pos_scan_templates SET uploaded=1, updated_at=datetime('now','localtime') WHERE id=?").run(id);
  return true;
}

// ── POS Scan History ─────────────────────────────────────────────────────────
function posScanHistorySave(entry) {
  return getDb().prepare(`INSERT INTO pos_scan_history (date_key,caisse_index,template_id,raw_text,extracted_values,applied_values,corrections_made,scan_source,ocr_engine) VALUES (@date_key,@caisse_index,@template_id,@raw_text,@extracted_values,@applied_values,@corrections_made,@scan_source,@ocr_engine)`).run(entry).lastInsertRowid;
}
function posScanHistoryGetRecent(limit = 30) {
  return getDb().prepare('SELECT id,date_key,caisse_index,template_id,extracted_values,applied_values,corrections_made,scan_source,ocr_engine,created_at FROM pos_scan_history ORDER BY created_at DESC LIMIT ?').all(limit);
}
function posScanHistoryGetForDate(dateKey) {
  return getDb().prepare('SELECT * FROM pos_scan_history WHERE date_key=? ORDER BY created_at DESC').all(dateKey);
}

// ── Onboarding Checklist ───────────────────────────────────────────────────
function onboardingGetAll() {
  return getDb().prepare('SELECT item_key, completed, completed_at FROM onboarding_progress').all();
}
function onboardingMarkDone(itemKey) {
  getDb().prepare(
    "INSERT OR REPLACE INTO onboarding_progress (item_key, completed, completed_at) VALUES (?, 1, datetime('now','localtime'))"
  ).run(itemKey);
  return true;
}
function onboardingReset() {
  getDb().prepare('DELETE FROM onboarding_progress').run();
  return true;
}

// ── P&L Invoice History (Vendor Price Intelligence) ───────────────────────
// Records a bill entry so we can compare invoice amounts across time.
function plInvoiceHistoryRecord(record) {
  // record: {supplier_key, supplier_name, amount, bill_date, note, month_key, bill_id}
  getDb().prepare(
    `INSERT OR IGNORE INTO pl_invoice_history
      (supplier_key, supplier_name, amount, bill_date, note, month_key, bill_id)
      VALUES (@supplier_key, @supplier_name, @amount, @bill_date, @note, @month_key, @bill_id)`
  ).run(record);
  return true;
}
// Returns the most recent recorded bill for a supplier_key (excluding current bill_id).
function plInvoiceHistoryGetLast(supplierKey, excludeBillId) {
  return getDb().prepare(
    `SELECT * FROM pl_invoice_history WHERE supplier_key=? AND bill_id!=?
     ORDER BY recorded_at DESC, id DESC LIMIT 1`
  ).get(supplierKey, excludeBillId || '') || null;
}
// Returns the last N bills for a supplier_key (most recent first).
function plInvoiceHistoryGetRecent(supplierKey, limit) {
  return getDb().prepare(
    `SELECT * FROM pl_invoice_history WHERE supplier_key=? ORDER BY recorded_at DESC, id DESC LIMIT ?`
  ).all(supplierKey, limit || 5);
}

// ── Upgrade Prompt Dismissals ──────────────────────────────────────────────
// Returns the ISO timestamp when the prompt was last dismissed, or null.
function upgradePromptGetDismissedAt(key) {
  const row = getDb().prepare('SELECT dismissed_at FROM upgrade_prompt_dismissals WHERE prompt_key = ?').get(key);
  return row ? row.dismissed_at : null;
}

// Records a dismissal (upsert — replaces any previous timestamp).
function upgradePromptDismiss(key) {
  getDb().prepare(
    "INSERT OR REPLACE INTO upgrade_prompt_dismissals (prompt_key, dismissed_at) VALUES (?, datetime('now','localtime'))"
  ).run(key);
  return true;
}

// ── Global Search ─────────────────────────────────────────────────────────────
// FTS5 is used for SQLite-backed tables; kv_store data is filtered in main.js.
function _safeFtsQuery(raw) {
  // Strip FTS5 special characters to avoid query syntax errors
  return (raw || '').replace(/["*()\-:^]/g, ' ').trim();
}

function searchIngredients(raw, limit = 6) {
  const safe = _safeFtsQuery(raw);
  if (!safe) return [];
  const q = safe.split(/\s+/).filter(Boolean).map(w => `${w}*`).join(' ');
  try {
    return getDb().prepare(`
      SELECT i.id, i.name_fr, i.name_en, i.category, i.current_unit_price, i.default_unit
      FROM fts_ingredients
      JOIN ingredients i ON fts_ingredients.rowid = i.id
      WHERE fts_ingredients MATCH ?
      ORDER BY rank LIMIT ?
    `).all(q, limit);
  } catch (_) {
    // FTS5 query parse error — fall back to LIKE
    return getDb().prepare(
      `SELECT id, name_fr, name_en, category, current_unit_price, default_unit
       FROM ingredients WHERE name_fr LIKE ? OR COALESCE(name_en,'') LIKE ? LIMIT ?`
    ).all(`%${safe}%`, `%${safe}%`, limit);
  }
}

function searchForecastProducts(raw, limit = 6) {
  const safe = _safeFtsQuery(raw);
  if (!safe) return [];
  const q = safe.split(/\s+/).filter(Boolean).map(w => `${w}*`).join(' ');
  try {
    return getDb().prepare(`
      SELECT fp.id, fp.name, fp.category
      FROM fts_forecast_products
      JOIN forecast_products fp ON fts_forecast_products.fp_id = fp.id
      WHERE fts_forecast_products MATCH ?
      ORDER BY rank LIMIT ?
    `).all(q, limit);
  } catch (_) {
    return getDb().prepare(
      `SELECT id, name, category FROM forecast_products WHERE name LIKE ? LIMIT ?`
    ).all(`%${safe}%`, limit);
  }
}

function searchHistoryGet(limit = 5) {
  try {
    return getDb().prepare(
      'SELECT id, query, result_type, result_id, searched_at FROM search_history ORDER BY searched_at DESC LIMIT ?'
    ).all(limit);
  } catch (_) { return []; }
}

function searchHistorySave(query, result_type, result_id) {
  try {
    getDb().prepare(
      `INSERT INTO search_history (query, result_type, result_id) VALUES (?, ?, ?)`
    ).run(query || '', result_type || null, result_id || null);
    getDb().prepare(
      `DELETE FROM search_history WHERE id NOT IN (SELECT id FROM search_history ORDER BY searched_at DESC LIMIT 20)`
    ).run();
  } catch (_) {}
}

function storageGetByPrefix(prefix) {
  try {
    return getDb().prepare("SELECT key, value FROM kv_store WHERE key LIKE ?").all(prefix + '%');
  } catch (_) { return []; }
}

// ── Chart of Accounts ─────────────────────────────────────────────────────────
function coaList() {
  return getDb().prepare(
    `SELECT id, account_number, name_fr, name_en, type, parent_account_id,
            is_contra, is_archived, is_system, is_simplified, tax_hint, created_at
     FROM chart_of_accounts
     ORDER BY account_number ASC`
  ).all();
}

function coaCreate({ account_number, name_fr, name_en, type, parent_account_id = null, is_contra = 0, is_simplified = 0, tax_hint = null }) {
  const existing = getDb().prepare('SELECT id FROM chart_of_accounts WHERE account_number = ?').get(account_number);
  if (existing) throw new Error(`Numéro de compte ${account_number} déjà utilisé`);
  const info = getDb().prepare(
    `INSERT INTO chart_of_accounts (account_number, name_fr, name_en, type, parent_account_id, is_contra, is_simplified, tax_hint, is_system)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`
  ).run(account_number, name_fr, name_en, type, parent_account_id, is_contra ? 1 : 0, is_simplified ? 1 : 0, tax_hint || null);
  return { id: info.lastInsertRowid };
}

function coaUpdate(id, fields) {
  const allowed = ['account_number', 'name_fr', 'name_en', 'type', 'parent_account_id', 'is_contra', 'is_simplified', 'tax_hint'];
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) { sets.push(`${k} = ?`); vals.push(v); }
  }
  if (!sets.length) return false;
  vals.push(id);
  getDb().prepare(`UPDATE chart_of_accounts SET ${sets.join(', ')} WHERE id = ? AND is_system = 0`).run(...vals);
  return true;
}

function coaArchive(id) {
  getDb().prepare(`UPDATE chart_of_accounts SET is_archived = 1 WHERE id = ?`).run(id);
  return true;
}

function coaUnarchive(id) {
  getDb().prepare(`UPDATE chart_of_accounts SET is_archived = 0 WHERE id = ?`).run(id);
  return true;
}

function coaImportCSV(csvString) {
  const lines = csvString.split('\n').map(l => l.trim()).filter(Boolean);
  let created = 0, skipped = 0;
  const errors = [];
  const db = getDb();
  const upsert = db.prepare(
    `INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type, tax_hint, is_system)
     VALUES (?, ?, ?, ?, ?, 0)`
  );
  // Skip header row if present
  const start = (lines[0] || '').toLowerCase().includes('account_number') ? 1 : 0;
  const importMany = db.transaction((rows) => {
    for (const line of rows) {
      const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
      const [account_number, name_fr, name_en, type, tax_hint] = cols;
      if (!account_number || !name_fr || !type) {
        errors.push(`Ligne ignorée (données manquantes): ${line}`);
        skipped++;
        continue;
      }
      try {
        const info = upsert.run(account_number, name_fr, name_en || name_fr, type, tax_hint || null);
        if (info.changes > 0) created++; else skipped++;
      } catch (e) {
        errors.push(`${account_number}: ${e.message}`);
        skipped++;
      }
    }
  });
  importMany(lines.slice(start));
  return { created, skipped, errors };
}

function coaExportCSV() {
  const rows = coaList();
  const header = 'account_number,name_fr,name_en,type,tax_hint,is_simplified,is_system';
  const lines = rows.map(r =>
    [r.account_number, r.name_fr, r.name_en, r.type, r.tax_hint || '', r.is_simplified, r.is_system].join(',')
  );
  return [header, ...lines].join('\n');
}

// Returns keyword-matched COA suggestions for a list of category/expense names
function coaMappingSuggestions(categoryNames) {
  const accounts = coaList().filter(a => !a.is_archived);
  const KEYWORDS = {
    // food & beverage
    'nourriture': '5010', 'aliment': '5010', 'food': '5010', 'épicerie': '5010',
    'boisson': '5020', 'beverage': '5020', 'drink': '5020',
    'emballage': '5030', 'packaging': '5030', 'contenant': '5030',
    // payroll
    'salaire': '6110', 'salary': '6110', 'paie': '6110', 'payroll': '6110', 'wage': '6110',
    'avantage': '6120', 'benefit': '6120', 'assurance-emploi': '6120', 'reer': '6120',
    'vacances': '6130', 'vacation': '6130', 'congé': '6130',
    // occupancy
    'loyer': '6210', 'rent': '6210', 'bail': '6210', 'local': '6210',
    'électricité': '6220', 'electricit': '6220', 'hydro': '6220', 'énergie': '6220',
    'gaz': '6230', 'gas': '6230', 'chauffage': '6230',
    'eau': '6240', 'water': '6240',
    // marketing
    'publicité': '6310', 'advertising': '6310', 'marketing': '6310', 'promotion': '6310',
    // admin
    'bureau': '6410', 'office': '6410', 'fourniture': '6410', 'supply': '6410',
    'téléphone': '6420', 'telephone': '6420', 'internet': '6420', 'cellulaire': '6420',
    'comptabilité': '6430', 'accounting': '6430', 'légal': '6440', 'legal': '6440', 'honoraire': '6440',
    'assurance': '6450', 'insurance': '6450',
    'permis': '6460', 'license': '6460', 'licence': '6460',
    // maintenance
    'entretien': '6510', 'maintenance': '6510', 'réparation': '6510', 'repair': '6510',
    'nettoyage': '6520', 'cleaning': '6520', 'ménage': '6520',
    // finance
    'intérêt': '6610', 'interest': '6610', 'frais bancaire': '6620', 'bank fee': '6620', 'frais de service': '6620',
    'stripe': '6630', 'carte': '6630', 'transaction': '6630',
    // royalties
    'redevance': '6710', 'royalty': '6710', 'franchise': '6710',
    // other
    'divers': '6810', 'miscellaneous': '6810', 'autre': '6810', 'other': '6810',
  };
  const byNumber = {};
  for (const a of accounts) byNumber[a.account_number] = a;
  const suggestions = {};
  for (const name of (categoryNames || [])) {
    const lower = name.toLowerCase();
    let matched = null;
    for (const [kw, num] of Object.entries(KEYWORDS)) {
      if (lower.includes(kw)) { matched = num; break; }
    }
    if (matched && byNumber[matched]) {
      suggestions[name] = { account_number: matched, name_fr: byNumber[matched].name_fr };
    }
  }
  return suggestions;
}

// ── General Ledger Core ───────────────────────────────────────────────────────

function _nextEntryNumber(db, fiscalYear) {
  const row = db.prepare(
    `SELECT entry_number FROM journal_entries
     WHERE entry_number LIKE ? ORDER BY entry_number DESC LIMIT 1`
  ).get(`JE-${fiscalYear}-%`);
  if (!row) return `JE-${fiscalYear}-000001`;
  const seq = parseInt(row.entry_number.split('-')[2], 10) + 1;
  return `JE-${fiscalYear}-${String(seq).padStart(6, '0')}`;
}

function _getDeviceUuid() {
  return getDeviceId();
}

// Returns or auto-creates the open monthly period for a given date.
function _ensurePeriod(db, entryDate, locationId = null) {
  const d = new Date(entryDate);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const start = `${year}-${month}-01`;
  const lastDay = new Date(year, d.getUTCMonth() + 1, 0).getDate();
  const end = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
  let period = db.prepare(
    `SELECT * FROM accounting_periods WHERE period_type='month' AND start_date=? AND end_date=? AND (location_id IS ? OR location_id=?)`
  ).get(start, end, locationId, locationId);
  if (!period) {
    const info = db.prepare(
      `INSERT OR IGNORE INTO accounting_periods (period_type, fiscal_year, start_date, end_date, status, location_id)
       VALUES ('month', ?, ?, ?, 'open', ?)`
    ).run(year, start, end, locationId);
    period = db.prepare(`SELECT * FROM accounting_periods WHERE id=?`).get(info.lastInsertRowid || db.prepare(
      `SELECT id FROM accounting_periods WHERE period_type='month' AND start_date=? AND end_date=?`
    ).get(start, end).id);
    if (!period) period = db.prepare(
      `SELECT * FROM accounting_periods WHERE period_type='month' AND start_date=? AND end_date=?`
    ).get(start, end);
  }
  return period;
}

// Draft: save entry + lines without posting (no balance check).
function glDraftEntry({ entry_date, description, source_type = 'manual', source_id = null, lines = [], location_id = null }) {
  const db = getDb();
  const uuid = _getDeviceUuid();
  const year = new Date(entry_date).getUTCFullYear();
  const period = _ensurePeriod(db, entry_date, location_id);
  const entryNumber = _nextEntryNumber(db, year);

  return db.transaction(() => {
    const { lastInsertRowid: entryId } = db.prepare(
      `INSERT INTO journal_entries (entry_number, entry_date, period_id, description, source_type, source_id, status, device_uuid, location_id)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)`
    ).run(entryNumber, entry_date, period.id, description || null, source_type, source_id || null, uuid, location_id || null);

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      db.prepare(
        `INSERT INTO journal_lines (entry_id, line_number, account_id, debit_cents, credit_cents, memo, location_id, contact_id, tax_code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(entryId, i + 1, l.account_id, l.debit_cents || 0, l.credit_cents || 0, l.memo || null, l.location_id || null, l.contact_id || null, l.tax_code || null);
    }
    return { entryId, entryNumber };
  })();
}

// Update a draft entry's lines (replaces all lines).
function glUpdateDraft(entryId, { entry_date, description, lines = [] }) {
  const db = getDb();
  const entry = db.prepare(`SELECT * FROM journal_entries WHERE id=?`).get(entryId);
  if (!entry) throw new Error('Écriture introuvable');
  if (entry.status !== 'draft') throw new Error('Seules les écritures en brouillon peuvent être modifiées');

  return db.transaction(() => {
    const updates = [];
    const vals = [];
    if (entry_date) { updates.push('entry_date=?'); vals.push(entry_date); }
    if (description !== undefined) { updates.push('description=?'); vals.push(description || null); }
    if (updates.length) { vals.push(entryId); db.prepare(`UPDATE journal_entries SET ${updates.join(',')} WHERE id=?`).run(...vals); }

    db.prepare(`DELETE FROM journal_lines WHERE entry_id=?`).run(entryId);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      db.prepare(
        `INSERT INTO journal_lines (entry_id, line_number, account_id, debit_cents, credit_cents, memo, location_id, contact_id, tax_code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(entryId, i + 1, l.account_id, l.debit_cents || 0, l.credit_cents || 0, l.memo || null, l.location_id || null, l.contact_id || null, l.tax_code || null);
    }
    return true;
  })();
}

// Post: validate balance, flip status to posted.
function glPostEntry(entryId) {
  const db = getDb();
  const entry = db.prepare(`SELECT * FROM journal_entries WHERE id=?`).get(entryId);
  if (!entry) throw new Error('Écriture introuvable');
  if (entry.status === 'posted') throw new Error('Écriture déjà comptabilisée');
  if (entry.status === 'reversed') throw new Error('Écriture annulée — ne peut pas être comptabilisée');

  const period = db.prepare(`SELECT * FROM accounting_periods WHERE id=?`).get(entry.period_id);
  if (period && period.status === 'closed') throw new Error('La période est fermée — rouvrez-la avant de comptabiliser');

  // An opening_balance entry must be unique per location — re-running a migration
  // or user error must never result in two opening balance postings.
  if (entry.source_type === 'opening_balance') {
    const existing = db.prepare(
      `SELECT id FROM journal_entries
       WHERE source_type='opening_balance' AND status='posted'
         AND (location_id IS ? OR location_id=?) AND id != ?`
    ).get(entry.location_id, entry.location_id, entryId);
    if (existing) throw new Error('Solde d\'ouverture déjà comptabilisé pour cet emplacement');
  }

  const lines = db.prepare(`SELECT * FROM journal_lines WHERE entry_id=?`).all(entryId);
  if (!lines.length) throw new Error('Écriture sans lignes');

  const totalDebits = lines.reduce((s, l) => s + l.debit_cents, 0);
  const totalCredits = lines.reduce((s, l) => s + l.credit_cents, 0);
  if (totalDebits !== totalCredits) {
    throw new Error(`Déséquilibre: débit ${totalDebits}¢ ≠ crédit ${totalCredits}¢`);
  }

  const now = new Date().toISOString();
  const uuid = _getDeviceUuid();
  db.prepare(
    `UPDATE journal_entries SET status='posted', posted_at=?, posted_by_device_uuid=?, posting_date=? WHERE id=?`
  ).run(now, uuid, now.slice(0, 10), entryId);

  return { entryNumber: entry.entry_number, postedAt: now };
}

// Reverse a posted entry: creates and immediately posts the mirror entry.
function glReverseEntry(entryId, reason) {
  const db = getDb();
  const orig = db.prepare(`SELECT * FROM journal_entries WHERE id=?`).get(entryId);
  if (!orig) throw new Error('Écriture introuvable');
  if (orig.status !== 'posted') throw new Error('Seules les écritures comptabilisées peuvent être annulées');
  if (orig.reversed_by_entry_id) throw new Error('Écriture déjà annulée');

  const period = db.prepare(`SELECT * FROM accounting_periods WHERE id=?`).get(orig.period_id);
  if (period && period.status === 'closed') throw new Error('La période est fermée — rouvrez-la avant d\'annuler');

  const origLines = db.prepare(`SELECT * FROM journal_lines WHERE entry_id=? ORDER BY line_number`).all(entryId);
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const uuid = _getDeviceUuid();
  const year = new Date(today).getUTCFullYear();
  const reversalPeriod = _ensurePeriod(db, today, orig.location_id);

  return db.transaction(() => {
    const revNumber = _nextEntryNumber(db, year);
    const { lastInsertRowid: revId } = db.prepare(
      `INSERT INTO journal_entries (entry_number, entry_date, period_id, description, source_type, source_id, status, posted_at, posted_by_device_uuid, posting_date, reverses_entry_id, reversal_reason, device_uuid, location_id)
       VALUES (?, ?, ?, ?, 'reversal', ?, 'posted', ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      revNumber, today, reversalPeriod.id,
      `Annulation de ${orig.entry_number}${reason ? ': ' + reason : ''}`,
      orig.source_id || null, now, uuid, today,
      entryId, reason || null, uuid, orig.location_id || null
    );

    for (let i = 0; i < origLines.length; i++) {
      const l = origLines[i];
      db.prepare(
        `INSERT INTO journal_lines (entry_id, line_number, account_id, debit_cents, credit_cents, memo, location_id, contact_id, tax_code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(revId, i + 1, l.account_id, l.credit_cents, l.debit_cents, l.memo, l.location_id, l.contact_id, l.tax_code);
    }

    db.prepare(
      `UPDATE journal_entries SET status='reversed', reversed_by_entry_id=?, reversed_at=?, reversed_by_device_uuid=? WHERE id=?`
    ).run(revId, now, uuid, entryId);

    return { reversalId: revId, reversalNumber: revNumber };
  })();
}

// Correct: atomic reverse + new draft (caller posts the new draft after confirming lines).
function glCorrectEntry(entryId, newData, reason) {
  const { reversalId, reversalNumber } = glReverseEntry(entryId, reason || 'Correction');
  const { entryId: newEntryId, entryNumber: newEntryNumber } = glDraftEntry(newData);
  return { reversalId, reversalNumber, newEntryId, newEntryNumber };
}

function glDeleteDraft(entryId) {
  const db = getDb();
  const entry = db.prepare(`SELECT status FROM journal_entries WHERE id=?`).get(entryId);
  if (!entry) throw new Error('Écriture introuvable');
  if (entry.status !== 'draft') throw new Error('Seules les écritures en brouillon peuvent être supprimées');
  db.prepare(`DELETE FROM journal_lines WHERE entry_id=?`).run(entryId);
  db.prepare(`DELETE FROM journal_entries WHERE id=?`).run(entryId);
  return true;
}

function glGetEntry(entryId) {
  const db = getDb();
  const entry = db.prepare(`SELECT * FROM journal_entries WHERE id=?`).get(entryId);
  if (!entry) return null;
  const lines = db.prepare(
    `SELECT jl.*, coa.account_number, coa.name_fr, coa.name_en, coa.type
     FROM journal_lines jl
     JOIN chart_of_accounts coa ON coa.id = jl.account_id
     WHERE jl.entry_id=? ORDER BY jl.line_number`
  ).all(entryId);
  return { ...entry, lines };
}

function glListEntries({ periodId = null, status = null, sourceType = null, dateFrom = null, dateTo = null, locationId = null, limit = 100, offset = 0 } = {}) {
  const db = getDb();
  const conditions = [];
  const params = [];
  if (periodId) { conditions.push('je.period_id=?'); params.push(periodId); }
  if (status) { conditions.push('je.status=?'); params.push(status); }
  if (sourceType) { conditions.push('je.source_type=?'); params.push(sourceType); }
  if (dateFrom) { conditions.push('je.entry_date>=?'); params.push(dateFrom); }
  if (dateTo) { conditions.push('je.entry_date<=?'); params.push(dateTo); }
  if (locationId != null) { conditions.push('(je.location_id IS ? OR je.location_id=?)'); params.push(locationId, locationId); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  params.push(limit, offset);
  const entries = db.prepare(
    `SELECT je.*, ap.start_date AS period_start, ap.end_date AS period_end
     FROM journal_entries je
     LEFT JOIN accounting_periods ap ON ap.id = je.period_id
     ${where}
     ORDER BY je.entry_date DESC, je.id DESC
     LIMIT ? OFFSET ?`
  ).all(...params);

  const total = db.prepare(
    `SELECT COUNT(*) AS n FROM journal_entries je ${where.replace('LIMIT ? OFFSET ?', '')}`
  ).get(...params.slice(0, -2))?.n || 0;

  return { entries, total };
}

function glExportLines({ dateFrom = null, dateTo = null, status = 'posted', locationId = null } = {}) {
  const db = getDb();
  const conds = ['je.status=?'];
  const params = [status];
  if (dateFrom) { conds.push('je.entry_date>=?'); params.push(dateFrom); }
  if (dateTo) { conds.push('je.entry_date<=?'); params.push(dateTo); }
  if (locationId != null) { conds.push('(je.location_id IS ? OR je.location_id=?)'); params.push(locationId, locationId); }
  return db.prepare(
    `SELECT je.id AS entry_id, je.entry_number, je.entry_date, je.description, je.source_type,
            jl.line_number, jl.debit_cents, jl.credit_cents, jl.memo AS line_memo,
            coa.account_number, coa.name_fr AS account_name_fr, coa.name_en AS account_name_en
     FROM journal_entries je
     JOIN journal_lines jl ON jl.entry_id = je.id
     JOIN chart_of_accounts coa ON coa.id = jl.account_id
     WHERE ${conds.join(' AND ')}
     ORDER BY je.entry_date ASC, je.id ASC, jl.line_number ASC`
  ).all(...params);
}

function glGetAccountHistory(accountId, { dateFrom = null, dateTo = null, locationId = null } = {}) {
  const db = getDb();
  const conds = ['jl.account_id=?', "je.status='posted'"];
  const params = [accountId];
  if (dateFrom) { conds.push('je.entry_date>=?'); params.push(dateFrom); }
  if (dateTo) { conds.push('je.entry_date<=?'); params.push(dateTo); }
  if (locationId != null) { conds.push('(je.location_id IS ? OR je.location_id=?)'); params.push(locationId, locationId); }
  return db.prepare(
    `SELECT je.entry_number, je.entry_date, je.description, je.source_type,
            jl.debit_cents, jl.credit_cents, jl.memo,
            coa.account_number, coa.name_fr
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.entry_id
     JOIN chart_of_accounts coa ON coa.id = jl.account_id
     WHERE ${conds.join(' AND ')}
     ORDER BY je.entry_date ASC, je.id ASC`
  ).all(...params);
}

function trialBalance(asOfDate, { locationId = null } = {}) {
  const db = getDb();
  const params = [asOfDate];
  const locCond = locationId != null ? '(je.location_id IS ? OR je.location_id=?)' : '1=1';
  if (locationId != null) params.push(locationId, locationId);

  const rows = db.prepare(
    `SELECT coa.id AS account_id, coa.account_number, coa.name_fr, coa.name_en, coa.type, coa.is_contra,
            SUM(jl.debit_cents) AS total_debit_cents, SUM(jl.credit_cents) AS total_credit_cents
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.entry_id AND je.status='posted' AND je.entry_date <= ?
     JOIN chart_of_accounts coa ON coa.id = jl.account_id
     WHERE ${locCond}
     GROUP BY jl.account_id
     ORDER BY coa.account_number ASC`
  ).all(...params);

  return rows.map(r => ({
    ...r,
    balance_cents: r.total_debit_cents - r.total_credit_cents,
  }));
}

// ── Accounting Periods ────────────────────────────────────────────────────────

function periodList({ fiscalYear = null, locationId = null } = {}) {
  const db = getDb();
  const conds = [];
  const params = [];
  if (fiscalYear) { conds.push('fiscal_year=?'); params.push(fiscalYear); }
  if (locationId != null) { conds.push('(location_id IS ? OR location_id=?)'); params.push(locationId, locationId); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  return db.prepare(`SELECT * FROM accounting_periods ${where} ORDER BY start_date ASC`).all(...params);
}

function periodOpen({ period_type = 'month', fiscal_year, start_date, end_date, location_id = null }) {
  const db = getDb();
  const info = db.prepare(
    `INSERT OR IGNORE INTO accounting_periods (period_type, fiscal_year, start_date, end_date, status, location_id)
     VALUES (?, ?, ?, ?, 'open', ?)`
  ).run(period_type, fiscal_year, start_date, end_date, location_id || null);
  if (!info.lastInsertRowid) {
    // Already exists — just ensure it's open
    const existing = db.prepare(
      `SELECT id, status FROM accounting_periods WHERE period_type=? AND start_date=? AND end_date=? AND (location_id IS ? OR location_id=?)`
    ).get(period_type, start_date, end_date, location_id, location_id);
    if (existing && existing.status === 'closed') {
      throw new Error('Période déjà fermée — utilisez "Rouvrir" pour la réouvrir');
    }
    return { periodId: existing?.id };
  }
  return { periodId: info.lastInsertRowid };
}

function periodClose(periodId) {
  const db = getDb();
  const period = db.prepare(`SELECT * FROM accounting_periods WHERE id=?`).get(periodId);
  if (!period) throw new Error('Période introuvable');
  if (period.status === 'closed') throw new Error('Période déjà fermée');

  // Check for draft entries in this period
  const drafts = db.prepare(
    `SELECT COUNT(*) AS n FROM journal_entries WHERE period_id=? AND status='draft'`
  ).get(periodId);
  if (drafts.n > 0) {
    return { success: false, blockers: [`${drafts.n} écriture(s) en brouillon doivent être comptabilisées ou supprimées avant la fermeture`] };
  }

  const now = new Date().toISOString();
  const uuid = _getDeviceUuid();
  db.prepare(
    `UPDATE accounting_periods SET status='closed', closed_at=?, closed_by_device_uuid=? WHERE id=?`
  ).run(now, uuid, periodId);
  return { success: true };
}

function periodReopen(periodId, reason) {
  const db = getDb();
  const period = db.prepare(`SELECT * FROM accounting_periods WHERE id=?`).get(periodId);
  if (!period) throw new Error('Période introuvable');
  if (period.status !== 'closed') throw new Error('La période n\'est pas fermée');
  if (!reason || !reason.trim()) throw new Error('Une raison est requise pour rouvrir une période');

  const now = new Date().toISOString();
  const uuid = _getDeviceUuid();
  db.prepare(
    `UPDATE accounting_periods SET status='reopened', reopened_at=?, reopened_by_device_uuid=?, reopen_reason=? WHERE id=?`
  ).run(now, uuid, reason.trim(), periodId);
  return { success: true };
}

function glAuditLogList({ entityType = null, entityId = null, dateFrom = null, dateTo = null, limit = 100 } = {}) {
  // Reads from the existing audit_log table, filtered to GL-related actions
  const db = getDb();
  const conds = ["module IN ('GL','PERIOD','LEDGER')"];
  const params = [];
  if (entityType) { conds.push('record_type=?'); params.push(entityType); }
  if (entityId) { conds.push('record_id=?'); params.push(String(entityId)); }
  if (dateFrom) { conds.push('timestamp>=?'); params.push(dateFrom); }
  if (dateTo) { conds.push('timestamp<=?'); params.push(dateTo); }
  params.push(limit);
  return db.prepare(
    `SELECT * FROM audit_log WHERE ${conds.join(' AND ')} ORDER BY timestamp DESC LIMIT ?`
  ).all(...params);
}

// ── Bank Reconciliation ───────────────────────────────────────────────────────

function bankAccountsList() {
  const db = getDb();
  return db.prepare(`
    SELECT ba.*, ca.account_number, ca.name_fr AS coa_name_fr
    FROM bank_accounts ba
    LEFT JOIN chart_of_accounts ca ON ca.id = ba.coa_account_id
    WHERE ba.is_archived = 0
    ORDER BY ba.name
  `).all();
}

function bankAccountCreate(fields) {
  const db = getDb();
  const { name, account_type, coa_account_id, opening_balance, opening_date, currency = 'CAD' } = fields;
  const { lastInsertRowid } = db.prepare(
    `INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date, currency)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(name, account_type || 'bank', coa_account_id, opening_balance || 0, opening_date, currency);
  return db.prepare(`SELECT * FROM bank_accounts WHERE id=?`).get(lastInsertRowid);
}

function bankAccountUpdate(id, fields) {
  const db = getDb();
  const cols = ['name','account_type','coa_account_id','opening_balance','opening_date','currency','csv_column_map','is_archived'];
  const sets = []; const vals = [];
  for (const c of cols) {
    if (fields[c] !== undefined) { sets.push(`${c}=?`); vals.push(fields[c]); }
  }
  if (!sets.length) return;
  vals.push(id);
  db.prepare(`UPDATE bank_accounts SET ${sets.join(',')} WHERE id=?`).run(...vals);
  return db.prepare(`SELECT * FROM bank_accounts WHERE id=?`).get(id);
}

function bankAccountArchive(id) {
  getDb().prepare(`UPDATE bank_accounts SET is_archived=1 WHERE id=?`).run(id);
  return true;
}

// ── CSV / OFX import ─────────────────────────────────────────────────────────

function _sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function _normDescription(desc) {
  return (desc || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 100);
}

// Parse bank CSV: returns [{date, description, amount, running_balance}]
function _parseBankCSV(csvText, columnMap) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());

  // Auto-detect or use saved mapping
  const map = columnMap || {};
  const detect = (candidates) => {
    for (const c of candidates) {
      const idx = headers.findIndex(h => h.includes(c));
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const dateIdx   = map.date        !== undefined ? map.date        : detect(['date','dat']);
  const descIdx   = map.description !== undefined ? map.description : detect(['description','libellé','libelle','memo','details','narrativ']);
  const amtIdx    = map.amount      !== undefined ? map.amount      : detect(['amount','montant','debit/credit','transaction amount']);
  const debitIdx  = map.debit       !== undefined ? map.debit       : detect(['debit','débit','withdrawals','sortie']);
  const creditIdx = map.credit      !== undefined ? map.credit      : detect(['credit','crédit','deposits','entrée']);
  const balIdx    = map.balance     !== undefined ? map.balance     : detect(['balance','solde','running balance','closing balance']);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].match(/("(?:[^"]|"")*"|[^,]*)/g) || [];
    const clean = cols.map(c => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
    if (!clean[dateIdx]) continue;

    let amount = 0;
    if (amtIdx >= 0 && clean[amtIdx]) {
      amount = parseFloat(clean[amtIdx].replace(/[^0-9.\-]/g, '')) || 0;
    } else if (debitIdx >= 0 || creditIdx >= 0) {
      const debit  = debitIdx  >= 0 ? parseFloat((clean[debitIdx]  || '').replace(/[^0-9.]/g, '')) || 0 : 0;
      const credit = creditIdx >= 0 ? parseFloat((clean[creditIdx] || '').replace(/[^0-9.]/g, '')) || 0 : 0;
      amount = credit - debit;
    }

    rows.push({
      transaction_date: clean[dateIdx] || '',
      description: clean[descIdx] || '',
      amount,
      running_balance: balIdx >= 0 ? (parseFloat((clean[balIdx] || '').replace(/[^0-9.\-]/g, '')) || null) : null,
    });
  }
  return rows;
}

// Parse OFX/QFX/QBO — lightweight regex (no full XML parser needed for stable OFX 1.x)
function _parseBankOFX(text) {
  const rows = [];
  const txBlocks = text.split(/<STMTTRN>|<\/STMTTRN>/i).filter((_, i) => i % 2 === 1);
  for (const block of txBlocks) {
    const get = (tag) => { const m = block.match(new RegExp(`<${tag}>([^<\r\n]+)`, 'i')); return m ? m[1].trim() : ''; };
    const dtRaw = get('DTPOSTED') || get('DTUSER');
    if (!dtRaw) continue;
    // OFX dates: YYYYMMDD[HHMMSS[...]]
    const dateStr = dtRaw.length >= 8 ? `${dtRaw.slice(0,4)}-${dtRaw.slice(4,6)}-${dtRaw.slice(6,8)}` : dtRaw;
    const amount = parseFloat(get('TRNAMT')) || 0;
    rows.push({
      transaction_date: dateStr,
      description: get('NAME') || get('MEMO') || get('TRNTYPE'),
      amount,
      running_balance: null,
    });
  }
  return rows;
}

// Run matching engine on newly imported rows
function _runMatchingEngine(db, bankAccountId, txIds) {
  const learned = db.prepare(`SELECT * FROM bank_match_learned ORDER BY match_count DESC`).all();
  const learnedMap = {};
  for (const l of learned) learnedMap[l.description_pattern] = l;

  for (const txId of txIds) {
    const tx = db.prepare(`SELECT * FROM bank_transactions WHERE id=?`).get(txId);
    if (!tx) continue;

    const normDesc = _normDescription(tx.description);

    // Check learned rules — auto-match if count >= 3 and amount/date are within window
    const rule = learnedMap[normDesc];
    if (rule && rule.match_count >= 3) {
      db.prepare(`UPDATE bank_transactions SET match_status='suggested', coa_account_id=? WHERE id=?`)
        .run(rule.coa_account_id, txId);
      continue;
    }

    // Partial description match against learned rules
    for (const [pattern, lrule] of Object.entries(learnedMap)) {
      if (normDesc.includes(pattern) || pattern.includes(normDesc)) {
        db.prepare(`UPDATE bank_transactions SET match_status='suggested', coa_account_id=? WHERE id=?`)
          .run(lrule.coa_account_id, txId);
        break;
      }
    }
  }
}

function bankStatementImport({ bankAccountId, fileText, fileName, fileType, periodStart, periodEnd, endingBalance }) {
  const db = getDb();
  const fileHash = _sha256(fileText);

  // Duplicate file check
  const existing = db.prepare(`SELECT id FROM bank_statements WHERE source_file_hash=? AND bank_account_id=?`).get(fileHash, bankAccountId);
  if (existing) throw new Error('Ce relevé semble déjà importé (fichier identique).');

  // Parse
  const account = db.prepare(`SELECT * FROM bank_accounts WHERE id=?`).get(bankAccountId);
  if (!account) throw new Error('Compte bancaire introuvable');
  const savedMap = account.csv_column_map ? JSON.parse(account.csv_column_map) : null;

  let rows = [];
  const ft = (fileType || '').toLowerCase();
  if (ft === 'ofx' || ft === 'qfx' || ft === 'qbo') {
    rows = _parseBankOFX(fileText);
  } else {
    rows = _parseBankCSV(fileText, savedMap);
  }

  if (!rows.length) throw new Error('Aucune transaction trouvée dans le fichier.');

  const start = periodStart || rows.reduce((mn, r) => r.transaction_date < mn ? r.transaction_date : mn, rows[0].transaction_date);
  const end   = periodEnd   || rows.reduce((mx, r) => r.transaction_date > mx ? r.transaction_date : mx, rows[0].transaction_date);
  const endBal = endingBalance !== undefined ? endingBalance : (rows[rows.length - 1].running_balance || 0);

  return db.transaction(() => {
    const { lastInsertRowid: stmtId } = db.prepare(
      `INSERT INTO bank_statements (bank_account_id, period_start, period_end, ending_balance, source_file_hash)
       VALUES (?, ?, ?, ?, ?)`
    ).run(bankAccountId, start, end, endBal, fileHash);

    let autoMatched = 0, suggested = 0, unmatched = 0, duplicateRows = 0;
    const newTxIds = [];

    for (const row of rows) {
      // Per-row dedupe: same account + date + amount + description
      const dupe = db.prepare(
        `SELECT id FROM bank_transactions WHERE bank_account_id=? AND transaction_date=? AND amount=? AND description=?`
      ).get(bankAccountId, row.transaction_date, row.amount, row.description);
      if (dupe) { duplicateRows++; continue; }

      const { lastInsertRowid: txId } = db.prepare(
        `INSERT INTO bank_transactions (bank_account_id, bank_statement_id, transaction_date, description, amount, running_balance)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(bankAccountId, stmtId, row.transaction_date, row.description, row.amount, row.running_balance || null);
      newTxIds.push(txId);
    }

    // Run matching engine
    _runMatchingEngine(db, bankAccountId, newTxIds);

    // Count results
    for (const txId of newTxIds) {
      const tx = db.prepare(`SELECT match_status FROM bank_transactions WHERE id=?`).get(txId);
      if (tx.match_status === 'matched') autoMatched++;
      else if (tx.match_status === 'suggested') suggested++;
      else unmatched++;
    }

    return { statementId: stmtId, rowCount: newTxIds.length, autoMatched, suggested, unmatched, duplicateRows };
  })();
}

function bankTransactionsList(bankAccountId, { dateFrom, dateTo, statusFilter, limit = 500 } = {}) {
  const db = getDb();
  const conds = ['bt.bank_account_id=?'];
  const params = [bankAccountId];
  if (dateFrom) { conds.push('bt.transaction_date>=?'); params.push(dateFrom); }
  if (dateTo)   { conds.push('bt.transaction_date<=?'); params.push(dateTo); }
  if (statusFilter && statusFilter !== 'all') { conds.push('bt.match_status=?'); params.push(statusFilter); }
  params.push(limit);
  return db.prepare(`
    SELECT bt.*, ca.account_number, ca.name_fr AS coa_name_fr
    FROM bank_transactions bt
    LEFT JOIN chart_of_accounts ca ON ca.id = bt.coa_account_id
    WHERE ${conds.join(' AND ')}
    ORDER BY bt.transaction_date DESC, bt.id DESC
    LIMIT ?
  `).all(...params);
}

function bankTransactionMatch(txId, entityType, entityId) {
  getDb().prepare(
    `UPDATE bank_transactions SET match_status='matched', matched_entity_type=?, matched_entity_id=? WHERE id=?`
  ).run(entityType, entityId, txId);
  return true;
}

function bankTransactionUnmatch(txId) {
  getDb().prepare(
    `UPDATE bank_transactions SET match_status='unmatched', matched_entity_type=NULL, matched_entity_id=NULL, coa_account_id=NULL WHERE id=?`
  ).run(txId);
  return true;
}

function bankTransactionCategorize(txId, coaAccountId, notes) {
  const db = getDb();
  db.prepare(
    `UPDATE bank_transactions SET match_status='manual', coa_account_id=?, notes=? WHERE id=?`
  ).run(coaAccountId, notes || null, txId);

  // Learn pattern: increment or insert
  const tx = db.prepare(`SELECT * FROM bank_transactions WHERE id=?`).get(txId);
  if (tx) {
    const norm = _normDescription(tx.description);
    db.prepare(
      `INSERT INTO bank_match_learned (description_pattern, coa_account_id, match_count, last_used_at)
       VALUES (?, ?, 1, CURRENT_TIMESTAMP)
       ON CONFLICT(description_pattern, coa_account_id) DO UPDATE SET match_count=match_count+1, last_used_at=CURRENT_TIMESTAMP`
    ).run(norm, coaAccountId);
  }
  return true;
}

function bankReconcilePreview(bankAccountId, asOfDate) {
  const db = getDb();
  const account = db.prepare(`SELECT * FROM bank_accounts WHERE id=?`).get(bankAccountId);
  if (!account) throw new Error('Compte introuvable');

  const lastStmt = db.prepare(
    `SELECT * FROM bank_statements WHERE bank_account_id=? ORDER BY period_end DESC LIMIT 1`
  ).get(bankAccountId);

  const statementBalance = lastStmt ? lastStmt.ending_balance : account.opening_balance;

  const sumRow = db.prepare(
    `SELECT COALESCE(SUM(amount),0) AS total FROM bank_transactions
     WHERE bank_account_id=? AND (reconciled=1 OR match_status IN ('matched','manual'))
     AND transaction_date <= ?`
  ).get(bankAccountId, asOfDate || new Date().toISOString().slice(0,10));
  const biqBalance = account.opening_balance + (sumRow ? sumRow.total : 0);

  const unreconciledCount = db.prepare(
    `SELECT COUNT(*) AS cnt FROM bank_transactions
     WHERE bank_account_id=? AND reconciled=0 AND match_status='unmatched'`
  ).get(bankAccountId).cnt;

  return {
    statementBalance,
    biqBalance,
    ecart: parseFloat((statementBalance - biqBalance).toFixed(2)),
    unreconciledCount,
  };
}

function bankReconcileClose(bankAccountId, statementId) {
  const db = getDb();
  const stmt = db.prepare(`SELECT * FROM bank_statements WHERE id=? AND bank_account_id=?`).get(statementId, bankAccountId);
  if (!stmt) throw new Error('Relevé introuvable');
  if (stmt.reconciled) throw new Error('Relevé déjà réconcilié');

  const preview = bankReconcilePreview(bankAccountId, stmt.period_end);
  if (Math.abs(preview.ecart) > 0.02) {
    return { success: false, ecart: preview.ecart, message: `Écart de ${preview.ecart.toFixed(2)} $ — réconciliez toutes les transactions avant de clôturer.` };
  }

  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(`UPDATE bank_statements SET reconciled=1, reconciled_at=? WHERE id=?`).run(now, statementId);
    db.prepare(
      `UPDATE bank_transactions SET reconciled=1
       WHERE bank_account_id=? AND transaction_date<=? AND match_status IN ('matched','manual','suggested')`
    ).run(bankAccountId, stmt.period_end);
  })();

  return { success: true, ecart: 0 };
}

function bankReconcileReopen(bankAccountId, statementId, reason) {
  const db = getDb();
  db.prepare(`UPDATE bank_statements SET reconciled=0, reconciled_at=NULL WHERE id=? AND bank_account_id=?`).run(statementId, bankAccountId);
  db.prepare(
    `UPDATE bank_transactions SET reconciled=0
     WHERE bank_account_id=? AND bank_statement_id=?`
  ).run(bankAccountId, statementId);
  db.prepare(
    `INSERT INTO audit_log (device_id, module, action, record_type, record_id, reason)
     VALUES (?, 'bank', 'reopen_reconciliation', 'bank_statement', ?, ?)`
  ).run(getDeviceId(), String(statementId), reason || null);
  return true;
}

function bankLearnedRulesList() {
  return getDb().prepare(`
    SELECT bml.*, ca.account_number, ca.name_fr AS coa_name_fr
    FROM bank_match_learned bml
    LEFT JOIN chart_of_accounts ca ON ca.id = bml.coa_account_id
    ORDER BY bml.match_count DESC
  `).all();
}

function bankLearnedRuleDelete(id) {
  getDb().prepare(`DELETE FROM bank_match_learned WHERE id=?`).run(id);
  return true;
}

function bankStatementsList(bankAccountId) {
  return getDb().prepare(
    `SELECT * FROM bank_statements WHERE bank_account_id=? ORDER BY period_end DESC`
  ).all(bankAccountId);
}

// ── CTI/RTI INPUT TAX CREDITS ─────────────────────────────────────────────────

function _dayVenteNet(dayData) {
  if (!dayData?.cashes) return 0;
  return dayData.cashes.reduce((s, c) => {
    if (c.finalCash != null && c.float != null) {
      return s + (c.interac || 0) + (c.livraisons || 0) + (c.deposits || 0) + (c.finalCash || 0) - (c.float || 0);
    }
    return s;
  }, 0);
}

function _monthsInRange(periodStart, periodEnd) {
  const months = [];
  const [sy, sm] = periodStart.split('-').map(Number);
  const [ey, em] = periodEnd.split('-').map(Number);
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

function taxPeriodCompute(periodStart, periodEnd) {
  const db = getDb();
  const months = _monthsInRange(periodStart, periodEnd);

  // Load daily data once
  let liveData = {};
  try {
    const r = db.prepare(`SELECT value FROM kv_store WHERE key='dicann-v7'`).get();
    if (r?.value) liveData = JSON.parse(r.value);
  } catch (_) {}

  let tpsCollected = 0, tvqCollected = 0, tpsCti = 0, tvqRti = 0;
  const billIds = [];

  for (const month of months) {
    const [my, mm] = month.split('-');
    const daysInMonth = new Date(parseInt(my), parseInt(mm), 0).getDate();

    // Revenue from daily POS data
    let monthRev = 0;
    let plData = {};
    try {
      const r = db.prepare(`SELECT value FROM kv_store WHERE key=?`).get(`dicann-pl-${month}`);
      if (r?.value) plData = JSON.parse(r.value);
    } catch (_) {}

    if (plData._revenueOverride != null) {
      monthRev = plData._revenueOverride;
    } else {
      for (let d = 1; d <= daysInMonth; d++) {
        const key = `${my}-${mm}-${String(d).padStart(2, '0')}`;
        monthRev += _dayVenteNet(liveData[key]);
      }
    }

    tpsCollected += monthRev * 0.05;
    tvqCollected += monthRev * 0.09975;

    // CTI/RTI from bill entries with tax fields
    const allKeys = Object.keys(plData);
    for (const key of allKeys) {
      if (!key.endsWith('_bills')) continue;
      const bills = plData[key];
      if (!Array.isArray(bills)) continue;
      for (const bill of bills) {
        const tps = parseFloat(bill.tps_paid) || 0;
        const tvq = parseFloat(bill.tvq_paid) || 0;
        const pct = (parseFloat(bill.business_use_pct) || 100) / 100;
        if (tps > 0 || tvq > 0) {
          tpsCti += tps * pct;
          tvqRti += tvq * pct;
          billIds.push(`${month}/${key}/${bill.id}`);
        }
      }
    }
  }

  const netTpsOwed = tpsCollected - tpsCti;
  const netTvqOwed = tvqCollected - tvqRti;

  // Check for suspense blockers
  const suspenseCount = db.prepare(
    `SELECT COUNT(*) AS cnt FROM bank_transactions
     WHERE coa_account_id IS NOT NULL AND tax_claimable = 0
       AND match_status IN ('manual','suggested') AND reconciled = 0`
  ).get().cnt;

  // Log calculation
  const now = new Date().toISOString();
  const logStmt = db.prepare(
    `INSERT INTO tax_calc_log (tax_period_id, calculation_type, formula_version, input_snapshot, result, calculated_at)
     VALUES (NULL, ?, 'v1.0-2026', ?, ?, ?)`
  );
  db.transaction(() => {
    logStmt.run('tps_collected', JSON.stringify({ months, method: 'revenue_pct' }), tpsCollected, now);
    logStmt.run('tvq_collected', JSON.stringify({ months, method: 'revenue_pct' }), tvqCollected, now);
    logStmt.run('cti', JSON.stringify({ months, billIds }), tpsCti, now);
    logStmt.run('rti', JSON.stringify({ months, billIds }), tvqRti, now);
  })();

  return {
    tpsCollected, tvqCollected, tpsCti, tvqRti,
    netTpsOwed, netTvqOwed,
    suspenseCount,
    billCount: billIds.length,
    months,
    blockers: suspenseCount > 0
      ? [{ type: 'suspense', count: suspenseCount }]
      : [],
  };
}

function taxPeriodSave(data) {
  const db = getDb();
  const {
    id, periodType = 'quarterly', periodStart, periodEnd,
    tpsCollected = 0, tvqCollected = 0, tpsCti = 0, tvqRti = 0,
    netTpsOwed = 0, netTvqOwed = 0, notes = null,
  } = data;

  if (id) {
    db.prepare(
      `UPDATE tax_periods SET tps_collected=?, tvq_collected=?, tps_cti=?, tvq_rti=?,
       net_tps_owed=?, net_tvq_owed=?, notes=? WHERE id=?`
    ).run(tpsCollected, tvqCollected, tpsCti, tvqRti, netTpsOwed, netTvqOwed, notes, id);
    return db.prepare(`SELECT * FROM tax_periods WHERE id=?`).get(id);
  }

  const { lastInsertRowid } = db.prepare(
    `INSERT INTO tax_periods (period_type, period_start, period_end, tps_collected, tvq_collected,
     tps_cti, tvq_rti, net_tps_owed, net_tvq_owed, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`
  ).run(periodType, periodStart, periodEnd, tpsCollected, tvqCollected, tpsCti, tvqRti, netTpsOwed, netTvqOwed, notes);

  return db.prepare(`SELECT * FROM tax_periods WHERE id=?`).get(lastInsertRowid);
}

function taxPeriodMarkFiled(id, confirmationNumber, paidAmount) {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE tax_periods SET status='filed', filed_at=?, confirmation_number=?, paid_at=? WHERE id=?`
  ).run(now, confirmationNumber || null, paidAmount != null ? now : null, id);
  db.prepare(
    `INSERT INTO audit_log (device_id, module, action, record_type, record_id, reason)
     VALUES (?, 'tax', 'period_filed', 'tax_period', ?, ?)`
  ).run(getDeviceId(), String(id), confirmationNumber || null);
  return db.prepare(`SELECT * FROM tax_periods WHERE id=?`).get(id);
}

function taxPeriodList() {
  return getDb().prepare(`SELECT * FROM tax_periods ORDER BY period_end DESC`).all();
}

function taxSuspenseList(opts = {}) {
  const { dateFrom, dateTo } = opts;
  let where = `coa_account_id IS NOT NULL AND tax_claimable = 0 AND match_status IN ('manual','suggested')`;
  const params = [];
  if (dateFrom) { where += ` AND transaction_date >= ?`; params.push(dateFrom); }
  if (dateTo)   { where += ` AND transaction_date <= ?`; params.push(dateTo); }
  return getDb().prepare(
    `SELECT bt.*, ca.account_number, ca.name_fr AS coa_name_fr
     FROM bank_transactions bt
     LEFT JOIN chart_of_accounts ca ON ca.id = bt.coa_account_id
     WHERE ${where}
     ORDER BY bt.transaction_date DESC`
  ).all(...params);
}

function taxSuspenseClassifyAsCashExpense(bankTxId, coaAccountId, reason) {
  const db = getDb();
  db.prepare(
    `UPDATE bank_transactions SET tax_claimable = 0, coa_account_id = ?, notes = ? WHERE id=?`
  ).run(coaAccountId, reason || null, bankTxId);
  db.prepare(
    `INSERT INTO audit_log (device_id, module, action, record_type, record_id, reason)
     VALUES (?, 'tax', 'classify_cash_expense', 'bank_transaction', ?, ?)`
  ).run(getDeviceId(), String(bankTxId), reason || null);
  return true;
}

function taxSuspenseReverseCategorization(bankTxId) {
  const db = getDb();
  db.prepare(
    `UPDATE bank_transactions SET coa_account_id = NULL, match_status = 'unmatched', tax_claimable = 0 WHERE id=?`
  ).run(bankTxId);
  return true;
}

function taxProfileList() {
  return getDb().prepare(`SELECT * FROM supplier_tax_profiles ORDER BY supplier_name`).all();
}

function taxProfileUpsert(data) {
  const db = getDb();
  const { id, supplierName, tpsRate = 0.05, tvqRate = 0.09975, appliesTps = 1, appliesTvq = 1, notes = null } = data;
  if (id) {
    db.prepare(
      `UPDATE supplier_tax_profiles SET supplier_name=?, tps_rate=?, tvq_rate=?, applies_tps=?, applies_tvq=?, notes=? WHERE id=?`
    ).run(supplierName, tpsRate, tvqRate, appliesTps ? 1 : 0, appliesTvq ? 1 : 0, notes, id);
    return db.prepare(`SELECT * FROM supplier_tax_profiles WHERE id=?`).get(id);
  }
  const { lastInsertRowid } = db.prepare(
    `INSERT OR REPLACE INTO supplier_tax_profiles (supplier_name, tps_rate, tvq_rate, applies_tps, applies_tvq, notes)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(supplierName, tpsRate, tvqRate, appliesTps ? 1 : 0, appliesTvq ? 1 : 0, notes);
  return db.prepare(`SELECT * FROM supplier_tax_profiles WHERE id=?`).get(lastInsertRowid);
}

function taxProfileDelete(id) {
  getDb().prepare(`DELETE FROM supplier_tax_profiles WHERE id=?`).run(id);
  return true;
}

// ── Supplier Bills (Relational AP) ────────────────────────────────────────────

function supplierBillList({ monthKey = null, paid = null, supplierId = null } = {}) {
  const db = getDb();
  const conds = [];
  const params = [];
  if (monthKey) { conds.push('month_key=?'); params.push(monthKey); }
  if (paid !== null) { conds.push('paid=?'); params.push(paid ? 1 : 0); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  return db.prepare(`SELECT * FROM supplier_bills ${where} ORDER BY bill_date DESC, id DESC`).all(...params);
}

function supplierBillCreate(data) {
  const db = getDb();
  const {
    month_key, supplier_name, category = null, amount, bill_date = null, note = '',
    bill_id = null, amount_before_tax = null, tps_paid = 0, tvq_paid = 0,
    coa_account_id = null, business_use_pct = 100.0, invoice_number = null,
    due_date = null,
  } = data;
  const { lastInsertRowid } = db.prepare(
    `INSERT INTO supplier_bills (month_key, supplier_name, category, amount, bill_date, note, bill_id,
       amount_before_tax, tps_paid, tvq_paid, coa_account_id, business_use_pct, invoice_number, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(month_key, supplier_name, category, amount, bill_date, note, bill_id || null,
        amount_before_tax, tps_paid, tvq_paid, coa_account_id, business_use_pct, invoice_number, due_date);
  return db.prepare(`SELECT * FROM supplier_bills WHERE id=?`).get(lastInsertRowid);
}

function supplierBillUpdate(id, data) {
  const db = getDb();
  const allowed = ['supplier_name','category','amount','bill_date','note','amount_before_tax',
    'tps_paid','tvq_paid','coa_account_id','business_use_pct','invoice_number','due_date','journal_entry_id'];
  const sets = [];
  const params = [];
  for (const k of allowed) {
    if (data[k] !== undefined) { sets.push(`${k}=?`); params.push(data[k]); }
  }
  if (!sets.length) throw new Error('Aucun champ a mettre a jour');
  params.push(id);
  db.prepare(`UPDATE supplier_bills SET ${sets.join(',')} WHERE id=?`).run(...params);
  return db.prepare(`SELECT * FROM supplier_bills WHERE id=?`).get(id);
}

function supplierBillMarkPaid(id, { payment_date, payment_method = null, bank_transaction_id = null } = {}) {
  const db = getDb();
  db.prepare(
    `UPDATE supplier_bills SET paid=1, payment_date=?, payment_method=?, bank_transaction_id=? WHERE id=?`
  ).run(payment_date || new Date().toISOString().slice(0, 10), payment_method, bank_transaction_id, id);
  return db.prepare(`SELECT * FROM supplier_bills WHERE id=?`).get(id);
}

function supplierBillMarkUnpaid(id) {
  const db = getDb();
  db.prepare(`UPDATE supplier_bills SET paid=0, payment_date=NULL, payment_method=NULL, bank_transaction_id=NULL WHERE id=?`).run(id);
  return db.prepare(`SELECT * FROM supplier_bills WHERE id=?`).get(id);
}

function supplierPaymentsList(billId) {
  return getDb().prepare(`SELECT * FROM supplier_payments WHERE supplier_bill_id=? ORDER BY payment_date ASC`).all(billId);
}

function supplierPaymentCreate(data) {
  const db = getDb();
  const { supplier_bill_id, amount, payment_date, payment_method = null, reference = null, notes = null } = data;
  const { lastInsertRowid } = db.prepare(
    `INSERT INTO supplier_payments (supplier_bill_id, amount, payment_date, payment_method, reference, notes)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(supplier_bill_id, amount, payment_date, payment_method, reference, notes);
  return db.prepare(`SELECT * FROM supplier_payments WHERE id=?`).get(lastInsertRowid);
}

// ── Assets & CCA ─────────────────────────────────────────────────────────────

function assetList({ includeArchived = false } = {}) {
  const db = getDb();
  const where = includeArchived ? '' : 'WHERE is_archived=0';
  return db.prepare(`SELECT a.*, c.account_number, c.name_fr AS coa_name_fr FROM assets a
    LEFT JOIN chart_of_accounts c ON c.id=a.coa_account_id ${where} ORDER BY a.acquisition_date ASC`).all();
}

function assetCreate(data) {
  const db = getDb();
  const { name, coa_account_id, cca_class, acquisition_date, acquisition_cost, personal_use_pct = 0, disposal_date = null, disposal_proceeds = null, notes = null } = data;
  const { lastInsertRowid } = db.prepare(
    `INSERT INTO assets (name, coa_account_id, cca_class, acquisition_date, acquisition_cost, personal_use_pct, disposal_date, disposal_proceeds, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(name, coa_account_id, cca_class, acquisition_date, acquisition_cost, personal_use_pct, disposal_date, disposal_proceeds, notes);
  return db.prepare(`SELECT * FROM assets WHERE id=?`).get(lastInsertRowid);
}

function assetUpdate(id, data) {
  const db = getDb();
  const allowed = ['name','coa_account_id','cca_class','acquisition_date','acquisition_cost','personal_use_pct','disposal_date','disposal_proceeds','notes'];
  const sets = [];
  const params = [];
  for (const k of allowed) {
    if (data[k] !== undefined) { sets.push(`${k}=?`); params.push(data[k]); }
  }
  if (!sets.length) throw new Error('Aucun champ a mettre a jour');
  params.push(id);
  db.prepare(`UPDATE assets SET ${sets.join(',')} WHERE id=?`).run(...params);
  return db.prepare(`SELECT * FROM assets WHERE id=?`).get(id);
}

function assetDelete(id) {
  getDb().prepare(`UPDATE assets SET is_archived=1 WHERE id=?`).run(id);
  return true;
}

function ccaClassesList() {
  return getDb().prepare(`SELECT * FROM cca_class_rates ORDER BY class ASC`).all();
}

function _ccaCompute(asset, ccaClass, fiscalYear) {
  const acqYear = new Date(asset.acquisition_date).getFullYear();
  const businessPct = (100 - (asset.personal_use_pct || 0)) / 100;

  // Compute UCC at start of fiscalYear by replaying all prior years
  let ucc = asset.acquisition_cost;
  for (let y = acqYear; y < fiscalYear; y++) {
    const isFirstYear = (y === acqYear);
    const additionsThisYear = isFirstYear ? asset.acquisition_cost : 0;
    const claim = _ccaClaimForYear(ccaClass, ucc, additionsThisYear, isFirstYear, asset.disposal_date ? new Date(asset.disposal_date).getFullYear() : null, y, asset.acquisition_date);
    ucc = ucc - claim;
    if (ucc < 0) ucc = 0;
  }

  // If already disposed before this fiscal year, no claim
  if (asset.disposal_date && new Date(asset.disposal_date).getFullYear() < fiscalYear) {
    return null;
  }

  const isFirstYear = (acqYear === fiscalYear);
  const additions = isFirstYear ? asset.acquisition_cost : 0;
  const disposalYear = asset.disposal_date ? new Date(asset.disposal_date).getFullYear() : null;
  const rawClaim = _ccaClaimForYear(ccaClass, ucc, additions, isFirstYear, disposalYear, fiscalYear, asset.acquisition_date);
  const claim = rawClaim * businessPct;
  return {
    asset_id: asset.id,
    fiscal_year: fiscalYear,
    ucc_opening: isFirstYear ? 0 : ucc,
    additions,
    disposals: disposalYear === fiscalYear ? (asset.disposal_proceeds || 0) : 0,
    cca_claimed: Math.round(claim * 100) / 100,
    ucc_closing: Math.round((ucc - claim) * 100) / 100,
    formula_version: 'v1.0-2026',
  };
}

function _ccaClaimForYear(ccaClass, uccOpening, additions, isFirstYear, disposalYear, fiscalYear, acquisitionDate) {
  if (ccaClass.method === 'full_year') {
    return isFirstYear ? additions : 0;
  }
  if (ccaClass.method === 'straight_line') {
    // Straight-line: divide cost by term (default 5 years for leasehold if no term given)
    const term = 5;
    return additions ? additions / term : uccOpening / Math.max(1, term - (fiscalYear - new Date(acquisitionDate).getFullYear()));
  }
  // Declining balance
  const rate = ccaClass.rate || 0;
  const uccForCalc = uccOpening + (isFirstYear ? additions * 0.5 : 0); // half-year rule applies to net additions in first year
  return uccForCalc * rate;
}

function ccaComputeForAsset(assetId, fiscalYear) {
  const db = getDb();
  const asset = db.prepare(`SELECT * FROM assets WHERE id=?`).get(assetId);
  if (!asset) throw new Error('Immobilisation introuvable');
  const ccaClass = db.prepare(`SELECT * FROM cca_class_rates WHERE class=?`).get(asset.cca_class);
  if (!ccaClass) throw new Error(`Classe DPA ${asset.cca_class} introuvable`);
  return _ccaCompute(asset, ccaClass, fiscalYear);
}

function ccaScheduleForYear(fiscalYear) {
  const db = getDb();
  const assets = db.prepare(`SELECT * FROM assets WHERE is_archived=0 AND strftime('%Y', acquisition_date) <= ?`).all(String(fiscalYear));
  const classes = {};
  db.prepare(`SELECT * FROM cca_class_rates`).all().forEach(c => { classes[c.class] = c; });
  return assets.map(asset => {
    const ccaClass = classes[asset.cca_class];
    if (!ccaClass) return null;
    return _ccaCompute(asset, ccaClass, fiscalYear);
  }).filter(Boolean);
}

// ── Balance Sheet ─────────────────────────────────────────────────────────────

const BS_CURRENT_ASSET_MAX   = '1499';
const BS_LONGT_ASSET_MIN     = '1500';
const BS_CURRENT_LIAB_MAX    = '2399';
const BS_CURRENT_LIAB_MIN    = '2000';
const BS_LONGT_LIAB_MIN      = '2400';
const BS_LONGT_LIAB_MAX      = '2499';
const BS_EQUITY_MIN          = '3000';
const BS_EQUITY_MAX          = '3999';

function buildBalanceSheet(asOfDate, { locationId = null } = {}) {
  const db = getDb();
  const params = [asOfDate];
  const locCond = locationId != null ? '(je.location_id IS ? OR je.location_id=?)' : '1=1';
  if (locationId != null) params.push(locationId, locationId);

  const rows = db.prepare(
    `SELECT coa.id AS account_id, coa.account_number, coa.name_fr, coa.name_en, coa.type, coa.is_contra,
            SUM(jl.debit_cents) AS total_debit_cents, SUM(jl.credit_cents) AS total_credit_cents
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.entry_id AND je.status='posted' AND je.entry_date <= ?
     JOIN chart_of_accounts coa ON coa.id = jl.account_id
     WHERE ${locCond}
     GROUP BY jl.account_id
     ORDER BY coa.account_number ASC`
  ).all(...params).map(r => ({
    ...r,
    balance_cents: r.total_debit_cents - r.total_credit_cents,
  }));

  const currentAssets  = [];
  const longTermAssets = [];
  const currentLiab    = [];
  const longTermLiab   = [];
  const equityAccounts = [];
  let revenueCents = 0;
  let expenseCents = 0;

  for (const r of rows) {
    const num = r.account_number;
    if (r.type === 'asset') {
      if (num >= BS_CURRENT_ASSET_MAX) {
        longTermAssets.push(r);
      } else {
        currentAssets.push(r);
      }
    } else if (r.type === 'liability') {
      if (num >= BS_LONGT_LIAB_MIN && num <= BS_LONGT_LIAB_MAX) {
        longTermLiab.push(r);
      } else {
        currentLiab.push(r);
      }
    } else if (r.type === 'equity') {
      equityAccounts.push(r);
    } else if (r.type === 'revenue') {
      revenueCents += r.balance_cents;
    } else if (r.type === 'expense' || r.type === 'cogs') {
      expenseCents += r.balance_cents;
    }
  }

  const toAmount = cents => Math.round(cents) / 100;

  const sumBalances = arr => arr.reduce((s, r) => s + r.balance_cents, 0);

  const totalCurrentAssetsCents  = sumBalances(currentAssets);
  const totalLongTermAssetsCents = sumBalances(longTermAssets);
  const totalAssetsCents         = totalCurrentAssetsCents + totalLongTermAssetsCents;

  const totalCurrentLiabCents  = -sumBalances(currentLiab);
  const totalLongTermLiabCents = -sumBalances(longTermLiab);
  const totalLiabCents         = totalCurrentLiabCents + totalLongTermLiabCents;

  const totalEquityCents = -sumBalances(equityAccounts);
  // net_income: revenue is CR (negative balance_cents), expenses are DR (positive balance_cents)
  // net income = -revenueCents - expenseCents ... wait
  // revenue balance_cents < 0 (credit balances), expense balance_cents > 0 (debit balances)
  // net_income = revenue - expenses = (-revenueCents) - expenseCents
  const netIncomeCents   = (-revenueCents) - expenseCents;
  const totalCapitauxCents = totalEquityCents + netIncomeCents;

  const trialBalanceCheck = rows.reduce((s, r) => s + r.balance_cents, 0);
  const isBalanced = trialBalanceCheck === 0;

  const blockers = getBalanceSheetBlockers(asOfDate, db);

  return {
    asOfDate,
    isBalanced,
    trialBalanceDiff: trialBalanceCheck,
    status: (isBalanced && blockers.length === 0) ? 'final' : 'draft',
    blockers,
    sections: {
      currentAssets:  { accounts: currentAssets.map(r => ({ account_number: r.account_number, name_fr: r.name_fr, name_en: r.name_en, is_contra: r.is_contra, balance: toAmount(r.balance_cents) })), total: toAmount(totalCurrentAssetsCents) },
      longTermAssets: { accounts: longTermAssets.map(r => ({ account_number: r.account_number, name_fr: r.name_fr, name_en: r.name_en, is_contra: r.is_contra, balance: toAmount(r.balance_cents) })), total: toAmount(totalLongTermAssetsCents) },
      totalAssets: toAmount(totalAssetsCents),
      currentLiab:   { accounts: currentLiab.map(r => ({ account_number: r.account_number, name_fr: r.name_fr, name_en: r.name_en, balance: toAmount(-r.balance_cents) })), total: toAmount(totalCurrentLiabCents) },
      longTermLiab:  { accounts: longTermLiab.map(r => ({ account_number: r.account_number, name_fr: r.name_fr, name_en: r.name_en, balance: toAmount(-r.balance_cents) })), total: toAmount(totalLongTermLiabCents) },
      totalLiabilities: toAmount(totalLiabCents),
      equity:        { accounts: equityAccounts.map(r => ({ account_number: r.account_number, name_fr: r.name_fr, name_en: r.name_en, balance: toAmount(-r.balance_cents) })), netIncome: toAmount(netIncomeCents), total: toAmount(totalCapitauxCents) },
      totalLiabAndEquity: toAmount(totalLiabCents + totalCapitauxCents),
    },
  };
}

function getBalanceSheetBlockers(asOfDate, _db) {
  const db = _db || getDb();
  const blockers = [];

  // 1. Draft journal entries in or before the period
  const draftCount = db.prepare(
    `SELECT COUNT(*) AS cnt FROM journal_entries WHERE status='draft' AND entry_date <= ?`
  ).get(asOfDate);
  if (draftCount.cnt > 0) {
    blockers.push({ type: 'draft_entries', count: draftCount.cnt, label_fr: `${draftCount.cnt} ecriture(s) en brouillon`, label_en: `${draftCount.cnt} draft journal entr${draftCount.cnt === 1 ? 'y' : 'ies'}` });
  }

  // 2. No opening balance entry posted
  const ob = db.prepare(`SELECT id FROM journal_entries WHERE source_type='opening_balance' AND status='posted'`).get();
  if (!ob) {
    blockers.push({ type: 'no_opening_balance', label_fr: 'Solde d\'ouverture non comptabilise', label_en: 'Opening balance not posted' });
  }

  // 3. Bank accounts with unreconciled statements in the period
  try {
    const unreconciled = db.prepare(
      `SELECT COUNT(*) AS cnt FROM bank_statements WHERE reconciled=0 AND period_end <= ?`
    ).get(asOfDate);
    if (unreconciled.cnt > 0) {
      blockers.push({ type: 'unreconciled_statements', count: unreconciled.cnt, label_fr: `${unreconciled.cnt} releve(s) bancaire(s) non rapproche(s)`, label_en: `${unreconciled.cnt} unreconciled bank statement${unreconciled.cnt === 1 ? '' : 's'}` });
    }
  } catch (_) {}

  // 4. Unpaid supplier bills (AP subledger check — informational)
  try {
    const unpaidAp = db.prepare(`SELECT COUNT(*) AS cnt FROM supplier_bills WHERE paid=0 AND due_date IS NOT NULL AND due_date <= ?`).get(asOfDate);
    if (unpaidAp.cnt > 0) {
      blockers.push({ type: 'overdue_ap', count: unpaidAp.cnt, label_fr: `${unpaidAp.cnt} facture(s) fournisseur en souffrance`, label_en: `${unpaidAp.cnt} overdue supplier bill${unpaidAp.cnt === 1 ? '' : 's'}`, blocking: false });
    }
  } catch (_) {}

  return blockers;
}

function balanceSheetSnapshotSave(data) {
  const db = getDb();
  const { snapshot_date, fiscal_year = null, status = 'draft', sections, total_assets_cents = null, total_liabilities_cents = null, total_equity_cents = null } = data;
  const { lastInsertRowid } = db.prepare(
    `INSERT INTO balance_sheet_snapshots (snapshot_date, fiscal_year, status, data, total_assets_cents, total_liabilities_cents, total_equity_cents)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(snapshot_date, fiscal_year, status, JSON.stringify(sections || data), total_assets_cents, total_liabilities_cents, total_equity_cents);
  return db.prepare(`SELECT * FROM balance_sheet_snapshots WHERE id=?`).get(lastInsertRowid);
}

function balanceSheetSnapshotList() {
  return getDb().prepare(`SELECT id, snapshot_date, fiscal_year, status, total_assets_cents, total_liabilities_cents, total_equity_cents, created_at FROM balance_sheet_snapshots ORDER BY snapshot_date DESC`).all();
}

function balanceSheetSnapshotGet(id) {
  const row = getDb().prepare(`SELECT * FROM balance_sheet_snapshots WHERE id=?`).get(id);
  if (row && row.data) { try { row.sections = JSON.parse(row.data); } catch (_) {} }
  return row;
}

// ── Source Document Vault ─────────────────────────────────────────────────────

function vaultAttach({ entity_type, entity_id, file_name, file_path, mime_type, size_bytes, sha256, ocr_text }) {
  const db = getDb();
  const existing = db.prepare(`SELECT id FROM source_documents WHERE sha256=? AND entity_type=? AND entity_id=?`).get(sha256, entity_type, entity_id);
  if (existing) return existing;
  const { lastInsertRowid } = db.prepare(
    `INSERT INTO source_documents (entity_type, entity_id, file_name, file_path, mime_type, size_bytes, sha256, ocr_text)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(entity_type, entity_id, file_name, file_path, mime_type || null, size_bytes || null, sha256, ocr_text || null);
  return db.prepare(`SELECT * FROM source_documents WHERE id=?`).get(lastInsertRowid);
}

function vaultList(entity_type, entity_id) {
  return getDb().prepare(`SELECT * FROM source_documents WHERE entity_type=? AND entity_id=? ORDER BY created_at DESC`).all(entity_type, entity_id);
}

function vaultListAll({ entity_type, year, month, limit = 200, offset = 0 } = {}) {
  const db = getDb();
  const conds = [];
  const vals = [];
  if (entity_type) { conds.push(`entity_type=?`); vals.push(entity_type); }
  if (year)  { conds.push(`strftime('%Y', created_at)=?`); vals.push(String(year)); }
  if (month) { conds.push(`strftime('%m', created_at)=?`); vals.push(String(month).padStart(2,'0')); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT * FROM source_documents ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...vals, limit, offset);
  const total = db.prepare(`SELECT COUNT(*) as c FROM source_documents ${where}`).get(...vals).c;
  return { rows, total };
}

function vaultSearch(query) {
  if (!query || !query.trim()) return [];
  const db = getDb();
  const ftsIds = db.prepare(`SELECT rowid FROM document_search WHERE document_search MATCH ? LIMIT 50`).all(query.trim() + '*');
  if (!ftsIds.length) return [];
  const ids = ftsIds.map(r => r.rowid);
  return db.prepare(`SELECT * FROM source_documents WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at DESC`).all(...ids);
}

function vaultDelete(id) {
  const db = getDb();
  const doc = db.prepare(`SELECT * FROM source_documents WHERE id=?`).get(id);
  if (!doc) return { ok: false, error: 'Not found' };
  db.prepare(`DELETE FROM source_documents WHERE id=?`).run(id);
  return { ok: true, file_path: doc.file_path };
}

function vaultGetOrphans() {
  return getDb().prepare(`SELECT * FROM source_documents WHERE entity_id IS NULL OR entity_id = 0 ORDER BY created_at DESC`).all();
}

function vaultReassign(id, entity_type, entity_id) {
  getDb().prepare(`UPDATE source_documents SET entity_type=?, entity_id=? WHERE id=?`).run(entity_type, entity_id, id);
  return getDb().prepare(`SELECT * FROM source_documents WHERE id=?`).get(id);
}

function vaultGetStats() {
  const db = getDb();
  const stats = db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(size_bytes),0) as total_bytes FROM source_documents`).get();
  const byType = db.prepare(`SELECT entity_type, COUNT(*) as count FROM source_documents GROUP BY entity_type`).all();
  return { ...stats, by_type: byType };
}

// ── Recurring Rules ───────────────────────────────────────────────────────────

function recurringRuleList({ active_only = false } = {}) {
  const where = active_only ? `WHERE is_active=1` : '';
  return getDb().prepare(`SELECT * FROM recurring_rules ${where} ORDER BY next_run_at ASC`).all().map(r => {
    try { r.template = JSON.parse(r.template_json); } catch (_) {}
    return r;
  });
}

function recurringRuleCreate(data) {
  const db = getDb();
  const { rule_type, name, frequency, start_date, end_date, day_of_month, day_of_week, template, auto_approve, next_run_at } = data;
  const { lastInsertRowid } = db.prepare(
    `INSERT INTO recurring_rules (rule_type, name, frequency, start_date, end_date, day_of_month, day_of_week, template_json, auto_approve, next_run_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(rule_type, name, frequency, start_date, end_date || null, day_of_month || null, day_of_week || null,
        JSON.stringify(template || {}), auto_approve ? 1 : 0, next_run_at);
  return db.prepare(`SELECT * FROM recurring_rules WHERE id=?`).get(lastInsertRowid);
}

function recurringRuleUpdate(id, data) {
  const db = getDb();
  const fields = [];
  const vals = [];
  const allowed = ['name', 'frequency', 'start_date', 'end_date', 'day_of_month', 'day_of_week', 'auto_approve', 'next_run_at', 'is_active'];
  for (const k of allowed) {
    if (data[k] !== undefined) { fields.push(`${k}=?`); vals.push(data[k]); }
  }
  if (data.template !== undefined) { fields.push(`template_json=?`); vals.push(JSON.stringify(data.template)); }
  if (!fields.length) return db.prepare(`SELECT * FROM recurring_rules WHERE id=?`).get(id);
  db.prepare(`UPDATE recurring_rules SET ${fields.join(',')} WHERE id=?`).run(...vals, id);
  return db.prepare(`SELECT * FROM recurring_rules WHERE id=?`).get(id);
}

function recurringRuleDeactivate(id) {
  getDb().prepare(`UPDATE recurring_rules SET is_active=0 WHERE id=?`).run(id);
  return { ok: true };
}

function recurringPendingList() {
  const db = getDb();
  const rows = db.prepare(
    `SELECT rg.*, rr.name as rule_name, rr.rule_type, rr.template_json
     FROM recurring_generated rg
     JOIN recurring_rules rr ON rr.id = rg.rule_id
     WHERE rg.status='pending'
     ORDER BY rg.scheduled_for ASC`
  ).all();
  return rows.map(r => {
    try { r.template = JSON.parse(r.template_snapshot || r.template_json); } catch (_) {}
    return r;
  });
}

function recurringApprove(generatedId) {
  const db = getDb();
  db.prepare(`UPDATE recurring_generated SET status='approved', approved_at=datetime('now','localtime') WHERE id=?`).run(generatedId);
  return db.prepare(`SELECT * FROM recurring_generated WHERE id=?`).get(generatedId);
}

function recurringSkip(generatedId) {
  getDb().prepare(`UPDATE recurring_generated SET status='skipped' WHERE id=?`).run(generatedId);
  return { ok: true };
}

function recurringHistoryList(ruleId) {
  return getDb().prepare(
    `SELECT * FROM recurring_generated WHERE rule_id=? ORDER BY scheduled_for DESC LIMIT 50`
  ).all(ruleId);
}

function _computeNextRun(frequency, from, day_of_month, day_of_week) {
  const d = new Date(from);
  switch (frequency) {
    case 'daily':     d.setDate(d.getDate() + 1); break;
    case 'weekly':    d.setDate(d.getDate() + 7); break;
    case 'biweekly':  d.setDate(d.getDate() + 14); break;
    case 'monthly': {
      d.setMonth(d.getMonth() + 1);
      if (day_of_month) { d.setDate(Math.min(day_of_month, new Date(d.getFullYear(), d.getMonth()+1, 0).getDate())); }
      break;
    }
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'annual':    d.setFullYear(d.getFullYear() + 1); break;
    default:          d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().slice(0, 10);
}

function recurringCheckDue(today) {
  const db = getDb();
  const todayStr = today || new Date().toISOString().slice(0, 10);
  const due = db.prepare(`SELECT * FROM recurring_rules WHERE is_active=1 AND next_run_at <= ?`).all(todayStr);
  const fired = [];
  for (const rule of due) {
    if (rule.end_date && todayStr > rule.end_date) {
      db.prepare(`UPDATE recurring_rules SET is_active=0 WHERE id=?`).run(rule.id);
      continue;
    }
    try { rule.template = JSON.parse(rule.template_json); } catch (_) {}
    const { lastInsertRowid } = db.prepare(
      `INSERT INTO recurring_generated (rule_id, scheduled_for, status, template_snapshot)
       VALUES (?,?,?,?)`
    ).run(rule.id, rule.next_run_at, rule.auto_approve ? 'approved' : 'pending', rule.template_json);
    const nextRun = _computeNextRun(rule.frequency, rule.next_run_at, rule.day_of_month, rule.day_of_week);
    db.prepare(`UPDATE recurring_rules SET last_run_at=?, next_run_at=? WHERE id=?`).run(rule.next_run_at, nextRun, rule.id);
    fired.push({ rule_id: rule.id, generated_id: lastInsertRowid, scheduled_for: rule.next_run_at, auto_approved: !!rule.auto_approve });
  }
  return fired;
}

function recurringPendingCount() {
  return getDb().prepare(`SELECT COUNT(*) as c FROM recurring_generated WHERE status='pending'`).get().c;
}

// ── Reminder Ladder ────────────────────────────────────────────────────────────

function _seedDefaultLadderIfEmpty(db) {
  const count = db.prepare(`SELECT COUNT(*) as n FROM reminder_ladder`).get().n;
  if (count > 0) return;
  const ladderId = db.prepare(
    `INSERT INTO reminder_ladder (name, is_default, is_active) VALUES ('Défaut', 1, 1)`
  ).run().lastInsertRowid;
  const steps = [
    { days: 3,  sfr: 'Rappel amical — Facture {numero}',       sen: 'Friendly reminder — Invoice {numero}',
      bfr: 'Bonjour {client_name},\n\nNous vous rappelons que la facture {numero} d\'un montant de {amount_due} est due depuis {days_overdue} jour(s).\n\nMerci de votre règlement rapide.\n\n{company_name}',
      ben: 'Hello {client_name},\n\nThis is a friendly reminder that invoice {numero} for {amount_due} has been due for {days_overdue} day(s).\n\nThank you for your prompt payment.\n\n{company_name}' },
    { days: 7,  sfr: 'Rappel ferme — Facture {numero}',        sen: 'Payment reminder — Invoice {numero}',
      bfr: 'Bonjour {client_name},\n\nNous n\'avons pas encore reçu le paiement de la facture {numero} ({amount_due}), maintenant en retard de {days_overdue} jour(s).\n\nVeuillez procéder au paiement dès que possible.\n\n{company_name}',
      ben: 'Hello {client_name},\n\nWe have not yet received payment for invoice {numero} ({amount_due}), now {days_overdue} day(s) overdue.\n\nPlease arrange payment at your earliest convenience.\n\n{company_name}' },
    { days: 14, sfr: 'Compte en retard — Facture {numero}',    sen: 'Past due — Invoice {numero}',
      bfr: 'Bonjour {client_name},\n\nLa facture {numero} ({amount_due}) est maintenant en retard de {days_overdue} jours. Des intérêts peuvent s\'appliquer conformément à nos conditions.\n\nCommuniquez avec nous pour régulariser la situation.\n\n{company_name}',
      ben: 'Hello {client_name},\n\nInvoice {numero} ({amount_due}) is now {days_overdue} days past due. Interest charges may apply per our terms.\n\nPlease contact us to resolve this matter.\n\n{company_name}' },
    { days: 30, sfr: 'Dernier avis — Facture {numero}',        sen: 'Final notice — Invoice {numero}',
      bfr: 'Bonjour {client_name},\n\nCeci est un dernier avis concernant la facture {numero} ({amount_due}), maintenant en retard de {days_overdue} jours.\n\nSans règlement sous 7 jours, nous devrons transmettre ce dossier à notre service de recouvrement.\n\n{company_name}',
      ben: 'Hello {client_name},\n\nThis is a final notice regarding invoice {numero} ({amount_due}), now {days_overdue} days past due.\n\nIf payment is not received within 7 days, we will refer this matter to collections.\n\n{company_name}' },
    { days: 60, sfr: 'Mise en demeure — Facture {numero}',     sen: 'Collection notice — Invoice {numero}',
      bfr: 'Bonjour {client_name},\n\nMalgré nos rappels précédents, la facture {numero} ({amount_due}) demeure impayée depuis {days_overdue} jours.\n\nCe dossier sera remis à notre service juridique si aucun règlement n\'est effectué d\'ici 5 jours ouvrables.\n\n{company_name}',
      ben: 'Hello {client_name},\n\nDespite previous notices, invoice {numero} ({amount_due}) remains unpaid for {days_overdue} days.\n\nThis matter will be referred to our legal department if payment is not received within 5 business days.\n\n{company_name}' },
  ];
  const ins = db.prepare(
    `INSERT INTO reminder_steps (ladder_id, days_after_due, subject_fr, subject_en, body_fr, body_en, attach_pdf, include_payment_link)
     VALUES (?, ?, ?, ?, ?, ?, 1, 1)`
  );
  for (const s of steps) ins.run(ladderId, s.days, s.sfr, s.sen, s.bfr, s.ben);
}

function reminderLadderList() {
  const db = getDb();
  _seedDefaultLadderIfEmpty(db);
  const ladders = db.prepare(`SELECT * FROM reminder_ladder ORDER BY is_default DESC, name`).all();
  for (const l of ladders) {
    l.steps = db.prepare(`SELECT * FROM reminder_steps WHERE ladder_id=? ORDER BY days_after_due`).all(l.id);
  }
  return ladders;
}

function reminderLadderCreate({ name, isDefault = 0, appliesToClientId = null }) {
  const db = getDb();
  if (isDefault) db.prepare(`UPDATE reminder_ladder SET is_default=0`).run();
  const id = db.prepare(
    `INSERT INTO reminder_ladder (name, is_default, applies_to_client_id, is_active) VALUES (?,?,?,1)`
  ).run(name, isDefault ? 1 : 0, appliesToClientId || null).lastInsertRowid;
  return db.prepare(`SELECT * FROM reminder_ladder WHERE id=?`).get(id);
}

function reminderLadderUpdate(id, { name, isDefault, isActive, appliesToClientId }) {
  const db = getDb();
  if (isDefault) db.prepare(`UPDATE reminder_ladder SET is_default=0`).run();
  const sets = [];
  const vals = [];
  if (name !== undefined) { sets.push('name=?'); vals.push(name); }
  if (isDefault !== undefined) { sets.push('is_default=?'); vals.push(isDefault ? 1 : 0); }
  if (isActive !== undefined) { sets.push('is_active=?'); vals.push(isActive ? 1 : 0); }
  if (appliesToClientId !== undefined) { sets.push('applies_to_client_id=?'); vals.push(appliesToClientId || null); }
  if (sets.length === 0) return;
  vals.push(id);
  db.prepare(`UPDATE reminder_ladder SET ${sets.join(',')} WHERE id=?`).run(...vals);
  return db.prepare(`SELECT * FROM reminder_ladder WHERE id=?`).get(id);
}

function reminderLadderDelete(id) {
  const db = getDb();
  db.prepare(`DELETE FROM reminder_steps WHERE ladder_id=?`).run(id);
  db.prepare(`DELETE FROM reminder_ladder WHERE id=?`).run(id);
  return { ok: true };
}

function reminderStepList(ladderId) {
  return getDb().prepare(`SELECT * FROM reminder_steps WHERE ladder_id=? ORDER BY days_after_due`).all(ladderId);
}

function reminderStepCreate({ ladderId, daysAfterDue, subjectFr, subjectEn, bodyFr, bodyEn, attachPdf = 1, includePaymentLink = 1 }) {
  const db = getDb();
  const id = db.prepare(
    `INSERT INTO reminder_steps (ladder_id, days_after_due, subject_fr, subject_en, body_fr, body_en, attach_pdf, include_payment_link)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(ladderId, daysAfterDue, subjectFr || null, subjectEn || null, bodyFr || null, bodyEn || null, attachPdf ? 1 : 0, includePaymentLink ? 1 : 0).lastInsertRowid;
  return db.prepare(`SELECT * FROM reminder_steps WHERE id=?`).get(id);
}

function reminderStepUpdate(id, { daysAfterDue, subjectFr, subjectEn, bodyFr, bodyEn, attachPdf, includePaymentLink }) {
  const db = getDb();
  const sets = [];
  const vals = [];
  if (daysAfterDue !== undefined) { sets.push('days_after_due=?'); vals.push(daysAfterDue); }
  if (subjectFr !== undefined) { sets.push('subject_fr=?'); vals.push(subjectFr); }
  if (subjectEn !== undefined) { sets.push('subject_en=?'); vals.push(subjectEn); }
  if (bodyFr !== undefined) { sets.push('body_fr=?'); vals.push(bodyFr); }
  if (bodyEn !== undefined) { sets.push('body_en=?'); vals.push(bodyEn); }
  if (attachPdf !== undefined) { sets.push('attach_pdf=?'); vals.push(attachPdf ? 1 : 0); }
  if (includePaymentLink !== undefined) { sets.push('include_payment_link=?'); vals.push(includePaymentLink ? 1 : 0); }
  if (sets.length === 0) return;
  vals.push(id);
  db.prepare(`UPDATE reminder_steps SET ${sets.join(',')} WHERE id=?`).run(...vals);
  return db.prepare(`SELECT * FROM reminder_steps WHERE id=?`).get(id);
}

function reminderStepDelete(id) {
  getDb().prepare(`DELETE FROM reminder_steps WHERE id=?`).run(id);
  return { ok: true };
}

function reminderLogList({ invoiceId, limit = 100 } = {}) {
  const db = getDb();
  if (invoiceId) {
    return db.prepare(
      `SELECT rl.*, rs.days_after_due, rs.subject_fr FROM reminder_log rl
       LEFT JOIN reminder_steps rs ON rs.id=rl.step_id
       WHERE rl.invoice_id=? ORDER BY rl.sent_at DESC LIMIT ?`
    ).all(String(invoiceId), limit);
  }
  return db.prepare(
    `SELECT rl.*, rs.days_after_due, rs.subject_fr FROM reminder_log rl
     LEFT JOIN reminder_steps rs ON rs.id=rl.step_id
     ORDER BY rl.sent_at DESC LIMIT ?`
  ).all(limit);
}

function reminderLogCreate({ invoiceId, stepId, sentTo, status }) {
  const db = getDb();
  const id = db.prepare(
    `INSERT INTO reminder_log (invoice_id, step_id, sent_to, status) VALUES (?,?,?,?)`
  ).run(String(invoiceId), stepId, sentTo || null, status || 'sent').lastInsertRowid;
  return db.prepare(`SELECT * FROM reminder_log WHERE id=?`).get(id);
}

// Returns {invoiceId, clientId, step} for invoices that need a reminder today.
// factures is the JSON array from kv_store (passed from renderer context via IPC).
function reminderCheckDue(factures, lang = 'fr') {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const defaultLadder = db.prepare(`SELECT * FROM reminder_ladder WHERE is_default=1 AND is_active=1`).get();
  if (!defaultLadder) return [];
  const steps = db.prepare(`SELECT * FROM reminder_steps WHERE ladder_id=? ORDER BY days_after_due`).all(defaultLadder.id);
  if (!steps.length) return [];

  const result = [];
  for (const fac of (factures || [])) {
    if (!fac.dateEcheance || !fac.clientId) continue;
    const statut = fac.statut || '';
    if (statut === 'Payée' || statut === 'Annulée' || statut === 'Void') continue;
    // Check if there's an outstanding balance
    const totalPaid = (fac.paiements || []).reduce((s, p) => s + (parseFloat(p.montant) || 0), 0);
    // Simple check: if any payments exist and total >= rough total, skip
    if (fac.statut === 'Payée') continue;
    const dueDate = new Date(fac.dateEcheance + 'T12:00:00');
    const todayDate = new Date(today + 'T12:00:00');
    const daysOverdue = Math.floor((todayDate - dueDate) / 86400000);
    if (daysOverdue <= 0) continue;

    // Find the applicable step (the one that just became due, not already sent)
    for (const step of steps) {
      if (daysOverdue < step.days_after_due) continue;
      // Check not already sent for this step
      const alreadySent = db.prepare(
        `SELECT id FROM reminder_log WHERE invoice_id=? AND step_id=? AND status='sent'`
      ).get(String(fac.id), step.id);
      if (alreadySent) continue;
      result.push({ invoiceId: fac.id, clientId: fac.clientId, step, daysOverdue });
      break; // Only one step per invoice per run
    }
  }
  return result;
}

// ── Deposit Schedules ──────────────────────────────────────────────────────────

function depositScheduleList(commandeId) {
  return getDb().prepare(
    `SELECT * FROM deposit_schedules WHERE commande_id=? ORDER BY sort_order, id`
  ).all(String(commandeId));
}

function depositScheduleCreate({ commandeId, label, percentage, fixedAmount, triggerType, triggerDate, sortOrder = 0 }) {
  const db = getDb();
  const id = db.prepare(
    `INSERT INTO deposit_schedules (commande_id, label, percentage, fixed_amount, trigger_type, trigger_date, sort_order, status)
     VALUES (?,?,?,?,?,?,?,'pending')`
  ).run(String(commandeId), label, percentage || null, fixedAmount || null, triggerType, triggerDate || null, sortOrder).lastInsertRowid;
  return db.prepare(`SELECT * FROM deposit_schedules WHERE id=?`).get(id);
}

function depositScheduleUpdate(id, { label, percentage, fixedAmount, triggerType, triggerDate, status, sortOrder }) {
  const db = getDb();
  const sets = [];
  const vals = [];
  if (label !== undefined) { sets.push('label=?'); vals.push(label); }
  if (percentage !== undefined) { sets.push('percentage=?'); vals.push(percentage || null); }
  if (fixedAmount !== undefined) { sets.push('fixed_amount=?'); vals.push(fixedAmount || null); }
  if (triggerType !== undefined) { sets.push('trigger_type=?'); vals.push(triggerType); }
  if (triggerDate !== undefined) { sets.push('trigger_date=?'); vals.push(triggerDate || null); }
  if (status !== undefined) { sets.push('status=?'); vals.push(status); }
  if (sortOrder !== undefined) { sets.push('sort_order=?'); vals.push(sortOrder); }
  if (sets.length === 0) return;
  vals.push(id);
  db.prepare(`UPDATE deposit_schedules SET ${sets.join(',')} WHERE id=?`).run(...vals);
  return db.prepare(`SELECT * FROM deposit_schedules WHERE id=?`).get(id);
}

function depositScheduleDelete(id) {
  getDb().prepare(`DELETE FROM deposit_schedules WHERE id=?`).run(id);
  return { ok: true };
}

function depositScheduleMarkGenerated(id, factureId) {
  getDb().prepare(
    `UPDATE deposit_schedules SET status='generated', generated_invoice_id=? WHERE id=?`
  ).run(String(factureId), id);
  return { ok: true };
}

// ── Document Number Registry ───────────────────────────────────────────────────

function docNumRegister(documentType, documentNumber, entityId) {
  try {
    getDb().prepare(
      `INSERT OR IGNORE INTO document_number_registry (document_type, document_number, entity_id)
       VALUES (?,?,?)`
    ).run(documentType, documentNumber, String(entityId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function docNumCheckConflicts(documentType, numbersList) {
  const db = getDb();
  const conflicts = [];
  for (const num of numbersList) {
    const row = db.prepare(
      `SELECT entity_id FROM document_number_registry WHERE document_type=? AND document_number=?`
    ).get(documentType, num);
    if (row) conflicts.push({ number: num, existingEntityId: row.entity_id });
  }
  return conflicts;
}

function docNumList(documentType) {
  return getDb().prepare(
    `SELECT document_number, entity_id, created_at FROM document_number_registry WHERE document_type=? ORDER BY id DESC LIMIT 500`
  ).all(documentType);
}

// ── Payment Plans ─────────────────────────────────────────────────────────────

function paymentPlanCreate({ parent_invoice_id, total_installments, cadence, start_date, use_pad = 0, notes }) {
  const db = getDb();
  const id = db.prepare(
    `INSERT OR REPLACE INTO payment_plans (parent_invoice_id, total_installments, cadence, start_date, use_pad, notes)
     VALUES (?,?,?,?,?,?)`
  ).run(String(parent_invoice_id), total_installments, cadence, start_date, use_pad ? 1 : 0, notes || null).lastInsertRowid;
  return db.prepare(`SELECT * FROM payment_plans WHERE id=?`).get(id);
}

function paymentPlanGet(parentInvoiceId) {
  return getDb().prepare(`SELECT * FROM payment_plans WHERE parent_invoice_id=?`).get(String(parentInvoiceId));
}

function paymentPlanUpdate(parentInvoiceId, { status, notes }) {
  const db = getDb();
  const sets = [];
  const vals = [];
  if (status !== undefined) { sets.push('status=?'); vals.push(status); }
  if (notes !== undefined) { sets.push('notes=?'); vals.push(notes || null); }
  if (sets.length === 0) return paymentPlanGet(parentInvoiceId);
  vals.push(String(parentInvoiceId));
  db.prepare(`UPDATE payment_plans SET ${sets.join(',')} WHERE parent_invoice_id=?`).run(...vals);
  return paymentPlanGet(parentInvoiceId);
}

function paymentPlanCancel(parentInvoiceId) {
  return paymentPlanUpdate(parentInvoiceId, { status: 'cancelled' });
}

function inventoryDeductUpsert({ invoice_id, invoice_numero, product_id, quantity, revenue, sale_date }) {
  const id = `${invoice_id}_${product_id}`;
  getDb().prepare(
    `INSERT OR REPLACE INTO invoice_inventory_deductions (id, invoice_id, invoice_numero, product_id, quantity, revenue, sale_date)
     VALUES (?,?,?,?,?,?,?)`
  ).run(String(id), String(invoice_id), invoice_numero || null, String(product_id), quantity, revenue || 0, sale_date);
}
function inventoryDeductDeleteByInvoice(invoiceId) {
  getDb().prepare(`DELETE FROM invoice_inventory_deductions WHERE invoice_id=?`).run(String(invoiceId));
}
function inventoryDeductListByProduct(productId) {
  return getDb().prepare(`SELECT * FROM invoice_inventory_deductions WHERE product_id=? ORDER BY sale_date DESC`).all(String(productId));
}
function inventoryDeductSummaryByDate(date) {
  return getDb().prepare(`SELECT product_id, SUM(quantity) as total_quantity, SUM(revenue) as total_revenue FROM invoice_inventory_deductions WHERE sale_date=? GROUP BY product_id`).all(date);
}

module.exports = {
  storageGet, storageSet, storageGetAll, storageGetByPrefix,
  auditInsert, auditQuery, getDeviceId,
  snapshotSave, snapshotGetByDate, snapshotGetLatest, snapshotListDates,
  forecastClearAll,
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
  posScanTemplatesGetAll, posScanTemplateSave, posScanTemplateDelete, posScanTemplateMarkUploaded,
  posScanHistorySave, posScanHistoryGetRecent, posScanHistoryGetForDate,
  upgradePromptGetDismissedAt, upgradePromptDismiss,
  onboardingGetAll, onboardingMarkDone, onboardingReset,
  plInvoiceHistoryRecord, plInvoiceHistoryGetLast, plInvoiceHistoryGetRecent,
  searchIngredients, searchForecastProducts, searchHistoryGet, searchHistorySave,
  searchWasteEntries,
  coaList, coaCreate, coaUpdate, coaArchive, coaUnarchive, coaImportCSV, coaExportCSV, coaMappingSuggestions,
  glDraftEntry, glUpdateDraft, glPostEntry, glReverseEntry, glCorrectEntry, glDeleteDraft,
  glGetEntry, glListEntries, glGetAccountHistory, glExportLines,
  trialBalance,
  periodList, periodOpen, periodClose, periodReopen,
  glAuditLogList,
  bankAccountsList, bankAccountCreate, bankAccountUpdate, bankAccountArchive,
  bankStatementImport, bankStatementsList,
  bankTransactionsList, bankTransactionMatch, bankTransactionUnmatch, bankTransactionCategorize,
  bankReconcilePreview, bankReconcileClose, bankReconcileReopen,
  bankLearnedRulesList, bankLearnedRuleDelete,
  taxPeriodCompute, taxPeriodSave, taxPeriodMarkFiled, taxPeriodList,
  taxSuspenseList, taxSuspenseClassifyAsCashExpense, taxSuspenseReverseCategorization,
  taxProfileList, taxProfileUpsert, taxProfileDelete,
  supplierBillList, supplierBillCreate, supplierBillUpdate, supplierBillMarkPaid, supplierBillMarkUnpaid,
  supplierPaymentsList, supplierPaymentCreate,
  assetList, assetCreate, assetUpdate, assetDelete,
  ccaClassesList, ccaComputeForAsset, ccaScheduleForYear,
  buildBalanceSheet, getBalanceSheetBlockers,
  balanceSheetSnapshotSave, balanceSheetSnapshotList, balanceSheetSnapshotGet,
  vaultAttach, vaultList, vaultListAll, vaultSearch, vaultDelete, vaultGetOrphans, vaultReassign, vaultGetStats,
  recurringRuleList, recurringRuleCreate, recurringRuleUpdate, recurringRuleDeactivate,
  recurringPendingList, recurringApprove, recurringSkip, recurringHistoryList,
  recurringCheckDue, recurringPendingCount,
  reminderLadderList, reminderLadderCreate, reminderLadderUpdate, reminderLadderDelete,
  reminderStepList, reminderStepCreate, reminderStepUpdate, reminderStepDelete,
  reminderLogList, reminderLogCreate, reminderCheckDue,
  depositScheduleList, depositScheduleCreate, depositScheduleUpdate, depositScheduleDelete, depositScheduleMarkGenerated,
  docNumRegister, docNumCheckConflicts, docNumList,
  paymentPlanCreate, paymentPlanGet, paymentPlanUpdate, paymentPlanCancel,
  inventoryDeductUpsert, inventoryDeductDeleteByInvoice, inventoryDeductListByProduct, inventoryDeductSummaryByDate,
};
