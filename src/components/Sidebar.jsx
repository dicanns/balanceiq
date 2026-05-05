import React from 'react';
import {
  NavIcon,
  IconCalendar,
  IconDollar,
  IconReceipt,
  IconBarChart,
  IconLightbulb,
  IconActivity,
  IconCalculator,
  IconTrendingDown,
  IconLeaf,
  IconBuilding,
  IconMapPin,
  IconSettings,
  IconSun,
  IconMoon,
  IconShield,
} from './Icons.jsx';

// Color palette per tab ID
const TAB_COLORS = {
  daily:        { stroke: '#F5923E', bg: 'rgba(245,146,62,0.12)' },
  encaisse:     { stroke: '#5AC8D8', bg: 'rgba(90,200,216,0.12)' },
  facturation:  { stroke: '#4A90D9', bg: 'rgba(74,144,217,0.12)' },
  monthly:      { stroke: '#9B6FD1', bg: 'rgba(155,111,209,0.12)' },
  intelligence: { stroke: '#9B6FD1', bg: 'rgba(155,111,209,0.12)' },
  previsions:   { stroke: '#E87CA0', bg: 'rgba(232,124,160,0.12)' },
  recettes:     { stroke: '#F7CE46', bg: 'rgba(247,206,70,0.12)' },
  waste:        { stroke: '#E25B5B', bg: 'rgba(226,91,91,0.12)' },
  eco:          { stroke: '#63B76C', bg: 'rgba(99,183,108,0.12)' },
  compliance:      { stroke: '#38BDF8', bg: 'rgba(56,189,248,0.12)' },
  taxconformite:   { stroke: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  reseau:       { stroke: '#A78BFA', bg: 'rgba(167,139,250,0.12)' },
  mylocations:  { stroke: '#4A90D9', bg: 'rgba(74,144,217,0.12)' },
  settings:     { stroke: '#8E8FA3', bg: 'rgba(142,143,163,0.10)' },
};

function TabIcon({ id, active }) {
  const c = TAB_COLORS[id] || TAB_COLORS.settings;
  const stroke = active ? '#fff' : c.stroke;
  const bg = active ? 'rgba(255,255,255,0.18)' : c.bg;
  const sz = 16;
  const icons = {
    daily:        <IconCalendar size={sz} stroke={stroke}/>,
    encaisse:     <IconDollar size={sz} stroke={stroke}/>,
    facturation:  <IconReceipt size={sz} stroke={stroke}/>,
    monthly:      <IconBarChart size={sz} stroke={stroke}/>,
    intelligence: <IconLightbulb size={sz} stroke={stroke}/>,
    previsions:   <IconActivity size={sz} stroke={stroke}/>,
    recettes:     <IconCalculator size={sz} stroke={stroke}/>,
    waste:        <IconTrendingDown size={sz} stroke={stroke}/>,
    eco:          <IconLeaf size={sz} stroke={stroke}/>,
    compliance:      <IconActivity size={sz} stroke={stroke}/>,
    taxconformite:   <IconShield size={sz} stroke={stroke}/>,
    reseau:       <IconBuilding size={sz} stroke={stroke}/>,
    mylocations:  <IconMapPin size={sz} stroke={stroke}/>,
    settings:     <IconSettings size={sz} stroke={stroke}/>,
  };
  return <NavIcon color={stroke} bg={bg} size={28}>{icons[id] || icons.settings}</NavIcon>;
}

function SectionLabel({ label, t }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.8px',
      textTransform: 'uppercase',
      color: t.textMuted,
      padding: '14px 4px 4px',
    }}>
      {label}
    </div>
  );
}

function NavItem({ id, label, active, onClick, badge, t }) {
  return (
    <button
      onClick={() => onClick(id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '5px 8px',
        margin: '1px 0',
        borderRadius: 10,
        border: 'none',
        background: active ? 'linear-gradient(135deg,#f97316,#ea580c)' : 'transparent',
        color: active ? '#fff' : t.text,
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: "'Satoshi',-apple-system,BlinkMacSystemFont,sans-serif",
        fontSize: 13.5,
        fontWeight: active ? 700 : 500,
        transition: 'background 0.12s, color 0.12s',
        boxShadow: active ? '0 2px 8px rgba(249,115,22,0.28)' : 'none',
      }}
    >
      <TabIcon id={id} active={active}/>
      <span style={{ flex: 1 }}>{label}</span>
      {badge > 0 && (
        <span style={{
          background: '#ef4444',
          color: '#fff',
          borderRadius: 10,
          fontSize: 9,
          fontWeight: 700,
          padding: '1px 6px',
          lineHeight: 1.6,
        }}>{badge}</span>
      )}
    </button>
  );
}

export default function Sidebar({
  t,
  activeTab,
  setActiveTab,
  appMode,
  previsionsEnabled,
  canUse,
  myLinkedLocations,
  prevInsightCount,
  hasClosePolicy,
  themeName,
  toggleTheme,
  T,
  lang,
}) {
  const isActive = (id) => activeTab === id;

  return (
    <div style={{
      width: 220,
      minWidth: 220,
      height: '100vh',
      background: t.headerBg,
      borderRight: `1px solid ${t.headerBorder}`,
      display: 'flex',
      flexDirection: 'column',
      position: 'sticky',
      top: 0,
      overflowY: 'auto',
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '18px 14px 14px',
        borderBottom: `1px solid ${t.headerBorder}`,
        marginBottom: 4,
      }}>
        <div style={{
          width: 32,
          height: 32,
          borderRadius: 9,
          background: 'linear-gradient(135deg,#f97316,#ea580c)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          fontWeight: 800,
          color: '#fff',
          letterSpacing: -0.5,
          flexShrink: 0,
          boxShadow: '0 2px 8px rgba(249,115,22,0.35)',
        }}>BIQ</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: t.text, letterSpacing: '-0.3px', lineHeight: 1.1 }}>BalanceIQ</div>
        </div>
      </div>

      {/* Nav items */}
      <div style={{ flex: 1, padding: '4px 6px', overflowY: 'auto' }}>

        {/* Franchiseur-only */}
        {appMode === 'franchiseur' && (
          <NavItem id="reseau" label={T.tabNetwork} active={isActive('reseau')} onClick={setActiveTab} t={t}/>
        )}

        {/* Multi-unit franchisee */}
        {appMode !== 'franchiseur' && myLinkedLocations && myLinkedLocations.length > 1 && (
          <NavItem id="mylocations" label={T.tabMyLocations || 'Mes succursales'} active={isActive('mylocations')} onClick={setActiveTab} t={t}/>
        )}

        {/* QUOTIDIEN */}
        <SectionLabel label={lang === 'en' ? 'Daily' : 'Quotidien'} t={t}/>
        <NavItem id="daily" label={T.tabDaily} active={isActive('daily')} onClick={setActiveTab} t={t}/>
        <NavItem id="encaisse" label={T.tabCash} active={isActive('encaisse')} onClick={setActiveTab} t={t}/>
        <NavItem id="facturation" label={T.tabInvoicing} active={isActive('facturation')} onClick={setActiveTab} t={t}/>

        {/* MENSUEL */}
        <SectionLabel label={lang === 'en' ? 'Monthly' : 'Mensuel'} t={t}/>
        <NavItem id="monthly" label={T.tabPL} active={isActive('monthly')} onClick={setActiveTab} t={t}/>

        {/* OPERATIONS */}
        <SectionLabel label={lang === 'en' ? 'Operations' : 'Opérations'} t={t}/>
        {previsionsEnabled && (
          <NavItem id="previsions" label={T.tabPrevisions} active={isActive('previsions')} onClick={setActiveTab} badge={prevInsightCount} t={t}/>
        )}
        {canUse && canUse('ocrScanning') && (
          <NavItem id="recettes" label={T.tabRecettes || 'Coûts'} active={isActive('recettes')} onClick={setActiveTab} t={t}/>
        )}
        <NavItem id="waste" label={T.tabWaste || 'Gaspillage'} active={isActive('waste')} onClick={setActiveTab} t={t}/>
        {appMode === 'franchiseur' && (
          <NavItem id="eco" label="Écocontrib." active={isActive('eco')} onClick={setActiveTab} t={t}/>
        )}
        {hasClosePolicy && (
          <NavItem id="compliance" label={lang === 'en' ? 'Compliance' : 'Conformité'} active={isActive('compliance')} onClick={setActiveTab} t={t}/>
        )}

        {/* ANALYSE */}
        <SectionLabel label={lang === 'en' ? 'Analysis' : 'Analyse'} t={t}/>
        <NavItem id="intelligence" label={T.tabIntelligence} active={isActive('intelligence')} onClick={setActiveTab} t={t}/>
        <NavItem id="taxconformite" label={lang === 'en' ? 'Tax Compliance' : 'Conformité fiscale'} active={isActive('taxconformite')} onClick={setActiveTab} t={t}/>

        {/* Divider before settings */}
        <div style={{ height: 1, background: t.divider, margin: '12px 2px 8px' }}/>

        <NavItem id="settings" label={T.tabConfig} active={isActive('settings')} onClick={setActiveTab} t={t}/>
      </div>

      {/* Bottom: theme toggle */}
      <div style={{
        padding: '10px 8px 14px',
        borderTop: `1px solid ${t.divider}`,
      }}>
        <div style={{
          display: 'flex',
          background: t.section,
          borderRadius: 10,
          padding: 3,
          gap: 2,
        }}>
          <button
            onClick={() => themeName !== 'light' && toggleTheme()}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              padding: '5px 0',
              borderRadius: 8,
              border: 'none',
              background: themeName === 'light' ? t.card : 'transparent',
              color: themeName === 'light' ? '#f97316' : t.textMuted,
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 700,
              fontFamily: "'Satoshi',-apple-system,BlinkMacSystemFont,sans-serif",
              boxShadow: themeName === 'light' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            <IconSun size={12} stroke={themeName === 'light' ? '#f97316' : t.textMuted} strokeWidth={2.5}/>
            {lang === 'en' ? 'Light' : 'Clair'}
          </button>
          <button
            onClick={() => themeName !== 'dark' && toggleTheme()}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              padding: '5px 0',
              borderRadius: 8,
              border: 'none',
              background: themeName === 'dark' ? t.card : 'transparent',
              color: themeName === 'dark' ? '#818cf8' : t.textMuted,
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 700,
              fontFamily: "'Satoshi',-apple-system,BlinkMacSystemFont,sans-serif",
              boxShadow: themeName === 'dark' ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
            }}
          >
            <IconMoon size={12} stroke={themeName === 'dark' ? '#818cf8' : t.textMuted} strokeWidth={2.5}/>
            {lang === 'en' ? 'Dark' : 'Sombre'}
          </button>
        </div>
      </div>
    </div>
  );
}
