# BalanceIQ — Prévisions / Forecasting Module
### Complete build specification for Claude Code
### Give this entire file to Claude Code. Build in phases, test each before moving on.

---

## OVERVIEW

A new hybrid tab called "📋 Prévisions / Forecasting" that predicts item-level 
demand for food production businesses (bakeries, restaurants, caterers, etc.).

The module:
- Tracks what was made, what sold, what was left over, what ran out
- Learns day-of-week patterns per item
- Uses actual upcoming weather forecasts to adjust predictions
- Generates weekly production lists
- Flags overproduction (waste) and stockouts (lost sales)
- FREE tier: basic tracking + rules-based averages
- PRO tier: Claude AI predictions with reasoning + smart alerts

This is toggled ON/OFF in Config → Application, same pattern as Inventory Tracking.
Default: OFF. When ON, a new "📋 Prévisions" tab appears in the main nav.

ALL TEXT MUST BE BILINGUAL (FR/EN) from the start. Every UI string needs 
both languages in the translation file.

---

## PHASE 1 — Config & Product Setup

```
Add the Prévisions module toggle and product setup.

1. CONFIG → APPLICATION:

Add a section:
"📋 Prévisions de production / Production Forecasting"
Toggle: Off (default)

FR: "Activez le module de prévisions pour prédire la demande 
     de vos produits et planifier votre production."
EN: "Enable the forecasting module to predict product demand 
     and plan your production."

When toggled ON:
- A "📋 Prévisions" tab appears in the main navigation 
  (between Intelligence and Invoicing)
- A product catalog section appears in Config

2. PRODUCT CATALOG (for forecasting — separate from invoicing products):

When Prévisions is ON, show in Config → a new sub-tab:
"📋 Produits de production / Production Products"

NOTE: These are PRODUCTION items (what you make/bake), which 
is different from invoicing products (what you sell/bill). 
They may overlap but are stored separately because the data 
model is different. In the future we could link them.

Each production product has:
- Nom / Name (e.g., "Croissant", "Baguette")
- Catégorie / Category (user-created, e.g., "Viennoiseries", 
  "Pains", "Pâtisseries", "Boissons")
- Quantité de base / Base quantity — what they normally make 
  on an average day (starting estimate before real data exists)
- Durée de vie (jours) / Shelf life (days) — how long the 
  product lasts (1 = must be made fresh daily, 3 = lasts 3 days)
  Default: 1
- Sensibilité météo / Weather sensitivity — slider or dropdown:
  * -2: Produit de temps froid / Cold weather seller (e.g., soup)
  * -1: Légèrement froid / Slightly cold preference
  *  0: Neutre / Neutral (default — sells regardless)
  * +1: Légèrement chaud / Slightly warm preference
  * +2: Produit de temps chaud / Hot weather seller (e.g., iced drinks)
- Actif / Active: yes/no toggle
- Notes internes / Internal notes

Product list view:
- Grouped by category
- Searchable
- "+ Nouveau produit / + New product" button
- Edit and deactivate (not delete — historical data references them)
- Import from CSV button (see Phase 2)

IMPORTANT: Products used here are EXAMPLES only to help understand 
the data model. Users create their own products for their business. 
Do not hardcode any specific products.

Save to SQLite. All text bilingual (FR/EN).
```

---

## PHASE 2 — Sales Data Import

```
Build the three ways to get daily itemized sales into the system.

1. CSV / EXCEL IMPORT:

In the Prévisions tab, add: "📥 Importer les ventes / Import sales"

Flow:
a) User clicks import → file picker (accepts .csv, .xlsx, .xls)
b) System reads the file and shows a column mapping screen:

   "Quelles colonnes correspondent à vos données?
    Which columns match your data?"

   Product name:    [dropdown of CSV columns]
   Quantity sold:   [dropdown of CSV columns]
   Date:            [dropdown of CSV columns] (optional — if not present, 
                     ask which date this data is for)
   Quantity made:   [dropdown of CSV columns] (optional)
   Quantity remaining: [dropdown of CSV columns] (optional)

c) System shows a preview of the mapped data:
   | Produit | Qté vendue | Qté fabriquée | Restant |
   | Croissant | 47 | — | — |
   | Baguette | 65 | — | — |

d) User confirms → data saved
e) System remembers the column mapping for this file format 
   (save as a "format" with a name so future uploads auto-map)

HANDLING UNKNOWN PRODUCTS:
If the CSV contains product names not in the catalog:
- Show: "3 nouveaux produits détectés / 3 new products detected"
- List them with option to: Add to catalog / Ignore / Map to existing product
- If added, they get default settings (neutral weather, shelf life 1 day)

2. POS API IMPORT (Pro tier):

If a POS is connected (Square, Clover, Shopify, Maitre D'), add:
"📡 Importer depuis [POS name] / Import from [POS name]"

This pulls ITEMIZED sales (not just totals like the daily tab import).
- Uses the existing POS integration framework
- Pulls: product name, quantity sold, unit price (optional)
- Maps POS product names to forecasting product catalog
- First time: shows mapping screen (POS name → catalog product)
- Remembers mapping for future imports

Gate behind canUse('posIntegration').

3. MANUAL ENTRY:

In the Prévisions tab, for any selected date, show a quick-entry table:

Date: [March 10, 2026]  ← date picker, can enter data for any past date

| Produit | Fabriqué | Vendu | Restant | Rupture? |
|---------|----------|-------|---------|----------|
| Croissant | [50] | [47] | [3] | ☐ |
| Baguette | [80] | [65] | [15] | ☐ |
| Pain choc | [40] | [32] | [8] | ☐ |
| + Ajouter produit... |

EN columns: Product | Made | Sold | Remaining | Stockout?

- Pre-populates with all active products
- "Fabriqué / Made" is what they produced that day
- "Vendu / Sold" is what they actually sold
- "Restant / Remaining" auto-calculates (made - sold) but is editable
- "Rupture / Stockout" checkbox — check if they ran out before end of day
  (this means actual demand was HIGHER than what was sold)
- Tab navigation for fast entry
- Save as you go (debounced auto-save)

4. DELAYED DATA ENTRY:

CRITICAL: The system must handle data entered days late.

- User can enter sales data for ANY past date via the date picker
- If entering data for March 7 on March 10, system accepts it normally
- Predictions auto-recalculate when new historical data arrives
- If predictions were generated without having recent data, show:
  "⚠️ Prévisions basées sur données incomplètes — X jours manquants
   cette semaine / Forecasts based on incomplete data — X days missing 
   this week"
- As gaps fill in, confidence improves automatically
- Never punish the user for being late — the system adapts

5. DATA STORAGE:

SQLite table structure:

CREATE TABLE forecast_products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  base_quantity INTEGER DEFAULT 0,
  shelf_life_days INTEGER DEFAULT 1,
  weather_sensitivity INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE forecast_daily_sales (
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

CREATE TABLE forecast_csv_mappings (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mapping TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

All text bilingual (FR/EN).
```

---

## PHASE 3 — Weather Forecast Integration

```
Add 7-day weather forecasting for the Prévisions module.

1. WEATHER FORECAST API:

Use Open-Meteo's forecast API (same provider as current weather, free):
https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lng}
  &daily=temperature_2m_max,temperature_2m_min,precipitation_sum,
  weathercode&timezone=America/Toronto&forecast_days=7

This returns daily forecast for the next 7 days including:
- Max/min temperature
- Precipitation amount
- Weather code (WMO codes — already mapped in the app)

Use the location coordinates already configured in Config → Integrations.

2. WEATHER DISPLAY IN PRÉVISIONS TAB:

At the top of the weekly forecast view, show a weather bar:

| Lun 17 | Mar 18 | Mer 19 | Jeu 20 | Ven 21 | Sam 22 | Dim 23 |
| 4°🌧   | 8°☁    | 12°☀   | 10°🌧   | 18°☀   | 22°☀   | 14°☁   |
| Auto   | Auto   | Auto   | Auto   | Auto   | Auto   | Auto   |

Each day shows: high temp + weather icon + source (Auto/Manuel)

3. MANUAL WEATHER OVERRIDE:

Click any day's weather cell to override:
- Temperature field (editable number)
- Weather condition dropdown (Ensoleillé/Sunny, Nuageux/Cloudy, 
  Pluie/Rain, Neige/Snow, Orage/Storm)
- When overridden, show "Manuel ✏️ / Manual ✏️" instead of "Auto"
- "Réinitialiser / Reset" button restores API forecast
- Predictions recalculate IMMEDIATELY when weather is changed

4. WEATHER → PREDICTION ADJUSTMENT:

The weather adjustment formula (rules-based, FREE tier):

For each product on each day:
  base_prediction = average of same-day-of-week historical sales
  
  weather_factor = product.weather_sensitivity × temperature_impact
  
  where temperature_impact:
    temp < 5°C:  cold_boost = +0.15 per sensitivity point toward cold
    5-15°C:      neutral (no adjustment)
    15-25°C:     warm_boost = +0.10 per sensitivity point toward warm
    25°C+:       hot_boost = +0.20 per sensitivity point toward warm
  
  rain_factor:
    if raining: -5% for all items (fewer customers overall)
    if snowing: -10%
  
  adjusted_prediction = base_prediction × (1 + weather_factor + rain_factor)

Example: Iced lemonade, weather_sensitivity = +2, forecast 28°C sunny:
  base: 30/day average
  weather: +2 × 0.20 = +40%
  rain: 0% (sunny)
  prediction: 30 × 1.40 = 42

The Pro tier AI overrides this with actual observed correlations 
from the product's sales history vs weather data.

5. WEATHER DATA CACHING:

- Fetch forecast once per day (or on tab open if stale > 6 hours)
- Cache in SQLite: forecast_weather table
- If API fails, show last known forecast + warning:
  "⚠️ Prévisions météo non disponibles — dernière mise à jour: 
   il y a 2 jours / Weather forecast unavailable — last updated: 
   2 days ago"
- Manual override always works regardless of API status

CREATE TABLE forecast_weather (
  date TEXT PRIMARY KEY,
  temp_max REAL,
  temp_min REAL,
  precipitation REAL,
  weather_code INTEGER,
  source TEXT DEFAULT 'auto',
  fetched_at TEXT DEFAULT (datetime('now','localtime'))
);

All text bilingual (FR/EN).
```

---

## PHASE 4 — Predictions & Weekly View

```
Build the main prediction engine and weekly planning view.

1. PREDICTION ENGINE (FREE tier — rules-based):

For each product, for each upcoming day:

a) Gather historical data:
   - All sales for the same day of week (e.g., all Fridays)
   - Weight recent data more heavily:
     * Last week: weight 4
     * 2 weeks ago: weight 3
     * 3 weeks ago: weight 2
     * 4+ weeks ago: weight 1

b) Calculate weighted average

c) Apply weather adjustment (from Phase 3 formula)

d) Apply trend adjustment:
   - If sales have been increasing over the last 4 weeks: +adjustment
   - If decreasing: -adjustment
   - Trend = (last 2 weeks avg - previous 2 weeks avg) / previous 2 weeks avg

e) Determine confidence level:
   - < 2 weeks of data for that day: "Estimation de base / Base estimate" 
     (uses base_quantity from product setup)
   - 2-4 weeks: "Confiance faible / Low confidence"
   - 4-8 weeks: "Confiance moyenne / Medium confidence"
   - 8+ weeks: "Confiance élevée / High confidence"
   
f) Round to nearest whole number

g) Check for stockout history:
   - If this product ran out on the same day of week recently,
     the prediction should be HIGHER than what was sold 
     (because actual demand was unknown — it was at least what sold)

2. WEEKLY FORECAST VIEW (main Prévisions tab screen):

Header:
"Prévisions — Semaine du [date] / Forecast — Week of [date]"
← → arrows to navigate weeks
"Aujourd'hui / Today" button to jump back

Weather bar (from Phase 3):
| Lun | Mar | Mer | Jeu | Ven | Sam | Dim |
| 4°🌧 | 8°☁ | 12°☀ | 10°🌧 | 18°☀ | 22°☀ | 14°☁ |

Product forecast table:

| Produit | Lun | Mar | Mer | Jeu | Ven | Sam | Dim | TOTAL | Alerte |
|---------|-----|-----|-----|-----|-----|-----|-----|-------|--------|
| Croissant | 28 | 31 | 35 | 33 | 52 | 58 | 22 | 259 | 🟢 |
| Baguette  | 60 | 62 | 65 | 61 | 78 | 82 | 45 | 453 | 🔴 |
| Pain choc | 20 | 22 | 24 | 22 | 38 | 42 | 15 | 183 | 🟡 |

Color-coding per cell:
- Confidence high: white text
- Confidence medium: slightly dimmed
- Confidence low: dimmed with dotted underline
- Base estimate only: gray italic

Alert column:
- 🟢 Optimisé / Optimized: waste < 10%, zero stockouts
- 🟡 Surproduction / Overproduction: average waste > 15%
- 🔴 Ruptures / Stockouts: ran out recently on this day of week

Click any cell to see the breakdown:
"Croissant — Vendredi 21 mars
 Prédiction: 52
 Confiance: Élevée (12 vendredis de données)
 Basé sur: Moyenne pondérée vendredis: 48
           Météo 18°☀: +8% (neutre, léger boost chaleur)
           Tendance: ↑3% ce mois
 Historique: Rupture 2 vendredis sur 4 dernier mois"

3. COMPARISON ROW (what they actually made last week):

Below the prediction table, show a comparison:

"Semaine dernière (réel) / Last week (actual)"
| Produit | Lun | Mar | Mer | Jeu | Ven | Sam | Dim | Gaspillage |
| Croissant | 50 | 50 | 50 | 50 | 50 | 55 | 30 | 18% |
| Baguette  | 80 | 80 | 80 | 80 | 80 | 80 | 60 | 14% |

This shows them: "you made 50 every day but only needed 28 on Monday"

4. DATA COMPLETENESS WARNING:

If there are missing days in recent data, show at the top:

"⚠️ Données manquantes: Mar 11, Mer 12, Jeu 13 — les prévisions 
 utilisent les données disponibles les plus récentes.
 Missing data: Mar 11, Wed 12, Thu 13 — forecasts use the most 
 recent available data."

All text bilingual (FR/EN).
```

---

## PHASE 5 — Production List

```
Generate actionable production lists from the predictions.

1. PRODUCTION LIST VIEW:

Button: "📋 Générer la liste de production / Generate production list"

The user selects:
- Date range: "Produire pour / Produce for" [start date] → [end date]
  Default: next 3 days
- Current stock: optionally enter what's currently on hand per product
  (for products with shelf life > 1 day, this reduces what needs to be made)

Output — grouped by production date (not sales date):

"LISTE DE PRODUCTION — Dimanche 16 mars
 PRODUCTION LIST — Sunday March 16"

Section 1: Products to make for Monday-Wednesday
(shelf life 1 day = must be made each day, so grouped by when to bake)

For items with shelf life = 1 (bake daily):
  "À produire LUNDI / To produce MONDAY:"
  | Produit | Qté prévue | En stock | À produire |
  | Croissant | 28 | 0 | 28 |
  | Baguette | 60 | 0 | 60 |
  
  "À produire MARDI / To produce TUESDAY:"
  | Croissant | 31 | 0 | 31 |
  | Baguette | 62 | 0 | 62 |

For items with shelf life > 1 (batch production):
  "Production en lot — valable 3 jours / Batch production — 3-day shelf life:"
  | Produit | Lun+Mar+Mer total | En stock | À produire |
  | Cookies | 120 (40+40+40) | 15 | 105 |

2. WEATHER ANNOTATIONS:

On the production list, annotate weather-sensitive items:

"☀️ Mardi 18°C ensoleillé:
 Limonade: +15% vs normal (prévision ajustée: 46 → 53)"
 
"🌧 Jeudi pluie prévue:
 Soupe du jour: +10% vs normal (prévision ajustée: 30 → 33)"

3. SMART ADJUSTMENTS:

Show a summary at the bottom:

"Ajustements suggérés vs production actuelle / 
 Suggested adjustments vs current production:"

| Produit | Production actuelle | Suggérée | Diff | Raison |
|---------|-------------------|----------|------|--------|
| Croissant | 50/jour | 28-52 | -22 à +2 | Surproduction Lun-Jeu |
| Baguette | 80/jour | 60-82 | -20 à +2 | Surproduction Lun-Jeu |

"Économie potentielle cette semaine: ~73 unités de croissant 
 Potential savings this week: ~73 croissant units"

4. PRINT / EXPORT:

"🖨️ Imprimer / Print" — opens print dialog with clean formatted list
"📥 Exporter CSV / Export CSV" — download as spreadsheet

The production list is the actionable output a baker prints and 
tapes to the wall.

All text bilingual (FR/EN).
```

---

## PHASE 6 — Alerts & Item Intelligence

```
Build the smart alert system and per-item intelligence view.

1. ALERTS DASHBOARD:

At the top of the Prévisions tab, show active alerts:

🔴 STOCKOUT ALERTS:
"Baguette: rupture de stock 3 vendredis sur 4 le mois dernier. 
 Production actuelle vendredi: 80. Suggéré: 95.
 Baguette: stockout 3 of last 4 Fridays. Current Friday production: 80. 
 Suggested: 95."

🟡 OVERPRODUCTION ALERTS:
"Pain au chocolat: gaspillage moyen de 22% les lundis. Vous 
 produisez 40, vous vendez en moyenne 28. Suggéré: 32.
 Pain au chocolat: average 22% waste on Mondays. You produce 40, 
 average sales 28. Suggested: 32."

🟢 OPTIMIZED:
"Croissant: bien calibré — gaspillage 4%, zéro rupture.
 Croissant: well calibrated — 4% waste, zero stockouts."

Alerts update automatically as new sales data comes in.

2. PER-ITEM INTELLIGENCE:

Click any product name to see its full profile:

"CROISSANT — Profil 30 jours / 30-day profile"

Overview:
- Moyenne vendue/jour: 42 / Average sold/day: 42
- Moyenne produite/jour: 50 / Average produced/day: 50
- Taux de gaspillage: 16% / Waste rate: 16%
- Jours de rupture: 3 (vendredis) / Stockout days: 3 (Fridays)
- Tendance: ↑5% ce mois / Trend: ↑5% this month

Day-of-week chart:
Bar chart showing average sales per day of week
Overlay: what was produced (to visualize the gap)

Weather correlation:
"Corrélation observée: +12% les jours ensoleillés >15°C
 Observed correlation: +12% on sunny days above 15°C"

If this differs from the manual weather_sensitivity setting:
"💡 Vos données suggèrent une sensibilité de +1 au lieu de 0 (neutre).
 Mettre à jour? [Oui] [Non]
 Your data suggests sensitivity +1 instead of 0 (neutral). 
 Update? [Yes] [No]"

Recent history:
Table of last 14 days: date, made, sold, remaining, stockout, weather

3. AI ANALYSIS BUTTON (Pro tier):

On the Prévisions tab and on each item profile, show:
"✨ Analyser avec IA / Analyze with AI"

Gate behind canUse('aiAnalysis').

When clicked, send to Claude API:
- Full sales history for the product (or all products for overview)
- Weather data (historical + forecast)
- Day-of-week patterns
- Stockout history
- Waste history
- Current production quantities

Claude returns a natural language analysis:

"✨ Analyse IA — Croissant:
 Vous surproduisez systématiquement du lundi au jeudi 
 d'environ 15 unités/jour. Mais vous manquez de stock les vendredis. 
 Suggestion: réduisez à 30 lun-jeu, augmentez à 58 le vendredi. 
 Cela économiserait ~60 croissants/semaine en gaspillage tout en 
 éliminant les ruptures du vendredi.
 
 De plus, vos données montrent que les ventes de croissants 
 augmentent de 12% les jours ensoleillés au-dessus de 15°C — 
 j'ai ajusté les prévisions de vendredi en conséquence."

For the weekly overview AI:
"✨ Résumé de la semaine:
 Production optimale vs actuelle: -47 unités totales
 Top 3 gaspillages: Pain choc (22%), Muffin bleuet (18%), Scone (15%)
 Risque de rupture: Baguette vendredi (considérez +15 unités)
 Météo impact: Samedi 22°C — augmentez les boissons froides de 20%"

4. CONFIDENCE AND ACCURACY TRACKING:

Over time, track how accurate the predictions were:

"Précision des prévisions — 30 derniers jours / 
 Forecast accuracy — last 30 days"

| Produit | Précision moy. | Meilleur jour | Pire jour |
|---------|----------------|---------------|-----------|
| Croissant | 89% | Mercredi (94%) | Vendredi (76%) |
| Baguette | 82% | Mardi (91%) | Samedi (71%) |

Accuracy = 1 - |predicted - actual| / actual

This tells the user how much they can trust the predictions 
and where the model still needs more data.

All text bilingual (FR/EN). Update CLAUDE.md and ROADMAP.md when done.
```

---

## TIER SUMMARY

| Feature | Free | Pro |
|---------|------|-----|
| Product catalog setup | ✅ | ✅ |
| Manual sales entry | ✅ | ✅ |
| CSV/Excel import | ✅ | ✅ |
| POS itemized import | ❌ | ✅ |
| Rules-based predictions (weighted averages) | ✅ | ✅ |
| Weather forecast integration | ✅ | ✅ |
| Manual weather override | ✅ | ✅ |
| Weekly forecast view | ✅ | ✅ |
| Production list generation | ✅ | ✅ |
| Stockout & overproduction alerts | ✅ | ✅ |
| Per-item intelligence profile | ✅ | ✅ |
| Print / CSV export | ✅ | ✅ |
| ✨ AI analysis with Claude | ❌ | ✅ |
| AI-adjusted predictions (replaces rules) | ❌ | ✅ |
| AI cross-product insights | ❌ | ✅ |
| Auto weather sensitivity learning | ❌ | ✅ |

---

## DATA FLOW

```
Sales data (POS / CSV / manual)
  → SQLite (forecast_daily_sales)
  → Prediction engine reads history
  → Weather forecast (Open-Meteo or manual)
  → Day-of-week pattern + weather adjustment + trend
  → Weekly prediction table
  → Production list output
  → Alerts (stockout / overproduction / optimized)
  → AI layer (Pro) adds reasoning and cross-product insights
```

---

## IMPORTANT NOTES

- Products in this module are EXAMPLES only. Do not hardcode any 
  specific products. Users create their own.
- The system must gracefully handle: missing days, late data entry, 
  products with zero history, products added mid-stream
- Confidence levels must be honest — never show "High confidence" 
  with only 1 week of data
- Weather forecast fetches from Open-Meteo free API — same coordinates 
  as existing weather config
- This module's data syncs to Supabase cloud like everything else 
  (for Pro/Franchise users)
- Audit trail applies: changes to historical sales data are logged

*BalanceIQ Prévisions Module — March 2026*
