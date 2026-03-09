# Contribuer à BalanceIQ / Contributing to BalanceIQ

---

## 🇫🇷 Français

### Environnement de développement

**Prérequis :** Node.js 18+, Git

```bash
git clone https://github.com/dicanns/balanceiq.git
cd balanceiq
npm install
npm start
```

`npm start` lance le serveur Vite (port 5173) et Electron en parallèle.

### Soumettre une pull request

1. Créez une branche à partir de `main` : `git checkout -b feat/ma-fonctionnalite`
2. Faites vos modifications avec des commits clairs et atomiques
3. Assurez-vous que `npm start` fonctionne sans erreur
4. Ouvrez une PR sur GitHub avec une description claire de ce qui a changé et pourquoi

### Règles importantes

**Bilinguisme obligatoire**
Tout texte visible dans l'interface doit avoir une clé dans les deux objets `FR` et `EN`
de `src/i18n/translations.js`. Aucune chaîne de caractères en dur dans les composants.

**Intégrité des données financières**
Les calculs financiers (réconciliation, P&L, facturation) doivent préserver l'intégrité
du journal d'audit. Toute modification d'un enregistrement existant passe par
`logUpdate()` ou `logCorrection()` — jamais en écrasant silencieusement les données.

**Pas de suppression sur les données financières**
Les factures, paiements, soumissions et commandes ne se suppriment pas — ils
s'annulent (`void`). Utiliser `logVoid()` et mettre le statut à `"Annulée"`.
La suppression physique n'est autorisée que pour les données de configuration
(fournisseurs, clients, catégories).

**Code de conduite**
Soyez respectueux, inclusif et constructif dans toutes les interactions —
issues, pull requests, commentaires de code. Les contributions de tous niveaux
d'expérience sont les bienvenues.

---

## 🇬🇧 English

### Dev environment setup

**Requirements:** Node.js 18+, Git

```bash
git clone https://github.com/dicanns/balanceiq.git
cd balanceiq
npm install
npm start
```

`npm start` runs the Vite dev server (port 5173) and Electron in parallel.

### Submitting a pull request

1. Branch from `main`: `git checkout -b feat/my-feature`
2. Make focused, well-described commits
3. Verify `npm start` runs without errors
4. Open a PR on GitHub with a clear description of what changed and why

### Important rules

**Bilingual UI required**
All visible UI text must have a key in both the `FR` and `EN` objects in
`src/i18n/translations.js`. No hardcoded strings in components.

**Financial data integrity**
Financial calculations (reconciliation, P&L, invoicing) must preserve audit trail
integrity. Any modification to an existing record goes through `logUpdate()` or
`logCorrection()` — never by silently overwriting data.

**No hard deletes on financial data**
Invoices, payments, quotes, and orders are not deleted — they are voided.
Use `logVoid()` and set status to `"Annulée"`. Hard deletes are only permitted
for configuration data (suppliers, clients, categories).

**Code of conduct**
Be respectful, inclusive, and constructive in all interactions —
issues, pull requests, code reviews. Contributions from all experience
levels are welcome.
