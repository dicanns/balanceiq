// BalanceIQ — Schema Migrations (extracted from database.js)
// No Electron dependency — safe to import in Node tests and in main process.

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
      database.prepare(`CREATE VIRTUAL TABLE IF NOT EXISTS fts_ingredients USING fts5(
        name_fr, name_en, category,
        content='ingredients', content_rowid='id'
      )`).run();
      database.prepare(`CREATE VIRTUAL TABLE IF NOT EXISTS fts_forecast_products USING fts5(
        name, category,
        content='forecast_products', content_rowid='id'
      )`).run();

      try { database.prepare(`INSERT INTO fts_ingredients(rowid, name_fr, name_en, category)
        SELECT id, name_fr, COALESCE(name_en,''), COALESCE(category,'') FROM ingredients`).run(); } catch(_) {}
      try { database.prepare(`INSERT INTO fts_forecast_products(rowid, name, category)
        SELECT id, name, COALESCE(category,'') FROM forecast_products`).run(); } catch(_) {}

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

      database.prepare(`CREATE TRIGGER IF NOT EXISTS fts_fp_insert AFTER INSERT ON forecast_products BEGIN
        INSERT INTO fts_forecast_products(rowid, name, category) VALUES (new.id, new.name, COALESCE(new.category,''));
      END`).run();
      database.prepare(`CREATE TRIGGER IF NOT EXISTS fts_fp_update AFTER UPDATE ON forecast_products BEGIN
        UPDATE fts_forecast_products SET name=new.name, category=COALESCE(new.category,'') WHERE rowid=old.id;
      END`).run();
      database.prepare(`CREATE TRIGGER IF NOT EXISTS fts_fp_delete AFTER DELETE ON forecast_products BEGIN
        DELETE FROM fts_forecast_products WHERE rowid=old.id;
      END`).run();

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
    description: 'Rebuild FTS5 tables with unicode61 tokenizer for accent-insensitive French search',
    up: (database) => {
      database.prepare(`DROP TRIGGER IF EXISTS fts_ing_insert`).run();
      database.prepare(`DROP TRIGGER IF EXISTS fts_ing_update`).run();
      database.prepare(`DROP TRIGGER IF EXISTS fts_ing_delete`).run();
      database.prepare(`DROP TRIGGER IF EXISTS fts_fp_insert`).run();
      database.prepare(`DROP TRIGGER IF EXISTS fts_fp_update`).run();
      database.prepare(`DROP TRIGGER IF EXISTS fts_fp_delete`).run();
      database.prepare(`DROP TABLE IF EXISTS fts_ingredients`).run();
      database.prepare(`DROP TABLE IF EXISTS fts_forecast_products`).run();

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

      try { database.prepare(`INSERT INTO fts_ingredients(rowid, name_fr, name_en, category)
        SELECT id, name_fr, COALESCE(name_en,''), COALESCE(category,'') FROM ingredients`).run(); } catch(_) {}
      try { database.prepare(`INSERT INTO fts_forecast_products(rowid, name, category)
        SELECT id, name, COALESCE(category,'') FROM forecast_products`).run(); } catch(_) {}

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

      database.prepare(`CREATE TRIGGER IF NOT EXISTS fts_fp_insert AFTER INSERT ON forecast_products BEGIN
        INSERT INTO fts_forecast_products(fp_id, name, category) VALUES (new.id, new.name, COALESCE(new.category,''));
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

      const ins = database.prepare(`INSERT OR IGNORE INTO chart_of_accounts
        (account_number, name_fr, name_en, type, is_contra, is_simplified, is_system, tax_hint)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?)`);

      const seed = [
        ['1010','Encaisse (banque operation)','Cash (operating bank account)','asset',0,1,null],
        ['1020','Encaisse (banque epargne)','Cash (savings account)','asset',0,0,null],
        ['1030','Petite caisse','Petty cash','asset',0,0,null],
        ['1100','Comptes clients','Accounts receivable','asset',0,1,null],
        ['1110','Provision pour creances douteuses','Allowance for doubtful accounts','asset',1,0,null],
        ['1200','Stock de marchandises','Merchandise inventory','asset',0,1,null],
        ['1210','Stock de nourriture et boissons','Food and beverage inventory','asset',0,0,null],
        ['1300','Frais payes davance','Prepaid expenses','asset',0,0,null],
        ['1400','TPS a recevoir (CTI)','GST receivable (ITC)','asset',0,1,'tps'],
        ['1410','TVQ a recevoir (RTI)','QST receivable (ITR)','asset',0,1,'tvq'],
        ['1500','Equipement de cuisine','Kitchen equipment','asset',0,1,null],
        ['1510','Amortissement cumule - equipement','Accumulated depreciation - equipment','asset',1,0,null],
        ['1520','Ameliorations locatives','Leasehold improvements','asset',0,0,null],
        ['1530','Amortissement cumule - ameliorations','Accumulated depreciation - improvements','asset',1,0,null],
        ['1540','Mobilier et agencements','Furniture and fixtures','asset',0,0,null],
        ['1550','Amortissement cumule - mobilier','Accumulated depreciation - furniture','asset',1,0,null],
        ['1560','Vehicules','Vehicles','asset',0,0,null],
        ['1570','Amortissement cumule - vehicules','Accumulated depreciation - vehicles','asset',1,0,null],
        ['2010','Comptes fournisseurs','Accounts payable','liability',0,1,null],
        ['2100','TPS a payer','GST payable','liability',0,1,'tps'],
        ['2110','TVQ a payer','QST payable','liability',0,1,'tvq'],
        ['2120','Retenues a la source (salaires)','Payroll withholdings','liability',0,0,null],
        ['2130','Cotisations employeur a payer','Employer contributions payable','liability',0,0,null],
        ['2200','Marge de credit','Line of credit','liability',0,0,null],
        ['2210','Carte de credit','Credit card','liability',0,1,null],
        ['2300','Emprunts a court terme','Short-term loans','liability',0,0,null],
        ['2400','Emprunts a long terme','Long-term loans','liability',0,0,null],
        ['2500','Depots de clients (acomptes)','Customer deposits (deposits)','liability',0,0,null],
        ['3000','Capital-actions','Share capital','equity',0,1,null],
        ['3100','Benefices non repartis','Retained earnings','equity',0,1,null],
        ['3200','Prelevements du proprietaire','Owner drawings','equity',0,0,null],
        ['3300','Mises de fonds du proprietaire','Owner contributions','equity',0,0,null],
        ['4000','Ventes - repas','Sales - meals','revenue',0,1,null],
        ['4010','Ventes - boissons','Sales - beverages','revenue',0,0,null],
        ['4020','Ventes - livraisons (brut)','Sales - delivery (gross)','revenue',0,1,null],
        ['4030','Ventes - alcool','Sales - alcohol','revenue',0,0,null],
        ['4040','Autres revenus','Other revenue','revenue',0,0,null],
        ['4100','Remises et remboursements','Sales returns and allowances','revenue',1,0,null],
        ['5000','Achats - nourriture','Purchases - food','cogs',0,1,'both'],
        ['5010','Achats - boissons non alcoolisees','Purchases - non-alcoholic beverages','cogs',0,0,'both'],
        ['5020','Achats - alcool','Purchases - alcohol','cogs',0,0,'both'],
        ['5030','Emballages et fournitures','Packaging and supplies','cogs',0,0,'both'],
        ['5040','Commissions - livraisons','Delivery commissions (DoorDash, Uber, Skip)','cogs',0,1,'both'],
        ['5100','Variation du stock','Inventory change (period adjustment)','cogs',0,0,null],
        ['6000','Salaires et avantages (production)','Wages and benefits (production)','expense',0,1,null],
        ['6010','Salaires et avantages (administration)','Wages and benefits (administration)','expense',0,0,null],
        ['6020','CNESST','CNESST (workers compensation)','expense',0,0,null],
        ['6030','Avantages sociaux','Employee benefits','expense',0,0,null],
        ['6100','Loyer','Rent','expense',0,1,'both'],
        ['6110','Hydro-Quebec','Hydro-Quebec (electricity)','expense',0,1,'both'],
        ['6120','Gaz naturel','Natural gas','expense',0,1,'both'],
        ['6130','Telecommunications','Telecommunications','expense',0,0,'both'],
        ['6140','Internet','Internet','expense',0,0,'both'],
        ['6200','Entretien et reparations - equipement','Equipment maintenance and repairs','expense',0,1,'both'],
        ['6210','Entretien et reparations - batiment','Building maintenance and repairs','expense',0,0,'both'],
        ['6220','Nettoyage et buanderie','Cleaning and laundry','expense',0,0,'both'],
        ['6300','Publicite et marketing','Advertising and marketing','expense',0,1,'both'],
        ['6310','Cartes-cadeaux et promotions','Gift cards and promotions','expense',0,0,'both'],
        ['6400','Frais bancaires','Bank charges','expense',0,1,null],
        ['6410','Frais de cartes de credit (merchant)','Merchant credit card fees','expense',0,0,null],
        ['6420','Interets payes','Interest paid','expense',0,0,null],
        ['6500','Assurances','Insurance','expense',0,1,null],
        ['6510','Permis et licences','Permits and licences','expense',0,0,'both'],
        ['6520','Honoraires professionnels','Professional fees (accountant, lawyer)','expense',0,0,'both'],
        ['6530','Frais informatiques et logiciels','IT and software expenses','expense',0,0,'both'],
        ['6600','Fournitures de bureau','Office supplies','expense',0,0,'both'],
        ['6610','Fournitures dexploitation','Operating supplies','expense',0,0,'both'],
        ['6700','Amortissement','Depreciation','expense',0,0,null],
        ['6800','Deplacements et representation','Travel and entertainment','expense',0,0,'both'],
        ['6900','Divers','Miscellaneous','expense',0,1,'both'],
      ];

      database.transaction(() => {
        for (const row of seed) ins.run(...row);
      })();
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
            THEN RAISE(ABORT, 'Ecriture desequilibree: total debit != total credit')
          END;
        END
      `).run();
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
    version: 12,
    description: 'Balance Sheet + AP Tracking + CCA Depreciation — Sprint 6 Accounting Suite',
    up: (database) => {
      // Supplier bills — new relational table (bills were previously in kv_store JSON)
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
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_sb_paid ON supplier_bills(paid, due_date)`).run();

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

      const ins = database.prepare(
        `INSERT OR IGNORE INTO cca_class_rates (class, rate, method, description_fr, description_en, first_year_rule, effective_from)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      ins.run('8',  0.20, 'declining',    'Equipement divers (20%)',           'Miscellaneous equipment (20%)',       'half_year', '2024-01-01');
      ins.run('10', 0.30, 'declining',    'Vehicules automobiles (30%)',        'Automobiles and vehicles (30%)',      'half_year', '2024-01-01');
      ins.run('12', 1.00, 'full_year',    'Petits outils et uniformes (100%)',  'Small tools and uniforms (100%)',     'full_year', '2024-01-01');
      ins.run('13', null, 'straight_line','Ameliorations locatives',            'Leasehold improvements',              'pro_rata',  '2024-01-01');
      ins.run('50', 0.55, 'declining',    'Materiel informatique (55%)',        'Computer equipment (55%)',            'half_year', '2024-01-01');

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
    version: 11,
    description: 'CTI/RTI Input Tax Credits — Sprint 4 Accounting Suite',
    up: (database) => {
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

      const ladderId = database.prepare(
        `INSERT INTO reminder_ladder (name, is_default, is_active) VALUES ('Defaut', 1, 1)`
      ).run().lastInsertRowid;
      const steps = [
        { days: 3,  sfr: 'Rappel amical — Facture {numero}',         sen: 'Friendly reminder — Invoice {numero}',        bfr: '', ben: '' },
        { days: 7,  sfr: 'Rappel ferme — Facture {numero}',          sen: 'Payment reminder — Invoice {numero}',         bfr: '', ben: '' },
        { days: 14, sfr: 'Compte en retard — Facture {numero}',      sen: 'Past due — Invoice {numero}',                 bfr: '', ben: '' },
        { days: 30, sfr: 'Dernier avis — Facture {numero}',          sen: 'Final notice — Invoice {numero}',             bfr: '', ben: '' },
        { days: 60, sfr: 'Mise en demeure — Facture {numero}',       sen: 'Collection notice — Invoice {numero}',        bfr: '', ben: '' },
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
  {
    version: 17,
    description: 'Sprint 15 — Bank match reason label',
    up: (database) => {
      try { database.prepare(`ALTER TABLE bank_transactions ADD COLUMN match_reason TEXT`).run(); } catch (_) {}
    },
  },
  {
    version: 18,
    description: 'Security sprint — durable cloud sync queue',
    up: (database) => {
      database.prepare(`CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        queued_at TEXT NOT NULL DEFAULT (datetime('now')),
        attempts INTEGER NOT NULL DEFAULT 0
      )`).run();
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_sq_key ON sync_queue(key)`).run();
    },
  },
  {
    version: 19,
    description: 'Close Assurance - policies, sessions, register closures, exceptions, approvals',
    up: (database) => {
      database.prepare(`CREATE TABLE IF NOT EXISTS close_policies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        location_id INTEGER,
        name TEXT NOT NULL DEFAULT 'default',
        blind_close_mode TEXT NOT NULL DEFAULT 'off',
        variance_per_register_cents INTEGER NOT NULL DEFAULT 100,
        variance_store_cents INTEGER NOT NULL DEFAULT 200,
        missing_required_checklist_rule TEXT NOT NULL DEFAULT 'inform',
        missing_pos_evidence_rule TEXT NOT NULL DEFAULT 'inform',
        missing_delivery_reconciliation_rule TEXT NOT NULL DEFAULT 'inform',
        manager_signoff_required INTEGER NOT NULL DEFAULT 0,
        approver_identity_method TEXT NOT NULL DEFAULT 'typed_name',
        denomination_mode TEXT NOT NULL DEFAULT 'total_only',
        shift_mode_enabled INTEGER NOT NULL DEFAULT 0,
        shift_signoff_required INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        CHECK (blind_close_mode IN ('off', 'register_blind', 'manager_reveal')),
        CHECK (denomination_mode IN ('total_only', 'denominations_optional', 'denominations_required')),
        CHECK (approver_identity_method IN ('typed_name', 'pin', 'cloud_user')),
        CHECK (missing_required_checklist_rule IN ('inform', 'require_reason', 'block')),
        CHECK (missing_pos_evidence_rule IN ('inform', 'require_reason', 'block')),
        CHECK (missing_delivery_reconciliation_rule IN ('inform', 'require_reason', 'block'))
      )`).run();

      database.prepare(`CREATE TABLE IF NOT EXISTS close_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date_key TEXT NOT NULL,
        shift_key TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        blind_close_mode TEXT NOT NULL DEFAULT 'off',
        policy_id INTEGER,
        prepared_by TEXT,
        submitted_at TEXT,
        approved_by TEXT,
        approved_at TEXT,
        reopened_by TEXT,
        reopened_at TEXT,
        reopen_reason TEXT,
        snapshot_id INTEGER,
        all_balanced INTEGER NOT NULL DEFAULT 0,
        warning_count INTEGER NOT NULL DEFAULT 0,
        blocker_count INTEGER NOT NULL DEFAULT 0,
        exception_summary_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (policy_id) REFERENCES close_policies(id),
        CHECK (status IN ('draft','submitted','approved','reopened','finalized'))
      )`).run();
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_cs_date ON close_sessions(date_key)`).run();
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_cs_status ON close_sessions(status)`).run();

      database.prepare(`CREATE TABLE IF NOT EXISTS register_closures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        close_session_id INTEGER NOT NULL,
        register_key TEXT NOT NULL,
        register_label TEXT,
        cashier_id TEXT,
        cashier_name TEXT,
        float_cents INTEGER NOT NULL DEFAULT 0,
        pos_sales_cents INTEGER NOT NULL DEFAULT 0,
        pos_tps_cents INTEGER NOT NULL DEFAULT 0,
        pos_tvq_cents INTEGER NOT NULL DEFAULT 0,
        pos_delivery_cents INTEGER NOT NULL DEFAULT 0,
        terminal_cents INTEGER NOT NULL DEFAULT 0,
        deposits_cents INTEGER NOT NULL DEFAULT 0,
        final_cash_cents INTEGER NOT NULL DEFAULT 0,
        expected_in_register_cents INTEGER NOT NULL DEFAULT 0,
        expected_cash_cents INTEGER NOT NULL DEFAULT 0,
        physical_cash_cents INTEGER NOT NULL DEFAULT 0,
        variance_cents INTEGER NOT NULL DEFAULT 0,
        count_mode TEXT NOT NULL DEFAULT 'total_only',
        status TEXT NOT NULL DEFAULT 'draft',
        variance_reason_code TEXT,
        variance_reason_text TEXT,
        submitted_at TEXT,
        approved_at TEXT,
        FOREIGN KEY (close_session_id) REFERENCES close_sessions(id)
      )`).run();
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_rc_session ON register_closures(close_session_id)`).run();

      database.prepare(`CREATE TABLE IF NOT EXISTS close_exceptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        close_session_id INTEGER NOT NULL,
        register_closure_id INTEGER,
        severity TEXT NOT NULL,
        exception_type TEXT NOT NULL,
        code TEXT NOT NULL,
        label_fr TEXT,
        label_en TEXT,
        payload_json TEXT,
        acknowledged_by TEXT,
        acknowledged_at TEXT,
        resolution_reason TEXT,
        FOREIGN KEY (close_session_id) REFERENCES close_sessions(id),
        CHECK (severity IN ('info','warning','blocker'))
      )`).run();
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_ce_session ON close_exceptions(close_session_id)`).run();

      database.prepare(`CREATE TABLE IF NOT EXISTS close_approvals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        close_session_id INTEGER NOT NULL,
        stage TEXT NOT NULL,
        actor_name TEXT NOT NULL,
        actor_role TEXT,
        approval_method TEXT,
        reason TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (close_session_id) REFERENCES close_sessions(id),
        CHECK (approval_method IN ('typed_name','pin','cloud_user'))
      )`).run();
      database.prepare(`CREATE INDEX IF NOT EXISTS idx_ca_session ON close_approvals(close_session_id)`).run();
    },
  },
  {
    version: 20,
    description: 'Close Assurance 2D - variance_register_rule column on close_policies',
    up: (database) => {
      try {
        database.prepare(`ALTER TABLE close_policies ADD COLUMN variance_register_rule TEXT NOT NULL DEFAULT 'require_reason'`).run();
      } catch (_) {}
    },
  },
  {
    version: 21,
    description: 'Close Assurance 3A - register_count_denominations table',
    up: (database) => {
      database.prepare(`
        CREATE TABLE IF NOT EXISTS register_count_denominations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          register_closure_id INTEGER NOT NULL,
          denomination_code TEXT NOT NULL,
          unit_value_cents INTEGER NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 0,
          total_value_cents INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (register_closure_id) REFERENCES register_closures(id)
        )
      `).run();
      database.prepare(`
        CREATE INDEX IF NOT EXISTS idx_rcd_closure ON register_count_denominations(register_closure_id)
      `).run();
      try {
        database.prepare(`ALTER TABLE close_policies ADD COLUMN denomination_mode TEXT NOT NULL DEFAULT 'total_only'`).run();
      } catch (_) {}
    },
  },
  {
    version: 22,
    description: 'Close Assurance 3B - safe_drop_events table',
    up: (database) => {
      database.prepare(`
        CREATE TABLE IF NOT EXISTS safe_drop_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date_key TEXT NOT NULL,
          shift_key TEXT,
          register_closure_id INTEGER,
          amount_cents INTEGER NOT NULL,
          bag_reference TEXT,
          dropped_by TEXT NOT NULL,
          witnessed_by TEXT,
          event_timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          notes TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (register_closure_id) REFERENCES register_closures(id)
        )
      `).run();
      database.prepare(`
        CREATE INDEX IF NOT EXISTS idx_sde_date ON safe_drop_events(date_key)
      `).run();
    },
  },
  {
    version: 23,
    description: 'Close Assurance 3C - deposit_verifications table',
    up: (database) => {
      database.prepare(`
        -- Reserved for Sprint 6 bank reconciliation use.
        -- This table tracks actual bank deposit verification (safe-to-bank
        -- runs entered in Encaisse). It is NOT for the daily close's
        -- 'Deposits' field, which is a till-to-safe internal movement and
        -- is captured by safe_drop_events (Sub-Sprint 3B).
        CREATE TABLE IF NOT EXISTS deposit_verifications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          close_session_id INTEGER,
          date_key TEXT NOT NULL,
          expected_amount_cents INTEGER NOT NULL,
          verified_amount_cents INTEGER,
          verified_date TEXT,
          verified_by TEXT,
          matched INTEGER NOT NULL DEFAULT 0,
          bank_transaction_id INTEGER,
          notes TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      database.prepare(`
        CREATE INDEX IF NOT EXISTS idx_dv_date ON deposit_verifications(date_key)
      `).run();
    },
  },
  {
    version: 24,
    description: 'Close Assurance 4A - local_users table',
    up: (database) => {
      database.prepare(`
        CREATE TABLE IF NOT EXISTS local_users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'cashier',
          pin_hash TEXT,
          pin_salt TEXT,
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          CHECK (role IN ('cashier','manager','owner'))
        )
      `).run();
      database.prepare(`
        CREATE INDEX IF NOT EXISTS idx_lu_active ON local_users(active)
      `).run();
    },
  },
];

// Runs all pending migrations in ascending version order.
// If any migration fails the error is re-thrown.
function runMigrations(database) {
  const currentVersion = database.pragma('user_version', { simple: true });
  const pending = MIGRATIONS
    .filter(m => m.version > currentVersion)
    .sort((a, b) => a.version - b.version);

  if (pending.length === 0) return;

  for (const migration of pending) {
    try {
      database.transaction(() => {
        migration.up(database);
        database.pragma(`user_version = ${migration.version}`);
      })();
    } catch (err) {
      const msg = `[DB] Migration v${migration.version} FAILED: ${err.message}`;
      throw new Error(msg);
    }
  }
}

module.exports = { MIGRATIONS, runMigrations };
