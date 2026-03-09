import { useState, useEffect, useCallback, useRef, useMemo, useContext, createContext } from "react";
import { version as appVersion } from "../package.json";
import { canUse, shouldShowUpgradePrompt } from "./config/features.js";
import { logCreate, logUpdate, logVoid, logCorrection, isFinancialField, promptCorrectionReason } from "./services/auditLogger.js";

// ── THEME ──
const DARK = {
  name:'dark',
  bg:'#0c0e14',
  card:'rgba(255,255,255,0.015)',
  cardBorder:'rgba(255,255,255,0.05)',
  section:'rgba(255,255,255,0.03)',
  sectionBorder:'rgba(255,255,255,0.055)',
  rowBg:'rgba(255,255,255,0.03)',
  rowBorder:'rgba(255,255,255,0.055)',
  divider:'rgba(255,255,255,0.025)',
  dividerMid:'rgba(255,255,255,0.04)',
  dividerStrong:'rgba(255,255,255,0.08)',
  innerBorder:'rgba(255,255,255,0.035)',
  text:'#e8e8ec',
  textSub:'#8b8fa3',
  textMuted:'#5a5e70',
  textDim:'#4a4e5e',
  textDisabled:'#3e4254',
  inputBg:'rgba(255,255,255,0.04)',
  inputBorder:'rgba(255,255,255,0.06)',
  inputText:'#ededf0',
  disabledBg:'rgba(255,255,255,0.015)',
  disabledBorder:'rgba(255,255,255,0.04)',
  disabledText:'#4a4e5e',
  optionBg:'#1a1c24',
  headerBg:'linear-gradient(180deg,rgba(249,115,22,0.06) 0%,transparent 100%)',
  headerBorder:'rgba(255,255,255,0.04)',
  posColor:'#818cf8',
  posRgb:'129,140,248',
  reconBalBg:'rgba(34,197,94,0.05)',
  reconBalBorder:'rgba(34,197,94,0.12)',
  reconErrBg:'rgba(239,68,68,0.05)',
  reconErrBorder:'rgba(239,68,68,0.12)',
  reconNeutralBg:'rgba(255,255,255,0.02)',
  reconNeutralBorder:'rgba(255,255,255,0.04)',
  reconLabel:'#7a7e90',
  reconLabelBold:'#c0c3d4',
  reconValue:'#c0c3d4',
  warnText:'#fbbf24',
  warnBg:'rgba(251,191,36,0.12)',
  balStatusBg:'rgba(34,197,94,0.06)',
  warnStatusBg:'rgba(251,191,36,0.06)',
  cashHeaderBg:'rgba(255,255,255,0.01)',
  rrValue:'#dddde2',
};
const LIGHT = {
  name:'light',
  bg:'#FBF8F4',
  card:'#FFFFFF',
  cardBorder:'#E8E2D9',
  section:'#F5F1EB',
  sectionBorder:'#E8E2D9',
  rowBg:'#F5F1EB',
  rowBorder:'#E8E2D9',
  divider:'#E8E2D9',
  dividerMid:'#E8E2D9',
  dividerStrong:'#DDD7CE',
  innerBorder:'#E8E2D9',
  text:'#1A1A1A',
  textSub:'#6B6560',
  textMuted:'#9C968E',
  textDim:'#9C968E',
  textDisabled:'#C5BFB8',
  inputBg:'#FFFFFF',
  inputBorder:'#DDD7CE',
  inputText:'#1A1A1A',
  disabledBg:'#F5F1EB',
  disabledBorder:'#E8E2D9',
  disabledText:'#9C968E',
  optionBg:'#FFFFFF',
  headerBg:'#FFFFFF',
  headerBorder:'#E8E2D9',
  posColor:'#4F64D8',
  posRgb:'79,100,216',
  reconBalBg:'#F0FAF0',
  reconBalBorder:'rgba(22,163,74,0.3)',
  reconErrBg:'#FEF2F2',
  reconErrBorder:'rgba(220,38,38,0.3)',
  reconNeutralBg:'#F5F1EB',
  reconNeutralBorder:'#E8E2D9',
  reconLabel:'#6B6560',
  reconLabelBold:'#1A1A1A',
  reconValue:'#4A4540',
  warnText:'#b45309',
  warnBg:'rgba(180,83,9,0.1)',
  balStatusBg:'#F0FAF0',
  warnStatusBg:'#FFF7ED',
  cashHeaderBg:'#F5F1EB',
  rrValue:'#4A4540',
};

const ThemeCtx = createContext(DARK);
const useT = () => useContext(ThemeCtx);

// ── CONSTANTS ──
const DAYS_FR=["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"];
const MONTHS_FR=["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const QC_HOL={"01-01":"Jour de l'An","03-29":"Vendredi saint","04-01":"Lundi de Pâques","05-20":"Journée nationale des patriotes","06-24":"Fête nationale du Québec","07-01":"Fête du Canada","09-02":"Fête du Travail","10-14":"Action de grâce","12-25":"Noël","12-26":"Lendemain de Noël"};
const fmt=n=>n==null||isNaN(n)?"—":n.toLocaleString("fr-CA",{style:"currency",currency:"CAD"});
const fmtD=d=>`${DAYS_FR[d.getDay()]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
const dk=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const prevDk=s=>{const d=new Date(s+"T12:00:00");d.setDate(d.getDate()-1);return dk(d)};
const getHol=d=>{const k=`${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;return QC_HOL[k]||null};
const PROVINCES_CA=["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"];
const DEFAULT_COMPANY_INFO={nom:"",adresse:"",ville:"",province:"QC",codePostal:"",telephone:"",courriel:"",siteWeb:"",numeroTPS:"",numeroTVQ:"",logo:null};
const DEFAULT_DOC_NUMS={prefix:"",soumission:1,commande:1,facture:1,creditNote:1,encaissement:1};
function fmtDocNum(prefix,code,num){return`${prefix||""}${code}-${String(num).padStart(4,"0")}`;}

const DEFAULT_SUPPLIERS=[{id:"1",name:"Dubord"},{id:"2",name:"Carrousel"},{id:"3",name:"St. Sylvain"},{id:"4",name:"Pepsi"},{id:"5",name:"Pain"},{id:"6",name:"Sauce"},{id:"7",name:"Costco"}];
const DEFAULT_PLATFORMS=[{id:"doordash",name:"DoorDash",emoji:"🔴"},{id:"ubereats",name:"Uber Eats",emoji:"🟢"},{id:"skip",name:"Skip The Dishes",emoji:"🟠"}];
const DEFAULT_SORTIE_CATS=[{id:"fournisseur_cash",name:"Fournisseur payé cash"},{id:"avance_employe",name:"Avance employé"},{id:"achats_divers",name:"Achats divers"},{id:"reparations",name:"Réparations"},{id:"autre",name:"Autre"}];
const DEFAULT_CASH_LOCATIONS=[{id:"tills",name:"Tiroirs-caisses"},{id:"petty",name:"Petite caisse"},{id:"office",name:"Bureau / Office"}];
const DEFAULT_ENCAISSE_CONFIG={sortieCategories:DEFAULT_SORTIE_CATS,cashLocations:DEFAULT_CASH_LOCATIONS};
const EXPENSE_ITEMS=[["hydro","Hydro"],["gazNat","Gaz Nat/Prop"],["allocAuto","Alloc. d'auto"],["depenseAuto","Dépense Auto"],["cell","Cell"],["telInternet","Tel/Internet"],["fraisProf","Frais Prof"],["assurances","Assurances"],["adPromo","Ad & Promo"],["dons","Dons"],["taxMuni","Tax Muni"],["permisGov","Permis Gov't"],["loyer","Loyer"],["csst","CSST"],["reparations","Réparations"],["equipDecor","Équipement/Décor"]];
const BLANK_CASH={cashierId:"",posVentes:null,posTPS:null,posTVQ:null,posLivraisons:null,float:null,interac:null,livraisons:null,deposits:null,finalCash:null};
const BLANK_EMP={name:"",hours:null,wage:null};
const BLANK_DAY={cashes:[{...BLANK_CASH}],employees:[],hamEnd:null,hamReceived:null,hamStartOverride:null,hotEnd:null,hotReceived:null,hotStartOverride:null,weather:"",tempC:null,gas:null,notes:"",events:""};
const OWNER_EMAIL="info@dicanns.ca";
const DAILY_FIELD_LABELS={posVentes:"Ventes POS",posTPS:"TPS POS",posTVQ:"TVQ POS",posLivraisons:"Livraisons POS",float:"Float",interac:"Interac",livraisons:"Livraisons caisse",deposits:"Dépôts",finalCash:"Cash final",hamEnd:"Hamburgers — fin",hotEnd:"Hot dogs — fin",hamReceived:"Hamburgers — reçus",hotReceived:"Hot dogs — reçus"};
const WMO_FR=code=>{if(code===0)return"Ensoleillé";if(code<=2)return"Peu nuageux";if(code===3)return"Couvert";if(code<=48)return"Brouillard";if(code<=55)return"Bruine";if(code<=65)return"Pluie";if(code<=75)return"Neige";if(code<=82)return"Averses";if(code<=86)return"Averses de neige";if(code<=99)return"Orageux";return"Variable"};

function genDemo(){const data={};const base=new Date(2024,0,1);for(let i=0;i<366;i++){const d=new Date(base);d.setDate(d.getDate()+i);const dow=d.getDay(),isWe=dow===0||dow===6;const total=Math.max(800,Math.round((isWe?2800:1900)+Math.sin((d.getMonth()/12)*Math.PI)*400+(Math.random()-0.5)*600));data[dk(d)]={venteNet:total,hamUsed:Math.round((18+Math.random()*12)*(0.7+Math.random()*0.25)),hotUsed:Math.round((12+Math.random()*8)*(0.7+Math.random()*0.25))}}return data}

// ── ATOMS ──
function F({label,value,onChange,disabled,prefix,suffix,type="number",placeholder,wide,accent:ac,tabIndex:ti,warn}){
  const t=useT();
  const [touched,setTouched]=useState(false);
  const border=disabled?`1px solid ${t.disabledBorder}`:ac?`1px solid rgba(${ac},0.25)`:`1px solid rgba(249,115,22,${value!=null&&value!==""?0.25:0.1})`;
  return(<div>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"3.5px 0",borderBottom:`1px solid ${t.divider}`,gap:4}}>
      <span style={{fontSize:11.5,color:disabled?t.textDisabled:t.textSub,fontWeight:500,whiteSpace:"nowrap"}}>{label}</span>
      <div style={{display:"flex",alignItems:"center",gap:2}}>
        {prefix&&<span style={{fontSize:10.5,color:t.textDisabled}}>{prefix}</span>}
        <input type={type} inputMode={type==="number"?"decimal":"text"} placeholder={placeholder||""} value={value??""}
          onChange={e=>{if(type==="number")onChange(e.target.value===""?null:parseFloat(e.target.value));else onChange(e.target.value)}}
          onBlur={()=>setTouched(true)}
          onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();const all=Array.from(document.querySelectorAll('input[type="number"]:not([disabled]),input[type="text"]:not([disabled])'));const idx=all.indexOf(e.target);const next=all.slice(idx+1).find(i=>i.value==='');if(next)next.focus();else e.target.blur();}}}
          disabled={disabled} tabIndex={ti}
          style={{width:wide?125:80,padding:"3.5px 6px",borderRadius:4,border,background:disabled?t.disabledBg:t.inputBg,color:disabled?t.disabledText:t.inputText,fontFamily:"'DM Mono',monospace",fontSize:12,textAlign:"right",outline:"none"}}/>
        {suffix&&<span style={{fontSize:10,color:t.textDisabled}}>{suffix}</span>}
      </div>
    </div>
    {touched&&warn&&<div style={{fontSize:10,color:"#f97316",padding:"1px 0 2px"}}>{warn}</div>}
  </div>);
}

function PL({label,value,onChange,prefix,warn}){
  const t=useT();
  const [local,setLocal]=useState(value??"");
  const [focused,setFocused]=useState(false);
  const [blurred,setBlurred]=useState(false);
  useEffect(()=>{if(!focused)setLocal(value??"")},[value,focused]);
  return(<div>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"3.5px 0",borderBottom:`1px solid ${t.divider}`,gap:4}}>
      <span style={{fontSize:11.5,color:t.textSub,fontWeight:500,whiteSpace:"nowrap"}}>{label}</span>
      <div style={{display:"flex",alignItems:"center",gap:2}}>
        {prefix&&<span style={{fontSize:10.5,color:t.textDisabled}}>{prefix}</span>}
        <input type="number" inputMode="decimal" value={local}
          onChange={e=>setLocal(e.target.value)}
          onFocus={()=>setFocused(true)}
          onBlur={()=>{setFocused(false);setBlurred(true);const n=local===""?null:parseFloat(local);if(n!==value)onChange(n)}}
          onKeyDown={e=>{if(e.key==="Enter"){const tgt=e.target;tgt.blur();setTimeout(()=>{const all=Array.from(document.querySelectorAll('input[type="number"]:not([disabled])'));const idx=all.indexOf(tgt);const next=all.slice(idx+1).find(i=>i.value==='');if(next)next.focus();},50);}}}
          style={{width:80,padding:"3.5px 6px",borderRadius:4,border:`1px solid rgba(249,115,22,${local!==""?0.25:0.1})`,background:t.inputBg,color:t.inputText,fontFamily:"'DM Mono',monospace",fontSize:12,textAlign:"right",outline:"none"}}/>
      </div>
    </div>
    {blurred&&!focused&&warn&&<div style={{fontSize:10,color:"#f97316",padding:"1px 0 2px"}}>{warn}</div>}
  </div>);
}

const RR=({label,value,accent,unit="$",bold})=>{
  const t=useT();
  const disp=value==null?"—":unit==="$"?fmt(value):value;
  return(<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"3.5px 0",borderBottom:`1px solid ${t.divider}`}}><span style={{fontSize:11.5,color:t.textSub,fontWeight:bold?600:500}}>{label}</span><span style={{fontFamily:"'DM Mono',monospace",fontSize:bold?13:12,color:accent||t.rrValue,fontWeight:bold?700:600,minWidth:80,textAlign:"right"}}>{disp}</span></div>);
};

const Pill=({ok,label,warn})=>{
  const t=useT();
  return(<span style={{display:"inline-flex",alignItems:"center",gap:3,padding:"2px 7px",borderRadius:14,fontSize:9.5,fontWeight:600,background:warn?t.warnBg:ok?"rgba(34,197,94,0.1)":"rgba(239,68,68,0.1)",color:warn?t.warnText:ok?"#16a34a":"#dc2626"}}><span style={{width:4,height:4,borderRadius:"50%",background:warn?t.warnText:ok?"#22c55e":"#ef4444"}}/>{label}</span>);
};

const MC=({label,value,sub,accent})=>{
  const t=useT();
  return(<div style={{background:t.section,border:`1px solid ${t.sectionBorder}`,borderRadius:8,padding:"9px 13px",display:"flex",flexDirection:"column",gap:1,minWidth:100,flex:"1 1 100px"}}><span style={{fontSize:8.5,color:t.textMuted,textTransform:"uppercase",letterSpacing:0.8,fontWeight:600}}>{label}</span><span style={{fontSize:18,fontWeight:700,color:accent||t.text,fontFamily:"'DM Mono',monospace"}}>{value}</span>{sub&&<span style={{fontSize:9.5,color:t.textMuted}}>{sub}</span>}</div>);
};

const CompBar=({label,current,previous,unit="$"})=>{
  const t=useT();
  const pct=previous?((current-previous)/previous*100):0;const up=pct>=0;
  return(<div style={{padding:"5px 0",borderBottom:`1px solid ${t.dividerMid}`}}><div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:3,marginBottom:2}}><span style={{fontSize:11,color:t.textSub}}>{label}</span><div style={{display:"flex",gap:8,alignItems:"center"}}><span style={{fontSize:10.5,color:t.textMuted}}>{previous!=null?`${unit==="$"?fmt(previous):previous}`:"—"} → {unit==="$"?fmt(current):current}</span>{previous!=null&&<span style={{fontSize:10,fontWeight:700,color:up?"#22c55e":"#ef4444",fontFamily:"'DM Mono',monospace"}}>{up?"▲":"▼"}{Math.abs(pct).toFixed(1)}%</span>}</div></div><div style={{display:"flex",gap:2,height:3,borderRadius:2,overflow:"hidden"}}><div style={{flex:Math.abs(previous)||1,background:"rgba(139,143,163,0.18)"}}/><div style={{flex:Math.abs(current)||1,background:up?"rgba(34,197,94,0.35)":"rgba(239,68,68,0.3)"}}/></div></div>);
};

const WeekChart=({selectedDate,computeDay,getLR})=>{
  const t=useT();
  const d=new Date(selectedDate+"T12:00:00");const dow=d.getDay();const mon=new Date(d);mon.setDate(d.getDate()-((dow+6)%7));
  const days=[];for(let i=0;i<7;i++){const dd=new Date(mon);dd.setDate(mon.getDate()+i);const key=dk(dd);const cd=computeDay(key);const lr=getLR?getLR(key):null;const complete=cd.anyData&&cd.allBal&&lr?.hamEnd!=null&&lr?.hotEnd!=null;const hasNotes=!!(lr?.notes&&lr.notes.trim().length>0);days.push({key,label:DAYS_FR[dd.getDay()].slice(0,3),vn:cd.venteNet,complete,hasNotes})}
  const mx=Math.max(...days.map(x=>x.vn||0),1);
  const barFilled=t.name==='dark'?"rgba(255,255,255,0.08)":"#DDD7CE";
  const barEmpty=t.name==='dark'?"rgba(255,255,255,0.02)":"#EDE9E3";
  return(<div style={{display:"flex",gap:4,alignItems:"flex-end",height:90}}>{days.map((x,i)=>{const h=Math.max(2,(x.vn/mx)*62);const sel=x.key===selectedDate;return(<div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}><span style={{fontSize:8,color:t.textDim,fontFamily:"'DM Mono',monospace"}}>{x.vn>0?`${(x.vn/1000).toFixed(1)}k`:""}</span><div style={{width:"100%",height:h,borderRadius:3,background:sel?"linear-gradient(180deg,#f97316,#ea580c)":x.vn>0?barFilled:barEmpty}}/><span style={{fontSize:8.5,fontWeight:sel?700:400,color:sel?"#f97316":t.textDim,textTransform:"capitalize"}}>{x.label}</span><div style={{height:6,display:"flex",gap:2,alignItems:"center",justifyContent:"center"}}>{x.complete&&<div style={{width:5,height:5,borderRadius:"50%",background:"#22c55e"}} title="Journée complète"/>}{x.hasNotes&&<div style={{width:4,height:4,borderRadius:"50%",background:"rgba(249,115,22,0.7)"}} title="Notes"/>}</div></div>)})}</div>);
};

function ReconLine({label,value,negative,bold,accent,borderTop}){
  const t=useT();
  return(<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"3px 0",borderTop:borderTop?`1.5px solid ${t.dividerStrong}`:"none"}}><span style={{fontSize:11,color:bold?t.reconLabelBold:t.reconLabel,fontWeight:bold?600:400}}>{label}</span><span style={{fontFamily:"'DM Mono',monospace",fontSize:bold?13:11.5,fontWeight:bold?700:500,color:accent||(negative?"#ef4444":t.reconValue)}}>{value==null?"—":`${negative?"− ":""}${fmt(Math.abs(value))}`}</span></div>);
}

// ── CASH BLOCK ──
function CashBlock({cash,index,onChange,onRemove,canRemove,collapsed,onToggle,roster}){
  const t=useT();
  const posOk=cash.posVentes!=null;const posT=(cash.posVentes||0)+(cash.posTPS||0)+(cash.posTVQ||0)+(cash.posLivraisons||0);
  const mc=cash.float!=null&&cash.deposits!=null&&cash.finalCash!=null;
  const manT=mc?(cash.interac||0)+(cash.livraisons||0)+(cash.deposits||0)+(cash.finalCash||0)-(cash.float||0):null;
  const canR=posOk&&mc;const ecart=canR?manT-posT:null;const bal=canR&&Math.abs(ecart)<=1;
  const rN=roster.find(r=>r.id===cash.cashierId)?.name;const label=rN||`Caisse ${index+1}`;
  const fc=[cash.posVentes,cash.float,cash.interac,cash.deposits,cash.finalCash].filter(v=>v!=null).length;
  const outerBorder=bal?t.reconBalBorder:canR&&!bal?t.reconErrBorder:t.cardBorder;
  const headerBg=bal?t.reconBalBg:t.cashHeaderBg;
  return(<div style={{background:t.card,border:`1px solid ${outerBorder}`,borderRadius:10,overflow:"hidden"}}>
    <div onClick={onToggle} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 11px",cursor:"pointer",background:headerBg,borderBottom:collapsed?"none":`1px solid ${t.innerBorder}`,userSelect:"none"}}>
      <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:12,color:collapsed?t.textMuted:"#f97316",transform:collapsed?"rotate(-90deg)":"rotate(0deg)",display:"inline-block"}}>▾</span><span style={{fontSize:12.5,fontWeight:700,color:t.text}}>{label}</span>{bal&&<Pill ok label="Balancé"/>}{canR&&!bal&&<Pill ok={false} label={`Écart: ${fmt(ecart)}`}/>}{!canR&&fc>0&&<Pill warn label="Incomplet"/>}</div>
      <div style={{display:"flex",gap:4,alignItems:"center"}} onClick={e=>e.stopPropagation()}>{manT!=null&&<span style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:t.textSub,fontWeight:600}}>{fmt(manT)}</span>}{canRemove&&<button onClick={onRemove} style={{background:"rgba(239,68,68,0.07)",border:"none",borderRadius:4,color:"#ef4444",fontSize:10,padding:"2px 6px",cursor:"pointer",fontWeight:600}}>✕</button>}</div>
    </div>
    {!collapsed&&(<div style={{padding:11}}>
      <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:8,paddingBottom:7,borderBottom:`1px solid ${t.innerBorder}`}}><span style={{fontSize:11}}>👤</span><select value={cash.cashierId||""} onChange={e=>onChange({...cash,cashierId:e.target.value})} style={{flex:1,background:t.inputBg,border:`1px solid ${t.inputBorder}`,borderRadius:5,color:t.text,fontSize:12,padding:"4px 7px",outline:"none"}}><option value="" style={{background:t.optionBg}}>— Sélectionner —</option>{roster.map(r=>(<option key={r.id} value={r.id} style={{background:t.optionBg}}>{r.name}</option>))}</select></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div>
          <div style={{fontSize:9.5,color:t.posColor,fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}><span style={{width:8,height:8,borderRadius:2,background:t.posColor,display:"inline-block",marginRight:4}}/> Lecture POS</div>
          <div style={{background:`rgba(${t.posRgb},0.05)`,borderRadius:7,padding:8,border:`1px solid rgba(${t.posRgb},0.12)`}}>
            <F label="Ventes av. taxes" value={cash.posVentes} onChange={v=>onChange({...cash,posVentes:v})} prefix="$" accent={t.posRgb} tabIndex={index*20+1} warn={cash.posVentes!=null&&cash.posVentes<0?"⚠️ Le montant ne peut pas être négatif":cash.posVentes!=null&&cash.posVentes>15000?"⚠️ Montant inhabituellement élevé — vérifier":null}/>
            <F label="TPS" value={cash.posTPS} onChange={v=>onChange({...cash,posTPS:v})} prefix="$" accent={t.posRgb} tabIndex={index*20+2} warn={cash.posTPS!=null&&cash.posTPS<0?"⚠️ Le montant ne peut pas être négatif":null}/>
            <F label="TVQ" value={cash.posTVQ} onChange={v=>onChange({...cash,posTVQ:v})} prefix="$" accent={t.posRgb} tabIndex={index*20+3} warn={cash.posTVQ!=null&&cash.posTVQ<0?"⚠️ Le montant ne peut pas être négatif":null}/>
            <F label="Livraisons" value={cash.posLivraisons} onChange={v=>onChange({...cash,posLivraisons:v})} prefix="$" accent={t.posRgb} tabIndex={index*20+4} warn={cash.posLivraisons!=null&&cash.posLivraisons<0?"⚠️ Le montant ne peut pas être négatif":null}/>
            <div style={{marginTop:4,paddingTop:4,borderTop:`1px solid rgba(${t.posRgb},0.15)`}}><RR label="Total POS" value={posOk?posT:null} accent={t.posColor} bold/></div>
          </div>
        </div>
        <div>
          <div style={{fontSize:9.5,color:"#f97316",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}><span style={{width:8,height:8,borderRadius:2,background:"#f97316",display:"inline-block",marginRight:4}}/> Décompte</div>
          <div style={{background:"rgba(249,115,22,0.04)",borderRadius:7,padding:8,border:"1px solid rgba(249,115,22,0.1)"}}>
            <F label="Float" value={cash.float} onChange={v=>onChange({...cash,float:v})} prefix="$" tabIndex={index*20+5} warn={cash.float!=null&&cash.float>500?"⚠️ Float inhabituellement élevé":cash.float!=null&&cash.float<0?"⚠️ Le float ne peut pas être négatif":null}/>
            <F label="Interac" value={cash.interac} onChange={v=>onChange({...cash,interac:v})} prefix="$" tabIndex={index*20+6} warn={cash.interac!=null&&cash.interac<0?"⚠️ Le montant ne peut pas être négatif":null}/>
            <F label="Livraisons" value={cash.livraisons} onChange={v=>onChange({...cash,livraisons:v})} prefix="$" tabIndex={index*20+7} warn={cash.livraisons!=null&&cash.livraisons<0?"⚠️ Le montant ne peut pas être négatif":null}/>
            <F label="Dépôts" value={cash.deposits} onChange={v=>onChange({...cash,deposits:v})} prefix="$" tabIndex={index*20+8} warn={cash.deposits!=null&&cash.deposits<0?"⚠️ Les dépôts ne peuvent pas être négatifs":null}/>
            <F label="Cash final" value={cash.finalCash} onChange={v=>onChange({...cash,finalCash:v})} prefix="$" tabIndex={index*20+9} warn={cash.finalCash!=null&&cash.finalCash<0?"⚠️ Le montant ne peut pas être négatif":null}/>
          </div>
        </div>
      </div>
      <div style={{marginTop:10,padding:"10px 12px",borderRadius:8,background:bal?t.reconBalBg:canR?t.reconErrBg:t.reconNeutralBg,border:`1px solid ${bal?t.reconBalBorder:canR?t.reconErrBorder:t.reconNeutralBorder}`}}>
        <div style={{fontSize:10,color:t.textSub,fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,marginBottom:6}}>Réconciliation</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:8,alignItems:"start"}}>
          <div><div style={{fontSize:9,color:"#f97316",fontWeight:600,textTransform:"uppercase",marginBottom:4}}>Compté</div><ReconLine label="Interac" value={cash.interac??0}/><ReconLine label="Livraisons" value={cash.livraisons??0}/><ReconLine label="Dépôts" value={cash.deposits??0}/><ReconLine label="Cash final" value={cash.finalCash??0}/><ReconLine label="Float" value={cash.float??0} negative/><ReconLine label="TOTAL" value={manT} bold accent="#f97316" borderTop/></div>
          <div style={{display:"flex",alignItems:"center",paddingTop:40}}><span style={{fontSize:13,fontWeight:700,color:t.textMuted}}>vs</span></div>
          <div><div style={{fontSize:9,color:t.posColor,fontWeight:600,textTransform:"uppercase",marginBottom:4}}>POS</div><ReconLine label="Ventes" value={cash.posVentes??null}/><ReconLine label="TPS" value={cash.posTPS??0}/><ReconLine label="TVQ" value={cash.posTVQ??0}/><ReconLine label="Livraisons" value={cash.posLivraisons??0}/><ReconLine label="TOTAL" value={posOk?posT:null} bold accent={t.posColor} borderTop/></div>
        </div>
        {canR?(<div style={{marginTop:8,padding:"7px 10px",borderRadius:6,textAlign:"center",background:bal?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.08)"}}>{bal?<span style={{fontSize:13,fontWeight:700,color:"#16a34a"}}>✓ BALANCÉ — {fmt(manT)}</span>:<div><span style={{fontSize:13,fontWeight:700,color:"#dc2626"}}>✗ ÉCART {fmt(Math.abs(ecart))}</span><div style={{fontSize:11,color:"#dc2626",marginTop:1}}>{ecart>0?"Surplus":"Manque"} de {fmt(Math.abs(ecart))}</div></div>}</div>):(<div style={{marginTop:8,padding:"7px 10px",borderRadius:6,textAlign:"center",background:t.reconNeutralBg,border:`1px solid ${t.reconNeutralBorder}`}}><span style={{fontSize:11.5,color:t.textMuted}}>{fc===0?"Remplir pour réconcilier":!posOk?"⬅ Remplir POS":"➡ Compléter décompte"}</span></div>)}
      </div>
    </div>)}
  </div>);
}

// ── CSV PARSING UTILS ──
const PLATFORM_COLUMN_HINTS={
  doordash:{dateHints:['payment date','deposit date','date'],amountHints:['amount','total payout','payout amount','net payout','payout']},
  ubereats:{dateHints:['date','payment date','payout date'],amountHints:['payout','total','net payout','amount']},
  skip:{dateHints:['date','payment date','payout date'],amountHints:['net payout','payout','amount','total']},
};
function parseCSVText(text){
  const lines=text.split(/\r?\n/).filter(l=>l.trim());
  if(lines.length<2)return{headers:[],rows:[]};
  const parseRow=line=>{const r=[];let cur='',inQ=false;for(const ch of line){if(ch==='"'){inQ=!inQ;}else if(ch===','&&!inQ){r.push(cur.trim());cur='';}else cur+=ch;}r.push(cur.trim());return r;};
  const headers=parseRow(lines[0]).map(h=>h.replace(/^"|"$/g,'').trim());
  const rows=lines.slice(1).map(l=>{const vals=parseRow(l);const obj={};headers.forEach((h,i)=>{obj[h]=(vals[i]??'').replace(/^"|"$/g,'').trim();});return obj;});
  return{headers,rows};
}
function autoDetectCols(headers,pid){
  const hints=PLATFORM_COLUMN_HINTS[pid]||PLATFORM_COLUMN_HINTS.doordash;
  const lh=headers.map(h=>h.toLowerCase().trim());
  const find=hs=>{for(const h of hs){const i=lh.findIndex(x=>x.includes(h));if(i!==-1)return headers[i];}return null;};
  return{dateCol:find(hints.dateHints),amountCol:find(hints.amountHints)};
}
function parseDateStr(s){
  if(!s)return null;
  if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);
  const m1=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);if(m1)return`${m1[3]}-${m1[1].padStart(2,'0')}-${m1[2].padStart(2,'0')}`;
  const m2=s.match(/^(\d{4})\/(\d{2})\/(\d{2})/);if(m2)return`${m2[1]}-${m2[2]}-${m2[3]}`;
  const MONS={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,janv:1,mars:3,avri:4,mai:5,juin:6,juil:7,sept:9,octo:10,nove:11};
  const m3=s.match(/([a-záàâéèêëîïôùûüç]+)[.\s-]+(\d{1,2})[,.\s-]*(\d{4})/i);
  if(m3){const mn=MONS[m3[1].toLowerCase().slice(0,4)];if(mn)return`${m3[3]}-${String(mn).padStart(2,'0')}-${m3[2].padStart(2,'0')}`;}
  const m4=s.match(/(\d{1,2})[.\s-]+([a-záàâéèêëîïôùûüç]+)[.\s-]+(\d{4})/i);
  if(m4){const mn=MONS[m4[2].toLowerCase().slice(0,4)];if(mn)return`${m4[3]}-${String(mn).padStart(2,'0')}-${m4[1].padStart(2,'0')}`;}
  return null;
}
function parseAmountStr(s){
  if(!s)return null;
  const neg=/^\(/.test(s.trim());
  const n=parseFloat(s.replace(/[$€£,\s]/g,'').replace(/[()]/g,''));
  if(isNaN(n)||n===0)return null;
  const v=Math.round(Math.abs(n)*100)/100;
  return neg?-v:v;
}

// ── LIVRAISONS SECTION ──
function LivraisonsSection({platforms,selectedDate,raw,upd,liveData,apiConfig,saveApiCfg}){
  const t=useT();
  const [collapsed,setCollapsed]=useState(false);
  const [importPid,setImportPid]=useState(null);
  const [importStep,setImportStep]=useState('idle'); // idle|mapping|preview|conflict|done
  const [csvData,setCsvData]=useState(null);
  const [colMap,setColMap]=useState({dateCol:null,amountCol:null});
  const [preview,setPreview]=useState([]);
  const [conflictItems,setConflictItems]=useState([]);
  const [importMsg,setImportMsg]=useState(null);
  const fileRef=useRef(null);
  const pidRef=useRef(null);
  const csvMaps=apiConfig?.csvColumnMaps||{};
  const platData=raw.platformLivraisons||{};
  const getPD=pid=>platData[pid]||{ventes:null,depot:null};
  const updPD=(pid,field,val)=>{const cur=platData[pid]||{ventes:null,depot:null};upd(selectedDate,"platformLivraisons",{...platData,[pid]:{...cur,[field]:val}});};
  const totalVentes=platforms.reduce((s,p)=>s+(getPD(p.id).ventes||0),0);
  const totalDepots=platforms.reduce((s,p)=>s+(getPD(p.id).depot||0),0);
  const totalComm=totalVentes-totalDepots;
  const totalCommPct=totalVentes>0?(totalComm/totalVentes*100):0;

  const openImport=pid=>{
    pidRef.current=pid;
    setImportPid(pid);setCsvData(null);setPreview([]);setConflictItems([]);setImportMsg(null);setImportStep('idle');
    setTimeout(()=>fileRef.current?.click(),0);
  };
  const handleFile=e=>{
    const file=e.target.files[0];if(!file)return;e.target.value='';
    const pid=pidRef.current;
    const reader=new FileReader();
    reader.onload=ev=>{
      const {headers,rows}=parseCSVText(ev.target.result);
      if(!headers.length){setImportMsg('Fichier CSV invalide ou vide.');return;}
      setCsvData({headers,rows});
      const saved=csvMaps[pid];const auto=autoDetectCols(headers,pid);
      const dc=saved?.dateCol&&headers.includes(saved.dateCol)?saved.dateCol:auto.dateCol;
      const ac=saved?.amountCol&&headers.includes(saved.amountCol)?saved.amountCol:auto.amountCol;
      setColMap({dateCol:dc,amountCol:ac});
      if(dc&&ac){doBuildPreview({headers,rows},dc,ac);}else{setImportStep('mapping');}
    };
    reader.readAsText(file);
  };
  const doBuildPreview=(data,dc,ac)=>{
    const src=data||csvData;const byDate={};
    src.rows.forEach(row=>{const date=parseDateStr(row[dc]);const amount=parseAmountStr(row[ac]);if(date&&amount&&amount>0)byDate[date]=Math.round(((byDate[date]||0)+amount)*100)/100;});
    const list=Object.entries(byDate).map(([date,amount])=>({date,amount})).sort((a,b)=>a.date.localeCompare(b.date));
    setPreview(list);setImportStep('preview');
  };
  const confirmMapping=()=>{
    if(!colMap.dateCol||!colMap.amountCol)return;
    const nc={...apiConfig,csvColumnMaps:{...csvMaps,[pidRef.current]:colMap}};
    saveApiCfg(nc);doBuildPreview(csvData,colMap.dateCol,colMap.amountCol);
  };
  const doFinish=items=>{
    const pid=pidRef.current;const pName=platforms.find(p=>p.id===pid)?.name||'';
    items.forEach(({date,amount})=>{const dp=liveData[date]?.platformLivraisons||{};const pd=dp[pid]||{ventes:null,depot:null};upd(date,"platformLivraisons",{...dp,[pid]:{...pd,depot:amount}});});
    const n=items.length;
    setImportMsg(`✓ ${n} dépôt${n!==1?'s':''} importé${n!==1?'s':''} pour ${pName}`);
    setImportStep('done');setTimeout(()=>{setImportStep('idle');setImportPid(null);setImportMsg(null);},4000);
  };
  const startImport=()=>{
    const pid=pidRef.current;
    const conflicts=preview.filter(({date})=>(liveData[date]?.platformLivraisons||{})[pid]?.depot!=null);
    if(conflicts.length){setConflictItems(conflicts);setImportStep('conflict');return;}
    doFinish(preview);
  };
  const handleConflict=override=>{
    const conflictDates=new Set(conflictItems.map(c=>c.date));
    doFinish(override?preview:preview.filter(({date})=>!conflictDates.has(date)));
  };
  const cancelImport=()=>{setImportStep('idle');setImportPid(null);setCsvData(null);setPreview([]);setConflictItems([]);setImportMsg(null);};
  const importPlatform=platforms.find(p=>p.id===importPid);
  const showPanel=importStep!=='idle'&&importStep!=='done'&&importPlatform;
  const selStyle={width:'100%',background:t.inputBg,border:`1px solid ${t.inputBorder}`,borderRadius:4,color:t.text,fontSize:11,padding:'4px 6px',outline:'none'};
  const btnP={padding:'4px 12px',borderRadius:5,border:'none',cursor:'pointer',fontWeight:600,fontSize:11,background:'linear-gradient(135deg,#f97316,#ea580c)',color:'#fff'};
  const btnS={padding:'4px 10px',borderRadius:5,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:'pointer',fontSize:11};

  return(<div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,overflow:'hidden'}}>
    <input ref={fileRef} type="file" accept=".csv" style={{display:'none'}} onChange={handleFile}/>
    {/* Header */}
    <div onClick={()=>setCollapsed(!collapsed)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 11px',cursor:'pointer',background:t.cashHeaderBg,borderBottom:collapsed?'none':`1px solid ${t.innerBorder}`,userSelect:'none'}}>
      <div style={{display:'flex',alignItems:'center',gap:6}}>
        <span style={{fontSize:12,color:collapsed?t.textMuted:'#f97316',transform:collapsed?'rotate(-90deg)':'rotate(0deg)',display:'inline-block'}}>▾</span>
        <span style={{fontSize:13,fontWeight:700,color:t.text}}>📱 Livraisons — suivi des plateformes</span>
      </div>
      <span style={{fontSize:10,color:t.textMuted,fontStyle:'italic'}}>Informatif seulement</span>
    </div>
    {!collapsed&&(<div style={{padding:11}}>
      <div style={{fontSize:10,color:t.textMuted,marginBottom:8,fontStyle:'italic'}}>N'affecte pas la réconciliation des caisses</div>

      {/* Import done message */}
      {importStep==='done'&&importMsg&&(<div style={{marginBottom:10,padding:'6px 10px',borderRadius:6,background:'rgba(34,197,94,0.06)',border:'1px solid rgba(34,197,94,0.2)',fontSize:12,color:'#16a34a',fontWeight:600}}>{importMsg}</div>)}

      {/* Import panel */}
      {showPanel&&(<div style={{marginBottom:10,padding:10,borderRadius:7,background:'rgba(56,189,248,0.05)',border:'1px solid rgba(56,189,248,0.18)'}}>
        <div style={{fontSize:11,fontWeight:700,color:'#38bdf8',marginBottom:8}}>{importPlatform.emoji} {importPlatform.name} — Import CSV</div>

        {/* Step: column mapping */}
        {importStep==='mapping'&&csvData&&(<div>
          <div style={{fontSize:11,color:t.textSub,marginBottom:6}}>Colonnes non détectées automatiquement. Sélectionner :</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:8}}>
            <div>
              <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Colonne date</div>
              <select value={colMap.dateCol||''} onChange={e=>setColMap(m=>({...m,dateCol:e.target.value||null}))} style={selStyle}>
                <option value="">— Choisir —</option>
                {csvData.headers.map(h=>(<option key={h} value={h}>{h}</option>))}
              </select>
            </div>
            <div>
              <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Colonne montant</div>
              <select value={colMap.amountCol||''} onChange={e=>setColMap(m=>({...m,amountCol:e.target.value||null}))} style={selStyle}>
                <option value="">— Choisir —</option>
                {csvData.headers.map(h=>(<option key={h} value={h}>{h}</option>))}
              </select>
            </div>
          </div>
          {colMap.dateCol&&colMap.amountCol&&<div style={{fontSize:10,color:t.textMuted,marginBottom:6}}>Ce mappage sera mémorisé pour {importPlatform.name}.</div>}
          <div style={{display:'flex',gap:6}}>
            <button onClick={confirmMapping} disabled={!colMap.dateCol||!colMap.amountCol} style={{...btnP,opacity:(!colMap.dateCol||!colMap.amountCol)?0.4:1}}>Continuer</button>
            <button onClick={cancelImport} style={btnS}>Annuler</button>
          </div>
        </div>)}

        {/* Step: preview */}
        {importStep==='preview'&&(<div>
          <div style={{fontSize:11,color:t.textSub,marginBottom:6}}>{importPlatform.name} — {preview.length} dépôt{preview.length!==1?'s':''} trouvé{preview.length!==1?'s':''} :</div>
          {preview.length===0
            ?(<div style={{fontSize:11,color:'#f97316',marginBottom:8}}>Aucune donnée valide détectée. Vérifier les colonnes.</div>)
            :(<div>
              <div style={{maxHeight:160,overflowY:'auto',marginBottom:6}}>
                {preview.map(({date,amount},i)=>{
                  const dd=new Date(date+'T12:00:00');const lbl=`${dd.getDate()} ${MONTHS_FR[dd.getMonth()]}`;
                  const existing=(liveData[date]?.platformLivraisons||{})[importPid]?.depot;
                  return(<div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'2px 0',borderBottom:`1px solid ${t.divider}`,fontSize:11}}>
                    <span style={{color:t.textSub}}>{lbl}</span>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      {existing!=null&&<span style={{fontSize:9.5,color:'#f97316'}}>⚠ existant</span>}
                      <span style={{fontFamily:"'DM Mono',monospace",color:t.text,fontWeight:600}}>{fmt(amount)}</span>
                    </div>
                  </div>);
                })}
              </div>
              <div style={{display:'flex',justifyContent:'flex-end',padding:'3px 0',marginBottom:8,borderTop:`1px solid rgba(249,115,22,0.2)`}}>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:700,color:'#f97316'}}>Total: {fmt(preview.reduce((s,x)=>s+x.amount,0))}</span>
              </div>
            </div>)}
          <div style={{display:'flex',gap:6}}>
            {preview.length>0&&<button onClick={startImport} style={btnP}>Importer {preview.length} dépôt{preview.length!==1?'s':''}</button>}
            <button onClick={cancelImport} style={btnS}>Annuler</button>
          </div>
        </div>)}

        {/* Step: conflict */}
        {importStep==='conflict'&&(<div>
          <div style={{fontSize:11,color:'#f97316',marginBottom:6}}>Des dépôts existent déjà pour {conflictItems.length} date{conflictItems.length!==1?'s':''} :</div>
          <div style={{marginBottom:8}}>
            {conflictItems.map(({date,amount},i)=>{
              const dd=new Date(date+'T12:00:00');
              const existing=(liveData[date]?.platformLivraisons||{})[importPid]?.depot;
              return(<div key={i} style={{fontSize:11,color:t.textSub,padding:'2px 0',borderBottom:`1px solid ${t.divider}`}}>
                {dd.getDate()} {MONTHS_FR[dd.getMonth()]} — existant: {fmt(existing)} → nouveau: {fmt(amount)}
              </div>);
            })}
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            <button onClick={()=>handleConflict(true)} style={btnP}>Remplacer tout</button>
            <button onClick={()=>handleConflict(false)} style={{...btnS,border:'1px solid rgba(249,115,22,0.2)',background:'rgba(249,115,22,0.06)',color:'#f97316'}}>Ignorer les conflits</button>
            <button onClick={cancelImport} style={btnS}>Annuler</button>
          </div>
        </div>)}
      </div>)}

      {platforms.length===0&&<div style={{fontSize:12,color:t.textMuted,textAlign:'center',padding:8}}>Aucune plateforme configurée — ajouter dans Config</div>}

      {platforms.map(platform=>{
        const pd=getPD(platform.id);const hasV=pd.ventes!=null;const hasD=pd.depot!=null;
        const ecart=(hasV&&hasD)?pd.depot-pd.ventes:null;
        const ecartPct=(ecart!=null&&pd.ventes>0)?(Math.abs(ecart)/pd.ventes*100):null;
        const active=importPid===platform.id&&importStep!=='idle'&&importStep!=='done';
        return(<div key={platform.id} style={{marginBottom:8,padding:10,borderRadius:7,background:t.section,border:`1px solid ${active?'rgba(56,189,248,0.35)':t.sectionBorder}`}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
            <span style={{fontSize:12,fontWeight:700,color:t.text}}>{platform.emoji} {platform.name}</span>
            <button onClick={e=>{e.stopPropagation();openImport(platform.id);}} style={{fontSize:9.5,padding:'2px 8px',borderRadius:4,border:'1px solid rgba(56,189,248,0.2)',background:'rgba(56,189,248,0.06)',color:'#38bdf8',cursor:'pointer',fontWeight:600,whiteSpace:'nowrap'}}>📥 Importer relevé</button>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <F label="Ventes plateforme" value={pd.ventes} onChange={v=>updPD(platform.id,'ventes',v)} prefix="$"/>
            <F label="Dépôt reçu" value={pd.depot} onChange={v=>updPD(platform.id,'depot',v)} prefix="$"/>
          </div>
          <div style={{marginTop:5,fontSize:11}}>
            {ecart!=null?(<span style={{color:'#f97316',fontWeight:600,fontFamily:"'DM Mono',monospace"}}>Écart: {fmt(ecart)}{ecartPct!=null?` (${ecartPct.toFixed(1)}%)`:''}
            </span>):hasV?(<span style={{color:t.textMuted}}>⏳ En attente du dépôt</span>):null}
          </div>
        </div>);
      })}

      {platforms.length>0&&(<div style={{marginTop:4,padding:'8px 10px',borderRadius:7,background:t.reconNeutralBg,border:`1px solid ${t.reconNeutralBorder}`}}>
        <div style={{fontSize:9.5,color:t.textMuted,fontWeight:700,textTransform:'uppercase',letterSpacing:0.7,marginBottom:4}}>Sommaire du jour — informatif</div>
        <RR label="Total ventes plateformes" value={totalVentes>0?totalVentes:null}/>
        <RR label="Total dépôts reçus" value={totalDepots>0?totalDepots:null}/>
        {totalVentes>0&&totalDepots>0&&(<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'3.5px 0',borderTop:`1px solid ${t.divider}`,marginTop:2}}>
          <span style={{fontSize:11.5,color:t.textSub,fontWeight:500}}>Commission totale</span>
          <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:'#f97316',fontWeight:700}}>{fmt(totalComm)} ({totalCommPct.toFixed(1)}%)</span>
        </div>)}
      </div>)}
    </div>)}
  </div>);
}

// ── BILL ENTRY (accumulating bills for P&L) ──
function BillEntry({label,baseKey,plData,updPL,accent="249,115,22"}){
  const t=useT();
  const [open,setOpen]=useState(false);
  const [newDate,setNewDate]=useState('');
  const [newAmt,setNewAmt]=useState('');
  const [newNote,setNewNote]=useState('');
  const [amtBlurred,setAmtBlurred]=useState(false);
  const bills=plData[`${baseKey}_bills`]||[];
  const total=bills.length?bills.reduce((s,b)=>s+(b.amount||0),0):(plData[baseKey]||0);
  const addBill=()=>{
    const amt=parseFloat(newAmt);if(!amt||isNaN(amt))return;
    const bill={id:Date.now().toString(),date:newDate,amount:amt,note:newNote.trim()};
    updPL(`${baseKey}_bills`,[...bills,bill]);
    logCreate('pl','facture_fournisseur',bill.id,bill);
    setNewAmt('');setNewNote('');
  };
  const removeBill=async id=>{
    const reason=await promptCorrectionReason('Retrait de facture fournisseur');
    if(!reason)return;
    logVoid('pl','facture_fournisseur',id,reason);
    updPL(`${baseKey}_bills`,bills.filter(b=>b.id!==id));
  };
  const accentRgb=`rgba(${accent},`;
  return(<div style={{borderBottom:`1px solid ${t.divider}`,marginBottom:0}}>
    {/* Header — click to collapse/expand */}
    <div onClick={()=>setOpen(!open)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"5px 0",cursor:"pointer",userSelect:"none"}}>
      <div style={{display:"flex",alignItems:"center",gap:5}}>
        <span style={{fontSize:9,color:open?`rgb(${accent})`:t.textDim,display:"inline-block",transform:open?"rotate(0deg)":"rotate(-90deg)",transition:"transform 0.15s"}}>▾</span>
        <span style={{fontSize:11.5,color:t.textSub,fontWeight:500}}>{label}</span>
        {bills.length>0&&<span style={{fontSize:9,color:`rgb(${accent})`,background:accentRgb+"0.08)",borderRadius:8,padding:"1px 5px",fontWeight:600}}>{bills.length} fact.</span>}
      </div>
      <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:total>0?t.rrValue:t.textDim,fontWeight:600}}>{fmt(total)}</span>
    </div>
    {/* Expanded content */}
    {open&&(<div style={{paddingLeft:12,paddingBottom:8}}>
      {/* Existing bills */}
      {bills.length>0&&(<div style={{marginBottom:6}}>
        <div style={{display:"grid",gridTemplateColumns:"76px 1fr 80px 20px",gap:4,padding:"2px 0 3px",marginBottom:1}}>
          {["Date","Note / N° facture","Montant (HT)",""].map((h,i)=>(<span key={i} style={{fontSize:9,color:t.textMuted,fontWeight:600,textAlign:i===2?"right":"left"}}>{h}</span>))}
        </div>
        {bills.map(b=>(<div key={b.id} style={{display:"grid",gridTemplateColumns:"76px 1fr 80px 20px",gap:4,padding:"3px 0",borderTop:`1px solid ${t.divider}`,alignItems:"center"}}>
          <span style={{fontSize:10,color:t.textMuted,fontFamily:"'DM Mono',monospace"}}>{b.date||"—"}</span>
          <span style={{fontSize:10,color:t.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.note||"—"}</span>
          <span style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:t.text,textAlign:"right"}}>{fmt(b.amount)}</span>
          <button onClick={()=>removeBill(b.id)} style={{background:"rgba(239,68,68,0.07)",border:"none",borderRadius:3,color:"#ef4444",fontSize:9,padding:"1px 4px",cursor:"pointer"}}>✕</button>
        </div>))}
        <div style={{display:"flex",justifyContent:"flex-end",padding:"4px 24px 0 0",borderTop:`1px solid ${accentRgb+"0.2)"}`,marginTop:2}}>
          <span style={{fontSize:11,fontFamily:"'DM Mono',monospace",fontWeight:700,color:`rgb(${accent})`}}>{fmt(total)}</span>
        </div>
      </div>)}
      {/* Add bill form */}
      <div style={{display:"grid",gridTemplateColumns:"76px 1fr 76px auto",gap:4,alignItems:"center",marginTop:4}}>
        <input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)}
          style={{padding:"3px 4px",borderRadius:3,border:`1px solid ${accentRgb+"0.15)"}`,background:t.inputBg,color:t.inputText,fontFamily:"'DM Mono',monospace",fontSize:9,outline:"none"}}/>
        <input type="text" value={newNote} onChange={e=>setNewNote(e.target.value)} placeholder="Note / N° facture..."
          onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();const amt=document.activeElement.closest('div')?.querySelector('input[type="number"]');if(amt)amt.focus();}}}
          style={{padding:"3px 5px",borderRadius:3,border:`1px solid ${accentRgb+"0.15)"}`,background:t.inputBg,color:t.inputText,fontSize:10,outline:"none"}}/>
        <input type="number" inputMode="decimal" value={newAmt} onChange={e=>{setNewAmt(e.target.value);setAmtBlurred(false);}} onBlur={()=>setAmtBlurred(true)} placeholder="Montant HT"
          onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();addBill();}}}
          style={{padding:"3px 5px",borderRadius:3,border:`1px solid ${accentRgb+"0.25)"}`,background:t.inputBg,color:t.inputText,fontFamily:"'DM Mono',monospace",fontSize:10,textAlign:"right",outline:"none"}}/>
        <button onClick={addBill} style={{fontSize:10,padding:"3px 8px",borderRadius:3,border:`1px solid ${accentRgb+"0.25)"}`,background:accentRgb+"0.08)",color:`rgb(${accent})`,cursor:"pointer",fontWeight:700}}>+</button>
      </div>
      {amtBlurred&&newAmt!==""&&(()=>{const n=parseFloat(newAmt);return n<0?<div style={{fontSize:10,color:"#f97316",padding:"1px 0 2px"}}>⚠️ Le montant ne peut pas être négatif</div>:n>50000?<div style={{fontSize:10,color:"#f97316",padding:"1px 0 2px"}}>⚠️ Montant inhabituellement élevé</div>:null})()}
      <div style={{fontSize:9,color:t.textDim,marginTop:3}}>Tous les montants avant taxes (HT)</div>
    </div>)}
  </div>);
}

// ── PDF GENERATOR ──
function openPDF(html){
  const w=window.open("","_blank");
  if(w){w.document.write(html);w.document.close();setTimeout(()=>w.print(),400)}
}

// ── EMPLOYEE ROW (daily tab) ──
function EmpRow({emp,index,empRoster,selectedDate,updEmp,rmEmp}){
  const t=useT();
  const [hTouched,setHTouched]=useState(false);
  const cost=(emp.hours||0)*(emp.wage||0);
  const hoursWarn=hTouched?(emp.hours!=null&&emp.hours>16?"⚠️ Plus de 16 heures — vérifier":emp.hours!=null&&emp.hours<0?"⚠️ Ne peut pas être négatif":null):null;
  const wageWarn=emp.wage!=null&&emp.wage<15?"⚠️ Sous le salaire minimum":null;
  return(<div>
    <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr auto",gap:6,padding:"3px 0",borderBottom:`1px solid ${t.divider}`,alignItems:"center"}}>
      <select value={emp.empId||""} onChange={e=>{const eid=e.target.value;const re=empRoster.find(r=>r.id===eid);updEmp(selectedDate,index,{...emp,empId:eid,name:re?.name||"",wage:re?.wage||emp.wage})}} style={{background:t.inputBg,border:`1px solid ${t.inputBorder}`,borderRadius:4,color:t.text,fontSize:12,padding:"4px 6px",outline:"none"}}>
        <option value="" style={{background:t.optionBg}}>— Choisir —</option>
        {empRoster.map(r=>(<option key={r.id} value={r.id} style={{background:t.optionBg}}>{r.name} ({fmt(r.wage)}/h)</option>))}
      </select>
      <input type="number" value={emp.hours??""} onChange={e=>updEmp(selectedDate,index,{...emp,hours:e.target.value===""?null:parseFloat(e.target.value)})} onBlur={()=>setHTouched(true)} placeholder="hrs" style={{background:t.inputBg,border:`1px solid ${t.inputBorder}`,borderRadius:4,color:t.inputText,fontSize:12,padding:"3px 5px",textAlign:"right",outline:"none",fontFamily:"'DM Mono',monospace"}}/>
      <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:t.textMuted,textAlign:"right"}}>{emp.wage?`${emp.wage.toFixed(2)}`:""}</span>
      <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:t.textSub,textAlign:"right"}}>{cost>0?fmt(cost):"—"}</span>
      <button onClick={()=>rmEmp(selectedDate,index)} style={{background:"rgba(239,68,68,0.07)",border:"none",borderRadius:4,color:"#ef4444",fontSize:10,padding:"2px 5px",cursor:"pointer"}}>✕</button>
    </div>
    {hoursWarn&&<div style={{fontSize:10,color:"#f97316",padding:"1px 0 2px"}}>{hoursWarn}</div>}
    {wageWarn&&<div style={{fontSize:10,color:"#f97316",padding:"1px 0 2px"}}>{wageWarn}</div>}
  </div>);
}

// ── GEO SEARCH (location picker for weather) ──
function GeoSearch({apiConfig,saveApiCfg}){
  const t=useT();
  const [query,setQuery]=useState('');
  const [results,setResults]=useState([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const inpStyle={background:t.inputBg,border:`1px solid ${t.inputBorder}`,borderRadius:5,color:t.text,fontSize:12,padding:"5px 8px",outline:"none"};

  const search=async()=>{
    const q=query.trim();if(!q)return;
    setLoading(true);setError('');setResults([]);
    try{
      const res=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=fr`);
      const data=await res.json();
      if(data.results?.length){setResults(data.results);}
      else{setError('Aucun résultat — essayez un nom de ville différent');}
    }catch{setError('Erreur de connexion — vérifier internet');}
    setLoading(false);
  };

  const select=r=>{
    const label=[r.name,r.admin1,r.country].filter(Boolean).join(', ');
    const nc={...apiConfig,weatherLat:r.latitude,weatherLng:r.longitude,weatherLabel:label};
    saveApiCfg(nc);setResults([]);setQuery('');
  };

  const clear=()=>{
    const nc={...apiConfig,weatherLat:null,weatherLng:null,weatherLabel:''};
    saveApiCfg(nc);
  };

  const configured=apiConfig.weatherLat&&apiConfig.weatherLng;
  const displayLabel=apiConfig.weatherLabel?(apiConfig.weatherLabel.split(', ').slice(0,-1).join(', ')||apiConfig.weatherLabel):'';

  return(<div>
    {configured&&<div style={{display:"flex",alignItems:"center",gap:6,marginBottom:7,padding:"5px 8px",borderRadius:6,background:"rgba(34,197,94,0.06)",border:"1px solid rgba(34,197,94,0.2)"}}>
      <span style={{fontSize:12,color:"#16a34a",flex:1}}>📍 {displayLabel} — météo configurée</span>
      <button onClick={clear} style={{fontSize:9,padding:"1px 5px",borderRadius:3,border:"none",background:"rgba(239,68,68,0.1)",color:"#ef4444",cursor:"pointer"}}>✕</button>
    </div>}
    <div style={{display:"flex",gap:4}}>
      <input value={query} onChange={e=>{setQuery(e.target.value);setError('');}} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();search();}}} placeholder="Laval, Saint-Hyacinthe, Montréal..." style={{...inpStyle,flex:1}}/>
      <button onClick={search} disabled={loading} style={{padding:"5px 12px",borderRadius:5,border:"none",cursor:"pointer",fontWeight:600,fontSize:12,background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#fff",opacity:loading?0.6:1,whiteSpace:"nowrap"}}>{loading?"...":"Chercher"}</button>
    </div>
    {error&&<div style={{fontSize:10,color:"#ef4444",marginTop:3}}>{error}</div>}
    {results.length>0&&<div style={{marginTop:5,border:`1px solid ${t.cardBorder}`,borderRadius:6,overflow:"hidden"}}>
      {results.map((r,i)=>{
        const lbl=[r.name,r.admin1,r.country].filter(Boolean).join(', ');
        return(<button key={i} onClick={()=>select(r)} style={{display:"block",width:"100%",textAlign:"left",padding:"7px 10px",background:i%2===0?t.card:t.section,border:"none",borderBottom:i<results.length-1?`1px solid ${t.divider}`:"none",color:t.text,fontSize:12,cursor:"pointer"}}>
          {lbl} <span style={{fontSize:10,color:t.textMuted,fontFamily:"'DM Mono',monospace"}}>{r.latitude.toFixed(3)}, {r.longitude.toFixed(3)}</span>
        </button>);
      })}
    </div>}
  </div>);
}

// ── P&L MONTHLY ──
function MonthlyPL({computeDay,suppliers,liveData,platforms}){
  const t=useT();
  const [month,setMonth]=useState(()=>{const n=new Date();return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`});
  const [plData,setPlData]=useState({});const [saved,setSaved]=useState(false);const [loaded,setLoaded]=useState(false);const saveRef=useRef(null);
  const [revTouched,setRevTouched]=useState(false);

  useEffect(()=>{setLoaded(false);setSaved(false);(async()=>{try{const r=await window.api.storage.get(`dicann-pl-${month}`);if(r?.value)setPlData(JSON.parse(r.value));else setPlData({})}catch(e){setPlData({})}setLoaded(true)})()},[month]);

  const dbSave=useCallback(data=>{if(saveRef.current)clearTimeout(saveRef.current);saveRef.current=setTimeout(async()=>{try{await window.api.storage.set(`dicann-pl-${month}`,JSON.stringify(data))}catch(e){}},800)},[month]);
  const updPL=useCallback((key,val)=>{setPlData(prev=>{const next={...prev,[key]:val};dbSave(next);return next});setSaved(false)},[dbSave]);

  const [y,m]=month.split("-").map(Number);const dim=new Date(y,m,0).getDate();
  let autoRev=0,autoLab=0;for(let d=1;d<=dim;d++){const k=`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;const cd=computeDay(k);autoRev+=cd.venteNet;autoLab+=cd.labourCost||0}
  const revenue=plData._revenueOverride!=null?plData._revenueOverride:autoRev;
  const billsSum=key=>{const bills=plData[`${key}_bills`];return bills&&bills.length?bills.reduce((s,b)=>s+(b.amount||0),0):(plData[key]||0);};
  let fpT=billsSum('pettyCashFP');suppliers.forEach(s=>{fpT+=billsSum(`sup_${s.id}`)});
  let expT=billsSum('pettyCashMisc');EXPENSE_ITEMS.forEach(([k])=>{expT+=billsSum(`exp_${k}`)});
  const labC=plData.labourOverride!=null?plData.labourOverride:autoLab;
  const gp=revenue-fpT;const np=gp-labC-expT;
  const deliveryStats=(platforms||[]).map(p=>{let tv=0,td=0;for(let day=1;day<=dim;day++){const k=`${y}-${String(m).padStart(2,"0")}-${String(day).padStart(2,"0")}`;const dd=liveData[k];if(!dd?.platformLivraisons)continue;const pd=dd.platformLivraisons[p.id]||{};if(pd.ventes!=null)tv+=pd.ventes;if(pd.depot!=null)td+=pd.depot;}const comm=tv-td;const commPct=tv>0?(comm/tv*100):0;return{...p,totalVentes:tv,totalDepots:td,commission:comm,commPct};});
  const delGrandV=deliveryStats.reduce((s,p)=>s+p.totalVentes,0);
  const delGrandD=deliveryStats.reduce((s,p)=>s+p.totalDepots,0);
  const delGrandComm=delGrandV-delGrandD;
  const delGrandPct=delGrandV>0?(delGrandComm/delGrandV*100):0;
  const fpP=revenue>0?(fpT/revenue*100):0;const labP=revenue>0?(labC/revenue*100):0;const npP=revenue>0?(np/revenue*100):0;

  const buildHTML=()=>{
    let h=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>P&L — ${MONTHS_FR[m-1]} ${y}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font:13px/1.6 Arial,sans-serif;padding:30px;color:#222}h1{font-size:20px;color:#ea580c;margin-bottom:4px}h3{font-size:13px;color:#555;margin:16px 0 6px;text-transform:uppercase;letter-spacing:0.5px}table{border-collapse:collapse;width:100%;margin-bottom:8px}th,td{border:1px solid #ddd;padding:6px 10px;text-align:right;font-size:12px}th{background:#f7f7f7;font-weight:600}td:first-child,th:first-child{text-align:left}.g{color:#16a34a;font-weight:700}.r{color:#dc2626;font-weight:700}.sub{font-size:11px;color:#888}@media print{body{padding:15px}}</style></head><body>`;
    h+=`<h1>BalanceIQ — P&L Mensuel</h1><p class="sub">${MONTHS_FR[m-1]} ${y} · Généré le ${new Date().toLocaleDateString("fr-CA")}</p>`;
    h+=`<h3>Revenus</h3><table><tr><td><b>Vente nette</b></td><td><b>${fmt(revenue)}</b></td></tr></table>`;
    const billRows=(key,name)=>{const bills=plData[`${key}_bills`]||[];const tot=billsSum(key);if(!tot&&!bills.length)return`<tr><td>${name}</td><td>—</td></tr>`;if(!bills.length)return`<tr><td>${name}</td><td>${fmt(tot)}</td></tr>`;let r=`<tr><td colspan="2" style="font-weight:600;padding-top:6px">${name}</td></tr>`;bills.forEach(b=>{r+=`<tr><td style="padding-left:16px;font-size:11px;color:#555">${b.date||""}${b.note?` — ${b.note}`:""} <em style="color:#888">(HT)</em></td><td>${fmt(b.amount)}</td></tr>`});r+=`<tr><td style="padding-left:16px;font-style:italic;font-size:11px">Sous-total</td><td style="font-weight:700">${fmt(tot)}</td></tr>`;return r;};
    h+=`<h3>Coût des marchandises (Food & Paper — avant taxes)</h3><table>${billRows('pettyCashFP','Petite caisse F&P')}`;
    suppliers.forEach(s=>{h+=billRows(`sup_${s.id}`,s.name)});
    h+=`<tr style="font-weight:700;border-top:2px solid #ddd"><td>Total F&P</td><td>${fmt(fpT)} (${fpP.toFixed(1)}%)</td></tr></table>`;
    h+=`<h3>Main d'œuvre</h3><table><tr><td><b>Total</b></td><td><b>${fmt(labC)} (${labP.toFixed(1)}%)</b></td></tr></table>`;
    h+=`<h3>Dépenses d'exploitation (avant taxes)</h3><table>${billRows('pettyCashMisc','Petite caisse Misc')}`;
    EXPENSE_ITEMS.forEach(([k,l])=>{h+=billRows(`exp_${k}`,l)});
    h+=`<tr style="font-weight:700"><td>Total dépenses</td><td>${fmt(expT)}</td></tr></table>`;
    h+=`<h3>Résultat</h3><table><tr><td>Revenus</td><td>${fmt(revenue)}</td></tr><tr><td>− Food & Paper</td><td>${fmt(fpT)}</td></tr><tr style="font-weight:700"><td>Profit brut</td><td>${fmt(gp)}</td></tr><tr><td>− Main d'œuvre</td><td>${fmt(labC)}</td></tr><tr><td>− Dépenses</td><td>${fmt(expT)}</td></tr><tr><td class="${np>=0?"g":"r"}" style="font-size:14px">${np>=0?"PROFIT NET":"PERTE NETTE"}</td><td class="${np>=0?"g":"r"}" style="font-size:14px">${fmt(Math.abs(np))} (${npP.toFixed(1)}%)</td></tr></table>`;
    h+=`<p class="sub" style="margin-top:20px">BalanceIQ · ${OWNER_EMAIL}</p></body></html>`;
    return h;
  };

  const handleSave=async()=>{
    const fd={...plData,_month:month,_savedAt:new Date().toISOString()};
    try{await window.api.storage.set(`dicann-pl-${month}`,JSON.stringify(fd))}catch(e){}
    openPDF(buildHTML());
    setSaved(true);setTimeout(()=>setSaved(false),5000);
  };

  const handleEmail=()=>{
    const subj=encodeURIComponent(`BalanceIQ — P&L ${MONTHS_FR[m-1]} ${y}`);
    const body=encodeURIComponent(`P&L — ${MONTHS_FR[m-1]} ${y}\n\nRevenus: ${fmt(revenue)}\nF&P: ${fmt(fpT)} (${fpP.toFixed(1)}%)\nMain d'œuvre: ${fmt(labC)} (${labP.toFixed(1)}%)\nDépenses: ${fmt(expT)}\n\n${np>=0?"PROFIT NET":"PERTE NETTE"}: ${fmt(Math.abs(np))} (${npP.toFixed(1)}%)\n\n— BalanceIQ`);
    window.open(`mailto:${OWNER_EMAIL}?subject=${subj}&body=${body}`);
  };

  const handleReset=()=>{
    if(!window.confirm(`Réinitialiser toutes les données P&L pour ${MONTHS_FR[m-1]} ${y} ?\n\nCette action est irréversible.`))return;
    setPlData({});
    window.api.storage.set(`dicann-pl-${month}`,JSON.stringify({})).catch(()=>{});
  };

  // P&L section — light theme uses left border instead of tinted bg
  const Sec=({title,color,children})=>{
    const isLight=t.name==='light';
    return(<div style={{background:isLight?t.section:`rgba(${color},0.03)`,border:isLight?'none':`1px solid rgba(${color},0.1)`,borderLeft:isLight?`3px solid rgb(${color})`:undefined,borderRadius:8,padding:10,paddingLeft:isLight?13:10}}>
      <div style={{fontSize:10,color:`rgb(${color})`,fontWeight:700,textTransform:"uppercase",letterSpacing:0.7,marginBottom:6}}>{title}</div>
      {children}
    </div>);
  };

  if(!loaded)return(<div style={{padding:20,textAlign:"center",color:t.textMuted}}>Chargement...</div>);

  return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
      <input type="month" value={month} onChange={e=>setMonth(e.target.value)} style={{background:t.inputBg,border:`1px solid ${t.inputBorder}`,borderRadius:5,color:t.text,padding:"5px 8px",fontSize:12,fontFamily:"'DM Mono',monospace"}}/>
      <span style={{fontSize:14,fontWeight:700,textTransform:"capitalize",color:t.text}}>{MONTHS_FR[m-1]} {y}</span>
    </div>
    <div style={{display:"flex",gap:5,flexWrap:"wrap"}}><MC label="Revenus" value={fmt(revenue)} accent="#22c55e"/><MC label="F&P" value={fmt(fpT)} sub={`${fpP.toFixed(1)}%`} accent={fpP>35?"#ef4444":"#f97316"}/><MC label="Main d'œuvre" value={fmt(labC)} sub={`${labP.toFixed(1)}%`} accent={labP>35?"#ef4444":"#38bdf8"}/><MC label="Profit" value={fmt(np)} sub={`${npP.toFixed(1)}%`} accent={np>=0?"#22c55e":"#ef4444"}/></div>
    <Sec title="Revenus" color="34,197,94">
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 0"}}>
        <span style={{fontSize:12,color:t.textSub}}>Ventes nettes <span style={{fontSize:10,color:t.textMuted}}>(auto: {fmt(autoRev)})</span></span>
        {plData._revenueOverride==null
          ?(<div style={{display:"flex",gap:4,alignItems:"center"}}><span style={{fontFamily:"'DM Mono',monospace",fontSize:14,fontWeight:700,color:"#22c55e"}}>{fmt(autoRev)}</span><button onClick={()=>updPL("_revenueOverride",autoRev)} style={{fontSize:9,padding:"1px 5px",borderRadius:3,border:"1px solid rgba(251,191,36,0.2)",background:"rgba(251,191,36,0.08)",color:t.warnText,cursor:"pointer"}}>✎</button></div>)
          :(<div><div style={{display:"flex",gap:4,alignItems:"center"}}><input type="number" value={plData._revenueOverride??""} onChange={e=>updPL("_revenueOverride",e.target.value===""?null:parseFloat(e.target.value))} onBlur={()=>setRevTouched(true)} style={{width:100,padding:"3px 6px",borderRadius:4,border:"1px solid rgba(251,191,36,0.25)",background:"rgba(251,191,36,0.06)",color:t.warnText,fontFamily:"'DM Mono',monospace",fontSize:13,textAlign:"right",outline:"none"}}/><button onClick={()=>{updPL("_revenueOverride",null);setRevTouched(false)}} style={{fontSize:9,padding:"1px 4px",borderRadius:3,border:"none",background:"rgba(239,68,68,0.1)",color:"#ef4444",cursor:"pointer"}}>✕</button></div>{revTouched&&plData._revenueOverride!=null&&plData._revenueOverride<0&&<div style={{fontSize:10,color:"#f97316",padding:"1px 0 2px"}}>⚠️ Le montant ne peut pas être négatif</div>}</div>)}
      </div>
    </Sec>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
      <Sec title="Coût marchandises (F&P)" color="249,115,22">
        <BillEntry label="Petite caisse F&P" baseKey="pettyCashFP" plData={plData} updPL={updPL} accent="249,115,22"/>
        {suppliers.map(s=>(<BillEntry key={s.id} label={s.name} baseKey={`sup_${s.id}`} plData={plData} updPL={updPL} accent="249,115,22"/>))}
        <div style={{marginTop:6,paddingTop:6,borderTop:`1px solid rgba(249,115,22,0.15)`}}><RR label="Total F&P" value={fpT} accent="#f97316" bold/>{revenue>0&&<RR label="F&P %" value={`${fpP.toFixed(1)}%`} unit="" accent={fpP>35?"#ef4444":fpP>30?t.warnText:"#22c55e"}/>}</div>
      </Sec>
      <Sec title="Dépenses d'exploitation" color="129,140,248">
        <BillEntry label="Petite caisse Misc" baseKey="pettyCashMisc" plData={plData} updPL={updPL} accent="129,140,248"/>
        {EXPENSE_ITEMS.map(([k,l])=>(<BillEntry key={k} label={l} baseKey={`exp_${k}`} plData={plData} updPL={updPL} accent="129,140,248"/>))}
        <div style={{marginTop:6,paddingTop:6,borderTop:`1px solid rgba(129,140,248,0.15)`}}><RR label="Total dépenses" value={expT} accent="#818cf8" bold/></div>
      </Sec>
    </div>
    <Sec title="Main d'œuvre" color="56,189,248">
      <div style={{fontSize:11,color:t.textMuted,marginBottom:4}}>Auto (rapports quotidiens): {fmt(autoLab)}</div>
      <PL label="Override mensuel" value={plData.labourOverride} onChange={v=>updPL("labourOverride",v)} prefix="$" warn={plData.labourOverride!=null&&plData.labourOverride<0?"⚠️ Le montant ne peut pas être négatif":null}/>
      <RR label="Total" value={labC} accent="#38bdf8" bold/>{revenue>0&&<RR label="%" value={`${labP.toFixed(1)}%`} unit="" accent={labP>35?"#ef4444":labP>28?t.warnText:"#22c55e"}/>}
    </Sec>
    {deliveryStats.length>0&&delGrandV>0&&(<Sec title="📱 Plateformes de livraison" color="249,115,22">
      <div style={{fontSize:10,color:t.textMuted,marginBottom:6,fontStyle:"italic"}}>Informatif — commission payée aux plateformes. Non inclus dans le calcul P&L.</div>
      {deliveryStats.filter(p=>p.totalVentes>0||p.totalDepots>0).map(p=>(<div key={p.id} style={{marginBottom:5,paddingBottom:5,borderBottom:`1px solid ${t.divider}`}}>
        <div style={{fontSize:11,fontWeight:700,color:t.text,marginBottom:2}}>{p.emoji} {p.name}</div>
        <RR label="Ventes" value={p.totalVentes}/>
        <RR label="Dépôts reçus" value={p.totalDepots}/>
        {p.totalVentes>0&&p.totalDepots>0&&<RR label="Commission" value={p.commission} accent="#f97316"/>}
        {p.totalVentes>0&&<RR label="Commission %" value={`${p.commPct.toFixed(1)}%`} unit="" accent="#f97316"/>}
      </div>))}
      {deliveryStats.filter(p=>p.totalVentes>0).length>1&&(<div style={{paddingTop:4,borderTop:`1px solid rgba(249,115,22,0.15)`}}>
        <RR label="Total ventes plateformes" value={delGrandV} bold/>
        <RR label="Commission totale payée" value={delGrandComm} accent="#f97316" bold/>
        {delGrandV>0&&<RR label="Commission %" value={`${delGrandPct.toFixed(1)}%`} unit="" accent="#f97316"/>}
      </div>)}
    </Sec>)}
    <div style={{background:np>=0?t.reconBalBg:t.reconErrBg,border:`1px solid ${np>=0?t.reconBalBorder:t.reconErrBorder}`,borderRadius:10,padding:14}}>
      <div style={{fontSize:11,color:t.textSub,fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,marginBottom:8}}>Résultat — {MONTHS_FR[m-1]} {y}</div>
      <RR label="Revenus" value={revenue} accent="#22c55e" bold/><RR label="− F&P" value={fpT} accent="#f97316"/><div style={{paddingTop:4,borderTop:`1px solid ${t.dividerMid}`}}><RR label="= Profit brut" value={gp} bold/></div><RR label="− Main d'œuvre" value={labC} accent="#38bdf8"/><RR label="− Dépenses" value={expT} accent="#818cf8"/>
      <div style={{paddingTop:6,marginTop:4,borderTop:`2px solid ${t.dividerStrong}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:14,fontWeight:700,color:np>=0?"#16a34a":"#dc2626"}}>{np>=0?"PROFIT NET":"PERTE NETTE"}</span><div style={{textAlign:"right"}}><span style={{fontSize:22,fontWeight:700,color:np>=0?"#16a34a":"#dc2626",fontFamily:"'DM Mono',monospace"}}>{fmt(Math.abs(np))}</span>{revenue>0&&<div style={{fontSize:11,color:np>=0?"#16a34a":"#dc2626"}}>{npP.toFixed(1)}%</div>}</div></div>
    </div>
    <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
      <button onClick={handleSave} style={{padding:"9px 20px",borderRadius:7,border:"none",cursor:"pointer",fontWeight:700,fontSize:13,background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#fff"}}>Sauvegarder & Imprimer PDF</button>
      <button onClick={handleEmail} style={{padding:"9px 16px",borderRadius:7,border:"1px solid rgba(34,197,94,0.2)",background:"rgba(34,197,94,0.08)",color:"#16a34a",cursor:"pointer",fontWeight:600,fontSize:12}}>Envoyer à {OWNER_EMAIL}</button>
      {saved&&<span style={{fontSize:12,color:"#16a34a",fontWeight:600}}>✓ Sauvegardé</span>}
      <button onClick={handleReset} style={{padding:"9px 16px",borderRadius:7,border:"1px solid rgba(239,68,68,0.2)",background:"rgba(239,68,68,0.08)",color:"#ef4444",cursor:"pointer",fontWeight:600,fontSize:12,marginLeft:"auto"}}>Réinitialiser le mois</button>
    </div>
  </div>);
}

// ── INTELLIGENCE HELPERS ──
function WEATHER_CAT(w){if(!w)return"inconnu";const lw=w.toLowerCase();if(/neige|snow|blizzard/.test(lw))return"neige";if(/pluie|rain|averse|pluvieux/.test(lw))return"pluie";if(/nuage|couvert|overcast|cloud/.test(lw))return"nuageux";if(/ensoleillé|soleil|sunny|clair|clear/.test(lw))return"ensoleillé";return"autre";}
function avArr(arr){if(!arr||arr.length===0)return null;return arr.reduce((a,b)=>a+b,0)/arr.length;}
const WIN_LABELS=["Début→14h","14h→17h","17h→19h","19h→20h"];

// ── SECTION HEADER (used by EncaisseTab) ──
function SH({label,children}){
  const t=useT();
  return(<div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:11}}><span style={{fontSize:13,fontWeight:700,marginBottom:8,display:"block",color:t.text}}>{label}</span>{children}</div>);
}

// ── ENCAISSE TAB ──
function EncaisseTab({liveData,encaisseData,persistEncaisse,encaisseConfig,saveEncaisseConfig}){
  const t=useT();
  const [selDate,setSelDate]=useState(()=>dk(new Date()));
  const [month,setMonth]=useState(()=>{const n=new Date();return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`});
  const [summaryOpen,setSummaryOpen]=useState(false);
  const [configOpen,setConfigOpen]=useState(false);
  const [overrideMode,setOverrideMode]=useState(false);
  const [overrideVal,setOverrideVal]=useState("");
  const [newEntreeDesc,setNewEntreeDesc]=useState("");
  const [newEntreeMt,setNewEntreeMt]=useState("");
  const [newDepMt,setNewDepMt]=useState("");
  const [newDepNote,setNewDepNote]=useState("");
  const [newDepSlip,setNewDepSlip]=useState("");
  const [newSortCat,setNewSortCat]=useState("");
  const [newSortDesc,setNewSortDesc]=useState("");
  const [newSortMt,setNewSortMt]=useState("");
  const [newCatName,setNewCatName]=useState("");
  const [newLocName,setNewLocName]=useState("");
  const [editCatId,setEditCatId]=useState(null);
  const [editCatName,setEditCatName]=useState("");

  const inputS={background:t.inputBg,border:`1px solid ${t.inputBorder}`,borderRadius:5,color:t.inputText,fontSize:12,padding:"5px 8px",outline:"none"};

  const getEnc=useCallback(dt=>({openingOverride:null,autreEntrees:[],deposits:[],sorties:[],physicalCount:{},carryForwardMode:"calculated",...(encaisseData[dt]||{})}),[encaisseData]);

  const computedMap=useMemo(()=>{
    const dates=Object.keys(encaisseData).filter(k=>!k.startsWith("_")).sort();
    const allDates=[...new Set([...dates,selDate])].sort();
    const res={};let prevClosing=null;
    for(const dt of allDates){
      const enc=getEnc(dt);
      const opening=enc.openingOverride!=null?enc.openingOverride:(prevClosing??null);
      const cDay=liveData[dt];
      let cashVentes=0,totalInterac=0,hasCaisseData=false;
      if(cDay?.cashes){cDay.cashes.forEach(c=>{if(c.finalCash!=null&&c.float!=null){cashVentes+=(c.finalCash-c.float);hasCaisseData=true;}if(c.interac!=null){totalInterac+=c.interac;hasCaisseData=true;}});}
      const autreEntreesTotal=enc.autreEntrees.reduce((s,e)=>s+(e.montant||0),0);
      const depositsTotal=enc.deposits.reduce((s,d)=>s+(d.montant||0),0);
      const sortiesTotal=enc.sorties.reduce((s,s2)=>s+(s2.montant||0),0);
      const calculated=(opening||0)+cashVentes+autreEntreesTotal-depositsTotal-sortiesTotal;
      const locs=encaisseConfig.cashLocations;
      const physTotal=locs.reduce((s,loc)=>s+((enc.physicalCount[loc.id])||0),0);
      const physEntered=locs.some(loc=>enc.physicalCount[loc.id]!=null);
      const ecart=physEntered?physTotal-calculated:null;
      const balanced=ecart!=null&&Math.abs(ecart)<=2;
      const carryMode=enc.carryForwardMode||"calculated";
      const closing=carryMode==="physical"&&physEntered?physTotal:calculated;
      res[dt]={opening,cashVentes,totalInterac,hasCaisseData,autreEntreesTotal,depositsTotal,sortiesTotal,calculated,physTotal,physEntered,ecart,balanced,closing};
      prevClosing=closing;
    }
    return res;
  },[encaisseData,liveData,encaisseConfig,selDate,getEnc]);

  const dr=computedMap[selDate]||{opening:null,cashVentes:0,totalInterac:0,hasCaisseData:false,autreEntreesTotal:0,depositsTotal:0,sortiesTotal:0,calculated:0,physTotal:0,physEntered:false,ecart:null,balanced:false,closing:0};
  const enc=getEnc(selDate);
  const d=new Date(selDate+"T12:00:00");

  const updEnc=useCallback((field,value)=>{const next={...encaisseData,[selDate]:{...enc,[field]:value}};persistEncaisse(next);},[encaisseData,selDate,enc,persistEncaisse]);

  const mSummary=useMemo(()=>{
    const [y,m]=month.split("-");const dim=new Date(parseInt(y),parseInt(m),0).getDate();
    let totalCV=0,totalDep=0,totalSort=0,bal=0,notBal=0,bigE=[];
    for(let day=1;day<=dim;day++){const k=`${y}-${m}-${String(day).padStart(2,"0")}`;const r=computedMap[k];if(!r)continue;totalCV+=r.cashVentes;totalDep+=r.depositsTotal;totalSort+=r.sortiesTotal;if(r.physEntered){if(r.balanced)bal++;else{notBal++;if(Math.abs(r.ecart||0)>10)bigE.push({date:k,ecart:r.ecart});}}}
    return{totalCV,totalDep,totalSort,currentPos:dr.closing,bal,notBal,bigE};
  },[month,computedMap,dr]);

  const addEntree=()=>{if(!newEntreeMt)return;const e={id:Date.now().toString(),description:newEntreeDesc.trim(),montant:parseFloat(newEntreeMt)};updEnc("autreEntrees",[...enc.autreEntrees,e]);logCreate('encaisse','entree',e.id,e);setNewEntreeDesc("");setNewEntreeMt("");};
  const rmEntree=async id=>{const reason=await promptCorrectionReason("Retrait d'entrée de caisse");if(!reason)return;logVoid('encaisse','entree',id,reason);updEnc("autreEntrees",enc.autreEntrees.filter(e=>e.id!==id));};
  const addDeposit=()=>{if(!newDepMt)return;const dep={id:Date.now().toString(),montant:parseFloat(newDepMt),note:newDepNote.trim(),slip:newDepSlip.trim()};updEnc("deposits",[...enc.deposits,dep]);logCreate('encaisse','depot',dep.id,dep);setNewDepMt("");setNewDepNote("");setNewDepSlip("");};
  const rmDeposit=async id=>{const reason=await promptCorrectionReason("Retrait de dépôt");if(!reason)return;logVoid('encaisse','depot',id,reason);updEnc("deposits",enc.deposits.filter(d=>d.id!==id));};
  const addSortie=()=>{if(!newSortMt||!newSortCat)return;const s={id:Date.now().toString(),categorie:newSortCat,description:newSortDesc.trim(),montant:parseFloat(newSortMt)};updEnc("sorties",[...enc.sorties,s]);logCreate('encaisse','sortie',s.id,s);setNewSortCat("");setNewSortDesc("");setNewSortMt("");};
  const rmSortie=async id=>{const reason=await promptCorrectionReason("Retrait de sortie de fonds");if(!reason)return;logVoid('encaisse','sortie',id,reason);updEnc("sorties",enc.sorties.filter(s=>s.id!==id));};

  return(<div style={{display:"flex",flexDirection:"column",gap:10}}>

    {/* Date nav */}
    <div style={{display:"flex",alignItems:"center",gap:6}}>
      <button onClick={()=>{const n=new Date(d);n.setDate(n.getDate()-1);setSelDate(dk(n))}} style={{background:t.section,border:`1px solid ${t.cardBorder}`,borderRadius:5,color:t.text,padding:"3px 8px",cursor:"pointer",fontSize:13}}>←</button>
      <div style={{fontSize:14,fontWeight:700,textTransform:"capitalize",color:t.text}}>{fmtD(d)}</div>
      <button onClick={()=>{const n=new Date(d);n.setDate(n.getDate()+1);setSelDate(dk(n))}} style={{background:t.section,border:`1px solid ${t.cardBorder}`,borderRadius:5,color:t.text,padding:"3px 8px",cursor:"pointer",fontSize:13}}>→</button>
      <input type="date" value={selDate} onChange={e=>e.target.value&&setSelDate(e.target.value)} style={{...inputS,fontFamily:"'DM Mono',monospace",fontSize:11,marginLeft:"auto"}}/>
    </div>

    {/* Monthly summary */}
    <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:11}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",userSelect:"none"}} onClick={()=>setSummaryOpen(o=>!o)}>
        <span style={{fontSize:13,fontWeight:700,color:t.text}}>Sommaire mensuel</span>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <input type="month" value={month} onChange={e=>e.target.value&&setMonth(e.target.value)} onClick={e=>e.stopPropagation()} style={{...inputS,fontFamily:"'DM Mono',monospace",fontSize:11}}/>
          <span style={{fontSize:9,color:t.textDim,display:"inline-block",transform:summaryOpen?"rotate(0deg)":"rotate(-90deg)",transition:"transform 0.15s"}}>▾</span>
        </div>
      </div>
      {summaryOpen&&(<div style={{marginTop:8}}>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
          <MC label="Cash des ventes" value={fmt(mSummary.totalCV)} accent={t.posColor}/>
          <MC label="Dépôts banque" value={fmt(mSummary.totalDep)} accent="#f97316"/>
          <MC label="Sorties cash" value={fmt(mSummary.totalSort)} accent="#7c3aed"/>
          <MC label="Position actuelle" value={fmt(mSummary.currentPos)}/>
          <MC label="Jours balancés" value={`${mSummary.bal}j`} accent="#22c55e" sub={mSummary.notBal>0?`${mSummary.notBal} non bal.`:undefined}/>
        </div>
        {mSummary.bigE.length>0&&(<div style={{padding:"7px 10px",borderRadius:7,background:t.reconErrBg,border:`1px solid ${t.reconErrBorder}`}}>
          <span style={{fontSize:11,fontWeight:600,color:"#dc2626"}}>⚠ Écarts &gt; 10$ :</span>
          {mSummary.bigE.map(x=>(<span key={x.date} style={{display:"inline-block",marginLeft:8,fontSize:10,color:"#dc2626",fontFamily:"'DM Mono',monospace"}}>{x.date}: {x.ecart>0?"surplus":"manque"} {fmt(Math.abs(x.ecart))}</span>))}
        </div>)}
      </div>)}
    </div>

    {/* S1: Solde d'ouverture */}
    <SH label="① Solde d'ouverture">
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 0"}}>
        {enc.openingOverride!=null
          ?(<><span style={{fontSize:11,color:t.textSub}}>Solde d'ouverture (manuel)</span>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:14,fontWeight:700,color:t.text}}>{fmt(enc.openingOverride)}</span>
              <button onClick={()=>updEnc("openingOverride",null)} style={{fontSize:9.5,padding:"2px 7px",borderRadius:4,border:"1px solid rgba(239,68,68,0.2)",background:"rgba(239,68,68,0.07)",color:"#ef4444",cursor:"pointer"}}>✕ Retirer</button>
            </div></>)
          :(<><div>
              <span style={{fontSize:11,color:t.textSub}}>Solde d'ouverture</span>
              {dr.opening==null&&<div style={{fontSize:9.5,color:t.textMuted,marginTop:1}}>Aucun historique — entrer manuellement pour la première journée</div>}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:14,fontWeight:700,color:dr.opening!=null?t.text:t.textDim}}>{dr.opening!=null?fmt(dr.opening):"—"}</span>
              {!overrideMode
                ?<button onClick={()=>{setOverrideMode(true);setOverrideVal(dr.opening!=null?String(dr.opening):"")}} style={{fontSize:9.5,padding:"2px 7px",borderRadius:4,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:"pointer"}}>✎ Modifier</button>
                :<div style={{display:"flex",gap:4,alignItems:"center"}}>
                  <input type="number" inputMode="decimal" value={overrideVal} onChange={e=>setOverrideVal(e.target.value)} autoFocus style={{...inputS,width:80,textAlign:"right",fontFamily:"'DM Mono',monospace"}}/>
                  <button onClick={()=>{updEnc("openingOverride",parseFloat(overrideVal)||0);setOverrideMode(false)}} style={{fontSize:9.5,padding:"2px 8px",borderRadius:4,border:"none",background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#fff",cursor:"pointer",fontWeight:700}}>✓</button>
                  <button onClick={()=>setOverrideMode(false)} style={{fontSize:9.5,padding:"2px 6px",borderRadius:4,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:"pointer"}}>✕</button>
                </div>}
            </div></>)}
      </div>
    </SH>

    {/* S2: Entrées de cash */}
    <SH label="② Entrées de cash">
      <div style={{padding:"5px 0",borderBottom:`1px solid ${t.divider}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:11,color:t.textSub}}>Cash des ventes <span style={{fontSize:9,color:t.textDim}}>(auto — depuis les caisses)</span></span>
          <span style={{fontFamily:"'DM Mono',monospace",fontSize:13,fontWeight:600,color:dr.hasCaisseData?t.posColor:t.textDim}}>{dr.hasCaisseData?fmt(dr.cashVentes):"⏳ Remplir les caisses d'abord"}</span>
        </div>
      </div>
      {enc.autreEntrees.map(e=>(<div key={e.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${t.divider}`}}>
        <span style={{fontSize:11,color:t.textSub}}>{e.description||"Autre entrée"}{e.fromFacturation&&<span style={{fontSize:9,color:t.textDim,marginLeft:5,fontWeight:600}}>(Facturation)</span>}</span>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#22c55e"}}>+{fmt(e.montant)}</span>
          {!e.fromFacturation&&<button onClick={()=>rmEntree(e.id)} style={{background:"rgba(239,68,68,0.07)",border:"none",borderRadius:3,color:"#ef4444",fontSize:9,padding:"1px 5px",cursor:"pointer"}}>✕</button>}
        </div>
      </div>))}
      <div style={{display:"flex",gap:4,marginTop:6,alignItems:"center"}}>
        <input value={newEntreeDesc} onChange={e=>setNewEntreeDesc(e.target.value)} placeholder="Description..." style={{...inputS,flex:1}}/>
        <input type="number" inputMode="decimal" value={newEntreeMt} onChange={e=>setNewEntreeMt(e.target.value)} placeholder="Montant" style={{...inputS,width:80,textAlign:"right",fontFamily:"'DM Mono',monospace"}} onKeyDown={e=>{if(e.key==="Enter")addEntree()}}/>
        <button onClick={addEntree} style={{padding:"5px 10px",borderRadius:5,border:"none",cursor:"pointer",fontWeight:600,fontSize:12,background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#fff"}}>+ Autre entrée</button>
      </div>
    </SH>

    {/* S3: Dépôts à la banque */}
    <SH label="③ Dépôts à la banque">
      <div style={{padding:"5px 0",borderBottom:`1px solid ${t.divider}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:11,color:t.textSub}}>Dépôt Interac / Crédit <span style={{fontSize:9,color:t.textDim}}>(auto — depuis les caisses)</span></span>
          <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:600,color:dr.hasCaisseData?t.text:t.textDim}}>{dr.hasCaisseData?fmt(dr.totalInterac):"—"}</span>
        </div>
      </div>
      {enc.deposits.map(dep=>(<div key={dep.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${t.divider}`}}>
        <span style={{fontSize:11,color:t.textSub}}>{dep.note||"Dépôt comptant"}{dep.slip&&<span style={{fontSize:9,color:t.textDim,marginLeft:4}}>#{dep.slip}</span>}</span>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#ef4444"}}>−{fmt(dep.montant)}</span>
          <button onClick={()=>rmDeposit(dep.id)} style={{background:"rgba(239,68,68,0.07)",border:"none",borderRadius:3,color:"#ef4444",fontSize:9,padding:"1px 5px",cursor:"pointer"}}>✕</button>
        </div>
      </div>))}
      <div style={{display:"flex",gap:4,marginTop:6,flexWrap:"wrap",alignItems:"center"}}>
        <input type="number" inputMode="decimal" value={newDepMt} onChange={e=>setNewDepMt(e.target.value)} placeholder="Montant" style={{...inputS,width:80,textAlign:"right",fontFamily:"'DM Mono',monospace"}}/>
        <input value={newDepNote} onChange={e=>setNewDepNote(e.target.value)} placeholder="Note..." style={{...inputS,flex:1,minWidth:80}}/>
        <input value={newDepSlip} onChange={e=>setNewDepSlip(e.target.value)} placeholder="# bordereau" style={{...inputS,width:90}}/>
        <button onClick={addDeposit} style={{padding:"5px 10px",borderRadius:5,border:"none",cursor:"pointer",fontWeight:600,fontSize:12,background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#fff"}}>+ Dépôt</button>
      </div>
    </SH>

    {/* S4: Sorties de cash */}
    <SH label="④ Sorties de cash">
      {enc.sorties.map(s=>(<div key={s.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${t.divider}`}}>
        <div>
          <span style={{fontSize:11,color:t.textSub}}>{s.description||"—"}</span>
          <span style={{fontSize:9,color:t.textDim,marginLeft:6}}>{encaisseConfig.sortieCategories.find(c=>c.id===s.categorie)?.name||s.categorie}</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#ef4444"}}>−{fmt(s.montant)}</span>
          <button onClick={()=>rmSortie(s.id)} style={{background:"rgba(239,68,68,0.07)",border:"none",borderRadius:3,color:"#ef4444",fontSize:9,padding:"1px 5px",cursor:"pointer"}}>✕</button>
        </div>
      </div>))}
      <div style={{display:"flex",gap:4,marginTop:6,flexWrap:"wrap",alignItems:"center"}}>
        <select value={newSortCat} onChange={e=>setNewSortCat(e.target.value)} style={{...inputS,flex:"0 0 auto",minWidth:160}}>
          <option value="">-- Catégorie --</option>
          {encaisseConfig.sortieCategories.map(c=>(<option key={c.id} value={c.id}>{c.name}</option>))}
        </select>
        <input value={newSortDesc} onChange={e=>setNewSortDesc(e.target.value)} placeholder="Description..." style={{...inputS,flex:1,minWidth:80}}/>
        <input type="number" inputMode="decimal" value={newSortMt} onChange={e=>setNewSortMt(e.target.value)} placeholder="Montant" style={{...inputS,width:80,textAlign:"right",fontFamily:"'DM Mono',monospace"}} onKeyDown={e=>{if(e.key==="Enter")addSortie()}}/>
        <button onClick={addSortie} style={{padding:"5px 10px",borderRadius:5,border:"none",cursor:"pointer",fontWeight:600,fontSize:12,background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#fff"}}>+ Sortie</button>
      </div>
    </SH>

    {/* S5: Comptage physique */}
    <SH label="⑤ Comptage physique">
      {encaisseConfig.cashLocations.map(loc=>(<F key={loc.id} label={loc.name} value={enc.physicalCount[loc.id]??null} onChange={v=>updEnc("physicalCount",{...enc.physicalCount,[loc.id]:v})} wide/>))}
      {dr.physEntered&&(<div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",marginTop:4,borderTop:`1px solid ${t.dividerStrong}`}}>
        <span style={{fontSize:12,fontWeight:700,color:t.text}}>Total physique</span>
        <span style={{fontFamily:"'DM Mono',monospace",fontSize:13,fontWeight:700,color:t.text}}>{fmt(dr.physTotal)}</span>
      </div>)}
    </SH>

    {/* S6: Réconciliation */}
    <div style={{background:dr.physEntered?(dr.balanced?t.reconBalBg:t.reconErrBg):t.reconNeutralBg,border:`1px solid ${dr.physEntered?(dr.balanced?t.reconBalBorder:t.reconErrBorder):t.reconNeutralBorder}`,borderRadius:9,padding:11}}>
      <span style={{fontSize:13,fontWeight:700,marginBottom:8,display:"block",color:t.text}}>⑥ Réconciliation</span>
      <ReconLine label="Solde d'ouverture" value={dr.opening??0}/>
      <ReconLine label="+ Cash des ventes" value={dr.cashVentes}/>
      {dr.autreEntreesTotal>0&&<ReconLine label="+ Autres entrées" value={dr.autreEntreesTotal}/>}
      {dr.depositsTotal>0&&<ReconLine label="− Dépôts banque (comptant)" value={dr.depositsTotal} negative/>}
      {dr.sortiesTotal>0&&<ReconLine label="− Sorties de cash" value={dr.sortiesTotal} negative/>}
      <ReconLine label="= Solde calculé" value={dr.calculated} bold borderTop/>
      {dr.physEntered&&(<>
        <ReconLine label="Comptage physique" value={dr.physTotal}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",marginTop:4,borderTop:`1.5px solid ${t.dividerStrong}`}}>
          <span style={{fontSize:12,fontWeight:700,color:t.reconLabelBold}}>ÉCART</span>
          <span style={{fontFamily:"'DM Mono',monospace",fontSize:14,fontWeight:800,color:dr.balanced?"#16a34a":"#dc2626"}}>{dr.balanced?"✓ BALANCÉ":`✗ ${(dr.ecart||0)>0?"surplus":"manque"} ${fmt(Math.abs(dr.ecart||0))}`}</span>
        </div>
      </>)}
      {!dr.physEntered&&<div style={{fontSize:10.5,color:t.textMuted,marginTop:6}}>Entrer le comptage physique (section ⑤) pour voir l'écart.</div>}
      <div style={{marginTop:10,paddingTop:8,borderTop:`1px solid ${t.divider}`}}>
        <span style={{fontSize:11,color:t.textSub,display:"block",marginBottom:5}}>Reporter au lendemain :</span>
        <div style={{display:"flex",gap:6}}>
          {[["calculated","Solde calculé"],["physical","Comptage physique"]].map(([v,label])=>(
            <button key={v} onClick={()=>updEnc("carryForwardMode",v)} style={{flex:1,padding:"5px 8px",borderRadius:6,border:`1.5px solid ${enc.carryForwardMode===v?"#f97316":t.cardBorder}`,background:enc.carryForwardMode===v?"rgba(249,115,22,0.08)":t.section,color:enc.carryForwardMode===v?"#f97316":t.textSub,cursor:"pointer",fontWeight:enc.carryForwardMode===v?700:500,fontSize:11,transition:"all 0.15s"}}>{label}</button>
          ))}
        </div>
      </div>
    </div>

    {/* Config */}
    <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:11}}>
      <div onClick={()=>setConfigOpen(o=>!o)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",userSelect:"none"}}>
        <span style={{fontSize:13,fontWeight:700,color:t.text}}>Configuration</span>
        <span style={{fontSize:9,color:t.textDim,display:"inline-block",transform:configOpen?"rotate(0deg)":"rotate(-90deg)",transition:"transform 0.15s"}}>▾</span>
      </div>
      {configOpen&&(<>
        <div style={{marginTop:10}}>
          <span style={{fontSize:11.5,fontWeight:700,color:t.textSub,display:"block",marginBottom:5}}>Catégories de sorties</span>
          {encaisseConfig.sortieCategories.map(c=>(<div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"3px 6px",background:t.rowBg,border:`1px solid ${t.rowBorder}`,borderRadius:4,marginBottom:3}}>
            {editCatId===c.id
              ?(<input value={editCatName} onChange={e=>setEditCatName(e.target.value)} autoFocus
                  onBlur={()=>{if(editCatName.trim()){saveEncaisseConfig({...encaisseConfig,sortieCategories:encaisseConfig.sortieCategories.map(x=>x.id===c.id?{...x,name:editCatName.trim()}:x)})}setEditCatId(null)}}
                  onKeyDown={e=>{if(e.key==="Enter")e.target.blur();if(e.key==="Escape")setEditCatId(null)}}
                  style={{flex:1,background:t.inputBg,border:`1px solid rgba(249,115,22,0.3)`,borderRadius:3,color:t.inputText,fontSize:11,padding:"2px 5px",outline:"none",marginRight:6}}/>)
              :(<span style={{fontSize:11,cursor:"pointer",color:t.text,flex:1}} onClick={()=>{setEditCatId(c.id);setEditCatName(c.name)}}>{c.name} <span style={{fontSize:9,color:t.textDim}}>✎</span></span>)}
            <button onClick={()=>saveEncaisseConfig({...encaisseConfig,sortieCategories:encaisseConfig.sortieCategories.filter(x=>x.id!==c.id)})} style={{background:"rgba(239,68,68,0.07)",border:"none",borderRadius:3,color:"#ef4444",fontSize:9,padding:"1px 5px",cursor:"pointer"}}>✕</button>
          </div>))}
          <div style={{display:"flex",gap:4,marginTop:3}}>
            <input value={newCatName} onChange={e=>setNewCatName(e.target.value)} placeholder="Nouvelle catégorie..." style={{flex:1,background:t.inputBg,border:`1px solid ${t.inputBorder}`,borderRadius:4,color:t.inputText,fontSize:11,padding:"3px 6px",outline:"none"}} onKeyDown={e=>{if(e.key==="Enter"&&newCatName.trim()){saveEncaisseConfig({...encaisseConfig,sortieCategories:[...encaisseConfig.sortieCategories,{id:Date.now().toString(),name:newCatName.trim()}]});setNewCatName("")}}}/>
            <button onClick={()=>{if(!newCatName.trim())return;saveEncaisseConfig({...encaisseConfig,sortieCategories:[...encaisseConfig.sortieCategories,{id:Date.now().toString(),name:newCatName.trim()}]});setNewCatName("")}} style={{padding:"3px 10px",borderRadius:4,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#fff"}}>+</button>
          </div>
        </div>
        <div style={{marginTop:10}}>
          <span style={{fontSize:11.5,fontWeight:700,color:t.textSub,display:"block",marginBottom:5}}>Emplacements de cash</span>
          {encaisseConfig.cashLocations.map(loc=>(<div key={loc.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"3px 6px",background:t.rowBg,border:`1px solid ${t.rowBorder}`,borderRadius:4,marginBottom:3}}>
            <span style={{fontSize:11,color:t.text,flex:1}}>{loc.name}</span>
            <button onClick={()=>saveEncaisseConfig({...encaisseConfig,cashLocations:encaisseConfig.cashLocations.filter(x=>x.id!==loc.id)})} style={{background:"rgba(239,68,68,0.07)",border:"none",borderRadius:3,color:"#ef4444",fontSize:9,padding:"1px 5px",cursor:"pointer"}}>✕</button>
          </div>))}
          <div style={{display:"flex",gap:4,marginTop:3}}>
            <input value={newLocName} onChange={e=>setNewLocName(e.target.value)} placeholder="Nouvel emplacement..." style={{flex:1,background:t.inputBg,border:`1px solid ${t.inputBorder}`,borderRadius:4,color:t.inputText,fontSize:11,padding:"3px 6px",outline:"none"}} onKeyDown={e=>{if(e.key==="Enter"&&newLocName.trim()){saveEncaisseConfig({...encaisseConfig,cashLocations:[...encaisseConfig.cashLocations,{id:Date.now().toString(),name:newLocName.trim()}]});setNewLocName("")}}}/>
            <button onClick={()=>{if(!newLocName.trim())return;saveEncaisseConfig({...encaisseConfig,cashLocations:[...encaisseConfig.cashLocations,{id:Date.now().toString(),name:newLocName.trim()}]});setNewLocName("")}} style={{padding:"3px 10px",borderRadius:4,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#fff"}}>+</button>
          </div>
        </div>
      </>)}
    </div>
  </div>);
}

// ── COMPTABILITE EXPORT ──
function ComptabiliteExport({factures,clients,produits,categories,onClose}){
  const t=useT();
  const today=dk(new Date());
  const firstOfMonth=today.slice(0,8)+"01";
  const iS={background:t.inputBg,border:`1px solid ${t.inputBorder}`,borderRadius:5,color:t.inputText,fontSize:11,padding:"4px 7px",outline:"none",fontFamily:"'DM Mono',monospace"};
  const [dateFrom,setDateFrom]=useState(firstOfMonth);
  const [dateTo,setDateTo]=useState(today);
  const [exportType,setExportType]=useState("facturation");
  const [upgradeMsg,setUpgradeMsg]=useState(false);
  const [msg,setMsg]=useState("");
  const buildCSV=(rows,filename)=>{
    const csv=rows.map(r=>r.map(v=>`"${String(v==null?"":v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;
    a.download=`${filename}-${dateFrom}-${dateTo}.csv`;a.click();URL.revokeObjectURL(url);
  };
  const doExport=()=>{
    setMsg("");setUpgradeMsg(false);
    if(exportType==="facturation"){
      const rows=[["Date","# Facture","Code client","Nom client","Code produit","Catégorie","# Compte revenu","Description","Quantité","Prix unitaire","Remise %","Sous-total","TPS","TVQ","Total"]];
      const facs=factures.filter(f=>!["Annulée","Brouillon"].includes(f.statut)&&(!dateFrom||f.date>=dateFrom)&&(!dateTo||f.date<=dateTo));
      for(const fac of facs){const cl=clients.find(c=>c.id===fac.clientId);for(const l of fac.lignes||[]){const prod=produits.find(p=>p.id===l.produitId);const cat=categories.find(c=>c.id===prod?.categorieId);const st=(l.prixUnitaire||0)*(l.quantite||0)*(1-(l.remise||0)/100);const tps=l.tps!==false?st*0.05:0;const tvq=l.tvq!==false?st*0.09975:0;rows.push([fac.date||"",fac.numero||"",cl?.code||"",cl?.entreprise||"",prod?.code||"",cat?.nom||"",cat?.compteRevenu||"",l.description||"",l.quantite||0,(l.prixUnitaire||0).toFixed(2),(l.remise||0).toFixed(1),st.toFixed(2),tps.toFixed(2),tvq.toFixed(2),(st+tps+tvq).toFixed(2)]);}}
      if(rows.length<=1){setMsg("Aucune donnée dans cette période.");return;}
      buildCSV(rows,"journal-facturation");setMsg(`${rows.length-1} ligne${rows.length>2?"s":""} exportée${rows.length>2?"s":""}.`);
    } else if(exportType==="encaissements"){
      const rows=[["Date","# Encaissement","Code client","Nom client","# Facture","Montant","Mode de paiement","Référence","Note"]];
      for(const fac of factures){const cl=clients.find(c=>c.id===fac.clientId);for(const p of fac.paiements||[]){if(p.fromCredit)continue;if(dateFrom&&p.date<dateFrom)continue;if(dateTo&&p.date>dateTo)continue;rows.push([p.date||"",p.numero||"",cl?.code||"",cl?.entreprise||"",fac.numero||"",(p.montant||0).toFixed(2),p.mode||"",p.reference||"",p.note||""]);}}
      if(rows.length<=1){setMsg("Aucun encaissement dans cette période.");return;}
      buildCSV(rows,"journal-encaissements");setMsg(`${rows.length-1} paiement${rows.length>2?"s":""} exporté${rows.length>2?"s":""}.`);
    } else if(exportType==="grandlivre"){
      const rows=[["Code client","Nom client","Solde ouverture","Facturé","Notes de crédit","Encaissé","Solde fermeture"]];
      const clientIds=[...new Set(factures.map(f=>f.clientId))];
      for(const cid of clientIds){
        const cl=clients.find(c=>c.id===cid);
        const facs=factures.filter(f=>f.clientId===cid&&!["Annulée","Brouillon"].includes(f.statut));
        let soldOuv=0;if(dateFrom){for(const f of facs){if(f.date>=dateFrom)continue;const tot=computeSoumTotals(f.lignes||[]).total;const pBefore=(f.paiements||[]).filter(p=>p.date<dateFrom).reduce((s,p)=>s+(p.montant||0),0);soldOuv+=tot-pBefore;}}
        const facture=facs.filter(f=>(!dateFrom||f.date>=dateFrom)&&(!dateTo||f.date<=dateTo)).reduce((s,f)=>s+computeSoumTotals(f.lignes||[]).total,0);
        const credited=facs.reduce((s,f)=>s+(f.paiements||[]).filter(p=>p.fromCredit&&(!dateFrom||p.date>=dateFrom)&&(!dateTo||p.date<=dateTo)).reduce((ss,p)=>ss+(p.montant||0),0),0);
        const encaisse=facs.reduce((s,f)=>s+(f.paiements||[]).filter(p=>!p.fromCredit&&(!dateFrom||p.date>=dateFrom)&&(!dateTo||p.date<=dateTo)).reduce((ss,p)=>ss+(p.montant||0),0),0);
        const soldFerm=soldOuv+facture-credited-encaisse;
        if(soldOuv===0&&facture===0&&credited===0&&encaisse===0)continue;
        rows.push([cl?.code||"",cl?.entreprise||cid,soldOuv.toFixed(2),facture.toFixed(2),credited.toFixed(2),encaisse.toFixed(2),soldFerm.toFixed(2)]);
      }
      if(rows.length<=1){setMsg("Aucune activité dans cette période.");return;}
      buildCSV(rows,"grand-livre-comptes-recevables");setMsg(`${rows.length-1} client${rows.length>2?"s":""} exporté${rows.length>2?"s":""}.`);
    }
  };
  const OPTS=[{id:"facturation",label:"Journal de facturation",desc:"Détail par ligne d'article — numéros de compte inclus"},{id:"encaissements",label:"Journal des encaissements",desc:"Paiements reçus, mode et référence"},{id:"grandlivre",label:"Grand livre comptes à recevoir",desc:"Soldes par client sur la période"}];
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div style={{background:t.bg,border:`1px solid ${t.cardBorder}`,borderRadius:12,padding:22,width:"100%",maxWidth:500,display:"flex",flexDirection:"column",gap:12,boxShadow:"0 20px 60px rgba(0,0,0,0.5)"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span style={{fontSize:14,fontWeight:700,color:t.text}}>📊 Exporter pour comptabilité</span>
        <button onClick={onClose} style={{background:"none",border:"none",color:t.textDim,cursor:"pointer",fontSize:18,lineHeight:1}}>✕</button>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <span style={{fontSize:11,color:t.textMuted}}>Période :</span>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={iS}/>
        <span style={{fontSize:11,color:t.textMuted}}>→</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={iS}/>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {OPTS.map(o=>(<label key={o.id} onClick={()=>setExportType(o.id)} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"9px 12px",borderRadius:8,border:`1px solid ${exportType===o.id?"#f97316":t.cardBorder}`,background:exportType===o.id?"rgba(249,115,22,0.06)":t.card}}>
          <input type="radio" checked={exportType===o.id} onChange={()=>setExportType(o.id)} style={{accentColor:"#f97316",flexShrink:0}}/>
          <div><div style={{fontSize:12,fontWeight:600,color:t.text}}>{o.label}</div><div style={{fontSize:10,color:t.textMuted,marginTop:1}}>{o.desc}</div></div>
        </label>))}
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",borderTop:`1px solid ${t.dividerMid}`,paddingTop:10,flexWrap:"wrap"}}>
        <button onClick={doExport} style={{padding:"7px 20px",borderRadius:6,border:"none",background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:12,fontFamily:"'Outfit',sans-serif"}}>⬇ Exporter CSV</button>
        <button onClick={()=>{if(!canUse("excelExport"))setUpgradeMsg(true);}} style={{padding:"7px 14px",borderRadius:6,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textDim,cursor:"pointer",fontWeight:600,fontSize:11,opacity:0.6}}>Excel 🔒</button>
        {upgradeMsg&&<span style={{fontSize:10,color:"#f97316",fontWeight:600}}>🔒 Pro requis pour l'export Excel</span>}
        {msg&&<span style={{fontSize:11,color:"#22c55e",fontWeight:600}}>{msg}</span>}
      </div>
    </div>
  </div>);
}

// ── FACTURATION DASHBOARD ──
const TYPE_PILL={soumission:{label:"S",bg:"rgba(59,130,246,0.12)",color:"#3b82f6"},commande:{label:"C",bg:"rgba(139,92,246,0.12)",color:"#8b5cf6"},facture:{label:"F",bg:"rgba(249,115,22,0.12)",color:"#f97316"},creditnote:{label:"NC",bg:"rgba(239,68,68,0.1)",color:"#ef4444"}};
function getStatutColor(doc){if(doc._type==="soumission")return STATUT_SOUM_C[doc.statut]||"#6b7280";if(doc._type==="commande")return STATUT_CMD_C[doc.statut]||"#6b7280";if(doc._type==="facture"||doc._type==="creditnote")return STATUT_FAC_C[doc.statut]||STATUT_NC_C[doc.statut]||"#6b7280";return"#6b7280";}
function getStatutColorFn(type,statut){if(type==="soumission")return STATUT_SOUM_C[statut]||"#6b7280";if(type==="commande")return STATUT_CMD_C[statut]||"#6b7280";if(type==="facture")return STATUT_FAC_C[statut]||"#6b7280";if(type==="creditnote")return STATUT_NC_C[statut]||"#6b7280";return"#6b7280";}
function getDocSolde(doc){if(doc._type==="facture"){const paye=(doc.paiements||[]).reduce((s,p)=>s+(p.montant||0),0);return Math.max(0,computeSoumTotals(doc.lignes||[]).total-paye);}return null;}
function FacturationDashboard({soumissions,commandes,factures,creditNotes,clients,produits,categories,openDoc}){
  const t=useT();
  const [showCompta,setShowCompta]=useState(false);
  const today=dk(new Date());
  const thisMonth=today.slice(0,7);
  const [filterType,setFilterType]=useState("tous");
  const [search,setSearch]=useState("");
  const [dateFrom,setDateFrom]=useState("");
  const [dateTo,setDateTo]=useState("");
  const [sortCol,setSortCol]=useState("date");
  const [sortDir,setSortDir]=useState(-1);
  const inputS={background:t.inputBg,border:`1px solid ${t.inputBorder}`,borderRadius:5,color:t.inputText,fontSize:11,padding:"4px 7px",outline:"none"};
  const stats=useMemo(()=>{
    const factureCeMois=factures.filter(f=>f.date?.startsWith(thisMonth)&&f.statut!=="Annulée").reduce((s,f)=>s+computeSoumTotals(f.lignes||[]).total,0);
    const encaisseCeMois=factures.reduce((s,f)=>(s+(f.paiements||[]).filter(p=>p.date?.startsWith(thisMonth)).reduce((ps,p)=>ps+(p.montant||0),0)),0);
    const enSouffrance=factures.filter(f=>!["Payée","Créditée","Annulée","Brouillon"].includes(f.statut)).reduce((s,f)=>{const paye=(f.paiements||[]).reduce((ps,p)=>ps+(p.montant||0),0);return s+Math.max(0,computeSoumTotals(f.lignes||[]).total-paye);},0);
    const enRetard=factures.filter(f=>["Envoyée","Payée partiellement"].includes(f.statut)&&f.dateEcheance&&f.dateEcheance<today).length;
    return{factureCeMois,encaisseCeMois,enSouffrance,enRetard};
  },[factures,thisMonth,today]);
  const allDocs=useMemo(()=>[...soumissions.map(d=>({...d,_type:"soumission"})),...commandes.map(d=>({...d,_type:"commande"})),...factures.map(d=>({...d,_type:"facture"})),...creditNotes.map(d=>({...d,_type:"creditnote"}))]
  ,[soumissions,commandes,factures,creditNotes]);
  const filtered=useMemo(()=>{
    let list=filterType==="tous"?allDocs:allDocs.filter(d=>d._type===filterType);
    if(search){const q=search.toLowerCase();list=list.filter(d=>{const cl=clients.find(c=>c.id===d.clientId);return(d.numero||"").toLowerCase().includes(q)||(cl?.entreprise||"").toLowerCase().includes(q);});}
    if(dateFrom)list=list.filter(d=>(d.date||"")>=dateFrom);
    if(dateTo)list=list.filter(d=>(d.date||"")<=dateTo);
    return[...list].sort((a,b)=>{
      if(sortCol==="numero")return sortDir*(a.numero||"").localeCompare(b.numero||"");
      if(sortCol==="date")return sortDir*(a.date||"").localeCompare(b.date||"");
      if(sortCol==="client"){const ca=clients.find(c=>c.id===a.clientId)?.entreprise||"";const cb=clients.find(c=>c.id===b.clientId)?.entreprise||"";return sortDir*ca.localeCompare(cb,"fr");}
      if(sortCol==="total")return sortDir*(computeSoumTotals(b.lignes||[]).total-computeSoumTotals(a.lignes||[]).total);
      if(sortCol==="statut")return sortDir*(a.statut||"").localeCompare(b.statut||"");
      return 0;
    });
  },[allDocs,filterType,search,dateFrom,dateTo,sortCol,sortDir,clients]);
  const exportCSV=()=>{
    const rows=[["#","Type","Date","Client","Total","Statut","Solde"]];
    for(const d of filtered){const cl=clients.find(c=>c.id===d.clientId);const total=computeSoumTotals(d.lignes||[]).total;const solde=getDocSolde(d);rows.push([d.numero||"",TYPE_PILL[d._type]?.label||"",d.date||"",cl?.entreprise||"",total.toFixed(2),d.statut||"",solde!=null?solde.toFixed(2):"—"]);}
    const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`documents-${today}.csv`;a.click();URL.revokeObjectURL(url);
  };
  const toggleSort=col=>{if(sortCol===col)setSortDir(d=>-d);else{setSortCol(col);setSortDir(-1);}};
  const SH=({col,align,children})=>(<span onClick={()=>toggleSort(col)} style={{cursor:"pointer",userSelect:"none",fontSize:10,fontWeight:700,color:sortCol===col?"#f97316":t.textMuted,display:"block",textAlign:align||"left"}}>{children}{sortCol===col?(sortDir<0?" ↓":" ↑"):""}</span>);
  const FTABS=[{id:"tous",label:"Tous"},{id:"soumission",label:"Soumissions"},{id:"commande",label:"Commandes"},{id:"facture",label:"Factures"},{id:"creditnote",label:"Notes de crédit"}];
  const countOf=type=>allDocs.filter(d=>d._type===type).length;
  return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    {/* Stats */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8}}>
      {[{label:"Facturé ce mois",val:fmt(stats.factureCeMois),color:"#f97316"},{label:"Encaissé ce mois",val:fmt(stats.encaisseCeMois),color:"#22c55e"},{label:"En souffrance",val:fmt(stats.enSouffrance),color:"#ef4444"},{label:"En retard",val:`${stats.enRetard} facture${stats.enRetard!==1?"s":""}`,color:stats.enRetard>0?"#ef4444":t.textMuted}].map(s=>(
        <div key={s.label} style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:"10px 14px"}}>
          <div style={{fontSize:9.5,color:t.textMuted,marginBottom:3,textTransform:"uppercase",letterSpacing:"0.5px"}}>{s.label}</div>
          <div style={{fontSize:15,fontWeight:900,color:s.color,fontFamily:"'DM Mono',monospace"}}>{s.val}</div>
        </div>
      ))}
    </div>
    {/* Filter tabs + search */}
    <div style={{display:"flex",gap:1,borderBottom:`1px solid ${t.dividerMid}`,alignItems:"flex-end",flexWrap:"wrap"}}>
      {FTABS.map(ft=>(<button key={ft.id} onClick={()=>setFilterType(ft.id)} style={{background:"none",border:"none",color:filterType===ft.id?"#f97316":t.textMuted,fontSize:11,fontWeight:600,padding:"5px 10px",cursor:"pointer",borderBottom:filterType===ft.id?"2px solid #f97316":"2px solid transparent",whiteSpace:"nowrap"}}>
        {ft.label}{ft.id!=="tous"&&<span style={{fontSize:9,marginLeft:3,color:t.textDim}}>({countOf(ft.id)})</span>}
      </button>))}
      <div style={{flex:1}}/>
      <button onClick={exportCSV} style={{fontSize:10,padding:"3px 10px",borderRadius:6,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:"pointer",fontWeight:600,marginBottom:3}}>⬇ CSV</button>
      <button onClick={()=>setShowCompta(true)} style={{fontSize:10,padding:"3px 10px",borderRadius:6,border:"1px solid rgba(249,115,22,0.25)",background:"rgba(249,115,22,0.07)",color:"#f97316",cursor:"pointer",fontWeight:700,marginBottom:3}}>📊 Comptabilité</button>
    </div>
    {showCompta&&<ComptabiliteExport factures={factures} clients={clients} produits={produits} categories={categories} onClose={()=>setShowCompta(false)}/>}
    {/* Search + date range */}
    <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher # ou client..." style={{...inputS,flex:"1 1 160px"}}/>
      <span style={{fontSize:10,color:t.textMuted}}>Du</span>
      <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{...inputS,fontFamily:"'DM Mono',monospace"}}/>
      <span style={{fontSize:10,color:t.textMuted}}>au</span>
      <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{...inputS,fontFamily:"'DM Mono',monospace"}}/>
      {(search||dateFrom||dateTo)&&<button onClick={()=>{setSearch("");setDateFrom("");setDateTo("");}} style={{fontSize:10,padding:"3px 8px",borderRadius:5,border:"none",background:"rgba(239,68,68,0.08)",color:"#ef4444",cursor:"pointer",fontWeight:600}}>✕ Réinitialiser</button>}
    </div>
    {/* Table */}
    {filtered.length===0
      ?<div style={{textAlign:"center",padding:"32px 0",color:t.textMuted,fontSize:12}}>Aucun document trouvé.</div>
      :<div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr style={{borderBottom:`2px solid ${t.dividerMid}`}}>
            <th style={{padding:"5px 8px",textAlign:"left",width:24}}/>
            <th style={{padding:"5px 8px",textAlign:"left"}}><SH col="numero">#</SH></th>
            <th style={{padding:"5px 8px",textAlign:"left"}}><SH col="date">Date</SH></th>
            <th style={{padding:"5px 8px",textAlign:"left"}}><SH col="client">Client</SH></th>
            <th style={{padding:"5px 8px",textAlign:"right"}}><SH col="total" align="right">Total</SH></th>
            <th style={{padding:"5px 8px",textAlign:"left"}}><SH col="statut">Statut</SH></th>
            <th style={{padding:"5px 8px",textAlign:"right"}}>Solde</th>
          </tr></thead>
          <tbody>
            {filtered.map(doc=>{
              const pill=TYPE_PILL[doc._type];
              const cl=clients.find(c=>c.id===doc.clientId);
              const total=computeSoumTotals(doc.lignes||[]).total;
              const solde=getDocSolde(doc);
              const sc=getStatutColorFn(doc._type,doc.statut);
              const isOverdue=doc._type==="facture"&&["Envoyée","Payée partiellement"].includes(doc.statut)&&doc.dateEcheance&&doc.dateEcheance<today;
              return(<tr key={doc.id} onClick={()=>openDoc(doc._type,doc.clientId,doc)} style={{borderBottom:`1px solid ${t.divider}`,cursor:"pointer",transition:"background 0.1s"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(249,115,22,0.04)"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                <td style={{padding:"6px 8px"}}><span style={{fontSize:9,fontWeight:800,padding:"2px 5px",borderRadius:4,background:pill?.bg,color:pill?.color,letterSpacing:"0.3px"}}>{pill?.label}</span></td>
                <td style={{padding:"6px 8px",fontFamily:"'DM Mono',monospace",fontWeight:600,color:t.text,fontSize:11}}>{doc.numero||<span style={{color:t.textDim,fontStyle:"italic"}}>Brouillon</span>}</td>
                <td style={{padding:"6px 8px",color:t.textSub,fontFamily:"'DM Mono',monospace"}}>{doc.date||"—"}</td>
                <td style={{padding:"6px 8px",color:t.text,fontWeight:500}}>{cl?.entreprise||<span style={{color:t.textDim,fontStyle:"italic"}}>Sans client</span>}</td>
                <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"'DM Mono',monospace",color:doc._type==="creditnote"?"#ef4444":t.textSub}}>{doc._type==="creditnote"?"("+fmt(total)+")":fmt(total)}</td>
                <td style={{padding:"6px 8px"}}><span style={{fontSize:9.5,fontWeight:700,padding:"2px 7px",borderRadius:10,background:`${sc}18`,color:sc}}>{isOverdue?"En retard ⚠":doc.statut}</span></td>
                <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"'DM Mono',monospace",color:solde!=null&&solde>0.005?"#f97316":t.textDim,fontWeight:solde!=null&&solde>0.005?700:400}}>{solde!=null?(solde>0.005?fmt(solde):"—"):"—"}</td>
              </tr>);
            })}
          </tbody>
        </table>
        <div style={{fontSize:10,color:t.textDim,marginTop:6,textAlign:"right"}}>{filtered.length} document{filtered.length!==1?"s":""}</div>
      </div>}
  </div>);
}

// ── AGING REPORT ──
function AgingReport({factures,clients}){
  const t=useT();
  const [asOf,setAsOf]=useState(dk(new Date()));
  const [sortCol,setSortCol]=useState("montantDu");
  const [sortDir,setSortDir]=useState(-1);
  const [upgradeMsg,setUpgradeMsg]=useState(false);
  const inputS={background:t.inputBg,border:`1px solid ${t.inputBorder}`,borderRadius:5,color:t.inputText,fontSize:11,padding:"3px 6px",outline:"none",fontFamily:"'DM Mono',monospace"};
  const data=useMemo(()=>{
    const asOfDate=new Date(asOf+"T12:00:00");
    const byClient={};
    for(const fac of factures.filter(f=>!["Payée","Créditée","Annulée","Brouillon"].includes(f.statut))){
      const paye=(fac.paiements||[]).reduce((s,p)=>s+(p.montant||0),0);
      const solde=computeSoumTotals(fac.lignes).total-paye;
      if(solde<=0.005)continue;
      if(!byClient[fac.clientId])byClient[fac.clientId]={courant:0,j30:0,j60:0,j90:0};
      let days=0;
      if(fac.dateEcheance){const due=new Date(fac.dateEcheance+"T12:00:00");days=Math.floor((asOfDate-due)/86400000);}
      const b=byClient[fac.clientId];
      if(days<=0)b.courant+=solde;else if(days<=30)b.j30+=solde;else if(days<=60)b.j60+=solde;else b.j90+=solde;
    }
    return Object.entries(byClient).map(([cid,b])=>({clientId:cid,client:clients.find(c=>c.id===cid),montantDu:b.courant+b.j30+b.j60+b.j90,...b}));
  },[factures,clients,asOf]);
  const sorted=useMemo(()=>[...data].sort((a,b)=>{
    if(sortCol==="client")return sortDir*(a.client?.entreprise||"").localeCompare(b.client?.entreprise||"","fr");
    return sortDir*((b[sortCol]||0)-(a[sortCol]||0));
  }),[data,sortCol,sortDir]);
  const totals=useMemo(()=>sorted.reduce((acc,r)=>({montantDu:acc.montantDu+r.montantDu,courant:acc.courant+r.courant,j30:acc.j30+r.j30,j60:acc.j60+r.j60,j90:acc.j90+r.j90}),{montantDu:0,courant:0,j30:0,j60:0,j90:0}),[sorted]);
  const toggleSort=col=>{if(sortCol===col)setSortDir(d=>-d);else{setSortCol(col);setSortDir(-1);}};
  const SortHd=({col,align,color,children})=>(<span onClick={()=>toggleSort(col)} style={{cursor:"pointer",userSelect:"none",fontWeight:600,fontSize:10,color:sortCol===col?"#f97316":(color||t.textMuted),display:"block",textAlign:align||"left"}}>{children}{sortCol===col?(sortDir<0?" ↓":" ↑"):""}</span>);
  const MonoCell=({val,color,bold})=>(<td style={{padding:"6px 8px",textAlign:"right",fontFamily:"'DM Mono',monospace",color:val>0?(color||t.textSub):t.textDim,fontWeight:bold?700:400}}>{val>0.005?fmt(val):"—"}</td>);
  return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
      <span style={{fontSize:13.5,fontWeight:700,color:t.text}}>Âge des comptes</span>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <span style={{fontSize:11,color:t.textMuted}}>au :</span>
        <input type="date" value={asOf} onChange={e=>setAsOf(e.target.value)} style={inputS}/>
      </div>
    </div>
    {sorted.length===0
      ?<div style={{textAlign:"center",padding:"32px 0",color:t.textMuted,fontSize:12}}>Aucune facture impayée au {asOf}.</div>
      :<div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr style={{borderBottom:`2px solid ${t.dividerMid}`}}>
            <th style={{textAlign:"left",padding:"5px 8px"}}><SortHd col="client">Client</SortHd></th>
            <th style={{textAlign:"right",padding:"5px 8px"}}><SortHd col="montantDu" align="right">Montant dû</SortHd></th>
            <th style={{textAlign:"right",padding:"5px 8px"}}><SortHd col="courant" align="right" color="#9ca3af">Courant</SortHd></th>
            <th style={{textAlign:"right",padding:"5px 8px"}}><SortHd col="j30" align="right" color="#eab308">30 jours</SortHd></th>
            <th style={{textAlign:"right",padding:"5px 8px"}}><SortHd col="j60" align="right" color="#f97316">60 jours</SortHd></th>
            <th style={{textAlign:"right",padding:"5px 8px"}}><SortHd col="j90" align="right" color="#ef4444">90+ jours</SortHd></th>
            <th style={{padding:"5px 8px"}}/>
          </tr></thead>
          <tbody>
            {sorted.map(row=>(<tr key={row.clientId} style={{borderBottom:`1px solid ${t.divider}`}}>
              <td style={{padding:"6px 8px",color:t.text,fontWeight:600}}>{row.client?.entreprise||"Client inconnu"}<span style={{fontSize:9,color:t.textMuted,fontFamily:"'DM Mono',monospace",marginLeft:5}}>{row.client?.code||""}</span></td>
              <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"'DM Mono',monospace",fontWeight:700,color:t.text}}>{fmt(row.montantDu)}</td>
              <MonoCell val={row.courant} color={t.textSub}/>
              <MonoCell val={row.j30} color="#eab308" bold={row.j30>0}/>
              <MonoCell val={row.j60} color="#f97316" bold={row.j60>0}/>
              <MonoCell val={row.j90} color="#ef4444" bold={row.j90>0}/>
              <td style={{padding:"6px 8px",textAlign:"right"}}>
                <button onClick={()=>{if(!canUse("detailedAging"))setUpgradeMsg(true);}} style={{fontSize:9,padding:"2px 7px",borderRadius:4,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textDim,cursor:"pointer",fontWeight:600}}>Détail 🔒</button>
              </td>
            </tr>))}
          </tbody>
          <tfoot><tr style={{borderTop:`2px solid ${t.dividerMid}`,background:t.section}}>
            <td style={{padding:"6px 8px",fontWeight:700,fontSize:12,color:t.text}}>TOTAL</td>
            <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"'DM Mono',monospace",fontWeight:900,fontSize:12,color:t.text}}>{fmt(totals.montantDu)}</td>
            <MonoCell val={totals.courant} color={t.textSub} bold/>
            <MonoCell val={totals.j30} color="#eab308" bold/>
            <MonoCell val={totals.j60} color="#f97316" bold/>
            <MonoCell val={totals.j90} color="#ef4444" bold/>
            <td/>
          </tr></tfoot>
        </table>
      </div>}
    {upgradeMsg&&<div style={{background:"rgba(249,115,22,0.08)",border:"1px solid rgba(249,115,22,0.2)",borderRadius:8,padding:12,display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
      <span style={{fontSize:11,color:t.textSub}}>🔒 <strong style={{color:"#f97316"}}>Pro</strong> — Le détail par facture est disponible avec BalanceIQ Pro.</span>
      <button onClick={()=>setUpgradeMsg(false)} style={{background:"none",border:"none",color:t.textDim,cursor:"pointer",fontSize:12}}>✕</button>
    </div>}
  </div>);
}

// ── FACTURATION TAB ──
function FacturationTab({categories,saveCategories,produits,saveProduits,clients,saveClients,soumissions,saveSoumissions,commandes,saveCommandes,factures,saveFactures,creditNotes,saveCreditNotes,docNums,saveDocNums,companyInfo,encaisseData,persistEncaisse,showUpgradePrompt}){
  const t=useT();
  const [subTab,setSubTab]=useState("documents");
  const [activeDoc,setActiveDoc]=useState(null);
  // activeDoc: null | { type, doc: obj|null, clientId: str|null }
  const openDoc=(type,clientId,doc)=>setActiveDoc({type,doc:doc||null,clientId:clientId||null});
  const closeDoc=()=>setActiveDoc(null);
  const convertSoumToCommande=(soum)=>{
    const id=Date.now().toString();
    const numero=fmtDocNum(docNums.prefix,"C",docNums.commande);
    const newCmd={id,numero,date:dk(new Date()),dateLivraison:"",clientId:soum.clientId,referenceClient:soum.referenceClient,statut:"Brouillon",lignes:soum.lignes.map(l=>({...l,id:Date.now().toString(36)+Math.random().toString(36).slice(2)})),notes:soum.notes,sourceType:"soumission",sourceId:soum.id,sourceNumero:soum.numero};
    saveCommandes([...commandes,newCmd]);
    saveDocNums({...docNums,commande:docNums.commande+1});
    saveSoumissions(soumissions.map(s=>s.id===soum.id?{...s,statut:"Acceptée",commandeId:id,commandeNumero:numero}:s));
    logCreate('invoice','commande',id,newCmd);
    logUpdate('invoice','soumission',soum.id,'statut',soum.statut,'Acceptée');
    setActiveDoc({type:"commande",doc:newCmd,clientId:null});
  };
  const convertToFacture=(source,sourceType)=>{
    const id=Date.now().toString();
    const numero=fmtDocNum(docNums.prefix,"F",docNums.facture);
    const client=clients.find(c=>c.id===source.clientId);
    const dateEcheance=client?calcDateEcheance(dk(new Date()),client.conditionsPaiement,client.nbJours):"";
    const newFac={id,numero,date:dk(new Date()),dateEcheance,clientId:source.clientId,referenceClient:source.referenceClient,statut:"Brouillon",lignes:source.lignes.map(l=>({...l,id:Date.now().toString(36)+Math.random().toString(36).slice(2)})),notes:source.notes,paiements:[],sourceType,sourceId:source.id,sourceNumero:source.numero};
    saveFactures([...factures,newFac]);
    saveDocNums({...docNums,facture:docNums.facture+1});
    if(sourceType==="soumission")saveSoumissions(soumissions.map(s=>s.id===source.id?{...s,statut:"Acceptée",factureId:id,factureNumero:numero}:s));
    if(sourceType==="commande")saveCommandes(commandes.map(c=>c.id===source.id?{...c,statut:"Complétée",factureId:id,factureNumero:numero}:c));
    logCreate('invoice','facture',id,newFac);
    if(sourceType==="soumission")logUpdate('invoice','soumission',source.id,'statut',source.statut,'Acceptée');
    if(sourceType==="commande")logUpdate('invoice','commande',source.id,'statut',source.statut,'Complétée');
    setActiveDoc({type:"facture",doc:newFac,clientId:null});
  };
  const inputS={background:t.inputBg,border:`1px solid ${t.inputBorder}`,borderRadius:5,color:t.inputText,fontSize:12,padding:"5px 8px",outline:"none"};

  // ── Categories section ──
  const [editingId,setEditingId]=useState(null);
  const [editForm,setEditForm]=useState({});
  const [newForm,setNewForm]=useState({nom:"",compteRevenu:"",compteEscompte:"",description:""});
  const [showInactive,setShowInactive]=useState(false);
  const [sortAZ,setSortAZ]=useState(true);
  const [addOpen,setAddOpen]=useState(false);

  const visibleCats=useMemo(()=>{
    let list=showInactive?categories:categories.filter(c=>c.actif!==false);
    list=[...list].sort((a,b)=>sortAZ?a.nom.localeCompare(b.nom,"fr"):b.nom.localeCompare(a.nom,"fr"));
    return list;
  },[categories,showInactive,sortAZ]);

  const startEdit=cat=>{setEditingId(cat.id);setEditForm({nom:cat.nom,compteRevenu:cat.compteRevenu||"",compteEscompte:cat.compteEscompte||"",description:cat.description||""})};
  const saveEdit=()=>{if(!editForm.nom.trim())return;saveCategories(categories.map(c=>c.id===editingId?{...c,...editForm,nom:editForm.nom.trim()}:c));setEditingId(null)};
  const toggleActif=cat=>saveCategories(categories.map(c=>c.id===cat.id?{...c,actif:!c.actif}:c));
  const addCat=()=>{if(!newForm.nom.trim())return;saveCategories([...categories,{id:Date.now().toString(),nom:newForm.nom.trim(),compteRevenu:newForm.compteRevenu.trim(),compteEscompte:newForm.compteEscompte.trim(),description:newForm.description.trim(),actif:true}]);setNewForm({nom:"",compteRevenu:"",compteEscompte:"",description:""});setAddOpen(false)};

  const subTabs=[{id:"documents",label:"Documents"},{id:"clients",label:"Clients"},{id:"categories",label:"Catégories"},{id:"produits",label:"Produits & Services"},{id:"vieillissement",label:"Vieillissement"}];

  if(activeDoc?.type==="soumission"){
    return<SoumissionEditor soumission={activeDoc.doc} clients={clients} produits={produits} companyInfo={companyInfo} docNums={docNums} saveDocNums={saveDocNums} soumissions={soumissions} saveSoumissions={saveSoumissions} onBack={closeDoc} initClientId={activeDoc.clientId} onConvertToCommande={convertSoumToCommande} onConvertToFacture={soum=>convertToFacture(soum,"soumission")}/>;
  }
  if(activeDoc?.type==="commande"){
    return<CommandeEditor commande={activeDoc.doc} clients={clients} produits={produits} companyInfo={companyInfo} docNums={docNums} saveDocNums={saveDocNums} commandes={commandes} saveCommandes={saveCommandes} onBack={closeDoc} initClientId={activeDoc.clientId} onConvertToFacture={cmd=>convertToFacture(cmd,"commande")}/>;
  }
  if(activeDoc?.type==="facture"){
    return<FactureEditor facture={activeDoc.doc} clients={clients} produits={produits} companyInfo={companyInfo} docNums={docNums} saveDocNums={saveDocNums} factures={factures} saveFactures={saveFactures} onBack={closeDoc} initClientId={activeDoc.clientId} onEnregistrerPaiement={(fac)=>openDoc("encaissement",fac.clientId,{factureId:fac.id})} onCreditNote={(fac)=>setActiveDoc({type:"creditnote",doc:null,clientId:fac.clientId,factureId:fac.id})}/>;
  }
  if(activeDoc?.type==="encaissement"){
    return<EncaissementEditor clientId={activeDoc.clientId} factureId={activeDoc.doc?.factureId||null} clients={clients} factures={factures} saveFactures={saveFactures} docNums={docNums} saveDocNums={saveDocNums} companyInfo={companyInfo} encaisseData={encaisseData||{}} persistEncaisse={persistEncaisse} onBack={closeDoc} showUpgradePrompt={showUpgradePrompt}/>;
  }
  if(activeDoc?.type==="creditnote"){
    return<NoteDeCreditEditor creditNote={activeDoc.doc} clients={clients} factures={factures} companyInfo={companyInfo} docNums={docNums} saveDocNums={saveDocNums} creditNotes={creditNotes} saveCreditNotes={saveCreditNotes} saveFactures={saveFactures} onBack={closeDoc} initClientId={activeDoc.clientId} initFactureId={activeDoc.factureId||null}/>;
  }

  return(<div style={{display:"flex",flexDirection:"column",gap:0}}>
    {/* Sub-nav */}
    <div style={{display:"flex",gap:1,marginBottom:10,borderBottom:`1px solid ${t.dividerMid}`,overflowX:"auto",alignItems:"center"}}>
      {subTabs.map(s=>(<button key={s.id} onClick={()=>!s.soon&&setSubTab(s.id)} style={{background:"none",border:"none",color:subTab===s.id?"#f97316":s.soon?t.textDim:t.textMuted,fontSize:11.5,fontWeight:600,padding:"5px 10px",cursor:s.soon?"default":"pointer",borderBottom:subTab===s.id?"2px solid #f97316":"2px solid transparent",whiteSpace:"nowrap",opacity:s.soon?0.5:1}}>
        {s.label}{s.soon&&<span style={{fontSize:8,marginLeft:4,color:t.textDim,fontWeight:400}}>bientôt</span>}
      </button>))}
      <div style={{flex:1}}/>
      <button onClick={()=>openDoc("soumission",null,null)} style={{fontSize:10.5,padding:"3px 10px",borderRadius:6,border:"1px solid rgba(249,115,22,0.25)",background:"rgba(249,115,22,0.07)",color:"#f97316",cursor:"pointer",fontWeight:700,marginBottom:2}}>+ Nouvelle soumission</button>
      <button onClick={()=>openDoc("commande",null,null)} style={{fontSize:10.5,padding:"3px 10px",borderRadius:6,border:"1px solid rgba(249,115,22,0.25)",background:"rgba(249,115,22,0.07)",color:"#f97316",cursor:"pointer",fontWeight:700,marginBottom:2}}>+ Nouvelle commande</button>
      <button onClick={()=>openDoc("facture",null,null)} style={{fontSize:10.5,padding:"3px 10px",borderRadius:6,border:"1px solid rgba(249,115,22,0.25)",background:"rgba(249,115,22,0.07)",color:"#f97316",cursor:"pointer",fontWeight:700,marginBottom:2}}>+ Nouvelle facture</button>
      <button onClick={()=>openDoc("creditnote",null,null)} style={{fontSize:10.5,padding:"3px 10px",borderRadius:6,border:"1px solid rgba(239,68,68,0.3)",background:"rgba(239,68,68,0.07)",color:"#ef4444",cursor:"pointer",fontWeight:700,marginBottom:2}}>+ Note de crédit</button>
    </div>

    {/* Dashboard */}
    {subTab==="documents"&&<FacturationDashboard soumissions={soumissions} commandes={commandes} factures={factures} creditNotes={creditNotes} clients={clients} produits={produits} categories={categories} openDoc={openDoc}/>}

    {/* Clients */}
    {subTab==="clients"&&<ClientsSection clients={clients} saveClients={saveClients} onNewDoc={(type,clientId)=>openDoc(type,clientId,null)} onOpenDoc={openDoc} soumissions={soumissions} commandes={commandes} factures={factures}/>}

    {/* Produits */}
    {subTab==="produits"&&<ProduitsSection produits={produits} saveProduits={saveProduits} categories={categories}/>}

    {/* Vieillissement */}
    {subTab==="vieillissement"&&<AgingReport factures={factures} clients={clients}/>}

    {/* Categories */}
    {subTab==="categories"&&(<div style={{display:"flex",flexDirection:"column",gap:8}}>
      {/* Header row */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:13.5,fontWeight:700,color:t.text}}>Catégories</span>
          <span style={{fontSize:11,color:t.textMuted}}>{categories.filter(c=>c.actif!==false).length} active{categories.filter(c=>c.actif!==false).length!==1?"s":""}</span>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <button onClick={()=>setSortAZ(s=>!s)} style={{fontSize:10,padding:"3px 8px",borderRadius:5,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:"pointer",fontWeight:600}}>
            {sortAZ?"A → Z":"Z → A"}
          </button>
          <button onClick={()=>setShowInactive(s=>!s)} style={{fontSize:10,padding:"3px 8px",borderRadius:5,border:`1px solid ${t.cardBorder}`,background:showInactive?"rgba(249,115,22,0.08)":t.section,color:showInactive?"#f97316":t.textSub,cursor:"pointer",fontWeight:600}}>
            {showInactive?"Masquer inactives":"Afficher inactives"}
          </button>
          <button onClick={()=>setAddOpen(o=>!o)} style={{fontSize:11,padding:"4px 12px",borderRadius:6,border:"1px solid rgba(249,115,22,0.25)",background:"rgba(249,115,22,0.08)",color:"#f97316",cursor:"pointer",fontWeight:700}}>
            + Nouvelle catégorie
          </button>
        </div>
      </div>

      {/* Add form */}
      {addOpen&&(<div style={{background:t.card,border:`1px solid rgba(249,115,22,0.2)`,borderRadius:9,padding:12}}>
        <span style={{fontSize:12,fontWeight:700,color:"#f97316",display:"block",marginBottom:8}}>Nouvelle catégorie</span>
        <div style={{display:"flex",flexDirection:"column",gap:5}}>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <div style={{flex:"2 1 160px"}}>
              <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Nom <span style={{color:"#f97316"}}>*</span></div>
              <input value={newForm.nom} onChange={e=>setNewForm(f=>({...f,nom:e.target.value}))} placeholder="ex: product sale" autoFocus style={{...inputS,width:"100%",boxSizing:"border-box"}} onKeyDown={e=>{if(e.key==="Enter")addCat()}}/>
            </div>
            <div style={{flex:"1 1 100px"}}>
              <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}># Compte revenu</div>
              <input value={newForm.compteRevenu} onChange={e=>setNewForm(f=>({...f,compteRevenu:e.target.value}))} placeholder="ex: 100" style={{...inputS,width:"100%",boxSizing:"border-box",fontFamily:"'DM Mono',monospace"}}/>
            </div>
            <div style={{flex:"1 1 100px"}}>
              <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}># Compte escompte</div>
              <input value={newForm.compteEscompte} onChange={e=>setNewForm(f=>({...f,compteEscompte:e.target.value}))} placeholder="ex: 5050" style={{...inputS,width:"100%",boxSizing:"border-box",fontFamily:"'DM Mono',monospace"}}/>
            </div>
          </div>
          <div>
            <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Description (optionnel)</div>
            <input value={newForm.description} onChange={e=>setNewForm(f=>({...f,description:e.target.value}))} placeholder="Description interne..." style={{...inputS,width:"100%",boxSizing:"border-box"}}/>
          </div>
          <div style={{display:"flex",gap:6,marginTop:2}}>
            <button onClick={addCat} disabled={!newForm.nom.trim()} style={{padding:"6px 16px",borderRadius:6,border:"none",background:newForm.nom.trim()?"linear-gradient(135deg,#f97316,#ea580c)":"rgba(255,255,255,0.05)",color:newForm.nom.trim()?"#fff":t.textDim,cursor:newForm.nom.trim()?"pointer":"default",fontWeight:700,fontSize:12,fontFamily:"'Outfit',sans-serif"}}>Ajouter</button>
            <button onClick={()=>{setAddOpen(false);setNewForm({nom:"",compteRevenu:"",compteEscompte:"",description:""})}} style={{padding:"6px 12px",borderRadius:6,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:"pointer",fontWeight:600,fontSize:12,fontFamily:"'Outfit',sans-serif"}}>Annuler</button>
          </div>
        </div>
      </div>)}

      {/* Column headers */}
      {visibleCats.length>0&&(<div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr auto",gap:6,padding:"3px 8px",borderBottom:`1px solid ${t.dividerMid}`}}>
        {["Nom","# Revenu","# Escompte","Description",""].map((h,i)=>(<span key={i} style={{fontSize:9.5,color:t.textMuted,fontWeight:600,textAlign:i===4?"center":"left"}}>{h}</span>))}
      </div>)}

      {/* Category rows */}
      {visibleCats.length===0&&(<div style={{textAlign:"center",padding:"24px 0",color:t.textMuted,fontSize:12}}>
        Aucune catégorie — cliquez sur "+ Nouvelle catégorie" pour commencer.
      </div>)}
      {visibleCats.map(cat=>(
        <div key={cat.id} style={{background:t.card,border:`1px solid ${cat.actif===false?"rgba(239,68,68,0.12)":t.cardBorder}`,borderRadius:7,padding:"6px 8px",opacity:cat.actif===false?0.55:1}}>
          {editingId===cat.id
            ?(<div style={{display:"flex",flexDirection:"column",gap:6}}>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <input value={editForm.nom} onChange={e=>setEditForm(f=>({...f,nom:e.target.value}))} autoFocus placeholder="Nom *" style={{...inputS,flex:"2 1 140px",boxSizing:"border-box"}}/>
                  <input value={editForm.compteRevenu} onChange={e=>setEditForm(f=>({...f,compteRevenu:e.target.value}))} placeholder="# Revenu" style={{...inputS,flex:"1 1 90px",fontFamily:"'DM Mono',monospace",boxSizing:"border-box"}}/>
                  <input value={editForm.compteEscompte} onChange={e=>setEditForm(f=>({...f,compteEscompte:e.target.value}))} placeholder="# Escompte" style={{...inputS,flex:"1 1 90px",fontFamily:"'DM Mono',monospace",boxSizing:"border-box"}}/>
                </div>
                <input value={editForm.description} onChange={e=>setEditForm(f=>({...f,description:e.target.value}))} placeholder="Description..." style={{...inputS,width:"100%",boxSizing:"border-box"}}/>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={saveEdit} disabled={!editForm.nom.trim()} style={{padding:"4px 12px",borderRadius:5,border:"none",background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:11,fontFamily:"'Outfit',sans-serif"}}>✓ Sauvegarder</button>
                  <button onClick={()=>setEditingId(null)} style={{padding:"4px 10px",borderRadius:5,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:"pointer",fontWeight:600,fontSize:11,fontFamily:"'Outfit',sans-serif"}}>Annuler</button>
                </div>
              </div>)
            :(<div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr auto",gap:6,alignItems:"center"}}>
                <span style={{fontSize:12,fontWeight:600,color:t.text,cursor:"pointer"}} onClick={()=>startEdit(cat)}>
                  {cat.nom}
                  {cat.actif===false&&<span style={{fontSize:9,color:"#ef4444",marginLeft:5,fontWeight:400}}>inactif</span>}
                  <span style={{fontSize:9,color:t.textDim,marginLeft:4}}>✎</span>
                </span>
                <span style={{fontSize:11,color:t.textSub,fontFamily:"'DM Mono',monospace"}}>{cat.compteRevenu||"—"}</span>
                <span style={{fontSize:11,color:t.textSub,fontFamily:"'DM Mono',monospace"}}>{cat.compteEscompte||"—"}</span>
                <span style={{fontSize:11,color:t.textSub,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cat.description||"—"}</span>
                <button onClick={()=>toggleActif(cat)} title={cat.actif===false?"Réactiver":"Désactiver"} style={{background:cat.actif===false?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.07)",border:"none",borderRadius:4,color:cat.actif===false?"#16a34a":"#ef4444",fontSize:10,padding:"2px 6px",cursor:"pointer",fontWeight:600,whiteSpace:"nowrap"}}>
                  {cat.actif===false?"Réactiver":"Désactiver"}
                </button>
              </div>)}
        </div>
      ))}
    </div>)}
  </div>);
}

// ── SOUMISSION ──
const STATUTS_SOUMISSION=["Brouillon","Envoyée","Acceptée","Refusée","Expirée"];
const STATUT_SOUM_C={"Brouillon":"#6b7280","Envoyée":"#3b82f6","Acceptée":"#22c55e","Refusée":"#ef4444","Expirée":"#9ca3af"};
function newLigne(){return{id:Date.now().toString(36)+Math.random().toString(36).slice(2),produitId:"",description:"",quantite:1,prixUnitaire:0,remise:0,tps:true,tvq:true};}
function computeSoumTotals(lignes){
  let st=0,tp=0,tv=0;
  lignes.forEach(l=>{const lt=(l.quantite||0)*(l.prixUnitaire||0)*(1-(l.remise||0)/100);st+=lt;if(l.tps)tp+=lt*0.05;if(l.tvq)tv+=lt*0.09975;});
  return{sousTotal:st,tpsTotal:tp,tvqTotal:tv,total:st+tp+tv};
}
function buildSoumissionHTML({numero,date,dateExpiration,statut,client,referenceClient,lignes,notes,totals,companyInfo}){
  const fd=d=>{if(!d)return"—";const dt=new Date(d+"T12:00:00");return`${dt.getDate()} ${["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"][dt.getMonth()]} ${dt.getFullYear()}`};
  const fc=n=>(n||0).toLocaleString("fr-CA",{style:"currency",currency:"CAD"});
  const logo=companyInfo.logo?`<img src="${companyInfo.logo}" style="max-height:55px;max-width:110px;object-fit:contain;" alt="Logo"/>`:"";
  const rows=lignes.map((l,i)=>{const lt=(l.quantite||0)*(l.prixUnitaire||0)*(1-(l.remise||0)/100);return`<tr style="background:${i%2?"#f9f9f9":"#fff"}"><td style="padding:5px 8px;border-bottom:1px solid #eee;font-size:12px">${l.description||""}</td><td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:center;font-size:12px">${l.quantite||1}</td><td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:right;font-size:12px">${fc(l.prixUnitaire||0)}</td><td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:center;font-size:12px">${l.remise?l.remise+"%":"—"}</td><td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:right;font-size:12px;font-weight:700">${fc(lt)}</td></tr>`}).join("");
  const cli=client?`<div style="font-weight:700;font-size:13px">${client.entreprise}</div>${client.contact?`<div>${client.contact}</div>`:""}${client.adresse?`<div>${client.adresse}</div>`:""}${client.ville?`<div>${[client.ville,client.province,client.codePostal].filter(Boolean).join(", ")}</div>`:""}${client.courriel?`<div>${client.courriel}</div>`:""}${client.tel1?`<div>${client.tel1}</div>`:""}`:""` "(aucun client)"`;
  return`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Soumission ${numero}</title><style>body{font-family:Arial,sans-serif;color:#1a1a1a;margin:0;padding:24px;font-size:13px}.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px}.title{font-size:30px;font-weight:900;color:#f97316;letter-spacing:2px}.meta{font-size:11px;color:#555;margin-top:3px}table{width:100%;border-collapse:collapse}th{background:#f97316;color:#fff;padding:6px 8px;text-align:left;font-size:11px}.tot{margin-left:auto;width:260px;margin-top:12px}.tr{display:flex;justify-content:space-between;padding:3px 0;font-size:12px}.tf{font-weight:900;font-size:15px;border-top:2px solid #1a1a1a;margin-top:4px;padding-top:4px}.notes{background:#f9f9f9;border-left:3px solid #f97316;padding:10px 12px;margin-top:16px;font-size:12px}.ftr{margin-top:24px;padding-top:8px;border-top:1px solid #eee;font-size:10px;color:#888;text-align:center}@media print{body{padding:10px}}</style></head><body><div class="hdr"><div>${logo}<div style="margin-top:4px;font-weight:700;font-size:14px">${companyInfo.nom||""}</div><div class="meta">${[companyInfo.adresse,companyInfo.ville,companyInfo.province].filter(Boolean).join(", ")}</div>${companyInfo.telephone?`<div class="meta">${companyInfo.telephone}</div>`:""}${companyInfo.courriel?`<div class="meta">${companyInfo.courriel}</div>`:""}</div><div style="text-align:right"><div class="title">SOUMISSION</div><div style="font-size:18px;font-weight:700;margin-top:4px"># ${numero}</div><div class="meta">Date: ${fd(date)}</div><div class="meta">Expiration: ${fd(dateExpiration)}</div><div class="meta">Statut: <strong>${statut}</strong></div>${referenceClient?`<div class="meta">Réf.: ${referenceClient}</div>`:""}</div></div><div style="margin-bottom:16px"><div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Facturé à</div><div style="line-height:1.6">${cli}</div></div><table><thead><tr><th>Description</th><th style="width:55px;text-align:center">Qté</th><th style="width:100px;text-align:right">Prix unit.</th><th style="width:65px;text-align:center">Remise</th><th style="width:100px;text-align:right">Total</th></tr></thead><tbody>${rows}</tbody></table><div class="tot"><div class="tr"><span>Sous-total</span><span>${fc(totals.sousTotal)}</span></div><div class="tr"><span>TPS (5%)</span><span>${fc(totals.tpsTotal)}</span></div><div class="tr"><span>TVQ (9.975%)</span><span>${fc(totals.tvqTotal)}</span></div><div class="tr tf"><span>TOTAL</span><span>${fc(totals.total)}</span></div></div>${notes?`<div class="notes"><strong>Notes / Conditions</strong><br/>${notes}</div>`:""}<div class="ftr">${companyInfo.numeroTPS?`N° TPS: ${companyInfo.numeroTPS}`:""}${companyInfo.numeroTVQ?` &nbsp;|&nbsp; N° TVQ: ${companyInfo.numeroTVQ}`:""}</div></body></html>`;
}
function SoumissionEditor({soumission,clients,produits,companyInfo,docNums,saveDocNums,soumissions,saveSoumissions,onBack,initClientId,onConvertToCommande,onConvertToFacture}){
  const t=useT();
  const isNew=!soumission?.id;
  const todayStr=dk(new Date());
  const exp30=dk(new Date(Date.now()+30*86400000));
  const inputS={background:t.inputBg,border:`1px solid ${t.inputBorder}`,borderRadius:5,color:t.inputText,fontSize:12,padding:"5px 8px",outline:"none"};
  const [form,setForm]=useState(soumission?{...soumission}:{date:todayStr,dateExpiration:exp30,clientId:initClientId||"",referenceClient:"",statut:"Brouillon",notes:"Soumission valide 30 jours."});
  const [lignes,setLignes]=useState(soumission?.lignes?.length?soumission.lignes:[newLigne()]);
  const [savedId,setSavedId]=useState(soumission?.id||null);
  const [savedNumero,setSavedNumero]=useState(soumission?.numero||null);
  const [confirmDel,setConfirmDel]=useState(false);
  const [flash,setFlash]=useState(false);
  const totals=useMemo(()=>computeSoumTotals(lignes),[lignes]);
  const client=clients.find(c=>c.id===form.clientId);
  const upd=f=>setForm(p=>({...p,...f}));
  const updL=(id,f)=>setLignes(ls=>ls.map(l=>l.id===id?{...l,...f}:l));
  const selectProd=(lid,pid)=>{
    if(!pid){updL(lid,{produitId:""});return;}
    const p=produits.find(x=>x.id===pid);
    if(p)updL(lid,{produitId:pid,description:p.description,prixUnitaire:parseFloat(p.prixUnitaire)||0,tps:p.tps!==false,tvq:p.tvq!==false});
  };
  const doSave=()=>{
    let id=savedId,numero=savedNumero;const isNew=!id;
    if(!id){
      id=Date.now().toString();numero=fmtDocNum(docNums.prefix,"S",docNums.soumission);
      saveDocNums({...docNums,soumission:docNums.soumission+1});
      setSavedId(id);setSavedNumero(numero);
    }
    const doc={...form,id,numero,lignes};
    saveSoumissions(soumissions.some(s=>s.id===id)?soumissions.map(s=>s.id===id?doc:s):[...soumissions,doc]);
    if(isNew)logCreate('invoice','soumission',id,doc);
    else logUpdate('invoice','soumission',id,'document',null,JSON.stringify(doc));
    setFlash(true);setTimeout(()=>setFlash(false),2000);
  };
  const doDelete=async()=>{
    if(!savedId)return;
    const reason=await promptCorrectionReason('Annulation de la soumission');
    if(!reason)return;
    logVoid('invoice','soumission',savedId,reason);
    saveSoumissions(soumissions.map(s=>s.id===savedId?{...s,statut:"Annulée",voidReason:reason,voidDate:dk(new Date())}:s));
    onBack();
  };
  const doPrint=()=>{
    const numero=savedNumero||fmtDocNum(docNums.prefix,"S",docNums.soumission);
    openPDF(buildSoumissionHTML({...form,numero,lignes,totals,client,companyInfo}));
  };
  const doEmail=()=>{
    if(!client?.courriel)return;
    const num=savedNumero||"—";
    const sub=encodeURIComponent(`Soumission ${num}`);
    const body=encodeURIComponent(`Bonjour,\n\nVeuillez trouver ci-joint votre soumission ${num} d'un montant de ${fmt(totals.total)}.\n\nMerci de votre confiance,\n${companyInfo.nom||""}`);
    window.open(`mailto:${client.courriel}?subject=${sub}&body=${body}`);
  };
  const SC=STATUT_SOUM_C;
  return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    {/* Top bar */}
    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
      <button onClick={onBack} style={{background:"none",border:`1px solid ${t.cardBorder}`,borderRadius:5,color:t.textSub,fontSize:11,padding:"3px 10px",cursor:"pointer",fontWeight:600}}>← Retour</button>
      <span style={{fontSize:14,fontWeight:700,color:t.text}}>{savedNumero||(isNew?"Nouvelle soumission":soumission?.numero)}</span>
      <span style={{fontSize:10,fontWeight:700,color:SC[form.statut]||t.textMuted,background:"rgba(0,0,0,0.06)",borderRadius:10,padding:"2px 8px"}}>{form.statut}</span>
      <div style={{flex:1}}/>
      <button onClick={doSave} style={{padding:"5px 14px",borderRadius:6,border:"none",background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:11,fontFamily:"'Outfit',sans-serif"}}>💾 Sauvegarder</button>
      {flash&&<span style={{fontSize:11,color:"#22c55e",fontWeight:600}}>✓</span>}
      <button onClick={doPrint} style={{padding:"5px 10px",borderRadius:6,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:"pointer",fontWeight:600,fontSize:11}}>🖨️ Imprimer</button>
      <button onClick={doEmail} disabled={!client?.courriel} title={!client?.courriel?"Aucun courriel client":""} style={{padding:"5px 10px",borderRadius:6,border:`1px solid ${t.cardBorder}`,background:t.section,color:!client?.courriel?t.textDim:t.textSub,cursor:!client?.courriel?"default":"pointer",fontWeight:600,fontSize:11,opacity:!client?.courriel?0.5:1}}>📧 Envoyer</button>
      {savedId&&!soumission?.commandeId&&onConvertToCommande
        ?<button onClick={()=>onConvertToCommande({...form,id:savedId,numero:savedNumero,lignes})} style={{padding:"5px 10px",borderRadius:6,border:"1px solid rgba(249,115,22,0.25)",background:"rgba(249,115,22,0.07)",color:"#f97316",cursor:"pointer",fontWeight:700,fontSize:11}}>→ Commande</button>
        :soumission?.commandeId
          ?<span style={{fontSize:10,color:"#22c55e",fontWeight:600}}>✓ {soumission.commandeNumero}</span>
          :<button disabled style={{padding:"5px 10px",borderRadius:6,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textDim,cursor:"default",fontWeight:600,fontSize:11,opacity:0.4}}>→ Commande</button>
      }
      {savedId&&!soumission?.factureId&&onConvertToFacture
        ?<button onClick={()=>onConvertToFacture({...form,id:savedId,numero:savedNumero,lignes})} style={{padding:"5px 10px",borderRadius:6,border:"1px solid rgba(249,115,22,0.25)",background:"rgba(249,115,22,0.07)",color:"#f97316",cursor:"pointer",fontWeight:700,fontSize:11}}>→ Facture</button>
        :soumission?.factureId
          ?<span style={{fontSize:10,color:"#22c55e",fontWeight:600}}>✓ {soumission.factureNumero}</span>
          :<button disabled style={{padding:"5px 10px",borderRadius:6,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textDim,cursor:"default",fontWeight:600,fontSize:11,opacity:0.4}}>→ Facture</button>
      }
      {savedId&&form.statut==="Brouillon"&&(
        confirmDel
          ?<><span style={{fontSize:11,color:"#ef4444"}}>Annuler ce document?</span>
             <button onClick={doDelete} style={{padding:"4px 10px",borderRadius:5,border:"none",background:"#ef4444",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:11}}>Annuler la soumission</button>
             <button onClick={()=>setConfirmDel(false)} style={{padding:"4px 8px",borderRadius:5,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:"pointer",fontSize:11}}>Revenir</button></>
          :<button onClick={()=>setConfirmDel(true)} style={{padding:"5px 10px",borderRadius:6,border:"1px solid rgba(239,68,68,0.2)",background:"rgba(239,68,68,0.07)",color:"#ef4444",cursor:"pointer",fontWeight:600,fontSize:11}}>🗑️</button>
      )}
    </div>
    {/* Header */}
    <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:12}}>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <div style={{flex:"2 1 200px"}}>
          <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Client</div>
          <select value={form.clientId||""} onChange={e=>upd({clientId:e.target.value})} style={{...inputS,width:"100%",boxSizing:"border-box"}}>
            <option value="">— Choisir un client —</option>
            {clients.filter(c=>c.statut==="actif").map(c=><option key={c.id} value={c.id}>{c.entreprise} ({c.code})</option>)}
          </select>
        </div>
        <div style={{flex:"1 1 120px"}}>
          <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Date</div>
          <input type="date" value={form.date||todayStr} onChange={e=>upd({date:e.target.value})} style={{...inputS,width:"100%",boxSizing:"border-box",fontFamily:"'DM Mono',monospace"}}/>
        </div>
        <div style={{flex:"1 1 120px"}}>
          <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Date d'expiration</div>
          <input type="date" value={form.dateExpiration||exp30} onChange={e=>upd({dateExpiration:e.target.value})} style={{...inputS,width:"100%",boxSizing:"border-box",fontFamily:"'DM Mono',monospace"}}/>
        </div>
        <div style={{flex:"1 1 140px"}}>
          <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Statut</div>
          <select value={form.statut} onChange={e=>upd({statut:e.target.value})} style={{...inputS,width:"100%",boxSizing:"border-box",color:SC[form.statut]||t.inputText,fontWeight:700}}>
            {STATUTS_SOUMISSION.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{flex:"2 1 180px"}}>
          <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Réf. client / Bon de commande</div>
          <input value={form.referenceClient||""} onChange={e=>upd({referenceClient:e.target.value})} placeholder="Optionnel" style={{...inputS,width:"100%",boxSizing:"border-box"}}/>
        </div>
      </div>
      {client&&<div style={{marginTop:8,padding:"5px 8px",borderRadius:6,background:t.section,border:`1px solid ${t.sectionBorder}`,fontSize:11,color:t.textSub}}>
        <strong style={{color:t.text}}>{client.entreprise}</strong>
        {client.contact&&` · ${client.contact}`}
        {client.adresse&&` · ${client.adresse}`}
        {client.ville&&` · ${[client.ville,client.province].filter(Boolean).join(", ")}`}
        {client.courriel&&<span style={{fontFamily:"'DM Mono',monospace",marginLeft:6,color:t.textMuted}}>{client.courriel}</span>}
      </div>}
    </div>
    {/* Lines */}
    <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:12}}>
      <span style={{fontSize:12,fontWeight:700,color:t.text,display:"block",marginBottom:8}}>Lignes</span>
      <div style={{display:"grid",gridTemplateColumns:"1.8fr 2fr 65px 85px 65px 28px 28px 90px 24px",gap:5,padding:"2px 4px",marginBottom:4}}>
        {["Produit","Description","Qté","Prix unit.","Remise %","TPS","TVQ","Total",""].map((h,i)=>(
          <span key={i} style={{fontSize:9.5,color:t.textMuted,fontWeight:600,textAlign:i>=2&&i<=7?"center":"left"}}>{h}</span>
        ))}
      </div>
      {lignes.map(l=>{
        const lt=(l.quantite||0)*(l.prixUnitaire||0)*(1-(l.remise||0)/100);
        return(<div key={l.id} style={{display:"grid",gridTemplateColumns:"1.8fr 2fr 65px 85px 65px 28px 28px 90px 24px",gap:5,marginBottom:6,alignItems:"center"}}>
          <select value={l.produitId||""} onChange={e=>selectProd(l.id,e.target.value)} style={{...inputS,width:"100%",boxSizing:"border-box",fontSize:11}}>
            <option value="">— Libre —</option>
            {produits.filter(p=>p.actif!==false).map(p=><option key={p.id} value={p.id}>{p.code} {p.description}</option>)}
          </select>
          <input value={l.description} onChange={e=>updL(l.id,{description:e.target.value})} placeholder="Description" style={{...inputS,width:"100%",boxSizing:"border-box",fontSize:11}}/>
          <input type="number" min="0" step="0.01" value={l.quantite} onChange={e=>updL(l.id,{quantite:parseFloat(e.target.value)||0})} style={{...inputS,width:"100%",boxSizing:"border-box",textAlign:"right",fontSize:11}}/>
          <input type="number" min="0" step="0.01" value={l.prixUnitaire} onChange={e=>updL(l.id,{prixUnitaire:parseFloat(e.target.value)||0})} style={{...inputS,width:"100%",boxSizing:"border-box",textAlign:"right",fontSize:11}}/>
          <input type="number" min="0" max="100" step="0.1" value={l.remise||""} onChange={e=>updL(l.id,{remise:parseFloat(e.target.value)||0})} placeholder="0" style={{...inputS,width:"100%",boxSizing:"border-box",textAlign:"right",fontSize:11}}/>
          <label style={{display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
            <input type="checkbox" checked={!!l.tps} onChange={e=>updL(l.id,{tps:e.target.checked})} style={{accentColor:"#f97316"}}/>
          </label>
          <label style={{display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
            <input type="checkbox" checked={!!l.tvq} onChange={e=>updL(l.id,{tvq:e.target.checked})} style={{accentColor:"#f97316"}}/>
          </label>
          <span style={{textAlign:"right",fontSize:12,fontWeight:700,color:t.text,fontFamily:"'DM Mono',monospace"}}>{fmt(lt)}</span>
          <button onClick={()=>setLignes(ls=>ls.filter(x=>x.id!==l.id))} disabled={lignes.length===1} style={{background:"none",border:"none",color:lignes.length===1?t.textDim:"#ef4444",cursor:lignes.length===1?"default":"pointer",fontSize:14,padding:0,fontWeight:700}}>✕</button>
        </div>);
      })}
      <button onClick={()=>setLignes(ls=>[...ls,newLigne()])} style={{marginTop:2,padding:"5px 12px",borderRadius:6,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:"pointer",fontWeight:600,fontSize:11}}>+ Ajouter une ligne</button>
    </div>
    {/* Totals + Notes */}
    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
      <div style={{flex:"2 1 200px",background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:12}}>
        <div style={{fontSize:12,fontWeight:700,color:t.text,marginBottom:6}}>Notes / Conditions</div>
        <textarea value={form.notes||""} onChange={e=>upd({notes:e.target.value})} rows={4} placeholder="Notes visibles sur le document imprimé..." style={{...inputS,width:"100%",boxSizing:"border-box",resize:"vertical",fontFamily:"'Outfit',sans-serif"}}/>
      </div>
      <div style={{flex:"1 1 180px",background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:12,display:"flex",flexDirection:"column",gap:5,justifyContent:"flex-end"}}>
        {[["Sous-total",totals.sousTotal],["TPS (5%)",totals.tpsTotal],["TVQ (9.975%)",totals.tvqTotal]].map(([label,val])=>(
          <div key={label} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:t.textSub}}>
            <span>{label}</span><span style={{fontFamily:"'DM Mono',monospace"}}>{fmt(val)}</span>
          </div>
        ))}
        <div style={{display:"flex",justifyContent:"space-between",fontSize:14,fontWeight:800,color:t.text,borderTop:`2px solid ${t.dividerMid}`,paddingTop:6,marginTop:2}}>
          <span>TOTAL</span><span style={{fontFamily:"'DM Mono',monospace",color:"#f97316"}}>{fmt(totals.total)}</span>
        </div>
      </div>
    </div>
  </div>);
}

// ── COMMANDE ──
const STATUTS_COMMANDE=["Brouillon","Confirmée","En cours","Complétée","Annulée"];
const STATUT_CMD_C={"Brouillon":"#6b7280","Confirmée":"#3b82f6","En cours":"#f59e0b","Complétée":"#22c55e","Annulée":"#ef4444"};
function buildCommandeHTML({numero,date,dateLivraison,statut,client,referenceClient,lignes,notes,totals,companyInfo,sourceNumero}){
  const fd=d=>{if(!d)return"—";const dt=new Date(d+"T12:00:00");return`${dt.getDate()} ${["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"][dt.getMonth()]} ${dt.getFullYear()}`};
  const fc=n=>(n||0).toLocaleString("fr-CA",{style:"currency",currency:"CAD"});
  const logo=companyInfo.logo?`<img src="${companyInfo.logo}" style="max-height:55px;max-width:110px;object-fit:contain;" alt="Logo"/>`:"";
  const rows=lignes.map((l,i)=>{const lt=(l.quantite||0)*(l.prixUnitaire||0)*(1-(l.remise||0)/100);return`<tr style="background:${i%2?"#f9f9f9":"#fff"}"><td style="padding:5px 8px;border-bottom:1px solid #eee;font-size:12px">${l.description||""}</td><td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:center;font-size:12px">${l.quantite||1}</td><td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:right;font-size:12px">${fc(l.prixUnitaire||0)}</td><td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:center;font-size:12px">${l.remise?l.remise+"%":"—"}</td><td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:right;font-size:12px;font-weight:700">${fc(lt)}</td></tr>`}).join("");
  const cli=client?`<div style="font-weight:700;font-size:13px">${client.entreprise}</div>${client.contact?`<div>${client.contact}</div>`:""}${client.adresse?`<div>${client.adresse}</div>`:""}${client.ville?`<div>${[client.ville,client.province,client.codePostal].filter(Boolean).join(", ")}</div>`:""}${client.courriel?`<div>${client.courriel}</div>`:""}${client.tel1?`<div>${client.tel1}</div>`:""}`:""` "(aucun client)"`;
  return`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Commande ${numero}</title><style>body{font-family:Arial,sans-serif;color:#1a1a1a;margin:0;padding:24px;font-size:13px}.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px}.title{font-size:26px;font-weight:900;color:#f97316;letter-spacing:2px}.meta{font-size:11px;color:#555;margin-top:3px}table{width:100%;border-collapse:collapse}th{background:#f97316;color:#fff;padding:6px 8px;text-align:left;font-size:11px}.tot{margin-left:auto;width:260px;margin-top:12px}.tr{display:flex;justify-content:space-between;padding:3px 0;font-size:12px}.tf{font-weight:900;font-size:15px;border-top:2px solid #1a1a1a;margin-top:4px;padding-top:4px}.notes{background:#f9f9f9;border-left:3px solid #f97316;padding:10px 12px;margin-top:16px;font-size:12px}.ftr{margin-top:24px;padding-top:8px;border-top:1px solid #eee;font-size:10px;color:#888;text-align:center}@media print{body{padding:10px}}</style></head><body><div class="hdr"><div>${logo}<div style="margin-top:4px;font-weight:700;font-size:14px">${companyInfo.nom||""}</div><div class="meta">${[companyInfo.adresse,companyInfo.ville,companyInfo.province].filter(Boolean).join(", ")}</div>${companyInfo.telephone?`<div class="meta">${companyInfo.telephone}</div>`:""}${companyInfo.courriel?`<div class="meta">${companyInfo.courriel}</div>`:""}</div><div style="text-align:right"><div class="title">BON DE COMMANDE</div><div style="font-size:18px;font-weight:700;margin-top:4px"># ${numero}</div><div class="meta">Date: ${fd(date)}</div>${dateLivraison?`<div class="meta">Livraison: ${fd(dateLivraison)}</div>`:""}<div class="meta">Statut: <strong>${statut}</strong></div>${referenceClient?`<div class="meta">Réf.: ${referenceClient}</div>`:""}${sourceNumero?`<div class="meta">Soumission: ${sourceNumero}</div>`:""}</div></div><div style="margin-bottom:16px"><div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Facturé à</div><div style="line-height:1.6">${cli}</div></div><table><thead><tr><th>Description</th><th style="width:55px;text-align:center">Qté</th><th style="width:100px;text-align:right">Prix unit.</th><th style="width:65px;text-align:center">Remise</th><th style="width:100px;text-align:right">Total</th></tr></thead><tbody>${rows}</tbody></table><div class="tot"><div class="tr"><span>Sous-total</span><span>${fc(totals.sousTotal)}</span></div><div class="tr"><span>TPS (5%)</span><span>${fc(totals.tpsTotal)}</span></div><div class="tr"><span>TVQ (9.975%)</span><span>${fc(totals.tvqTotal)}</span></div><div class="tr tf"><span>TOTAL</span><span>${fc(totals.total)}</span></div></div>${notes?`<div class="notes"><strong>Notes / Conditions</strong><br/>${notes}</div>`:""}<div class="ftr">${companyInfo.numeroTPS?`N° TPS: ${companyInfo.numeroTPS}`:""}${companyInfo.numeroTVQ?` &nbsp;|&nbsp; N° TVQ: ${companyInfo.numeroTVQ}`:""}</div></body></html>`;
}
function CommandeEditor({commande,clients,produits,companyInfo,docNums,saveDocNums,commandes,saveCommandes,onBack,initClientId,onConvertToFacture}){ // eslint-disable-line
  const t=useT();
  const isNew=!commande?.id;
  const todayStr=dk(new Date());
  const locked=commande?.statut==="Complétée";
  const inputS={background:t.inputBg,border:`1px solid ${t.inputBorder}`,borderRadius:5,color:t.inputText,fontSize:12,padding:"5px 8px",outline:"none"};
  const [form,setForm]=useState(commande?{...commande}:{date:todayStr,dateLivraison:"",clientId:initClientId||"",referenceClient:"",statut:"Brouillon",notes:"",sourceType:null,sourceId:null,sourceNumero:null});
  const [lignes,setLignes]=useState(commande?.lignes?.length?commande.lignes:[newLigne()]);
  const [savedId,setSavedId]=useState(commande?.id||null);
  const [savedNumero,setSavedNumero]=useState(commande?.numero||null);
  const [confirmDel,setConfirmDel]=useState(false);
  const [flash,setFlash]=useState(false);
  const totals=useMemo(()=>computeSoumTotals(lignes),[lignes]);
  const client=clients.find(c=>c.id===form.clientId);
  const upd=f=>setForm(p=>({...p,...f}));
  const updL=(id,f)=>setLignes(ls=>ls.map(l=>l.id===id?{...l,...f}:l));
  const selectProd=(lid,pid)=>{
    if(!pid){updL(lid,{produitId:""});return;}
    const p=produits.find(x=>x.id===pid);
    if(p)updL(lid,{produitId:pid,description:p.description,prixUnitaire:parseFloat(p.prixUnitaire)||0,tps:p.tps!==false,tvq:p.tvq!==false});
  };
  const doSave=()=>{
    let id=savedId,numero=savedNumero;const isNew=!id;
    if(!id){
      id=Date.now().toString();numero=fmtDocNum(docNums.prefix,"C",docNums.commande);
      saveDocNums({...docNums,commande:docNums.commande+1});
      setSavedId(id);setSavedNumero(numero);
    }
    const doc={...form,id,numero,lignes};
    saveCommandes(commandes.some(c=>c.id===id)?commandes.map(c=>c.id===id?doc:c):[...commandes,doc]);
    if(isNew)logCreate('invoice','commande',id,doc);
    else logUpdate('invoice','commande',id,'document',null,JSON.stringify(doc));
    setFlash(true);setTimeout(()=>setFlash(false),2000);
  };
  const doDelete=async()=>{
    if(!savedId)return;
    const reason=await promptCorrectionReason('Annulation de la commande');
    if(!reason)return;
    logVoid('invoice','commande',savedId,reason);
    saveCommandes(commandes.map(c=>c.id===savedId?{...c,statut:"Annulée",voidReason:reason,voidDate:dk(new Date())}:c));
    onBack();
  };
  const doPrint=()=>{
    const numero=savedNumero||fmtDocNum(docNums.prefix,"C",docNums.commande);
    openPDF(buildCommandeHTML({...form,numero,lignes,totals,client,companyInfo}));
  };
  const doEmail=()=>{
    if(!client?.courriel)return;
    const num=savedNumero||"—";
    const sub=encodeURIComponent(`Commande ${num}`);
    const body=encodeURIComponent(`Bonjour,\n\nVeuillez trouver ci-joint votre bon de commande ${num} d'un montant de ${fmt(totals.total)}.\n\nMerci de votre confiance,\n${companyInfo.nom||""}`);
    window.open(`mailto:${client.courriel}?subject=${sub}&body=${body}`);
  };
  const SC=STATUT_CMD_C;
  return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
      <button onClick={onBack} style={{background:"none",border:`1px solid ${t.cardBorder}`,borderRadius:5,color:t.textSub,fontSize:11,padding:"3px 10px",cursor:"pointer",fontWeight:600}}>← Retour</button>
      <span style={{fontSize:14,fontWeight:700,color:t.text}}>{savedNumero||(isNew?"Nouvelle commande":commande?.numero)}</span>
      <span style={{fontSize:10,fontWeight:700,color:SC[form.statut]||t.textMuted,background:"rgba(0,0,0,0.06)",borderRadius:10,padding:"2px 8px"}}>{form.statut}</span>
      {form.sourceNumero&&<span style={{fontSize:10,color:t.textMuted}}>← Soumission {form.sourceNumero}</span>}
      <div style={{flex:1}}/>
      <button onClick={doSave} style={{padding:"5px 14px",borderRadius:6,border:"none",background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:11,fontFamily:"'Outfit',sans-serif"}}>💾 Sauvegarder</button>
      {flash&&<span style={{fontSize:11,color:"#22c55e",fontWeight:600}}>✓</span>}
      <button onClick={doPrint} style={{padding:"5px 10px",borderRadius:6,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:"pointer",fontWeight:600,fontSize:11}}>🖨️ Imprimer</button>
      <button onClick={doEmail} disabled={!client?.courriel} style={{padding:"5px 10px",borderRadius:6,border:`1px solid ${t.cardBorder}`,background:t.section,color:!client?.courriel?t.textDim:t.textSub,cursor:!client?.courriel?"default":"pointer",fontWeight:600,fontSize:11,opacity:!client?.courriel?0.5:1}}>📧 Envoyer</button>
      {savedId&&!commande?.factureId&&onConvertToFacture
        ?<button onClick={()=>onConvertToFacture({...form,id:savedId,numero:savedNumero,lignes})} style={{padding:"5px 10px",borderRadius:6,border:"1px solid rgba(249,115,22,0.25)",background:"rgba(249,115,22,0.07)",color:"#f97316",cursor:"pointer",fontWeight:700,fontSize:11}}>Facturer cette commande</button>
        :commande?.factureId
          ?<span style={{fontSize:10,color:"#22c55e",fontWeight:600}}>✓ {commande.factureNumero}</span>
          :<button disabled style={{padding:"5px 10px",borderRadius:6,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textDim,cursor:"default",fontWeight:600,fontSize:11,opacity:0.4}}>Facturer cette commande</button>
      }
      {savedId&&form.statut==="Brouillon"&&(
        confirmDel
          ?<><span style={{fontSize:11,color:"#ef4444"}}>Annuler ce document?</span>
             <button onClick={doDelete} style={{padding:"4px 10px",borderRadius:5,border:"none",background:"#ef4444",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:11}}>Annuler la commande</button>
             <button onClick={()=>setConfirmDel(false)} style={{padding:"4px 8px",borderRadius:5,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:"pointer",fontSize:11}}>Revenir</button></>
          :<button onClick={()=>setConfirmDel(true)} style={{padding:"5px 10px",borderRadius:6,border:"1px solid rgba(239,68,68,0.2)",background:"rgba(239,68,68,0.07)",color:"#ef4444",cursor:"pointer",fontWeight:600,fontSize:11}}>🗑️</button>
      )}
    </div>
    <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:12}}>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <div style={{flex:"2 1 200px"}}>
          <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Client</div>
          <select value={form.clientId||""} onChange={e=>upd({clientId:e.target.value})} style={{...inputS,width:"100%",boxSizing:"border-box"}}>
            <option value="">— Choisir un client —</option>
            {clients.filter(c=>c.statut==="actif").map(c=><option key={c.id} value={c.id}>{c.entreprise} ({c.code})</option>)}
          </select>
        </div>
        <div style={{flex:"1 1 120px"}}>
          <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Date</div>
          <input type="date" value={form.date||todayStr} onChange={e=>upd({date:e.target.value})} style={{...inputS,width:"100%",boxSizing:"border-box",fontFamily:"'DM Mono',monospace"}}/>
        </div>
        <div style={{flex:"1 1 120px"}}>
          <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Date de livraison (opt.)</div>
          <input type="date" value={form.dateLivraison||""} onChange={e=>upd({dateLivraison:e.target.value})} style={{...inputS,width:"100%",boxSizing:"border-box",fontFamily:"'DM Mono',monospace"}}/>
        </div>
        <div style={{flex:"1 1 140px"}}>
          <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Statut</div>
          <select value={form.statut} onChange={e=>upd({statut:e.target.value})} style={{...inputS,width:"100%",boxSizing:"border-box",color:SC[form.statut]||t.inputText,fontWeight:700}}>
            {STATUTS_COMMANDE.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{flex:"2 1 180px"}}>
          <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Réf. client / Bon de commande</div>
          <input value={form.referenceClient||""} onChange={e=>upd({referenceClient:e.target.value})} placeholder="Optionnel" style={{...inputS,width:"100%",boxSizing:"border-box"}}/>
        </div>
      </div>
      {client&&<div style={{marginTop:8,padding:"5px 8px",borderRadius:6,background:t.section,border:`1px solid ${t.sectionBorder}`,fontSize:11,color:t.textSub}}>
        <strong style={{color:t.text}}>{client.entreprise}</strong>
        {client.contact&&` · ${client.contact}`}
        {client.adresse&&` · ${client.adresse}`}
        {client.ville&&` · ${[client.ville,client.province].filter(Boolean).join(", ")}`}
        {client.courriel&&<span style={{fontFamily:"'DM Mono',monospace",marginLeft:6,color:t.textMuted}}>{client.courriel}</span>}
      </div>}
    </div>
    <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:12}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <span style={{fontSize:12,fontWeight:700,color:t.text}}>Lignes</span>
        {locked&&<span style={{fontSize:10,color:"#f59e0b",fontWeight:600,background:"rgba(245,158,11,0.1)",borderRadius:8,padding:"1px 7px"}}>Commande complétée — lignes verrouillées</span>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1.8fr 2fr 65px 85px 65px 28px 28px 90px 24px",gap:5,padding:"2px 4px",marginBottom:4}}>
        {["Produit","Description","Qté","Prix unit.","Remise %","TPS","TVQ","Total",""].map((h,i)=>(
          <span key={i} style={{fontSize:9.5,color:t.textMuted,fontWeight:600,textAlign:i>=2&&i<=7?"center":"left"}}>{h}</span>
        ))}
      </div>
      {lignes.map(l=>{
        const lt=(l.quantite||0)*(l.prixUnitaire||0)*(1-(l.remise||0)/100);
        return(<div key={l.id} style={{display:"grid",gridTemplateColumns:"1.8fr 2fr 65px 85px 65px 28px 28px 90px 24px",gap:5,marginBottom:6,alignItems:"center"}}>
          <select value={l.produitId||""} onChange={e=>selectProd(l.id,e.target.value)} disabled={locked} style={{...inputS,width:"100%",boxSizing:"border-box",fontSize:11,opacity:locked?0.6:1}}>
            <option value="">— Libre —</option>
            {produits.filter(p=>p.actif!==false).map(p=><option key={p.id} value={p.id}>{p.code} {p.description}</option>)}
          </select>
          <input value={l.description} onChange={e=>updL(l.id,{description:e.target.value})} disabled={locked} placeholder="Description" style={{...inputS,width:"100%",boxSizing:"border-box",fontSize:11,opacity:locked?0.6:1}}/>
          <input type="number" min="0" step="0.01" value={l.quantite} onChange={e=>updL(l.id,{quantite:parseFloat(e.target.value)||0})} disabled={locked} style={{...inputS,width:"100%",boxSizing:"border-box",textAlign:"right",fontSize:11,opacity:locked?0.6:1}}/>
          <input type="number" min="0" step="0.01" value={l.prixUnitaire} onChange={e=>updL(l.id,{prixUnitaire:parseFloat(e.target.value)||0})} disabled={locked} style={{...inputS,width:"100%",boxSizing:"border-box",textAlign:"right",fontSize:11,opacity:locked?0.6:1}}/>
          <input type="number" min="0" max="100" step="0.1" value={l.remise||""} onChange={e=>updL(l.id,{remise:parseFloat(e.target.value)||0})} disabled={locked} placeholder="0" style={{...inputS,width:"100%",boxSizing:"border-box",textAlign:"right",fontSize:11,opacity:locked?0.6:1}}/>
          <label style={{display:"flex",alignItems:"center",justifyContent:"center",cursor:locked?"default":"pointer"}}>
            <input type="checkbox" checked={!!l.tps} onChange={e=>updL(l.id,{tps:e.target.checked})} disabled={locked} style={{accentColor:"#f97316"}}/>
          </label>
          <label style={{display:"flex",alignItems:"center",justifyContent:"center",cursor:locked?"default":"pointer"}}>
            <input type="checkbox" checked={!!l.tvq} onChange={e=>updL(l.id,{tvq:e.target.checked})} disabled={locked} style={{accentColor:"#f97316"}}/>
          </label>
          <span style={{textAlign:"right",fontSize:12,fontWeight:700,color:t.text,fontFamily:"'DM Mono',monospace"}}>{fmt(lt)}</span>
          <button onClick={()=>setLignes(ls=>ls.filter(x=>x.id!==l.id))} disabled={lignes.length===1||locked} style={{background:"none",border:"none",color:(lignes.length===1||locked)?t.textDim:"#ef4444",cursor:(lignes.length===1||locked)?"default":"pointer",fontSize:14,padding:0,fontWeight:700}}>✕</button>
        </div>);
      })}
      {!locked&&<button onClick={()=>setLignes(ls=>[...ls,newLigne()])} style={{marginTop:2,padding:"5px 12px",borderRadius:6,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:"pointer",fontWeight:600,fontSize:11}}>+ Ajouter une ligne</button>}
    </div>
    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
      <div style={{flex:"2 1 200px",background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:12}}>
        <div style={{fontSize:12,fontWeight:700,color:t.text,marginBottom:6}}>Notes / Conditions</div>
        <textarea value={form.notes||""} onChange={e=>upd({notes:e.target.value})} rows={4} placeholder="Notes visibles sur le document imprimé..." style={{...inputS,width:"100%",boxSizing:"border-box",resize:"vertical",fontFamily:"'Outfit',sans-serif"}}/>
      </div>
      <div style={{flex:"1 1 180px",background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:12,display:"flex",flexDirection:"column",gap:5,justifyContent:"flex-end"}}>
        {[["Sous-total",totals.sousTotal],["TPS (5%)",totals.tpsTotal],["TVQ (9.975%)",totals.tvqTotal]].map(([label,val])=>(
          <div key={label} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:t.textSub}}>
            <span>{label}</span><span style={{fontFamily:"'DM Mono',monospace"}}>{fmt(val)}</span>
          </div>
        ))}
        <div style={{display:"flex",justifyContent:"space-between",fontSize:14,fontWeight:800,color:t.text,borderTop:`2px solid ${t.dividerMid}`,paddingTop:6,marginTop:2}}>
          <span>TOTAL</span><span style={{fontFamily:"'DM Mono',monospace",color:"#f97316"}}>{fmt(totals.total)}</span>
        </div>
      </div>
    </div>
  </div>);
}

// ── FACTURE ──
const STATUTS_FACTURE=["Brouillon","Envoyée","Payée partiellement","Payée","En retard","Créditée","Annulée"];
const STATUT_FAC_C={"Brouillon":"#6b7280","Envoyée":"#3b82f6","Payée partiellement":"#f59e0b","Payée":"#22c55e","En retard":"#ef4444","Créditée":"#8b5cf6","Annulée":"#9ca3af"};
function calcDateEcheance(dateStr,conditions,nbJours){
  if(!dateStr)return"";
  const d=new Date(dateStr+"T12:00:00");
  const days=conditions==="Net 15"?15:conditions==="Net 30"?30:conditions==="Net 45"?45:conditions==="Net 60"?60:conditions==="Personnalisé"?(parseInt(nbJours)||0):0;
  d.setDate(d.getDate()+days);return dk(d);
}
function buildFactureHTML({numero,date,dateEcheance,statut,client,referenceClient,lignes,notes,totals,companyInfo,sourceNumero,sourceType,montantPaye}){
  const fd=d=>{if(!d)return"—";const dt=new Date(d+"T12:00:00");return`${dt.getDate()} ${["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"][dt.getMonth()]} ${dt.getFullYear()}`};
  const fc=n=>(n||0).toLocaleString("fr-CA",{style:"currency",currency:"CAD"});
  const logo=companyInfo.logo?`<img src="${companyInfo.logo}" style="max-height:55px;max-width:110px;object-fit:contain;" alt="Logo"/>`:"";
  const rows=lignes.map((l,i)=>{const lt=(l.quantite||0)*(l.prixUnitaire||0)*(1-(l.remise||0)/100);return`<tr style="background:${i%2?"#f9f9f9":"#fff"}"><td style="padding:5px 8px;border-bottom:1px solid #eee;font-size:12px">${l.description||""}</td><td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:center;font-size:12px">${l.quantite||1}</td><td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:right;font-size:12px">${fc(l.prixUnitaire||0)}</td><td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:center;font-size:12px">${l.remise?l.remise+"%":"—"}</td><td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:right;font-size:12px;font-weight:700">${fc(lt)}</td></tr>`}).join("");
  const cli=client?`<div style="font-weight:700;font-size:13px">${client.entreprise}</div>${client.contact?`<div>${client.contact}</div>`:""}${client.adresse?`<div>${client.adresse}</div>`:""}${client.ville?`<div>${[client.ville,client.province,client.codePostal].filter(Boolean).join(", ")}</div>`:""}${client.courriel?`<div>${client.courriel}</div>`:""}${client.tel1?`<div>${client.tel1}</div>`:""}`:""` "(aucun client)"`;
  const solde=totals.total-(montantPaye||0);
  return`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Facture ${numero}</title><style>body{font-family:Arial,sans-serif;color:#1a1a1a;margin:0;padding:24px;font-size:13px}table{width:100%;border-collapse:collapse}th{background:#f97316;color:#fff;padding:6px 8px;text-align:left;font-size:11px}.tot{margin-left:auto;width:280px;margin-top:12px}.tr{display:flex;justify-content:space-between;padding:3px 0;font-size:12px}.tf{font-weight:900;font-size:15px;border-top:2px solid #1a1a1a;margin-top:4px;padding-top:4px}.due{background:#fff3cd;border:1px solid #f97316;borderRadius:4px;padding:6px 10px;margin-bottom:12px;font-size:12px;font-weight:700}.notes{background:#f9f9f9;border-left:3px solid #f97316;padding:10px 12px;margin-top:16px;font-size:12px}.ftr{margin-top:24px;padding-top:8px;border-top:1px solid #eee;font-size:10px;color:#888;text-align:center}@media print{body{padding:10px}}</style></head><body><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px"><div>${logo}<div style="margin-top:4px;font-weight:700;font-size:14px">${companyInfo.nom||""}</div><div style="font-size:11px;color:#555">${[companyInfo.adresse,companyInfo.ville,companyInfo.province].filter(Boolean).join(", ")}</div>${companyInfo.telephone?`<div style="font-size:11px;color:#555">${companyInfo.telephone}</div>`:""}${companyInfo.courriel?`<div style="font-size:11px;color:#555">${companyInfo.courriel}</div>`:""}</div><div style="text-align:right"><div style="font-size:30px;font-weight:900;color:#f97316;letter-spacing:2px">FACTURE</div><div style="font-size:18px;font-weight:700;margin-top:4px"># ${numero}</div><div style="font-size:11px;color:#555;margin-top:3px">Date: ${fd(date)}</div><div style="font-size:12px;font-weight:700;color:${statut==="En retard"?"#ef4444":"#1a1a1a"};margin-top:4px;padding:4px 8px;background:${statut==="En retard"?"#fee2e2":"#f3f4f6"};borderRadius:4px;display:inline-block">Échéance: ${fd(dateEcheance)}</div><div style="font-size:11px;color:#555;margin-top:3px">Statut: <strong>${statut}</strong></div>${referenceClient?`<div style="font-size:11px;color:#555">Réf.: ${referenceClient}</div>`:""}${sourceNumero?`<div style="font-size:11px;color:#555">${sourceType==="commande"?"Commande":"Soumission"}: ${sourceNumero}</div>`:""}</div></div><div style="margin-bottom:16px"><div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Facturé à</div><div style="line-height:1.6">${cli}</div></div><table><thead><tr><th>Description</th><th style="width:55px;text-align:center">Qté</th><th style="width:100px;text-align:right">Prix unit.</th><th style="width:65px;text-align:center">Remise</th><th style="width:100px;text-align:right">Total</th></tr></thead><tbody>${rows}</tbody></table><div class="tot"><div class="tr"><span>Sous-total</span><span>${fc(totals.sousTotal)}</span></div><div class="tr"><span>TPS (5%)</span><span>${fc(totals.tpsTotal)}</span></div><div class="tr"><span>TVQ (9.975%)</span><span>${fc(totals.tvqTotal)}</span></div><div class="tr tf"><span>TOTAL</span><span>${fc(totals.total)}</span></div>${(montantPaye||0)>0?`<div class="tr" style="color:#22c55e"><span>Montant payé</span><span>${fc(montantPaye)}</span></div><div class="tr tf" style="color:#ef4444"><span>SOLDE DÛ</span><span>${fc(solde)}</span></div>`:""}</div>${notes?`<div class="notes"><strong>Notes</strong><br/>${notes}</div>`:""}<div class="ftr">${companyInfo.numeroTPS?`N° TPS: ${companyInfo.numeroTPS}`:""}${companyInfo.numeroTVQ?` &nbsp;|&nbsp; N° TVQ: ${companyInfo.numeroTVQ}`:""}</div></body></html>`;
}
function FactureEditor({facture,clients,produits,companyInfo,docNums,saveDocNums,factures,saveFactures,onBack,initClientId,onEnregistrerPaiement,onCreditNote}){
  const t=useT();
  const isNew=!facture?.id;
  const todayStr=dk(new Date());
  const inputS={background:t.inputBg,border:`1px solid ${t.inputBorder}`,borderRadius:5,color:t.inputText,fontSize:12,padding:"5px 8px",outline:"none"};
  const [form,setForm]=useState(facture?{...facture}:{date:todayStr,dateEcheance:"",clientId:initClientId||"",referenceClient:"",statut:"Brouillon",notes:"",paiements:[],sourceType:null,sourceId:null,sourceNumero:null});
  const [lignes,setLignes]=useState(facture?.lignes?.length?facture.lignes:[newLigne()]);
  const [savedId,setSavedId]=useState(facture?.id||null);
  const [savedNumero,setSavedNumero]=useState(facture?.numero||null);
  const [confirmDel,setConfirmDel]=useState(false);
  const [flash,setFlash]=useState(false);
  const totals=useMemo(()=>computeSoumTotals(lignes),[lignes]);
  const client=clients.find(c=>c.id===form.clientId);
  const locked=form.statut!=="Brouillon";
  const creditPaiements=useMemo(()=>(form.paiements||[]).filter(p=>p.fromCredit),[form.paiements]);
  const regularPaiements=useMemo(()=>(form.paiements||[]).filter(p=>!p.fromCredit),[form.paiements]);
  const montantCredit=useMemo(()=>creditPaiements.reduce((s,p)=>s+(p.montant||0),0),[creditPaiements]);
  const montantPaye=useMemo(()=>(form.paiements||[]).reduce((s,p)=>s+(p.montant||0),0),[form.paiements]);
  const soldeDu=totals.total-montantPaye;
  // Auto-detect overdue
  const isOverdue=form.statut==="Envoyée"&&form.dateEcheance&&dk(new Date())>form.dateEcheance;
  const displayStatut=isOverdue?"En retard":form.statut;
  const upd=f=>setForm(p=>({...p,...f}));
  const updL=(id,f)=>setLignes(ls=>ls.map(l=>l.id===id?{...l,...f}:l));
  const selectProd=(lid,pid)=>{
    if(!pid){updL(lid,{produitId:""});return;}
    const p=produits.find(x=>x.id===pid);
    if(p)updL(lid,{produitId:pid,description:p.description,prixUnitaire:parseFloat(p.prixUnitaire)||0,tps:p.tps!==false,tvq:p.tvq!==false});
  };
  // Auto-fill dateEcheance when client or date changes
  const prevClientId=useRef(form.clientId);
  useEffect(()=>{
    if(form.clientId!==prevClientId.current||(!form.dateEcheance&&form.date)){
      prevClientId.current=form.clientId;
      if(client&&form.date){
        const ech=calcDateEcheance(form.date,client.conditionsPaiement,client.nbJours);
        setForm(p=>({...p,dateEcheance:ech}));
      }
    }
  },[form.clientId,form.date,client]);
  const doSave=()=>{
    let id=savedId,numero=savedNumero;const isNew=!id;
    if(!id){
      id=Date.now().toString();numero=fmtDocNum(docNums.prefix,"F",docNums.facture);
      saveDocNums({...docNums,facture:docNums.facture+1});
      setSavedId(id);setSavedNumero(numero);
    }
    const doc={...form,id,numero,lignes};
    saveFactures(factures.some(f=>f.id===id)?factures.map(f=>f.id===id?doc:f):[...factures,doc]);
    if(isNew)logCreate('invoice','facture',id,doc);
    else logUpdate('invoice','facture',id,'document',null,JSON.stringify(doc));
    setFlash(true);setTimeout(()=>setFlash(false),2000);
  };
  const doDelete=async()=>{
    if(!savedId)return;
    const reason=await promptCorrectionReason('Annulation de la facture');
    if(!reason)return;
    logVoid('invoice','facture',savedId,reason);
    saveFactures(factures.map(f=>f.id===savedId?{...f,statut:"Annulée",voidReason:reason,voidDate:dk(new Date())}:f));
    onBack();
  };
  const doPrint=()=>{
    const numero=savedNumero||fmtDocNum(docNums.prefix,"F",docNums.facture);
    openPDF(buildFactureHTML({...form,numero,lignes,totals,client,companyInfo,montantPaye}));
  };
  const doEmail=()=>{
    if(!client?.courriel)return;
    const num=savedNumero||"—";
    const sub=encodeURIComponent(`Facture ${num}`);
    const body=encodeURIComponent(`Bonjour,\n\nVeuillez trouver ci-joint votre facture ${num} d'un montant de ${fmt(totals.total)}${soldeDu<totals.total?`, solde dû: ${fmt(soldeDu)}`:""}.\n\nMerci de votre confiance,\n${companyInfo.nom||""}`);
    window.open(`mailto:${client.courriel}?subject=${sub}&body=${body}`);
  };
  const SC=STATUT_FAC_C;
  return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
      <button onClick={onBack} style={{background:"none",border:`1px solid ${t.cardBorder}`,borderRadius:5,color:t.textSub,fontSize:11,padding:"3px 10px",cursor:"pointer",fontWeight:600}}>← Retour</button>
      <span style={{fontSize:14,fontWeight:700,color:t.text}}>{savedNumero||(isNew?"Nouvelle facture":facture?.numero)}</span>
      <span style={{fontSize:10,fontWeight:700,color:SC[displayStatut]||t.textMuted,background:"rgba(0,0,0,0.06)",borderRadius:10,padding:"2px 8px"}}>{displayStatut}{isOverdue&&" ⚠"}</span>
      {form.sourceNumero&&<span style={{fontSize:10,color:t.textMuted}}>← {form.sourceType==="commande"?"Commande":"Soumission"} {form.sourceNumero}</span>}
      <div style={{flex:1}}/>
      <button onClick={doSave} style={{padding:"5px 14px",borderRadius:6,border:"none",background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:11,fontFamily:"'Outfit',sans-serif"}}>💾 Sauvegarder</button>
      {flash&&<span style={{fontSize:11,color:"#22c55e",fontWeight:600}}>✓</span>}
      <button onClick={doPrint} style={{padding:"5px 10px",borderRadius:6,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:"pointer",fontWeight:600,fontSize:11}}>🖨️ Imprimer</button>
      <button onClick={doEmail} disabled={!client?.courriel} style={{padding:"5px 10px",borderRadius:6,border:`1px solid ${t.cardBorder}`,background:t.section,color:!client?.courriel?t.textDim:t.textSub,cursor:!client?.courriel?"default":"pointer",fontWeight:600,fontSize:11,opacity:!client?.courriel?0.5:1}}>📧 Envoyer</button>
      <button onClick={()=>savedId&&onEnregistrerPaiement&&onEnregistrerPaiement(factures.find(f=>f.id===savedId)||{...form,id:savedId})} disabled={!savedId||!onEnregistrerPaiement||["Payée","Annulée"].includes(form.statut)} style={{padding:"5px 10px",borderRadius:6,border:`1px solid ${!savedId||!onEnregistrerPaiement||["Payée","Annulée"].includes(form.statut)?t.cardBorder:"rgba(249,115,22,0.3)"}`,background:!savedId||!onEnregistrerPaiement||["Payée","Annulée"].includes(form.statut)?t.section:"rgba(249,115,22,0.07)",color:!savedId||!onEnregistrerPaiement||["Payée","Annulée"].includes(form.statut)?t.textDim:"#f97316",cursor:!savedId||!onEnregistrerPaiement||["Payée","Annulée"].includes(form.statut)?"default":"pointer",fontWeight:600,fontSize:11,opacity:!savedId||!onEnregistrerPaiement||["Payée","Annulée"].includes(form.statut)?0.4:1}}>Enregistrer un paiement</button>
      <button onClick={()=>savedId&&onCreditNote&&onCreditNote(factures.find(f=>f.id===savedId)||{...form,id:savedId})} disabled={!savedId||!onCreditNote||["Annulée"].includes(form.statut)} style={{padding:"5px 10px",borderRadius:6,border:`1px solid ${!savedId||!onCreditNote||["Annulée"].includes(form.statut)?t.cardBorder:"rgba(239,68,68,0.3)"}`,background:!savedId||!onCreditNote||["Annulée"].includes(form.statut)?t.section:"rgba(239,68,68,0.07)",color:!savedId||!onCreditNote||["Annulée"].includes(form.statut)?t.textDim:"#ef4444",cursor:!savedId||!onCreditNote||["Annulée"].includes(form.statut)?"default":"pointer",fontWeight:600,fontSize:11,opacity:!savedId||!onCreditNote||["Annulée"].includes(form.statut)?0.4:1}}>→ Note de crédit</button>
      {savedId&&!locked&&(
        confirmDel
          ?<><span style={{fontSize:11,color:"#ef4444"}}>Annuler ce document?</span>
             <button onClick={doDelete} style={{padding:"4px 10px",borderRadius:5,border:"none",background:"#ef4444",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:11}}>Annuler la facture</button>
             <button onClick={()=>setConfirmDel(false)} style={{padding:"4px 8px",borderRadius:5,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:"pointer",fontSize:11}}>Revenir</button></>
          :<button onClick={()=>setConfirmDel(true)} style={{padding:"5px 10px",borderRadius:6,border:"1px solid rgba(239,68,68,0.2)",background:"rgba(239,68,68,0.07)",color:"#ef4444",cursor:"pointer",fontWeight:600,fontSize:11}}>🗑️</button>
      )}
    </div>
    <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:12}}>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <div style={{flex:"2 1 200px"}}>
          <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Client</div>
          <select value={form.clientId||""} onChange={e=>upd({clientId:e.target.value})} disabled={locked} style={{...inputS,width:"100%",boxSizing:"border-box",opacity:locked?0.6:1}}>
            <option value="">— Choisir un client —</option>
            {clients.filter(c=>c.statut==="actif").map(c=><option key={c.id} value={c.id}>{c.entreprise} ({c.code})</option>)}
          </select>
        </div>
        <div style={{flex:"1 1 120px"}}>
          <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Date</div>
          <input type="date" value={form.date||todayStr} onChange={e=>upd({date:e.target.value})} disabled={locked} style={{...inputS,width:"100%",boxSizing:"border-box",fontFamily:"'DM Mono',monospace",opacity:locked?0.6:1}}/>
        </div>
        <div style={{flex:"1 1 120px"}}>
          <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Date d'échéance</div>
          <input type="date" value={form.dateEcheance||""} onChange={e=>upd({dateEcheance:e.target.value})} style={{...inputS,width:"100%",boxSizing:"border-box",fontFamily:"'DM Mono',monospace",borderColor:isOverdue?"#ef4444":undefined}}/>
        </div>
        <div style={{flex:"1 1 140px"}}>
          <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Statut</div>
          <select value={form.statut} onChange={e=>upd({statut:e.target.value})} style={{...inputS,width:"100%",boxSizing:"border-box",color:SC[form.statut]||t.inputText,fontWeight:700}}>
            {STATUTS_FACTURE.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{flex:"2 1 180px"}}>
          <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Réf. client / Bon de commande</div>
          <input value={form.referenceClient||""} onChange={e=>upd({referenceClient:e.target.value})} placeholder="Optionnel" style={{...inputS,width:"100%",boxSizing:"border-box"}}/>
        </div>
      </div>
      {client&&<div style={{marginTop:8,padding:"5px 8px",borderRadius:6,background:t.section,border:`1px solid ${t.sectionBorder}`,fontSize:11,color:t.textSub}}>
        <strong style={{color:t.text}}>{client.entreprise}</strong>
        {client.contact&&` · ${client.contact}`}
        {client.adresse&&` · ${client.adresse}`}
        {client.ville&&` · ${[client.ville,client.province].filter(Boolean).join(", ")}`}
        {client.courriel&&<span style={{fontFamily:"'DM Mono',monospace",marginLeft:6,color:t.textMuted}}>{client.courriel}</span>}
        <span style={{marginLeft:8,fontSize:10,color:t.textMuted}}>{client.conditionsPaiement}{client.conditionsPaiement==="Personnalisé"&&client.nbJours?` (${client.nbJours} jours)`:""}</span>
      </div>}
      {locked&&<div style={{marginTop:8,padding:"4px 8px",borderRadius:5,background:"rgba(99,102,241,0.07)",border:"1px solid rgba(99,102,241,0.15)",fontSize:10,color:"#6366f1",fontWeight:600}}>Lignes verrouillées — utilisez une note de crédit pour les ajustements.</div>}
    </div>
    <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:12}}>
      <span style={{fontSize:12,fontWeight:700,color:t.text,display:"block",marginBottom:8}}>Lignes</span>
      <div style={{display:"grid",gridTemplateColumns:"1.8fr 2fr 65px 85px 65px 28px 28px 90px 24px",gap:5,padding:"2px 4px",marginBottom:4}}>
        {["Produit","Description","Qté","Prix unit.","Remise %","TPS","TVQ","Total",""].map((h,i)=>(
          <span key={i} style={{fontSize:9.5,color:t.textMuted,fontWeight:600,textAlign:i>=2&&i<=7?"center":"left"}}>{h}</span>
        ))}
      </div>
      {lignes.map(l=>{
        const lt=(l.quantite||0)*(l.prixUnitaire||0)*(1-(l.remise||0)/100);
        return(<div key={l.id} style={{display:"grid",gridTemplateColumns:"1.8fr 2fr 65px 85px 65px 28px 28px 90px 24px",gap:5,marginBottom:6,alignItems:"center"}}>
          <select value={l.produitId||""} onChange={e=>selectProd(l.id,e.target.value)} disabled={locked} style={{...inputS,width:"100%",boxSizing:"border-box",fontSize:11,opacity:locked?0.6:1}}>
            <option value="">— Libre —</option>
            {produits.filter(p=>p.actif!==false).map(p=><option key={p.id} value={p.id}>{p.code} {p.description}</option>)}
          </select>
          <input value={l.description} onChange={e=>updL(l.id,{description:e.target.value})} disabled={locked} placeholder="Description" style={{...inputS,width:"100%",boxSizing:"border-box",fontSize:11,opacity:locked?0.6:1}}/>
          <input type="number" min="0" step="0.01" value={l.quantite} onChange={e=>updL(l.id,{quantite:parseFloat(e.target.value)||0})} disabled={locked} style={{...inputS,width:"100%",boxSizing:"border-box",textAlign:"right",fontSize:11,opacity:locked?0.6:1}}/>
          <input type="number" min="0" step="0.01" value={l.prixUnitaire} onChange={e=>updL(l.id,{prixUnitaire:parseFloat(e.target.value)||0})} disabled={locked} style={{...inputS,width:"100%",boxSizing:"border-box",textAlign:"right",fontSize:11,opacity:locked?0.6:1}}/>
          <input type="number" min="0" max="100" step="0.1" value={l.remise||""} onChange={e=>updL(l.id,{remise:parseFloat(e.target.value)||0})} disabled={locked} placeholder="0" style={{...inputS,width:"100%",boxSizing:"border-box",textAlign:"right",fontSize:11,opacity:locked?0.6:1}}/>
          <label style={{display:"flex",alignItems:"center",justifyContent:"center",cursor:locked?"default":"pointer"}}>
            <input type="checkbox" checked={!!l.tps} onChange={e=>updL(l.id,{tps:e.target.checked})} disabled={locked} style={{accentColor:"#f97316"}}/>
          </label>
          <label style={{display:"flex",alignItems:"center",justifyContent:"center",cursor:locked?"default":"pointer"}}>
            <input type="checkbox" checked={!!l.tvq} onChange={e=>updL(l.id,{tvq:e.target.checked})} disabled={locked} style={{accentColor:"#f97316"}}/>
          </label>
          <span style={{textAlign:"right",fontSize:12,fontWeight:700,color:t.text,fontFamily:"'DM Mono',monospace"}}>{fmt(lt)}</span>
          <button onClick={()=>setLignes(ls=>ls.filter(x=>x.id!==l.id))} disabled={lignes.length===1||locked} style={{background:"none",border:"none",color:(lignes.length===1||locked)?t.textDim:"#ef4444",cursor:(lignes.length===1||locked)?"default":"pointer",fontSize:14,padding:0,fontWeight:700}}>✕</button>
        </div>);
      })}
      {!locked&&<button onClick={()=>setLignes(ls=>[...ls,newLigne()])} style={{marginTop:2,padding:"5px 12px",borderRadius:6,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:"pointer",fontWeight:600,fontSize:11}}>+ Ajouter une ligne</button>}
    </div>
    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
      <div style={{flex:"2 1 200px",background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:12}}>
        <div style={{fontSize:12,fontWeight:700,color:t.text,marginBottom:6}}>Notes</div>
        <textarea value={form.notes||""} onChange={e=>upd({notes:e.target.value})} rows={3} placeholder="Notes visibles sur la facture imprimée..." style={{...inputS,width:"100%",boxSizing:"border-box",resize:"vertical",fontFamily:"'Outfit',sans-serif"}}/>
      </div>
      <div style={{flex:"1 1 180px",background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:12,display:"flex",flexDirection:"column",gap:5,justifyContent:"flex-end"}}>
        {[["Sous-total",totals.sousTotal],["TPS (5%)",totals.tpsTotal],["TVQ (9.975%)",totals.tvqTotal]].map(([label,val])=>(
          <div key={label} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:t.textSub}}>
            <span>{label}</span><span style={{fontFamily:"'DM Mono',monospace"}}>{fmt(val)}</span>
          </div>
        ))}
        <div style={{display:"flex",justifyContent:"space-between",fontSize:14,fontWeight:800,color:t.text,borderTop:`2px solid ${t.dividerMid}`,paddingTop:6,marginTop:2}}>
          <span>TOTAL</span><span style={{fontFamily:"'DM Mono',monospace",color:"#f97316"}}>{fmt(totals.total)}</span>
        </div>
        {regularPaiements.length>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#22c55e"}}>
          <span>Paiements reçus</span><span style={{fontFamily:"'DM Mono',monospace"}}>−{fmt(regularPaiements.reduce((s,p)=>s+(p.montant||0),0))}</span>
        </div>}
        {creditPaiements.length>0&&<div style={{display:"flex",flexDirection:"column",gap:2,marginTop:2}}>
          {creditPaiements.map(p=><div key={p.id} style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#8b5cf6"}}>
            <span>Note de crédit {p.reference||p.numero}</span><span style={{fontFamily:"'DM Mono',monospace"}}>−{fmt(p.montant)}</span>
          </div>)}
        </div>}
        {montantPaye>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:13,fontWeight:800,color:soldeDu<=0?"#22c55e":"#ef4444",borderTop:`1px solid ${t.dividerMid}`,paddingTop:5,marginTop:2}}>
          <span>Solde dû</span><span style={{fontFamily:"'DM Mono',monospace"}}>{fmt(soldeDu)}</span>
        </div>}
        {montantPaye===0&&<div style={{fontSize:10,color:t.textMuted,textAlign:"center",marginTop:4}}>Aucun paiement enregistré</div>}
      </div>
    </div>
  </div>);
}

// ── ENCAISSEMENT ──
const MODES_PAIEMENT=["Chèque","Virement/E-Transfer","Carte de crédit","Carte de débit","Comptant","Autre"];
function buildReceiptHTML({numero,date,montant,mode,reference,note,client,facture,companyInfo}){
  const fd=d=>{if(!d)return"—";const dt=new Date(d+"T12:00:00");return`${dt.getDate()} ${["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"][dt.getMonth()]} ${dt.getFullYear()}`};
  const fc=n=>(n||0).toLocaleString("fr-CA",{style:"currency",currency:"CAD"});
  const logo=companyInfo.logo?`<img src="${companyInfo.logo}" style="max-height:50px;object-fit:contain;" alt="Logo"/>`:"";
  return`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Reçu ${numero}</title><style>body{font-family:Arial,sans-serif;color:#1a1a1a;margin:0;padding:30px;font-size:13px;max-width:400px}.title{font-size:24px;font-weight:900;color:#f97316;letter-spacing:2px;margin:12px 0 4px}.num{font-size:16px;font-weight:700;margin-bottom:16px}.row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #eee;font-size:12px}.total{font-size:18px;font-weight:900;color:#22c55e;text-align:right;margin-top:12px}.stamp{border:3px solid #22c55e;color:#22c55e;font-weight:900;font-size:20px;text-align:center;padding:8px;margin-top:16px;letter-spacing:4px}.ftr{margin-top:20px;font-size:10px;color:#888;text-align:center}@media print{body{padding:15px}}</style></head><body>${logo}<div class="title">REÇU DE PAIEMENT</div><div class="num"># ${numero}</div><div class="row"><span>Date</span><span>${fd(date)}</span></div><div class="row"><span>Client</span><span>${client?.entreprise||"—"}</span></div>${facture?`<div class="row"><span>Facture</span><span>${facture.numero}</span></div>`:""}<div class="row"><span>Mode de paiement</span><span>${mode}</span></div>${reference?`<div class="row"><span>Référence</span><span>${reference}</span></div>`:""}<div class="total">${fc(montant)}</div>${note?`<div style="margin-top:10px;font-size:11px;color:#555">Note: ${note}</div>`:""}<div class="stamp">✓ REÇU</div><div class="ftr">${companyInfo.nom||""}</div></body></html>`;
}
function EncaissementEditor({clientId,factureId,clients,factures,saveFactures,docNums,saveDocNums,companyInfo,encaisseData,persistEncaisse,onBack,showUpgradePrompt}){
  const t=useT();
  const isBulk=canUse('bulkEncaissement');
  const todayStr=dk(new Date());
  const inputS={background:t.inputBg,border:`1px solid ${t.inputBorder}`,borderRadius:5,color:t.inputText,fontSize:12,padding:"5px 8px",outline:"none"};
  const client=clients.find(c=>c.id===clientId);
  const unpaid=useMemo(()=>factures.filter(f=>f.clientId===clientId&&!["Payée","Créditée","Annulée","Brouillon"].includes(f.statut)).sort((a,b)=>(a.date||"").localeCompare(b.date||"")),[factures,clientId]);

  // Free tier: single selection
  const [selId,setSelId]=useState(factureId||null);
  // Pro tier: multi-selection map + per-invoice allocation
  const [selMap,setSelMap]=useState(()=>factureId?{[factureId]:true}:{});
  const [allocations,setAllocations]=useState({}); // invoiceId → amount string
  const [overflowChoice,setOverflowChoice]=useState(null); // null | 'credit' | 'remboursement'

  const [form,setForm]=useState({date:todayStr,montant:"",mode:"Virement/E-Transfer",reference:"",note:""});
  const [confirmation,setConfirmation]=useState(null);
  const updF=f=>setForm(p=>({...p,...f}));

  // ── Single-invoice helpers (free) ──
  const selFac=factures.find(f=>f.id===selId);
  const selTotals=selFac?computeSoumTotals(selFac.lignes):{total:0};
  const dejaPaye=selFac?(selFac.paiements||[]).reduce((s,p)=>s+(p.montant||0),0):0;
  const solde=selTotals.total-dejaPaye;

  // ── Bulk helpers (pro) ──
  const selectedFacs=useMemo(()=>unpaid.filter(f=>selMap[f.id]),[unpaid,selMap]);
  const totalSoldeSelected=useMemo(()=>selectedFacs.reduce((s,f)=>{const tot=computeSoumTotals(f.lignes).total;const dp=(f.paiements||[]).reduce((a,p)=>a+(p.montant||0),0);return s+(tot-dp);},[]),[selectedFacs]);
  const totalMontant=parseFloat(form.montant)||0;
  const totalAlloue=useMemo(()=>Object.values(allocations).reduce((s,v)=>s+(parseFloat(v)||0),0),[allocations]);
  const restant=totalMontant-totalAlloue;
  const excedent=Math.max(0,totalMontant-totalSoldeSelected);

  const autoApply=()=>{
    let remaining=totalMontant;
    const newAlloc={};
    selectedFacs.forEach(f=>{
      if(remaining<=0.005)return;
      const tot=computeSoumTotals(f.lignes).total;
      const dp=(f.paiements||[]).reduce((s,p)=>s+(p.montant||0),0);
      const sol=tot-dp;
      const apply=Math.min(remaining,sol);
      newAlloc[f.id]=apply.toFixed(2);
      remaining-=apply;
    });
    setAllocations(newAlloc);
  };

  const toggleSel=fId=>{
    const alreadySel=!!selMap[fId];
    const countSel=Object.values(selMap).filter(Boolean).length;
    if(!alreadySel&&countSel>=1){
      // Trying to add a second invoice
      if(!isBulk){if(showUpgradePrompt)showUpgradePrompt('bulkEncaissement');return;}
    }
    setSelMap(p=>({...p,[fId]:!p[fId]}));
    if(alreadySel){setAllocations(p=>{const n={...p};delete n[fId];return n;});}
  };

  // ── Save (single / bulk) ──
  const _applyPayment=(updFactures,fac,montant,encNum)=>{
    const id=Date.now().toString(36)+Math.random().toString(36).slice(2);
    const numero=fmtDocNum(docNums.prefix,"E",encNum);
    const paiement={id,numero,date:form.date,montant,mode:form.mode,reference:form.reference,note:form.note};
    const dp=(fac.paiements||[]).reduce((s,p)=>s+(p.montant||0),0);
    const newSolde=computeSoumTotals(fac.lignes).total-dp-montant;
    const newStatut=newSolde<=0.005?"Payée":"Payée partiellement";
    const updFac={...fac,paiements:[...(fac.paiements||[]),paiement],statut:newStatut};
    logCreate('payment','paiement',id,{...paiement,factureId:fac.id,factureNumero:fac.numero});
    logUpdate('invoice','facture',fac.id,'statut',fac.statut,newStatut);
    return{updFactures:updFactures.map(f=>f.id===fac.id?updFac:f),paiement,updFac,numero};
  };

  const doSave=()=>{
    if(!isBulk){
      // Free tier — single invoice
      if(!selFac||!form.montant||parseFloat(form.montant)<=0)return;
      const montant=Math.min(parseFloat(form.montant),solde);
      const{updFactures,paiement,updFac,numero}=_applyPayment([...factures],selFac,montant,docNums.encaissement);
      saveFactures(updFactures);
      saveDocNums({...docNums,encaissement:docNums.encaissement+1});
      if(form.mode==="Comptant"&&persistEncaisse){
        const d=form.date;const prev=encaisseData[d]||{};
        persistEncaisse({...encaisseData,[d]:{...prev,autreEntrees:[...(prev.autreEntrees||[]),{id:paiement.id,description:`Paiement ${updFac.numero} (Facturation)`,montant,fromFacturation:true}]}});
      }
      setConfirmation({single:true,numero,montant,factureNumero:selFac.numero,paiement,facture:updFac});
      return;
    }
    // Pro bulk — apply allocations
    const toApply=selectedFacs.filter(f=>parseFloat(allocations[f.id])>0);
    if(!toApply.length||totalMontant<=0)return;
    let updFactures=[...factures];
    let encNum=docNums.encaissement;
    const results=[];
    toApply.forEach(f=>{
      const cap=computeSoumTotals(f.lignes).total-(f.paiements||[]).reduce((s,p)=>s+(p.montant||0),0);
      const montant=Math.min(parseFloat(allocations[f.id])||0,cap);
      if(montant<=0)return;
      const{updFactures:uf,paiement,updFac,numero}=_applyPayment(updFactures,f,montant,encNum++);
      updFactures=uf;
      results.push({numero,montant,factureNumero:f.numero,facture:updFac});
      if(form.mode==="Comptant"&&persistEncaisse){
        const d=form.date;const prev=encaisseData[d]||{};
        persistEncaisse({...encaisseData,[d]:{...prev,autreEntrees:[...(prev.autreEntrees||[]),{id:paiement.id,description:`Paiement ${updFac.numero} (Facturation)`,montant,fromFacturation:true}]}});
      }
    });
    saveFactures(updFactures);
    saveDocNums({...docNums,encaissement:encNum});
    setConfirmation({bulk:true,results,totalMontant:totalAlloue,overflowChoice,excedent});
  };

  if(confirmation){
    return(<div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <button onClick={onBack} style={{background:"none",border:`1px solid ${t.cardBorder}`,borderRadius:5,color:t.textSub,fontSize:11,padding:"3px 10px",cursor:"pointer",fontWeight:600}}>← Retour</button>
        <span style={{fontSize:14,fontWeight:700,color:t.text}}>{confirmation.bulk?"Paiements enregistrés":"Paiement enregistré"}</span>
      </div>
      <div style={{background:"rgba(34,197,94,0.08)",border:"1px solid rgba(34,197,94,0.2)",borderRadius:9,padding:16}}>
        <div style={{textAlign:"center",marginBottom:8}}>
          <div style={{fontSize:22,marginBottom:4}}>✓</div>
          <div style={{fontSize:14,fontWeight:700,color:"#22c55e"}}>{confirmation.bulk?`${fmt(confirmation.totalMontant)} réparti sur ${confirmation.results.length} facture${confirmation.results.length>1?"s":""}`:  `Paiement de ${fmt(confirmation.montant)} enregistré`}</div>
          {!confirmation.bulk&&<div style={{fontSize:12,color:t.textSub,marginTop:4}}>sur facture {confirmation.factureNumero} — reçu {confirmation.numero}</div>}
        </div>
        {confirmation.bulk&&confirmation.results.map(r=>(
          <div key={r.numero} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:t.textSub,borderTop:`1px solid ${t.divider}`,padding:"4px 0"}}>
            <span>Facture {r.factureNumero} — reçu {r.numero}</span>
            <span style={{fontFamily:"'DM Mono',monospace",color:"#22c55e",fontWeight:700}}>{fmt(r.montant)}</span>
          </div>
        ))}
        {confirmation.bulk&&confirmation.excedent>0&&(<div style={{marginTop:8,padding:"6px 10px",borderRadius:6,background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.2)",fontSize:11,color:"#f59e0b"}}>
          Excédent de {fmt(confirmation.excedent)} — {confirmation.overflowChoice==="credit"?"conservé en crédit client":"remboursement manuel requis"}
        </div>)}
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"center"}}>
        {!confirmation.bulk&&<button onClick={()=>openPDF(buildReceiptHTML({...confirmation.paiement,numero:confirmation.numero,montant:confirmation.montant,client,facture:selFac,companyInfo}))} style={{padding:"7px 16px",borderRadius:6,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:"pointer",fontWeight:600,fontSize:12}}>🖨️ Imprimer le reçu</button>}
        <button onClick={onBack} style={{padding:"7px 16px",borderRadius:6,border:"none",background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:12,fontFamily:"'Outfit',sans-serif"}}>Terminer</button>
      </div>
    </div>);
  }

  const colsPro="24px 80px 100px 90px 90px 90px";
  const colsFree="24px 80px 100px 1fr 90px 90px";
  return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
      <button onClick={onBack} style={{background:"none",border:`1px solid ${t.cardBorder}`,borderRadius:5,color:t.textSub,fontSize:11,padding:"3px 10px",cursor:"pointer",fontWeight:600}}>← Retour</button>
      <span style={{fontSize:14,fontWeight:700,color:t.text}}>Enregistrer un paiement</span>
      {client&&<span style={{fontSize:12,color:t.textMuted}}>— {client.entreprise}</span>}
      {isBulk&&<span style={{fontSize:9.5,fontWeight:700,color:"#f97316",background:"rgba(249,115,22,0.1)",padding:"2px 7px",borderRadius:8}}>PRO · Multi-factures</span>}
    </div>

    {/* ① Invoice selector */}
    <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:12}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <span style={{fontSize:12,fontWeight:700,color:t.text}}>① {isBulk?"Choisir les factures":"Choisir la facture"}</span>
        {isBulk&&selectedFacs.length>0&&<button onClick={autoApply} disabled={!totalMontant} style={{padding:"3px 10px",borderRadius:5,border:"none",background:totalMontant?"linear-gradient(135deg,#f97316,#ea580c)":"rgba(255,255,255,0.05)",color:totalMontant?"#fff":t.textDim,cursor:totalMontant?"pointer":"default",fontWeight:700,fontSize:10,fontFamily:"'Outfit',sans-serif"}}>⚡ Appliquer automatiquement</button>}
      </div>
      {unpaid.length===0
        ?<div style={{textAlign:"center",padding:"16px 0",color:t.textMuted,fontSize:12}}>Aucune facture impayée pour ce client.</div>
        :<div style={{display:"flex",flexDirection:"column",gap:4}}>
          <div style={{display:"grid",gridTemplateColumns:isBulk?colsPro:colsFree,gap:6,padding:"2px 6px",borderBottom:`1px solid ${t.dividerMid}`}}>
            {(isBulk?["","# Facture","Date","Total","Solde","À appliquer"]:["","# Facture","Date","Total","Déjà payé","Solde"]).map((h,i)=><span key={i} style={{fontSize:9.5,color:t.textMuted,fontWeight:600,textAlign:i>=3?"right":"left"}}>{h}</span>)}
          </div>
          {unpaid.map(f=>{
            const tot=computeSoumTotals(f.lignes).total;
            const dp=(f.paiements||[]).reduce((s,p)=>s+(p.montant||0),0);
            const sol=tot-dp;
            const isSel=isBulk?!!selMap[f.id]:selId===f.id;
            return(
              <div key={f.id} style={{display:"grid",gridTemplateColumns:isBulk?colsPro:colsFree,gap:6,padding:"5px 6px",borderRadius:6,background:isSel?"rgba(249,115,22,0.08)":t.card,border:`1px solid ${isSel?"#f97316":t.cardBorder}`,alignItems:"center"}}>
                {isBulk
                  ?<input type="checkbox" checked={!!selMap[f.id]} onChange={()=>toggleSel(f.id)} style={{accentColor:"#f97316",cursor:"pointer"}}/>
                  :<input type="radio" checked={selId===f.id} onChange={()=>setSelId(f.id)} style={{accentColor:"#f97316",cursor:"pointer"}}/>}
                <span onClick={()=>isBulk?toggleSel(f.id):setSelId(f.id)} style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:t.text,fontWeight:600,cursor:"pointer"}}>{f.numero}</span>
                <span onClick={()=>isBulk?toggleSel(f.id):setSelId(f.id)} style={{fontSize:11,color:t.textSub,cursor:"pointer"}}>{f.date}</span>
                <span style={{fontSize:11,color:t.textSub,textAlign:"right",fontFamily:"'DM Mono',monospace"}}>{fmt(tot)}</span>
                {isBulk
                  ?<span style={{fontSize:12,fontWeight:700,color:"#f97316",textAlign:"right",fontFamily:"'DM Mono',monospace"}}>{fmt(sol)}</span>
                  :<span style={{fontSize:11,color:"#22c55e",textAlign:"right",fontFamily:"'DM Mono',monospace"}}>{dp>0?fmt(dp):"—"}</span>}
                {isBulk
                  ?<input type="number" min="0" step="0.01" value={selMap[f.id]?(allocations[f.id]||""):""}
                      onChange={e=>{if(!selMap[f.id])return;setAllocations(p=>({...p,[f.id]:e.target.value}));}}
                      disabled={!selMap[f.id]}
                      placeholder={selMap[f.id]?sol.toFixed(2):"—"}
                      style={{...inputS,padding:"3px 5px",textAlign:"right",fontFamily:"'DM Mono',monospace",fontSize:11,width:"100%",boxSizing:"border-box",opacity:selMap[f.id]?1:0.3}}/>
                  :<span style={{fontSize:12,fontWeight:700,color:"#f97316",textAlign:"right",fontFamily:"'DM Mono',monospace"}}>{fmt(sol)}</span>}
              </div>
            );
          })}
          {/* Bulk running totals */}
          {isBulk&&selectedFacs.length>0&&totalMontant>0&&(
            <div style={{display:"flex",gap:12,padding:"8px 6px",borderTop:`1px solid ${t.dividerMid}`,marginTop:2,flexWrap:"wrap"}}>
              <span style={{fontSize:11,color:t.textSub}}>Montant reçu: <strong style={{fontFamily:"'DM Mono',monospace",color:t.text}}>{fmt(totalMontant)}</strong></span>
              <span style={{fontSize:11,color:t.textSub}}>Appliqué: <strong style={{fontFamily:"'DM Mono',monospace",color:"#22c55e"}}>{fmt(totalAlloue)}</strong></span>
              <span style={{fontSize:11,color:t.textSub}}>Restant: <strong style={{fontFamily:"'DM Mono',monospace",color:Math.abs(restant)<0.005?"#22c55e":restant<0?"#ef4444":"#f97316"}}>{fmt(restant)}</strong></span>
              {excedent>0.005&&<span style={{fontSize:11,color:"#f59e0b",background:"rgba(245,158,11,0.1)",padding:"1px 7px",borderRadius:5}}>Excédent: {fmt(excedent)}</span>}
            </div>
          )}
          {/* Overflow choice for Pro */}
          {isBulk&&excedent>0.005&&totalAlloue>0&&(
            <div style={{display:"flex",gap:6,padding:"6px 6px 2px",alignItems:"center"}}>
              <span style={{fontSize:11,color:"#f59e0b"}}>Excédent de {fmt(excedent)} :</span>
              <button onClick={()=>setOverflowChoice('credit')} style={{padding:"3px 10px",borderRadius:5,border:`1px solid ${overflowChoice==="credit"?"#f97316":t.cardBorder}`,background:overflowChoice==="credit"?"rgba(249,115,22,0.1)":t.section,color:overflowChoice==="credit"?"#f97316":t.textSub,cursor:"pointer",fontSize:10,fontWeight:overflowChoice==="credit"?700:400}}>Garder en crédit</button>
              <button onClick={()=>setOverflowChoice('remboursement')} style={{padding:"3px 10px",borderRadius:5,border:`1px solid ${overflowChoice==="remboursement"?"#f97316":t.cardBorder}`,background:overflowChoice==="remboursement"?"rgba(249,115,22,0.1)":t.section,color:overflowChoice==="remboursement"?"#f97316":t.textSub,cursor:"pointer",fontSize:10,fontWeight:overflowChoice==="remboursement"?700:400}}>Rembourser</button>
            </div>
          )}
        </div>}
    </div>

    {/* ② Payment form */}
    {(isBulk?selectedFacs.length>0:!!selFac)&&<div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:12}}>
      <div style={{fontSize:12,fontWeight:700,color:t.text,marginBottom:8}}>② Détails du paiement</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
        <div style={{flex:"1 1 120px"}}>
          <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Date du versement</div>
          <input type="date" value={form.date} onChange={e=>updF({date:e.target.value})} style={{...inputS,width:"100%",boxSizing:"border-box",fontFamily:"'DM Mono',monospace"}}/>
        </div>
        <div style={{flex:"1 1 130px"}}>
          <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Montant reçu{!isBulk&&<span style={{color:t.textDim,fontSize:9}}> (solde: {fmt(solde)})</span>}</div>
          <input type="number" min="0.01" step="0.01" value={form.montant} onChange={e=>updF({montant:e.target.value})} placeholder={isBulk?totalSoldeSelected.toFixed(2):solde.toFixed(2)} style={{...inputS,width:"100%",boxSizing:"border-box",textAlign:"right",fontFamily:"'DM Mono',monospace"}}/>
        </div>
        <div style={{flex:"1 1 160px"}}>
          <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Mode de paiement</div>
          <select value={form.mode} onChange={e=>updF({mode:e.target.value})} style={{...inputS,width:"100%",boxSizing:"border-box"}}>
            {MODES_PAIEMENT.map(m=><option key={m}>{m}</option>)}
          </select>
        </div>
        <div style={{flex:"1 1 140px"}}>
          <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Numéro de référence</div>
          <input value={form.reference} onChange={e=>updF({reference:e.target.value})} placeholder="Optionnel" style={{...inputS,width:"100%",boxSizing:"border-box",fontFamily:"'DM Mono',monospace"}}/>
        </div>
        <div style={{flex:"2 1 200px"}}>
          <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Note</div>
          <input value={form.note} onChange={e=>updF({note:e.target.value})} placeholder="Optionnel" style={{...inputS,width:"100%",boxSizing:"border-box"}}/>
        </div>
      </div>
      {form.mode==="Comptant"&&<div style={{fontSize:10,color:"#f59e0b",background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.2)",borderRadius:5,padding:"4px 8px",marginBottom:8}}>💵 Paiement comptant — une entrée sera ajoutée automatiquement dans l'onglet Encaisse.</div>}
      {(()=>{
        const canSave=isBulk?(totalAlloue>0&&totalMontant>0&&(excedent<=0.005||overflowChoice!=null)):(!!selFac&&parseFloat(form.montant)>0);
        return<button onClick={doSave} disabled={!canSave} style={{padding:"7px 20px",borderRadius:6,border:"none",background:canSave?"linear-gradient(135deg,#f97316,#ea580c)":"rgba(255,255,255,0.05)",color:canSave?"#fff":t.textDim,cursor:canSave?"pointer":"default",fontWeight:700,fontSize:12,fontFamily:"'Outfit',sans-serif"}}>✓ {isBulk&&selectedFacs.length>1?`Enregistrer ${selectedFacs.length} paiements`:"Enregistrer le paiement"}</button>;
      })()}
    </div>}
  </div>);
}

// ── NOTE DE CRÉDIT ──
const RAISONS_NC=["Article brisé / endommagé","Erreur de facturation","Retour de marchandise","Ajustement de prix","Autre"];
const STATUTS_NC=["Brouillon","Émise","Appliquée","Annulée"];
const STATUT_NC_C={"Brouillon":"#6b7280","Émise":"#3b82f6","Appliquée":"#22c55e","Annulée":"#9ca3af"};
function buildNoteDeCreditHTML({numero,date,clientId,factureNumero,raison,raisonDetail,lignes,notes,companyInfo,clients}){
  const client=clients.find(c=>c.id===clientId);
  const cli=client?[client.entreprise,client.adresse,client.ville?`${client.ville}, ${client.province||""} ${client.codePostal||""}`:null,client.tel1,client.courriel].filter(Boolean).join("<br/>"):"—";
  const totals=computeSoumTotals(lignes);
  const fc=v=>`${v<0?"-":""}$${Math.abs(v).toFixed(2)}`;
  const fd=s=>s?new Date(s+"T12:00:00").toLocaleDateString("fr-CA",{year:"numeric",month:"long",day:"numeric"}):"";
  const rows=lignes.map(l=>{const sub=(l.prixUnitaire||0)*(l.quantite||0)*(1-(l.remise||0)/100);return`<tr style="border-bottom:1px solid #eee"><td style="padding:5px 8px">${l.description||""}</td><td style="padding:5px 8px;text-align:center">${l.quantite}</td><td style="padding:5px 8px;text-align:right">${fc(-(l.prixUnitaire||0))}</td><td style="padding:5px 8px;text-align:center">${l.remise?l.remise+"%":"—"}</td><td style="padding:5px 8px;text-align:right;color:#ef4444;font-weight:700">${fc(-sub)}</td></tr>`;}).join("");
  const logo=companyInfo.logo?`<img src="${companyInfo.logo}" style="height:48px;object-fit:contain;display:block;margin-bottom:4px"/>`:`<div style="font-size:24px;font-weight:900;background:linear-gradient(135deg,#ef4444,#dc2626);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:2px">BIQ</div>`;
  return`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Note de crédit ${numero}</title><style>body{font-family:Arial,sans-serif;color:#1a1a1a;margin:0;padding:24px;font-size:13px}table{width:100%;border-collapse:collapse}th{background:#ef4444;color:#fff;padding:6px 8px;text-align:left;font-size:11px}.tot{margin-left:auto;width:280px;margin-top:12px}.tr{display:flex;justify-content:space-between;padding:3px 0;font-size:12px}.tf{font-weight:900;font-size:15px;border-top:2px solid #1a1a1a;margin-top:4px;padding-top:4px;color:#ef4444}.notes{background:#f9f9f9;border-left:3px solid #ef4444;padding:10px 12px;margin-top:16px;font-size:12px}.ftr{margin-top:24px;padding-top:8px;border-top:1px solid #eee;font-size:10px;color:#888;text-align:center}@media print{body{padding:10px}}</style></head><body><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px"><div>${logo}<div style="margin-top:4px;font-weight:700;font-size:14px">${companyInfo.nom||""}</div><div style="font-size:11px;color:#555">${[companyInfo.adresse,companyInfo.ville,companyInfo.province].filter(Boolean).join(", ")}</div>${companyInfo.telephone?`<div style="font-size:11px;color:#555">${companyInfo.telephone}</div>`:""}${companyInfo.courriel?`<div style="font-size:11px;color:#555">${companyInfo.courriel}</div>`:""}</div><div style="text-align:right"><div style="font-size:26px;font-weight:900;color:#ef4444;letter-spacing:2px">NOTE DE CRÉDIT</div><div style="font-size:18px;font-weight:700;margin-top:4px"># ${numero}</div><div style="font-size:11px;color:#555;margin-top:3px">Date: ${fd(date)}</div>${factureNumero?`<div style="font-size:11px;color:#555;margin-top:3px">Facture d'origine: <strong>${factureNumero}</strong></div>`:""}<div style="font-size:11px;color:#555;margin-top:3px">Raison: ${raison==="Autre"?raisonDetail:raison}</div></div></div><div style="margin-bottom:16px"><div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Client</div><div style="line-height:1.6">${cli}</div></div><table><thead><tr><th>Description</th><th style="width:55px;text-align:center">Qté</th><th style="width:100px;text-align:right">Prix unit.</th><th style="width:65px;text-align:center">Remise</th><th style="width:100px;text-align:right">Crédit</th></tr></thead><tbody>${rows}</tbody></table><div class="tot"><div class="tr"><span>Sous-total</span><span style="color:#ef4444">${fc(-totals.sousTotal)}</span></div><div class="tr"><span>TPS (5%)</span><span style="color:#ef4444">${fc(-totals.tpsTotal)}</span></div><div class="tr"><span>TVQ (9.975%)</span><span style="color:#ef4444">${fc(-totals.tvqTotal)}</span></div><div class="tr tf"><span>CRÉDIT TOTAL</span><span>${fc(-totals.total)}</span></div></div>${notes?`<div class="notes"><strong>Notes</strong><br/>${notes}</div>`:""}<div class="ftr">${companyInfo.numeroTPS?`N° TPS: ${companyInfo.numeroTPS}`:""}${companyInfo.numeroTVQ?` &nbsp;|&nbsp; N° TVQ: ${companyInfo.numeroTVQ}`:""}</div></body></html>`;
}
function NoteDeCreditEditor({creditNote,clients,factures,companyInfo,docNums,saveDocNums,creditNotes,saveCreditNotes,saveFactures,onBack,initClientId,initFactureId}){
  const t=useT();
  const isNew=!creditNote?.id;
  const inputS={background:t.inputBg,border:`1px solid ${t.inputBorder}`,borderRadius:5,color:t.inputText,fontSize:12,padding:"5px 8px",outline:"none"};
  const resolvedFactureId=creditNote?.factureId||initFactureId||"";
  const initFac=useMemo(()=>factures.find(f=>f.id===resolvedFactureId),[factures,resolvedFactureId]);
  const fromInvoice=!!initFac;
  const [form,setForm]=useState(()=>creditNote?{...creditNote}:{clientId:initClientId||initFac?.clientId||"",factureId:resolvedFactureId,raison:"Erreur de facturation",raisonDetail:"",date:dk(new Date()),statut:"Brouillon",notes:""});
  // From-invoice selection lines (one per invoice line)
  const [selLines,setSelLines]=useState(()=>{
    if(creditNote?.selLines)return creditNote.selLines;
    if(initFac)return initFac.lignes.map(l=>({srcId:l.id,description:l.description||"",qtéOriginale:l.quantite||0,prixUnitaire:l.prixUnitaire||0,remise:l.remise||0,tps:l.tps!==false,tvq:l.tvq!==false,checked:false,qtéACréditer:"0",useOverride:false,montantOverride:""}));
    return[];
  });
  // Manual / custom lines (standalone: all lines; from-invoice: extra custom lines)
  const [manualLines,setManualLines]=useState(()=>{
    if(fromInvoice)return creditNote?.customLines||[];
    return creditNote?.lignes||[newLigne()];
  });
  const [savedId,setSavedId]=useState(creditNote?.id||null);
  const [saved,setSaved]=useState(false);
  const upd=f=>setForm(p=>({...p,...f}));
  const updSel=(srcId,f)=>setSelLines(ls=>ls.map(l=>l.srcId===srcId?{...l,...f}:l));
  const updManual=(id,f)=>setManualLines(ls=>ls.map(l=>l.id===id?{...l,...f}:l));
  const addManual=()=>setManualLines(ls=>[...ls,newLigne()]);
  const rmManual=id=>setManualLines(ls=>ls.filter(l=>l.id!==id));
  const creditTout=()=>setSelLines(ls=>ls.map(l=>({...l,checked:true,qtéACréditer:String(l.qtéOriginale)})));
  const activeLignes=useMemo(()=>{
    const lines=[];
    if(fromInvoice){
      for(const sl of selLines){
        if(!sl.checked)continue;
        if(sl.useOverride){const amt=parseFloat(sl.montantOverride)||0;if(amt<=0)continue;lines.push({id:sl.srcId,description:sl.description,quantite:1,prixUnitaire:amt,remise:0,tps:sl.tps,tvq:sl.tvq});}
        else{const qty=parseFloat(sl.qtéACréditer)||0;if(qty<=0)continue;lines.push({id:sl.srcId,description:sl.description,quantite:qty,prixUnitaire:sl.prixUnitaire,remise:sl.remise,tps:sl.tps,tvq:sl.tvq});}
      }
      for(const ml of manualLines){if((ml.prixUnitaire||0)>0||(ml.description||"").trim())lines.push(ml);}
    } else {
      lines.push(...manualLines);
    }
    return lines;
  },[fromInvoice,selLines,manualLines]);
  const totals=useMemo(()=>computeSoumTotals(activeLignes),[activeLignes]);
  const clientFactures=useMemo(()=>factures.filter(f=>f.clientId===form.clientId&&!["Annulée"].includes(f.statut)),[factures,form.clientId]);
  const client=clients.find(c=>c.id===form.clientId);
  const linkedFac=factures.find(f=>f.id===form.factureId);
  const facTotalAmt=linkedFac?computeSoumTotals(linkedFac.lignes).total:0;
  const alreadyCredited=linkedFac?(linkedFac.paiements||[]).filter(p=>p.fromCredit).reduce((s,p)=>s+(p.montant||0),0):0;
  const remainingCredit=Math.max(0,facTotalAmt-alreadyCredited);
  const creditExceedsAvailable=linkedFac&&totals.total>remainingCredit+0.005;
  const locked=!isNew&&form.statut!=="Brouillon";
  const canSave=form.clientId&&!(form.raison==="Autre"&&!form.raisonDetail?.trim())&&activeLignes.length>0&&totals.total>0&&!creditExceedsAvailable;
  const doSave=()=>{
    if(!canSave)return;
    const id=savedId||Date.now().toString();
    const numero=savedId?(creditNotes.find(n=>n.id===savedId)?.numero||fmtDocNum(docNums.prefix,"NC",docNums.creditNote)):fmtDocNum(docNums.prefix,"NC",docNums.creditNote);
    const creditAmount=linkedFac?Math.min(totals.total,remainingCredit):totals.total;
    const rec={...form,id,numero,lignes:activeLignes,selLines:fromInvoice?selLines:undefined,customLines:fromInvoice?manualLines:undefined};
    if(!savedId){
      saveCreditNotes([...creditNotes,rec]);
      saveDocNums({...docNums,creditNote:docNums.creditNote+1});
      logCreate('invoice','note_de_credit',id,rec);
      if(form.factureId&&linkedFac&&creditAmount>0){
        const pId=Date.now().toString()+"c";
        const newPaiements=[...(linkedFac.paiements||[]),{id:pId,numero,date:form.date,montant:creditAmount,mode:"Note de crédit",reference:numero,note:`Note de crédit ${numero}`,fromCredit:true}];
        const totalPaye=newPaiements.reduce((s,p)=>s+(p.montant||0),0);
        const solde=facTotalAmt-totalPaye;
        const newStatut=solde<=0.005?"Créditée":totalPaye>0?"Payée partiellement":linkedFac.statut;
        saveFactures(factures.map(f=>f.id===form.factureId?{...f,paiements:newPaiements,statut:newStatut}:f));
        logUpdate('invoice','facture',form.factureId,'statut',linkedFac.statut,newStatut);
      }
    } else {
      saveCreditNotes(creditNotes.map(n=>n.id===id?rec:n));
      logUpdate('invoice','note_de_credit',id,'document',null,JSON.stringify(rec));
    }
    setSavedId(id);setSaved(true);setTimeout(()=>setSaved(false),2000);
  };
  const doPrint=()=>savedId&&openPDF(buildNoteDeCreditHTML({...form,lignes:activeLignes,numero:creditNotes.find(n=>n.id===savedId)?.numero||"",factureNumero:linkedFac?.numero||"",clients,companyInfo}));
  return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    {/* Header bar */}
    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
      <button onClick={onBack} style={{background:"none",border:`1px solid ${t.cardBorder}`,borderRadius:5,color:t.textSub,fontSize:11,padding:"3px 10px",cursor:"pointer",fontWeight:600}}>← Retour</button>
      <span style={{fontSize:14,fontWeight:700,color:"#ef4444"}}>Note de crédit</span>
      {fromInvoice&&<span style={{fontSize:11,color:t.textMuted,background:"rgba(59,130,246,0.07)",padding:"2px 8px",borderRadius:5}}>sur facture <strong>{linkedFac?.numero||"—"}</strong></span>}
      {savedId&&<span style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:t.textMuted}}>{creditNotes.find(n=>n.id===savedId)?.numero}</span>}
      {savedId&&<span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:10,background:`${STATUT_NC_C[form.statut]}22`,color:STATUT_NC_C[form.statut]}}>{form.statut}</span>}
    </div>
    {/* Header fields */}
    <div style={{background:t.card,border:`1px solid rgba(239,68,68,0.2)`,borderRadius:9,padding:12}}>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
        <div style={{flex:"1 1 160px"}}>
          <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Client <span style={{color:"#ef4444"}}>*</span></div>
          <select value={form.clientId} onChange={e=>upd({clientId:e.target.value,factureId:""})} disabled={locked||fromInvoice} style={{...inputS,width:"100%",boxSizing:"border-box",borderColor:form.clientId?"":!locked?"#ef4444":undefined,opacity:fromInvoice?0.75:1}}>
            <option value="">— Choisir un client —</option>
            {clients.filter(c=>c.statut!=="inactif").map(c=><option key={c.id} value={c.id}>{c.entreprise}</option>)}
          </select>
        </div>
        <div style={{flex:"1 1 120px"}}>
          <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Date</div>
          <input type="date" value={form.date} onChange={e=>upd({date:e.target.value})} disabled={locked} style={{...inputS,width:"100%",boxSizing:"border-box",fontFamily:"'DM Mono',monospace"}}/>
        </div>
        <div style={{flex:"1 1 120px"}}>
          <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Statut</div>
          <select value={form.statut} onChange={e=>upd({statut:e.target.value})} style={{...inputS,width:"100%",boxSizing:"border-box",color:STATUT_NC_C[form.statut],fontWeight:700}}>
            {STATUTS_NC.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {!fromInvoice&&<div style={{flex:"1 1 160px"}}>
          <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Facture liée (optionnel)</div>
          <select value={form.factureId||""} onChange={e=>upd({factureId:e.target.value})} disabled={locked||!form.clientId||!isNew} style={{...inputS,width:"100%",boxSizing:"border-box",opacity:!form.clientId?0.5:1}}>
            <option value="">— Aucune (autonome) —</option>
            {clientFactures.map(f=><option key={f.id} value={f.id}>{f.numero} ({new Date(f.date+"T12:00:00").toLocaleDateString("fr-CA")})</option>)}
          </select>
        </div>}
        <div style={{flex:"1 1 160px"}}>
          <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Raison <span style={{color:"#ef4444"}}>*</span></div>
          <select value={form.raison} onChange={e=>upd({raison:e.target.value})} disabled={locked} style={{...inputS,width:"100%",boxSizing:"border-box"}}>
            {RAISONS_NC.map(r=><option key={r}>{r}</option>)}
          </select>
        </div>
        {form.raison==="Autre"&&<div style={{flex:"2 1 200px"}}>
          <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Explication <span style={{color:"#ef4444"}}>*</span></div>
          <input value={form.raisonDetail||""} onChange={e=>upd({raisonDetail:e.target.value})} placeholder="Décrivez la raison..." disabled={locked} style={{...inputS,width:"100%",boxSizing:"border-box"}}/>
        </div>}
      </div>
      {linkedFac&&<div style={{marginTop:8,fontSize:11,color:"#3b82f6",background:"rgba(59,130,246,0.06)",borderRadius:5,padding:"5px 8px",display:"flex",gap:12,flexWrap:"wrap"}}>
        <span>Facture <strong>{linkedFac.numero}</strong></span>
        <span>Total: <strong style={{fontFamily:"'DM Mono',monospace"}}>{fmt(facTotalAmt)}</strong></span>
        <span>Déjà crédité: <strong style={{fontFamily:"'DM Mono',monospace",color:"#8b5cf6"}}>{alreadyCredited>0?"("+fmt(alreadyCredited)+")":"—"}</strong></span>
        <span>Disponible: <strong style={{fontFamily:"'DM Mono',monospace",color:remainingCredit>0?"#22c55e":"#ef4444"}}>{fmt(remainingCredit)}</strong></span>
      </div>}
    </div>
    {/* FROM INVOICE: Selection table */}
    {fromInvoice&&<div style={{background:t.card,border:`1px solid rgba(239,68,68,0.15)`,borderRadius:9,padding:12}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <span style={{fontSize:12,fontWeight:700,color:t.text}}>Lignes de la facture d'origine</span>
        {!locked&&<button onClick={creditTout} style={{fontSize:10,padding:"3px 10px",borderRadius:5,border:"1px solid rgba(239,68,68,0.25)",background:"rgba(239,68,68,0.07)",color:"#ef4444",cursor:"pointer",fontWeight:700}}>Créditer tout</button>}
      </div>
      {/* Column headers */}
      <div style={{display:"grid",gridTemplateColumns:"24px 1fr 70px 90px 80px 80px 90px",gap:4,padding:"0 2px",marginBottom:4}}>
        {["","Description","Qté orig.","Qté à créd.","Prix unit.","Total",""].map((h,i)=><span key={i} style={{fontSize:9.5,color:t.textMuted,fontWeight:600,textAlign:i>=4?"right":"left"}}>{h}</span>)}
      </div>
      {selLines.map(sl=>{
        const subQty=(sl.prixUnitaire||0)*(parseFloat(sl.qtéACréditer)||0)*(1-(sl.remise||0)/100);
        const subAmt=parseFloat(sl.montantOverride)||0;
        const sub=sl.useOverride?subAmt:subQty;
        return(<div key={sl.srcId} style={{display:"grid",gridTemplateColumns:"24px 1fr 70px 90px 80px 80px 90px",gap:4,marginBottom:5,alignItems:"center",opacity:sl.checked?1:0.45}}>
          <input type="checkbox" checked={sl.checked} onChange={e=>updSel(sl.srcId,{checked:e.target.checked,qtéACréditer:e.target.checked?String(sl.qtéOriginale):"0"})} disabled={locked} style={{accentColor:"#ef4444"}}/>
          <span style={{fontSize:11,color:t.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={sl.description}>{sl.description||"—"}</span>
          <span style={{fontSize:11,color:t.textMuted,textAlign:"right",fontFamily:"'DM Mono',monospace"}}>{sl.qtéOriginale}</span>
          {sl.useOverride
            ?<input type="number" min="0" step="0.01" value={sl.montantOverride} onChange={e=>updSel(sl.srcId,{montantOverride:e.target.value})} disabled={locked||!sl.checked} placeholder="$" style={{...inputS,textAlign:"right",fontFamily:"'DM Mono',monospace",width:"100%",boxSizing:"border-box",fontSize:11}}/>
            :<input type="number" min="0" step="0.01" max={sl.qtéOriginale} value={sl.qtéACréditer} onChange={e=>updSel(sl.srcId,{qtéACréditer:e.target.value})} disabled={locked||!sl.checked} style={{...inputS,textAlign:"right",fontFamily:"'DM Mono',monospace",width:"100%",boxSizing:"border-box",fontSize:11}}/>}
          <span style={{fontSize:11,color:t.textMuted,textAlign:"right",fontFamily:"'DM Mono',monospace"}}>{sl.useOverride?"—":fmt(sl.prixUnitaire)}</span>
          <span style={{fontSize:11,fontWeight:700,color:sub>0?"#ef4444":t.textDim,textAlign:"right",fontFamily:"'DM Mono',monospace"}}>{sub>0?"("+fmt(sub)+")":"—"}</span>
          {!locked&&<button onClick={()=>updSel(sl.srcId,{useOverride:!sl.useOverride,montantOverride:""})} title={sl.useOverride?"Retour à la quantité":"Saisir un montant personnalisé"} style={{fontSize:9,padding:"2px 5px",borderRadius:4,border:`1px solid ${t.cardBorder}`,background:sl.useOverride?"rgba(139,92,246,0.08)":t.section,color:sl.useOverride?"#8b5cf6":t.textDim,cursor:"pointer",fontWeight:600}}>
            {sl.useOverride?"qty":"$"}
          </button>}
        </div>);
      })}
    </div>}
    {/* STANDALONE: Manual line items */}
    {!fromInvoice&&<div style={{background:t.card,border:`1px solid rgba(239,68,68,0.15)`,borderRadius:9,padding:12}}>
      <div style={{fontSize:12,fontWeight:700,color:t.text,marginBottom:8}}>Articles à créditer</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 60px 90px 60px 50px 50px 90px 24px",gap:4,marginBottom:4,padding:"0 2px"}}>
        {["Description","Qté","Prix unit.","Remise %","TPS","TVQ","Montant",""].map((h,i)=><span key={i} style={{fontSize:9.5,color:t.textMuted,fontWeight:600,textAlign:i>=4&&i<7?"center":i===6?"right":"left"}}>{h}</span>)}
      </div>
      {manualLines.map(l=>{const sub=(l.prixUnitaire||0)*(l.quantite||0)*(1-(l.remise||0)/100);return(
        <div key={l.id} style={{display:"grid",gridTemplateColumns:"1fr 60px 90px 60px 50px 50px 90px 24px",gap:4,marginBottom:4,alignItems:"center"}}>
          <input value={l.description||""} onChange={e=>updManual(l.id,{description:e.target.value})} placeholder="Description du crédit..." disabled={locked} style={{...inputS,width:"100%",boxSizing:"border-box"}}/>
          <input type="number" min="0.01" step="0.01" value={l.quantite||1} onChange={e=>updManual(l.id,{quantite:parseFloat(e.target.value)||0})} disabled={locked} style={{...inputS,textAlign:"right",fontFamily:"'DM Mono',monospace",width:"100%",boxSizing:"border-box"}}/>
          <input type="number" min="0" step="0.01" value={l.prixUnitaire||0} onChange={e=>updManual(l.id,{prixUnitaire:parseFloat(e.target.value)||0})} disabled={locked} style={{...inputS,textAlign:"right",fontFamily:"'DM Mono',monospace",width:"100%",boxSizing:"border-box"}}/>
          <input type="number" min="0" max="100" step="0.1" value={l.remise||0} onChange={e=>updManual(l.id,{remise:parseFloat(e.target.value)||0})} disabled={locked} style={{...inputS,textAlign:"right",fontFamily:"'DM Mono',monospace",width:"100%",boxSizing:"border-box"}}/>
          <div style={{textAlign:"center"}}><input type="checkbox" checked={l.tps!==false} onChange={e=>updManual(l.id,{tps:e.target.checked})} disabled={locked} style={{accentColor:"#ef4444"}}/></div>
          <div style={{textAlign:"center"}}><input type="checkbox" checked={l.tvq!==false} onChange={e=>updManual(l.id,{tvq:e.target.checked})} disabled={locked} style={{accentColor:"#ef4444"}}/></div>
          <span style={{textAlign:"right",fontFamily:"'DM Mono',monospace",fontSize:12,color:"#ef4444",fontWeight:700}}>({fmt(sub)})</span>
          {!locked&&<button onClick={()=>rmManual(l.id)} disabled={manualLines.length===1} style={{background:"none",border:"none",color:"#ef4444",cursor:manualLines.length===1?"default":"pointer",fontSize:13,opacity:manualLines.length===1?0.3:1}}>✕</button>}
        </div>
      );})}
      {!locked&&<button onClick={addManual} style={{fontSize:11,padding:"3px 10px",borderRadius:5,border:"1px solid rgba(239,68,68,0.2)",background:"rgba(239,68,68,0.05)",color:"#ef4444",cursor:"pointer",fontWeight:600,marginTop:4}}>+ Ligne</button>}
    </div>}
    {/* CUSTOM LINES (from-invoice mode extra lines) */}
    {fromInvoice&&<div style={{background:t.card,border:`1px solid rgba(239,68,68,0.1)`,borderRadius:9,padding:12}}>
      <div style={{fontSize:12,fontWeight:700,color:t.text,marginBottom:8}}>Lignes personnalisées <span style={{fontSize:10,color:t.textMuted,fontWeight:400}}>(optionnel — ex: article brisé dans une caisse)</span></div>
      {manualLines.map(l=>{const sub=(l.prixUnitaire||0)*(l.quantite||0)*(1-(l.remise||0)/100);return(
        <div key={l.id} style={{display:"grid",gridTemplateColumns:"1fr 60px 90px 50px 50px 90px 24px",gap:4,marginBottom:4,alignItems:"center"}}>
          <input value={l.description||""} onChange={e=>updManual(l.id,{description:e.target.value})} placeholder="ex: 1 article brisé dans case de 24..." disabled={locked} style={{...inputS,width:"100%",boxSizing:"border-box"}}/>
          <input type="number" min="0.01" step="0.01" value={l.quantite||1} onChange={e=>updManual(l.id,{quantite:parseFloat(e.target.value)||0})} disabled={locked} style={{...inputS,textAlign:"right",fontFamily:"'DM Mono',monospace",width:"100%",boxSizing:"border-box"}}/>
          <input type="number" min="0" step="0.01" value={l.prixUnitaire||0} onChange={e=>updManual(l.id,{prixUnitaire:parseFloat(e.target.value)||0})} disabled={locked} style={{...inputS,textAlign:"right",fontFamily:"'DM Mono',monospace",width:"100%",boxSizing:"border-box"}}/>
          <div style={{textAlign:"center"}}><input type="checkbox" checked={l.tps!==false} onChange={e=>updManual(l.id,{tps:e.target.checked})} disabled={locked} style={{accentColor:"#ef4444"}}/></div>
          <div style={{textAlign:"center"}}><input type="checkbox" checked={l.tvq!==false} onChange={e=>updManual(l.id,{tvq:e.target.checked})} disabled={locked} style={{accentColor:"#ef4444"}}/></div>
          <span style={{textAlign:"right",fontFamily:"'DM Mono',monospace",fontSize:12,color:"#ef4444",fontWeight:700}}>({fmt(sub)})</span>
          {!locked&&<button onClick={()=>rmManual(l.id)} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:13}}>✕</button>}
        </div>
      );})}
      {!locked&&<button onClick={addManual} style={{fontSize:11,padding:"3px 10px",borderRadius:5,border:"1px solid rgba(239,68,68,0.2)",background:"rgba(239,68,68,0.05)",color:"#ef4444",cursor:"pointer",fontWeight:600,marginTop:4}}>+ Ligne personnalisée</button>}
    </div>}
    {/* Totals */}
    <div style={{display:"flex",justifyContent:"flex-end"}}>
      <div style={{width:280,display:"flex",flexDirection:"column",gap:3}}>
        {[["Sous-total",totals.sousTotal],["TPS (5%)",totals.tpsTotal],["TVQ (9.975%)",totals.tvqTotal]].map(([l,v])=>(
          <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:12,color:t.textSub}}>
            <span>{l}</span><span style={{fontFamily:"'DM Mono',monospace",color:"#ef4444"}}>({fmt(v)})</span>
          </div>
        ))}
        <div style={{display:"flex",justifyContent:"space-between",fontSize:14,fontWeight:900,color:"#ef4444",borderTop:`1px solid ${t.dividerMid}`,paddingTop:4,marginTop:2}}>
          <span>CRÉDIT TOTAL</span><span style={{fontFamily:"'DM Mono',monospace"}}>({fmt(totals.total)})</span>
        </div>
        {creditExceedsAvailable&&<div style={{fontSize:10,color:"#ef4444",background:"rgba(239,68,68,0.08)",borderRadius:4,padding:"3px 6px",marginTop:2}}>⚠ Dépasse le solde disponible ({fmt(remainingCredit)})</div>}
      </div>
    </div>
    {/* Notes */}
    <div>
      <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Notes internes (optionnel)</div>
      <textarea value={form.notes||""} onChange={e=>upd({notes:e.target.value})} rows={2} style={{...inputS,width:"100%",boxSizing:"border-box",resize:"vertical"}}/>
    </div>
    {/* Actions */}
    <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
      <button onClick={doSave} disabled={!canSave} style={{padding:"6px 18px",borderRadius:6,border:"none",background:canSave?"linear-gradient(135deg,#ef4444,#dc2626)":"rgba(255,255,255,0.05)",color:canSave?"#fff":t.textDim,cursor:canSave?"pointer":"default",fontWeight:700,fontSize:12,fontFamily:"'Outfit',sans-serif"}}>✓ {savedId?"Sauvegarder":"Créer la note de crédit"}</button>
      {saved&&<span style={{fontSize:11,color:"#22c55e",fontWeight:600}}>Sauvegardé ✓</span>}
      {savedId&&<button onClick={doPrint} style={{padding:"5px 10px",borderRadius:6,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:"pointer",fontWeight:600,fontSize:11}}>🖨️ Imprimer</button>}
    </div>
  </div>);
}

// ── CLIENTS ──
const CONDITIONS_PAIEMENT=["Sur réception","Net 15","Net 30","Net 45","Net 60","Personnalisé"];
function genClientCode(clients){
  const nums=clients.map(c=>{const m=c.code?.match(/^CLI-(\d+)$/);return m?parseInt(m[1]):0});
  const max=nums.length?Math.max(...nums):0;
  return`CLI-${String(max+1).padStart(3,"0")}`;
}
function ClientForm({form,setForm,inputS,t,autoFocusEntreprise}){
  return(<div style={{display:"flex",flexDirection:"column",gap:7}}>
    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
      <div style={{flex:"1 1 100px"}}>
        <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Code client</div>
        <input value={form.code||""} onChange={e=>setForm(f=>({...f,code:e.target.value}))} placeholder="auto-généré" style={{...inputS,width:"100%",boxSizing:"border-box",fontFamily:"'DM Mono',monospace"}}/>
      </div>
      <div style={{flex:"3 1 200px"}}>
        <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Entreprise <span style={{color:"#f97316"}}>*</span></div>
        <input value={form.entreprise||""} onChange={e=>setForm(f=>({...f,entreprise:e.target.value}))} placeholder="Nom de l'entreprise" autoFocus={!!autoFocusEntreprise} style={{...inputS,width:"100%",boxSizing:"border-box"}}/>
      </div>
      <div style={{flex:"2 1 160px"}}>
        <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Contact</div>
        <input value={form.contact||""} onChange={e=>setForm(f=>({...f,contact:e.target.value}))} placeholder="Nom du contact" style={{...inputS,width:"100%",boxSizing:"border-box"}}/>
      </div>
    </div>
    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
      <div style={{flex:"2 1 180px"}}>
        <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Adresse</div>
        <input value={form.adresse||""} onChange={e=>setForm(f=>({...f,adresse:e.target.value}))} placeholder="123 rue Principale" style={{...inputS,width:"100%",boxSizing:"border-box"}}/>
      </div>
      <div style={{flex:"1 1 120px"}}>
        <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Ville</div>
        <input value={form.ville||""} onChange={e=>setForm(f=>({...f,ville:e.target.value}))} placeholder="Montréal" style={{...inputS,width:"100%",boxSizing:"border-box"}}/>
      </div>
      <div style={{flex:"0 0 80px"}}>
        <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Province</div>
        <select value={form.province||"QC"} onChange={e=>setForm(f=>({...f,province:e.target.value}))} style={{...inputS,width:"100%",boxSizing:"border-box"}}>
          {PROVINCES_CA.map(p=><option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div style={{flex:"1 1 90px"}}>
        <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Code postal</div>
        <input value={form.codePostal||""} onChange={e=>setForm(f=>({...f,codePostal:e.target.value}))} placeholder="H1A 1A1" style={{...inputS,width:"100%",boxSizing:"border-box",fontFamily:"'DM Mono',monospace"}}/>
      </div>
      <div style={{flex:"1 1 100px"}}>
        <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Pays</div>
        <input value={form.pays||"Canada"} onChange={e=>setForm(f=>({...f,pays:e.target.value}))} placeholder="Canada" style={{...inputS,width:"100%",boxSizing:"border-box"}}/>
      </div>
    </div>
    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
      <div style={{flex:"1 1 130px"}}>
        <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Téléphone #1</div>
        <input value={form.tel1||""} onChange={e=>setForm(f=>({...f,tel1:e.target.value}))} placeholder="514-555-0000" style={{...inputS,width:"100%",boxSizing:"border-box",fontFamily:"'DM Mono',monospace"}}/>
      </div>
      <div style={{flex:"1 1 130px"}}>
        <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Téléphone #2</div>
        <input value={form.tel2||""} onChange={e=>setForm(f=>({...f,tel2:e.target.value}))} placeholder="450-555-0000" style={{...inputS,width:"100%",boxSizing:"border-box",fontFamily:"'DM Mono',monospace"}}/>
      </div>
      <div style={{flex:"1 1 130px"}}>
        <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Cellulaire</div>
        <input value={form.cell||""} onChange={e=>setForm(f=>({...f,cell:e.target.value}))} placeholder="514-555-0000" style={{...inputS,width:"100%",boxSizing:"border-box",fontFamily:"'DM Mono',monospace"}}/>
      </div>
      <div style={{flex:"2 1 180px"}}>
        <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Courriel</div>
        <input type="email" value={form.courriel||""} onChange={e=>setForm(f=>({...f,courriel:e.target.value}))} placeholder="client@exemple.com" style={{...inputS,width:"100%",boxSizing:"border-box"}}/>
      </div>
    </div>
    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
      <div style={{flex:"1 1 120px"}}>
        <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Langue</div>
        <select value={form.langue||"Français"} onChange={e=>setForm(f=>({...f,langue:e.target.value}))} style={{...inputS,width:"100%",boxSizing:"border-box"}}>
          <option>Français</option><option>English</option>
        </select>
      </div>
      <div style={{flex:"1 1 180px"}}>
        <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Conditions de paiement</div>
        <select value={form.conditionsPaiement||"Net 30"} onChange={e=>setForm(f=>({...f,conditionsPaiement:e.target.value}))} style={{...inputS,width:"100%",boxSizing:"border-box"}}>
          {CONDITIONS_PAIEMENT.map(c=><option key={c}>{c}</option>)}
        </select>
      </div>
      {form.conditionsPaiement==="Personnalisé"&&(
        <div style={{flex:"0 0 100px"}}>
          <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Nombre de jours</div>
          <input type="number" min="1" value={form.nbJours||""} onChange={e=>setForm(f=>({...f,nbJours:e.target.value}))} placeholder="45" style={{...inputS,width:"100%",boxSizing:"border-box"}}/>
        </div>
      )}
    </div>
    <div>
      <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Notes internes</div>
      <textarea value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Notes internes..." rows={2} style={{...inputS,width:"100%",boxSizing:"border-box",resize:"vertical",fontFamily:"'Outfit',sans-serif"}}/>
    </div>
  </div>);
}
function ClientProfile({client,saveClient,onBack,onNewDoc,onOpenDoc,soumissions,commandes,factures,inputS,t}){
  const [form,setForm]=useState({...client});
  const [profileTab,setProfileTab]=useState("factures");
  const [saved,setSaved]=useState(false);
  const doSave=()=>{if(!form.entreprise?.trim())return;saveClient({...form,entreprise:form.entreprise.trim()});setSaved(true);setTimeout(()=>setSaved(false),2000);};
  const toggleStatut=()=>{const updated={...form,statut:form.statut==="actif"?"inactif":"actif"};setForm(updated);saveClient(updated);};
  // Per-client filtered lists, sorted date desc
  const cId=client.id;
  const cFac=useMemo(()=>[...(factures||[]).filter(f=>f.clientId===cId)].sort((a,b)=>(b.date||"").localeCompare(a.date||"")),[factures,cId]);
  const cCmd=useMemo(()=>[...(commandes||[]).filter(f=>f.clientId===cId)].sort((a,b)=>(b.date||"").localeCompare(a.date||"")),[commandes,cId]);
  const cSou=useMemo(()=>[...(soumissions||[]).filter(f=>f.clientId===cId)].sort((a,b)=>(b.date||"").localeCompare(a.date||"")),[soumissions,cId]);
  const cPaiements=useMemo(()=>{const rows=[];for(const f of cFac){for(const p of f.paiements||[]){if(!p.fromCredit)rows.push({...p,factureNumero:f.numero,factureId:f.id});}}return rows.sort((a,b)=>(b.date||"").localeCompare(a.date||""));},[cFac]);
  const soldeDu=useMemo(()=>cFac.filter(f=>!["Payée","Créditée","Annulée","Brouillon"].includes(f.statut)).reduce((s,f)=>{const paye=(f.paiements||[]).reduce((ps,p)=>ps+(p.montant||0),0);return s+Math.max(0,computeSoumTotals(f.lignes||[]).total-paye);},(0)),[cFac]);
  const SC=(type,statut)=>type==="soumission"?STATUT_SOUM_C[statut]||"#6b7280":type==="commande"?STATUT_CMD_C[statut]||"#6b7280":STATUT_FAC_C[statut]||"#6b7280";
  const rowS={display:"grid",gap:6,padding:"6px 6px",borderBottom:`1px solid ${t.divider}`,cursor:"pointer",alignItems:"center"};
  const EmptyMsg=()=><div style={{textAlign:"center",padding:"20px 0",color:t.textMuted,fontSize:11}}>Aucun enregistrement.</div>;
  const HISTORY_TABS=[{id:"factures",label:`Factures (${cFac.length})`},{id:"commandes",label:`Commandes (${cCmd.length})`},{id:"soumissions",label:`Soumissions (${cSou.length})`},{id:"encaissements",label:`Encaissements (${cPaiements.length})`},{id:"notes",label:"Notes"}];
  return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
      <button onClick={onBack} style={{background:"none",border:`1px solid ${t.cardBorder}`,borderRadius:5,color:t.textSub,fontSize:11,padding:"3px 10px",cursor:"pointer",fontWeight:600}}>← Retour</button>
      <div style={{flex:1}}>
        <span style={{fontSize:14,fontWeight:700,color:t.text}}>{client.entreprise}</span>
        <span style={{fontSize:10,color:t.textMuted,fontFamily:"'DM Mono',monospace",marginLeft:8}}>{client.code}</span>
        {client.statut==="inactif"&&<span style={{fontSize:9,color:"#ef4444",marginLeft:8,fontWeight:700}}>INACTIF</span>}
      </div>
      {soldeDu>0.005&&<div style={{background:"rgba(249,115,22,0.08)",border:"1px solid rgba(249,115,22,0.2)",borderRadius:7,padding:"5px 12px",textAlign:"right"}}>
        <div style={{fontSize:9,color:t.textMuted,textTransform:"uppercase",letterSpacing:"0.5px"}}>Solde dû</div>
        <div style={{fontSize:14,fontWeight:900,color:"#f97316",fontFamily:"'DM Mono',monospace"}}>{fmt(soldeDu)}</div>
      </div>}
      <button onClick={toggleStatut} style={{background:form.statut==="inactif"?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.07)",border:"none",borderRadius:5,color:form.statut==="inactif"?"#16a34a":"#ef4444",fontSize:10,padding:"4px 10px",cursor:"pointer",fontWeight:700}}>
        {form.statut==="inactif"?"Réactiver":"Désactiver"}
      </button>
    </div>
    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
      <button onClick={()=>onNewDoc&&onNewDoc("soumission",cId)} style={{fontSize:10,padding:"4px 10px",borderRadius:5,border:"1px solid rgba(249,115,22,0.25)",background:"rgba(249,115,22,0.07)",color:"#f97316",cursor:"pointer",fontWeight:700}}>+ Nouvelle soumission</button>
      <button onClick={()=>onNewDoc&&onNewDoc("commande",cId)} style={{fontSize:10,padding:"4px 10px",borderRadius:5,border:"1px solid rgba(249,115,22,0.25)",background:"rgba(249,115,22,0.07)",color:"#f97316",cursor:"pointer",fontWeight:700}}>+ Nouvelle commande</button>
      <button onClick={()=>onNewDoc&&onNewDoc("facture",cId)} style={{fontSize:10,padding:"4px 10px",borderRadius:5,border:"1px solid rgba(249,115,22,0.25)",background:"rgba(249,115,22,0.07)",color:"#f97316",cursor:"pointer",fontWeight:700}}>+ Nouvelle facture</button>
      <button onClick={()=>onNewDoc&&onNewDoc("encaissement",cId)} style={{fontSize:10,padding:"4px 10px",borderRadius:5,border:"1px solid rgba(249,115,22,0.25)",background:"rgba(249,115,22,0.07)",color:"#f97316",cursor:"pointer",fontWeight:700}}>+ Nouvel encaissement</button>
      <button onClick={()=>onNewDoc&&onNewDoc("creditnote",cId)} style={{fontSize:10,padding:"4px 10px",borderRadius:5,border:"1px solid rgba(239,68,68,0.3)",background:"rgba(239,68,68,0.07)",color:"#ef4444",cursor:"pointer",fontWeight:700}}>+ Note de crédit</button>
      <button disabled title="Bientôt disponible" style={{fontSize:10,padding:"4px 10px",borderRadius:5,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textDim,cursor:"default",fontWeight:600,opacity:0.5}}>État de compte</button>
    </div>
    <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:12}}>
      <ClientForm form={form} setForm={setForm} inputS={inputS} t={t}/>
      <div style={{display:"flex",gap:6,marginTop:10,alignItems:"center"}}>
        <button onClick={doSave} disabled={!form.entreprise?.trim()} style={{padding:"6px 16px",borderRadius:6,border:"none",background:form.entreprise?.trim()?"linear-gradient(135deg,#f97316,#ea580c)":"rgba(255,255,255,0.05)",color:form.entreprise?.trim()?"#fff":t.textDim,cursor:form.entreprise?.trim()?"pointer":"default",fontWeight:700,fontSize:12,fontFamily:"'Outfit',sans-serif"}}>✓ Sauvegarder</button>
        {saved&&<span style={{fontSize:11,color:"#22c55e",fontWeight:600}}>Sauvegardé ✓</span>}
      </div>
    </div>
    {/* History tabs */}
    <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:12}}>
      <div style={{display:"flex",gap:1,borderBottom:`1px solid ${t.dividerMid}`,marginBottom:10,overflowX:"auto"}}>
        {HISTORY_TABS.map(ht=>(
          <button key={ht.id} onClick={()=>setProfileTab(ht.id)} style={{background:"none",border:"none",color:profileTab===ht.id?"#f97316":t.textMuted,fontSize:11,fontWeight:600,padding:"4px 10px",cursor:"pointer",borderBottom:profileTab===ht.id?"2px solid #f97316":"2px solid transparent",whiteSpace:"nowrap"}}>{ht.label}</button>
        ))}
      </div>
      {/* Factures */}
      {profileTab==="factures"&&(cFac.length===0?<EmptyMsg/>:<div>
        <div style={{display:"grid",gridTemplateColumns:"90px 80px 1fr 80px 80px",gap:6,padding:"2px 6px",borderBottom:`1px solid ${t.dividerMid}`,marginBottom:2}}>
          {["# Facture","Date","Statut","Total","Solde"].map((h,i)=><span key={i} style={{fontSize:9.5,color:t.textMuted,fontWeight:600,textAlign:i>=3?"right":"left"}}>{h}</span>)}
        </div>
        {cFac.map(f=>{const tot=computeSoumTotals(f.lignes||[]).total;const paye=(f.paiements||[]).reduce((s,p)=>s+(p.montant||0),0);const sol=Math.max(0,tot-paye);const sc=STATUT_FAC_C[f.statut]||"#6b7280";const isOD=["Envoyée","Payée partiellement"].includes(f.statut)&&f.dateEcheance&&f.dateEcheance<dk(new Date());return(
          <div key={f.id} onClick={()=>onOpenDoc&&onOpenDoc("facture",f.clientId,f)} style={{...rowS,gridTemplateColumns:"90px 80px 1fr 80px 80px"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(249,115,22,0.04)"} onMouseLeave={e=>e.currentTarget.style.background=""}>
            <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:600,color:t.text}}>{f.numero||"—"}</span>
            <span style={{fontSize:11,color:t.textSub,fontFamily:"'DM Mono',monospace"}}>{f.date||"—"}</span>
            <span style={{fontSize:10,fontWeight:700,padding:"1px 7px",borderRadius:8,background:`${sc}18`,color:sc,width:"fit-content"}}>{isOD?"En retard ⚠":f.statut}</span>
            <span style={{fontSize:11,textAlign:"right",fontFamily:"'DM Mono',monospace",color:t.textSub}}>{fmt(tot)}</span>
            <span style={{fontSize:11,textAlign:"right",fontFamily:"'DM Mono',monospace",fontWeight:sol>0.005?700:400,color:sol>0.005?"#f97316":t.textDim}}>{sol>0.005?fmt(sol):"—"}</span>
          </div>
        );})}
      </div>)}
      {/* Commandes */}
      {profileTab==="commandes"&&(cCmd.length===0?<EmptyMsg/>:<div>
        <div style={{display:"grid",gridTemplateColumns:"100px 80px 1fr 90px",gap:6,padding:"2px 6px",borderBottom:`1px solid ${t.dividerMid}`,marginBottom:2}}>
          {["# Commande","Date","Statut","Total"].map((h,i)=><span key={i} style={{fontSize:9.5,color:t.textMuted,fontWeight:600,textAlign:i===3?"right":"left"}}>{h}</span>)}
        </div>
        {cCmd.map(d=>{const tot=computeSoumTotals(d.lignes||[]).total;const sc=STATUT_CMD_C[d.statut]||"#6b7280";return(
          <div key={d.id} onClick={()=>onOpenDoc&&onOpenDoc("commande",d.clientId,d)} style={{...rowS,gridTemplateColumns:"100px 80px 1fr 90px"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(249,115,22,0.04)"} onMouseLeave={e=>e.currentTarget.style.background=""}>
            <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:600,color:t.text}}>{d.numero||"—"}</span>
            <span style={{fontSize:11,color:t.textSub,fontFamily:"'DM Mono',monospace"}}>{d.date||"—"}</span>
            <span style={{fontSize:10,fontWeight:700,padding:"1px 7px",borderRadius:8,background:`${sc}18`,color:sc,width:"fit-content"}}>{d.statut}</span>
            <span style={{fontSize:11,textAlign:"right",fontFamily:"'DM Mono',monospace",color:t.textSub}}>{fmt(tot)}</span>
          </div>
        );})}
      </div>)}
      {/* Soumissions */}
      {profileTab==="soumissions"&&(cSou.length===0?<EmptyMsg/>:<div>
        <div style={{display:"grid",gridTemplateColumns:"100px 80px 1fr 90px",gap:6,padding:"2px 6px",borderBottom:`1px solid ${t.dividerMid}`,marginBottom:2}}>
          {["# Soumission","Date","Statut","Total"].map((h,i)=><span key={i} style={{fontSize:9.5,color:t.textMuted,fontWeight:600,textAlign:i===3?"right":"left"}}>{h}</span>)}
        </div>
        {cSou.map(d=>{const tot=computeSoumTotals(d.lignes||[]).total;const sc=STATUT_SOUM_C[d.statut]||"#6b7280";return(
          <div key={d.id} onClick={()=>onOpenDoc&&onOpenDoc("soumission",d.clientId,d)} style={{...rowS,gridTemplateColumns:"100px 80px 1fr 90px"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(249,115,22,0.04)"} onMouseLeave={e=>e.currentTarget.style.background=""}>
            <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:600,color:t.text}}>{d.numero||"—"}</span>
            <span style={{fontSize:11,color:t.textSub,fontFamily:"'DM Mono',monospace"}}>{d.date||"—"}</span>
            <span style={{fontSize:10,fontWeight:700,padding:"1px 7px",borderRadius:8,background:`${sc}18`,color:sc,width:"fit-content"}}>{d.statut}</span>
            <span style={{fontSize:11,textAlign:"right",fontFamily:"'DM Mono',monospace",color:t.textSub}}>{fmt(tot)}</span>
          </div>
        );})}
      </div>)}
      {/* Encaissements */}
      {profileTab==="encaissements"&&(cPaiements.length===0?<EmptyMsg/>:<div>
        <div style={{display:"grid",gridTemplateColumns:"90px 80px 90px 1fr 80px",gap:6,padding:"2px 6px",borderBottom:`1px solid ${t.dividerMid}`,marginBottom:2}}>
          {["# Reçu","Date","Montant","Mode","# Facture"].map((h,i)=><span key={i} style={{fontSize:9.5,color:t.textMuted,fontWeight:600,textAlign:i===2?"right":"left"}}>{h}</span>)}
        </div>
        {cPaiements.map(p=>(
          <div key={p.id} onClick={()=>{const f=cFac.find(f=>f.id===p.factureId);if(f&&onOpenDoc)onOpenDoc("facture",f.clientId,f);}} style={{...rowS,gridTemplateColumns:"90px 80px 90px 1fr 80px"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(249,115,22,0.04)"} onMouseLeave={e=>e.currentTarget.style.background=""}>
            <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:t.text}}>{p.numero||"—"}</span>
            <span style={{fontSize:11,color:t.textSub,fontFamily:"'DM Mono',monospace"}}>{p.date||"—"}</span>
            <span style={{fontSize:11,textAlign:"right",fontFamily:"'DM Mono',monospace",color:"#22c55e",fontWeight:700}}>{fmt(p.montant)}</span>
            <span style={{fontSize:11,color:t.textSub}}>{p.mode||"—"}</span>
            <span style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:t.textMuted}}>{p.factureNumero||"—"}</span>
          </div>
        ))}
      </div>)}
      {profileTab==="notes"&&<EmptyMsg/>}
    </div>
  </div>);
}
function ClientsSection({clients,saveClients,onNewDoc,onOpenDoc,soumissions,commandes,factures}){
  const t=useT();
  const inputS={background:t.inputBg,border:`1px solid ${t.inputBorder}`,borderRadius:5,color:t.inputText,fontSize:12,padding:"5px 8px",outline:"none"};
  const BLANK={code:"",entreprise:"",contact:"",adresse:"",ville:"",province:"QC",codePostal:"",pays:"Canada",tel1:"",tel2:"",cell:"",courriel:"",langue:"Français",conditionsPaiement:"Net 30",nbJours:"",notes:"",statut:"actif"};
  const [search,setSearch]=useState("");
  const [filterStatut,setFilterStatut]=useState("actif");
  const [sortCol,setSortCol]=useState("entreprise");
  const [sortAsc,setSortAsc]=useState(true);
  const [selectedId,setSelectedId]=useState(null);
  const [addOpen,setAddOpen]=useState(false);
  const [form,setForm]=useState(BLANK);
  const filtered=useMemo(()=>{
    let list=clients;
    if(filterStatut!=="tous")list=list.filter(c=>c.statut===filterStatut);
    if(search.trim()){const q=search.toLowerCase();list=list.filter(c=>c.code?.toLowerCase().includes(q)||c.entreprise?.toLowerCase().includes(q)||c.contact?.toLowerCase().includes(q));}
    return[...list].sort((a,b)=>{const av=a[sortCol]||"",bv=b[sortCol]||"";return sortAsc?av.localeCompare(bv,"fr"):bv.localeCompare(av,"fr");});
  },[clients,filterStatut,search,sortCol,sortAsc]);
  const addClient=()=>{
    if(!form.entreprise.trim())return;
    const code=form.code.trim()||genClientCode(clients);
    saveClients([...clients,{...form,id:Date.now().toString(),code,entreprise:form.entreprise.trim()}]);
    setForm(BLANK);setAddOpen(false);
  };
  const saveClient=updated=>saveClients(clients.map(c=>c.id===updated.id?updated:c));
  const ColH=({col,label,right})=>(
    <span onClick={()=>{if(sortCol===col)setSortAsc(a=>!a);else{setSortCol(col);setSortAsc(true);}}} style={{fontSize:9.5,color:sortCol===col?"#f97316":t.textMuted,fontWeight:600,cursor:"pointer",userSelect:"none",textAlign:right?"right":"left"}}>
      {label}{sortCol===col?(sortAsc?" ↑":" ↓"):""}
    </span>
  );
  if(selectedId){
    const client=clients.find(c=>c.id===selectedId);
    if(!client){setSelectedId(null);return null;}
    return<ClientProfile client={client} saveClient={saveClient} onBack={()=>setSelectedId(null)} onNewDoc={onNewDoc} onOpenDoc={onOpenDoc} soumissions={soumissions} commandes={commandes} factures={factures} inputS={inputS} t={t}/>;
  }
  return(<div style={{display:"flex",flexDirection:"column",gap:8}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <span style={{fontSize:13.5,fontWeight:700,color:t.text}}>Clients</span>
        <span style={{fontSize:11,color:t.textMuted}}>{clients.filter(c=>c.statut==="actif").length} actif{clients.filter(c=>c.statut==="actif").length!==1?"s":""}</span>
      </div>
      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher..." style={{...inputS,fontSize:11,padding:"4px 8px"}}/>
        <div style={{display:"flex",gap:2}}>
          {[{v:"actif",l:"Actifs"},{v:"inactif",l:"Inactifs"},{v:"tous",l:"Tous"}].map(({v,l})=>(
            <button key={v} onClick={()=>setFilterStatut(v)} style={{fontSize:10,padding:"3px 8px",borderRadius:5,border:`1px solid ${t.cardBorder}`,background:filterStatut===v?"rgba(249,115,22,0.08)":t.section,color:filterStatut===v?"#f97316":t.textSub,cursor:"pointer",fontWeight:600}}>{l}</button>
          ))}
        </div>
        <button onClick={()=>{setAddOpen(o=>!o);setForm(BLANK);}} style={{fontSize:11,padding:"4px 12px",borderRadius:6,border:"1px solid rgba(249,115,22,0.25)",background:"rgba(249,115,22,0.08)",color:"#f97316",cursor:"pointer",fontWeight:700}}>+ Nouveau client</button>
      </div>
    </div>
    {addOpen&&(<div style={{background:t.card,border:"1px solid rgba(249,115,22,0.2)",borderRadius:9,padding:12}}>
      <span style={{fontSize:12,fontWeight:700,color:"#f97316",display:"block",marginBottom:8}}>Nouveau client</span>
      <ClientForm form={form} setForm={setForm} inputS={inputS} t={t} autoFocusEntreprise/>
      <div style={{display:"flex",gap:6,marginTop:8}}>
        <button onClick={addClient} disabled={!form.entreprise.trim()} style={{padding:"6px 16px",borderRadius:6,border:"none",background:form.entreprise.trim()?"linear-gradient(135deg,#f97316,#ea580c)":"rgba(255,255,255,0.05)",color:form.entreprise.trim()?"#fff":t.textDim,cursor:form.entreprise.trim()?"pointer":"default",fontWeight:700,fontSize:12,fontFamily:"'Outfit',sans-serif"}}>Ajouter</button>
        <button onClick={()=>{setAddOpen(false);setForm(BLANK);}} style={{padding:"6px 12px",borderRadius:6,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:"pointer",fontWeight:600,fontSize:12,fontFamily:"'Outfit',sans-serif"}}>Annuler</button>
      </div>
    </div>)}
    {filtered.length>0&&(<div style={{display:"grid",gridTemplateColumns:"90px 2fr 1.5fr 1fr 1fr 100px",gap:6,padding:"3px 8px",borderBottom:`1px solid ${t.dividerMid}`}}>
      <ColH col="code" label="Code"/><ColH col="entreprise" label="Entreprise"/><ColH col="contact" label="Contact"/><ColH col="ville" label="Ville"/>
      <span style={{fontSize:9.5,color:t.textMuted,fontWeight:600}}>Téléphone</span>
      <ColH col="_solde" label="Solde dû" right/>
    </div>)}
    {filtered.length===0&&!addOpen&&(<div style={{textAlign:"center",padding:"24px 0",color:t.textMuted,fontSize:12}}>
      {clients.length===0?"Aucun client — cliquez sur \"+ Nouveau client\" pour commencer.":"Aucun résultat."}
    </div>)}
    {filtered.map(c=>(
      <div key={c.id} onClick={()=>setSelectedId(c.id)}
        style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:7,padding:"7px 10px",cursor:"pointer",opacity:c.statut==="inactif"?0.55:1,display:"grid",gridTemplateColumns:"90px 2fr 1.5fr 1fr 1fr 100px",gap:6,alignItems:"center",transition:"border-color 0.15s"}}
        onMouseEnter={e=>e.currentTarget.style.borderColor="#f97316"}
        onMouseLeave={e=>e.currentTarget.style.borderColor=t.cardBorder}>
        <span style={{fontSize:10,color:t.textMuted,fontFamily:"'DM Mono',monospace"}}>{c.code}</span>
        <span style={{fontSize:12,fontWeight:600,color:t.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.entreprise}</span>
        <span style={{fontSize:11,color:t.textSub,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.contact||"—"}</span>
        <span style={{fontSize:11,color:t.textSub}}>{c.ville||"—"}</span>
        <span style={{fontSize:11,color:t.textSub,fontFamily:"'DM Mono',monospace"}}>{c.tel1||"—"}</span>
        <span style={{fontSize:11,color:t.textSub,textAlign:"right",fontFamily:"'DM Mono',monospace"}}>0,00 $</span>
      </div>
    ))}
  </div>);
}

// ── PRODUITS & SERVICES ──
const UNITES_MESURE=["unité","douzaine","kg","litre","heure","forfait","%","boîte","caisse"];
function genProdCode(produits){
  const nums=produits.map(p=>{const m=p.code?.match(/^PROD-(\d+)$/);return m?parseInt(m[1]):0});
  const max=nums.length?Math.max(...nums):0;
  return`PROD-${String(max+1).padStart(3,"0")}`;
}
function ProdForm({form,setForm,customU,setCustomU,onSave,onCancel,isNew,activeCats,inputS,t}){
  return(<div style={{display:"flex",flexDirection:"column",gap:7,padding:isNew?12:6}}>
    {isNew&&<span style={{fontSize:12,fontWeight:700,color:"#f97316",marginBottom:2}}>Nouveau produit / service</span>}
    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
      <div style={{flex:"1 1 100px"}}>
        <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Code produit</div>
        <input value={form.code||""} onChange={e=>setForm(f=>({...f,code:e.target.value}))} placeholder={isNew?"auto-généré":""} style={{...inputS,width:"100%",boxSizing:"border-box",fontFamily:"'DM Mono',monospace"}}/>
      </div>
      <div style={{flex:"3 1 200px"}}>
        <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Description <span style={{color:"#f97316"}}>*</span></div>
        <input value={form.description||""} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="ex: Hamburger 1/4 lb" autoFocus={isNew} style={{...inputS,width:"100%",boxSizing:"border-box"}} onKeyDown={e=>{if(e.key==="Enter"&&isNew)onSave()}}/>
      </div>
    </div>
    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
      <div style={{flex:"2 1 140px"}}>
        <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Catégorie</div>
        <select value={form.categorieId||""} onChange={e=>setForm(f=>({...f,categorieId:e.target.value}))} style={{...inputS,width:"100%",boxSizing:"border-box",borderColor:!form.categorieId?"#f97316":undefined}}>
          <option value="" disabled>— Choisir une catégorie * —</option>
          {activeCats.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
      </div>
      <div style={{flex:"1 1 100px"}}>
        <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Prix unitaire ($)</div>
        <input type="number" min="0" step="0.01" value={form.prixUnitaire||""} onChange={e=>setForm(f=>({...f,prixUnitaire:e.target.value}))} placeholder="0.00" style={{...inputS,width:"100%",boxSizing:"border-box"}}/>
      </div>
      <div style={{flex:"1 1 120px"}}>
        <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Unité de mesure</div>
        <select value={form.uniteMesure||"unité"} onChange={e=>setForm(f=>({...f,uniteMesure:e.target.value}))} style={{...inputS,width:"100%",boxSizing:"border-box"}}>
          {UNITES_MESURE.map(u=><option key={u} value={u}>{u}</option>)}
          <option value="__custom__">Autre...</option>
        </select>
      </div>
      {form.uniteMesure==="__custom__"&&(
        <div style={{flex:"1 1 100px"}}>
          <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Unité personnalisée</div>
          <input value={customU} onChange={e=>setCustomU(e.target.value)} placeholder="ex: palette" style={{...inputS,width:"100%",boxSizing:"border-box"}}/>
        </div>
      )}
    </div>
    <div style={{display:"flex",gap:14,alignItems:"center",flexWrap:"wrap"}}>
      <label style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer",fontSize:11,color:t.text}}>
        <input type="checkbox" checked={!!form.tps} onChange={e=>setForm(f=>({...f,tps:e.target.checked}))} style={{accentColor:"#f97316"}}/>
        Taxable TPS
      </label>
      <label style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer",fontSize:11,color:t.text}}>
        <input type="checkbox" checked={!!form.tvq} onChange={e=>setForm(f=>({...f,tvq:e.target.checked}))} style={{accentColor:"#f97316"}}/>
        Taxable TVQ
      </label>
    </div>
    <div>
      <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Notes internes (non visibles sur les documents)</div>
      <input value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Notes..." style={{...inputS,width:"100%",boxSizing:"border-box"}}/>
    </div>
    <div style={{display:"flex",gap:6,marginTop:2}}>
      <button onClick={onSave} disabled={!form.description?.trim()||!form.categorieId} style={{padding:"6px 16px",borderRadius:6,border:"none",background:(form.description?.trim()&&form.categorieId)?"linear-gradient(135deg,#f97316,#ea580c)":"rgba(255,255,255,0.05)",color:(form.description?.trim()&&form.categorieId)?"#fff":t.textDim,cursor:(form.description?.trim()&&form.categorieId)?"pointer":"default",fontWeight:700,fontSize:12,fontFamily:"'Outfit',sans-serif"}}>{isNew?"Ajouter":"✓ Sauvegarder"}</button>
      <button onClick={onCancel} style={{padding:"6px 12px",borderRadius:6,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:"pointer",fontWeight:600,fontSize:12,fontFamily:"'Outfit',sans-serif"}}>Annuler</button>
    </div>
  </div>);
}
function ProduitsSection({produits,saveProduits,categories}){
  const t=useT();
  const activeCats=useMemo(()=>categories.filter(c=>c.actif!==false),[categories]);
  const inputS={background:t.inputBg,border:`1px solid ${t.inputBorder}`,borderRadius:5,color:t.inputText,fontSize:12,padding:"5px 8px",outline:"none"};
  const BLANK={code:"",description:"",categorieId:"",prixUnitaire:"",uniteMesure:"unité",tps:true,tvq:true,notes:"",actif:true};
  const [search,setSearch]=useState("");
  const [filterCat,setFilterCat]=useState("all");
  const [showInactive,setShowInactive]=useState(false);
  const [addOpen,setAddOpen]=useState(false);
  const [editingId,setEditingId]=useState(null);
  const [editForm,setEditForm]=useState({});
  const [collapsedCats,setCollapsedCats]=useState({});
  const [newForm,setNewForm]=useState(BLANK);
  const [customUnite,setCustomUnite]=useState("");
  const [editCustomUnite,setEditCustomUnite]=useState("");
  const filtered=useMemo(()=>{
    let list=showInactive?produits:produits.filter(p=>p.actif!==false);
    if(filterCat!=="all")list=list.filter(p=>p.categorieId===filterCat);
    if(search.trim()){const q=search.toLowerCase();list=list.filter(p=>p.description?.toLowerCase().includes(q)||p.code?.toLowerCase().includes(q));}
    return list;
  },[produits,showInactive,filterCat,search]);
  const grouped=useMemo(()=>{
    const map={};
    filtered.forEach(p=>{
      const cat=categories.find(c=>c.id===p.categorieId);
      const key=cat?cat.id:"__none__";const label=cat?cat.nom:"Sans catégorie";
      if(!map[key])map[key]={label,items:[]};
      map[key].items.push(p);
    });
    return Object.entries(map).sort(([,a],[,b])=>a.label.localeCompare(b.label,"fr"));
  },[filtered,categories]);
  const addProd=()=>{
    if(!newForm.description.trim()||!newForm.categorieId)return;
    const code=newForm.code.trim()||genProdCode(produits);
    const unite=newForm.uniteMesure==="__custom__"?customUnite.trim()||"unité":newForm.uniteMesure;
    saveProduits([...produits,{id:Date.now().toString(),code,description:newForm.description.trim(),categorieId:newForm.categorieId,prixUnitaire:newForm.prixUnitaire,uniteMesure:unite,tps:newForm.tps,tvq:newForm.tvq,notes:newForm.notes.trim(),actif:true}]);
    setNewForm(BLANK);setCustomUnite("");setAddOpen(false);
  };
  const startEdit=p=>{
    const isCustom=!UNITES_MESURE.includes(p.uniteMesure);
    setEditingId(p.id);setEditForm({...p,uniteMesure:isCustom?"__custom__":p.uniteMesure});setEditCustomUnite(isCustom?p.uniteMesure:"");
  };
  const saveEdit=()=>{
    if(!editForm.description?.trim()||!editForm.categorieId)return;
    const unite=editForm.uniteMesure==="__custom__"?editCustomUnite.trim()||"unité":editForm.uniteMesure;
    saveProduits(produits.map(p=>p.id===editingId?{...p,...editForm,description:editForm.description.trim(),uniteMesure:unite,code:editForm.code?.trim()||p.code}:p));
    setEditingId(null);
  };
  const toggleActif=p=>saveProduits(produits.map(x=>x.id===p.id?{...x,actif:!x.actif}:x));
  return(<div style={{display:"flex",flexDirection:"column",gap:8}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <span style={{fontSize:13.5,fontWeight:700,color:t.text}}>Produits & Services</span>
        <span style={{fontSize:11,color:t.textMuted}}>{produits.filter(p=>p.actif!==false).length} actif{produits.filter(p=>p.actif!==false).length!==1?"s":""}</span>
      </div>
      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher..." style={{...inputS,fontSize:11,padding:"4px 8px"}}/>
        <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={{...inputS,fontSize:11,padding:"4px 7px"}}>
          <option value="all">Toutes les catégories</option>
          {categories.filter(c=>c.actif!==false).map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
        <button onClick={()=>setShowInactive(s=>!s)} style={{fontSize:10,padding:"3px 8px",borderRadius:5,border:`1px solid ${t.cardBorder}`,background:showInactive?"rgba(249,115,22,0.08)":t.section,color:showInactive?"#f97316":t.textSub,cursor:"pointer",fontWeight:600}}>
          {showInactive?"Masquer inactifs":"Afficher inactifs"}
        </button>
        <button onClick={()=>{setAddOpen(o=>!o);setNewForm(BLANK);setCustomUnite("");}} style={{fontSize:11,padding:"4px 12px",borderRadius:6,border:"1px solid rgba(249,115,22,0.25)",background:"rgba(249,115,22,0.08)",color:"#f97316",cursor:"pointer",fontWeight:700}}>
          + Nouveau produit
        </button>
      </div>
    </div>
    {addOpen&&(<div style={{background:t.card,border:"1px solid rgba(249,115,22,0.2)",borderRadius:9}}>
      <ProdForm form={newForm} setForm={setNewForm} customU={customUnite} setCustomU={setCustomUnite} onSave={addProd} onCancel={()=>{setAddOpen(false);setNewForm(BLANK);setCustomUnite("");}} isNew={true} activeCats={activeCats} inputS={inputS} t={t}/>
    </div>)}
    {filtered.length===0&&!addOpen&&(<div style={{textAlign:"center",padding:"24px 0",color:t.textMuted,fontSize:12}}>
      {produits.length===0?"Aucun produit — cliquez sur \"+ Nouveau produit\" pour commencer.":"Aucun résultat pour cette recherche."}
    </div>)}
    {grouped.map(([catId,group])=>(
      <div key={catId}>
        <div onClick={()=>setCollapsedCats(p=>({...p,[catId]:!p[catId]}))} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",padding:"4px 6px",borderRadius:5,userSelect:"none",marginBottom:3}}>
          <span style={{fontSize:9,color:t.textMuted,fontWeight:700,display:"inline-block",transform:collapsedCats[catId]?"rotate(0deg)":"rotate(90deg)",transition:"transform 0.15s"}}>▶</span>
          <span style={{fontSize:11.5,fontWeight:700,color:t.textSub}}>{group.label}</span>
          <span style={{fontSize:10,color:t.textMuted}}>{group.items.length}</span>
        </div>
        {!collapsedCats[catId]&&(<div style={{display:"flex",flexDirection:"column",gap:4,marginLeft:16}}>
          {group.items.map(prod=>(
            <div key={prod.id} style={{background:t.card,border:`1px solid ${prod.actif===false?"rgba(239,68,68,0.12)":t.cardBorder}`,borderRadius:7,padding:"7px 10px",opacity:prod.actif===false?0.6:1}}>
              {editingId===prod.id
                ?(<ProdForm form={editForm} setForm={setEditForm} customU={editCustomUnite} setCustomU={setEditCustomUnite} onSave={saveEdit} onCancel={()=>setEditingId(null)} isNew={false} activeCats={activeCats} inputS={inputS} t={t}/>)
                :(<div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    <span style={{fontSize:10,color:t.textMuted,fontFamily:"'DM Mono',monospace",minWidth:80}}>{prod.code}</span>
                    <span style={{fontSize:12,fontWeight:600,color:t.text,flex:1,cursor:"pointer",minWidth:100}} onClick={()=>startEdit(prod)}>
                      {prod.description}
                      {prod.actif===false&&<span style={{fontSize:9,color:"#ef4444",marginLeft:5,fontWeight:400}}>inactif</span>}
                      <span style={{fontSize:9,color:t.textDim,marginLeft:4}}>✎</span>
                    </span>
                    <span style={{fontSize:11,color:t.textSub,fontFamily:"'DM Mono',monospace"}}>
                      {prod.prixUnitaire?`${Number(prod.prixUnitaire).toFixed(2)} $`:"—"}
                      <span style={{fontSize:9,color:t.textMuted,marginLeft:2}}>/{prod.uniteMesure}</span>
                    </span>
                    <div style={{display:"flex",gap:3}}>
                      {prod.tps&&<span style={{fontSize:8,padding:"1px 4px",borderRadius:3,background:"rgba(249,115,22,0.08)",color:"#f97316",fontWeight:700}}>TPS</span>}
                      {prod.tvq&&<span style={{fontSize:8,padding:"1px 4px",borderRadius:3,background:"rgba(249,115,22,0.08)",color:"#f97316",fontWeight:700}}>TVQ</span>}
                    </div>
                    <button onClick={()=>toggleActif(prod)} style={{background:prod.actif===false?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.07)",border:"none",borderRadius:4,color:prod.actif===false?"#16a34a":"#ef4444",fontSize:10,padding:"2px 6px",cursor:"pointer",fontWeight:600,whiteSpace:"nowrap"}}>
                      {prod.actif===false?"Réactiver":"Désactiver"}
                    </button>
                  </div>)}
            </div>
          ))}
        </div>)}
      </div>
    ))}
  </div>);
}

// ── INTELLIGENCE TAB ──
function IntelligenceTab({liveData,computeDay,demoData,selectedDate,velocityProfiles,getLR,platforms,encaisseData,encaisseConfig}){
  const t=useT();
  const d=new Date(selectedDate+"T12:00:00");
  const dowProfiles=useMemo(()=>{
    const profiles=Array(7).fill(null).map(()=>({sales:[],ham:[],hot:[]}));
    Object.keys(liveData).forEach(k=>{
      const cd=computeDay(k);if(cd.venteNet<=0)return;
      const dd=new Date(k+"T12:00:00").getDay();
      profiles[dd].sales.push(cd.venteNet);
      if(cd.hamUsed!=null)profiles[dd].ham.push(cd.hamUsed);
      if(cd.hotUsed!=null)profiles[dd].hot.push(cd.hotUsed);
    });
    return profiles.map((p,i)=>{
      const n=p.sales.length;if(n===0)return{day:DAYS_FR[i],n:0,avgSales:0,avgHam:0,avgHot:0};
      return{day:DAYS_FR[i],n,avgSales:Math.round(p.sales.reduce((a,b)=>a+b,0)/n),avgHam:n>0?Math.round(p.ham.reduce((a,b)=>a+b,0)/Math.max(p.ham.length,1)):0,avgHot:n>0?Math.round(p.hot.reduce((a,b)=>a+b,0)/Math.max(p.hot.length,1)):0};
    });
  },[liveData,computeDay]);

  const anomalies=useMemo(()=>{
    const results=[];
    for(let i=0;i<14;i++){
      const dd=new Date(d);dd.setDate(d.getDate()-i);const k=dk(dd);
      const cd=computeDay(k);if(cd.venteNet<=0)continue;
      const dow=dd.getDay();const profile=dowProfiles[dow];
      if(profile.n<3)continue;
      const pct=((cd.venteNet-profile.avgSales)/profile.avgSales)*100;
      if(Math.abs(pct)>25)results.push({date:k,venteNet:cd.venteNet,avg:profile.avgSales,pct,day:DAYS_FR[dow]});
    }
    return results;
  },[d,computeDay,dowProfiles]);

  const cashierVariances=useMemo(()=>{
    const vars={};
    Object.entries(liveData).forEach(([date,dayData])=>{
      if(!dayData.cashes)return;
      dayData.cashes.forEach(c=>{
        if(!c.cashierId||c.posVentes==null||c.float==null||c.deposits==null||c.finalCash==null)return;
        const manT=(c.interac||0)+(c.livraisons||0)+(c.deposits||0)+(c.finalCash||0)-(c.float||0);
        const posT=(c.posVentes||0)+(c.posTPS||0)+(c.posTVQ||0)+(c.posLivraisons||0);
        const ecart=manT-posT;
        if(!vars[c.cashierId])vars[c.cashierId]={ecarts:[],total:0};
        vars[c.cashierId].ecarts.push({date,ecart});
        vars[c.cashierId].total+=ecart;
      });
    });
    return vars;
  },[liveData]);

  const hasDowData=dowProfiles.some(p=>p.n>0);
  const dow=d.getDay();
  const samples=[];for(let w=1;w<=8;w++){const p=new Date(d);p.setDate(d.getDate()-(w*7));const k=dk(p);const cd=computeDay(k);const demo=demoData[k];const vn=cd.venteNet>0?cd.venteNet:(demo?.venteNet||0);if(vn>0)samples.push({venteNet:vn,hamUsed:cd.hamUsed||demo?.hamUsed||0,hotUsed:cd.hotUsed||demo?.hotUsed||0})}
  const hasProj=samples.length>=2;
  const avg=hasProj?Math.round(samples.reduce((a,x)=>a+x.venteNet,0)/samples.length):0;
  const aH=hasProj?Math.round(samples.reduce((a,x)=>a+x.hamUsed,0)/samples.length):0;
  const aHo=hasProj?Math.round(samples.reduce((a,x)=>a+x.hotUsed,0)/samples.length):0;
  const tr=samples.length>=3?((samples[0].venteNet-samples[samples.length-1].venteNet)/samples.length):0;
  const proj=Math.round(avg+tr);
  const ICard=({children})=>(<div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:11}}>{children}</div>);

  const velocityData=useMemo(()=>{
    const dowVP=velocityProfiles[dow];
    return WIN_LABELS.map((label,i)=>({
      label,
      avgHam:avArr(dowVP[i].ham),
      avgHot:avArr(dowVP[i].hot),
      n:Math.max(dowVP[i].ham.length,dowVP[i].hot.length)
    }));
  },[velocityProfiles,dow]);

  const multiFactorPred=useMemo(()=>{
    const tomorrow=new Date(d);tomorrow.setDate(d.getDate()+1);
    const tDow=tomorrow.getDay();
    const tProfile=dowProfiles[tDow];
    if(tProfile.n<2)return null;
    const tKey=dk(tomorrow);const tRaw=getLR(tKey);
    const wCat=WEATHER_CAT(tRaw.weather);
    let hamBase=tProfile.avgHam;let hotBase=tProfile.avgHot;let salesBase=tProfile.avgSales;
    let hamAdj=0;let hotAdj=0;let salesAdj=0;
    if(wCat==="pluie"||wCat==="neige"){salesAdj-=salesBase*0.10;hamAdj-=hamBase*0.10;hotAdj-=hotBase*0.10;}
    else if(wCat==="ensoleillé"){salesAdj+=salesBase*0.05;hamAdj+=hamBase*0.05;hotAdj+=hotBase*0.05;}
    if(tRaw.tempC!=null){if(tRaw.tempC<5){salesAdj-=salesBase*0.08;hamAdj-=hamBase*0.08;hotAdj-=hotBase*0.08;}else if(tRaw.tempC>24){salesAdj+=salesBase*0.08;hamAdj+=hamBase*0.08;hotAdj+=hotBase*0.08;}}
    const tHol=getHol(tomorrow);
    if(tHol){salesAdj+=salesBase*0.12;hamAdj+=hamBase*0.12;hotAdj+=hotBase*0.12;}
    const factors=[];if(wCat!=="inconnu"&&wCat!=="autre")factors.push(wCat);if(tRaw.tempC!=null)factors.push(`${tRaw.tempC}°C`);if(tHol)factors.push(tHol);
    return{day:DAYS_FR[tDow],hamQty:Math.round(hamBase+hamAdj)+3,hotQty:Math.round(hotBase+hotAdj)+2,salesEst:Math.round(salesBase+salesAdj),factors,n:tProfile.n,hasContext:wCat!=="inconnu"||tRaw.tempC!=null||!!tHol};
  },[d,dowProfiles,getLR]);

  return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    <ICard>
      <span style={{fontSize:13,fontWeight:700,marginBottom:5,display:"block",color:t.text}}>Projections — {DAYS_FR[dow]} {d.getDate()} {MONTHS_FR[d.getMonth()]}</span>
      {hasProj?(<div style={{display:"flex",flexDirection:"column",gap:8}}>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}><MC label="Projeté" value={fmt(proj)} sub={`${samples.length} ${DAYS_FR[dow]}s`} accent="#f97316"/><MC label="Moyenne" value={fmt(avg)} accent={t.posColor}/></div>
        <div style={{background:t.section,borderRadius:6,padding:8}}>
          <div style={{fontSize:9.5,color:t.textSub,fontWeight:600,textTransform:"uppercase",letterSpacing:0.7,marginBottom:4}}>Commande suggérée</div>
          <span style={{fontSize:13,color:t.text}}><span style={{color:"#f97316",fontWeight:700}}>{aH+3}</span> <span style={{color:t.textMuted}}>dz Ham</span></span>
          <span style={{fontSize:13,marginLeft:14,color:t.text}}><span style={{color:"#f97316",fontWeight:700}}>{aHo+2}</span> <span style={{color:t.textMuted}}>dz Hot</span></span>
        </div>
      </div>):(<div style={{fontSize:12,color:t.textMuted,textAlign:"center",padding:8}}>Besoin de 2+ semaines de données</div>)}
    </ICard>
    <ICard>
      <span style={{fontSize:13,fontWeight:700,marginBottom:6,display:"block",color:t.text}}>Profil par jour de la semaine</span>
      {hasDowData?(<div>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr",gap:4,padding:"4px 0",borderBottom:`1px solid ${t.dividerMid}`,marginBottom:3}}>
          {["Jour","Données","Ventes moy.","Ham moy.","Hot moy."].map((h,i)=>(<span key={i} style={{fontSize:10,color:t.textMuted,fontWeight:600,textAlign:i>0?"right":"left"}}>{h}</span>))}
        </div>
        {dowProfiles.map((p,i)=>p.n>0&&(<div key={i} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr",gap:4,padding:"3px 0",borderBottom:`1px solid ${t.divider}`,alignItems:"center"}}>
          <span style={{fontSize:12,textTransform:"capitalize",fontWeight:d.getDay()===i?700:400,color:d.getDay()===i?"#f97316":t.text}}>{p.day}</span>
          <span style={{fontSize:11,color:t.textMuted,textAlign:"right"}}>{p.n} jrs</span>
          <span style={{fontSize:12,fontFamily:"'DM Mono',monospace",textAlign:"right",color:t.posColor}}>{fmt(p.avgSales)}</span>
          <span style={{fontSize:12,fontFamily:"'DM Mono',monospace",textAlign:"right",color:t.text}}>{p.avgHam}</span>
          <span style={{fontSize:12,fontFamily:"'DM Mono',monospace",textAlign:"right",color:t.text}}>{p.avgHot}</span>
        </div>))}
      </div>):(<div style={{fontSize:12,color:t.textMuted,textAlign:"center",padding:8}}>Entrer des données quotidiennes pour voir les tendances</div>)}
    </ICard>
    <ICard>
      <span style={{fontSize:13,fontWeight:700,marginBottom:6,display:"block",color:t.text}}>Anomalies détectées (14 derniers jours)</span>
      {anomalies.length>0?anomalies.map((a,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",borderBottom:`1px solid ${t.divider}`}}>
        <span style={{fontSize:12,textTransform:"capitalize",color:t.text}}>{a.day} {a.date}</span>
        <div style={{display:"flex",gap:8,alignItems:"center"}}><span style={{fontSize:11,color:t.textMuted}}>Moy: {fmt(a.avg)}</span><span style={{fontSize:11,color:t.textSub}}>→</span><span style={{fontSize:12,fontWeight:600,fontFamily:"'DM Mono',monospace",color:t.text}}>{fmt(a.venteNet)}</span><span style={{fontSize:11,fontWeight:700,color:a.pct>0?"#22c55e":"#ef4444",fontFamily:"'DM Mono',monospace"}}>{a.pct>0?"+":""}{a.pct.toFixed(0)}%</span></div>
      </div>)):(<div style={{fontSize:12,color:t.textMuted,textAlign:"center",padding:8}}>Aucune anomalie — besoin de 3+ jours du même type</div>)}
    </ICard>
    <ICard>
      <span style={{fontSize:13,fontWeight:700,marginBottom:6,display:"block",color:t.text}}>Historique écarts de caisse</span>
      {Object.keys(cashierVariances).length>0?Object.entries(cashierVariances).map(([id,data])=>(<div key={id} style={{marginBottom:8}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}><span style={{fontSize:12,fontWeight:600,color:t.text}}>{id.length>8?`Caissier ${id.slice(-4)}`:id}</span><span style={{fontSize:12,fontFamily:"'DM Mono',monospace",color:data.total>=0?"#16a34a":"#dc2626",fontWeight:700}}>Total: {data.total>=0?"+":""}{fmt(data.total)}</span></div>
        {data.ecarts.slice(-5).map((e,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",padding:"2px 0",fontSize:11}}><span style={{color:t.textMuted}}>{e.date}</span><span style={{fontFamily:"'DM Mono',monospace",color:Math.abs(e.ecart)<=1?"#16a34a":"#dc2626"}}>{Math.abs(e.ecart)<=1?"✓ OK":e.ecart>0?`+${fmt(e.ecart)}`:fmt(e.ecart)}</span></div>))}
      </div>)):(<div style={{fontSize:12,color:t.textMuted,textAlign:"center",padding:8}}>Aucune donnée — les écarts apparaîtront après réconciliation</div>)}
    </ICard>
    <ICard>
      <span style={{fontSize:13,fontWeight:700,marginBottom:6,display:"block",color:t.text}}>Vélocité de consommation — {DAYS_FR[dow]}</span>
      {velocityData.some(v=>v.n>0)?(<div>
        <div style={{display:"grid",gridTemplateColumns:"1.8fr 0.6fr 1fr 1fr",gap:4,padding:"3px 0",borderBottom:`1px solid ${t.dividerMid}`,marginBottom:3}}>
          {["Fenêtre","n","Ham moy.","Hot moy."].map((h,i)=>(<span key={i} style={{fontSize:10,color:t.textMuted,fontWeight:600,textAlign:i>0?"right":"left"}}>{h}</span>))}
        </div>
        {velocityData.map((v,i)=>(<div key={i} style={{display:"grid",gridTemplateColumns:"1.8fr 0.6fr 1fr 1fr",gap:4,padding:"3px 0",borderBottom:`1px solid ${t.divider}`,alignItems:"center",opacity:v.n===0?0.35:1}}>
          <span style={{fontSize:11,color:t.textSub}}>{v.label}</span>
          <span style={{fontSize:11,color:t.textMuted,textAlign:"right"}}>{v.n}</span>
          <span style={{fontSize:12,fontFamily:"'DM Mono',monospace",textAlign:"right",color:t.text}}>{v.avgHam!=null?Math.round(v.avgHam):"—"}</span>
          <span style={{fontSize:12,fontFamily:"'DM Mono',monospace",textAlign:"right",color:t.text}}>{v.avgHot!=null?Math.round(v.avgHot):"—"}</span>
        </div>))}
        <div style={{fontSize:9,color:t.textDim,marginTop:4}}>Douzaines consommées par fenêtre de temps</div>
      </div>):(<div style={{fontSize:12,color:t.textMuted,textAlign:"center",padding:8}}>Entrer les comptages pain (14h–20h) pour voir la vélocité</div>)}
    </ICard>
    <ICard>
      <span style={{fontSize:13,fontWeight:700,marginBottom:6,display:"block",color:t.text}}>Prévision de commande — demain</span>
      {multiFactorPred?(<div style={{display:"flex",flexDirection:"column",gap:8}}>
        <div style={{fontSize:12,color:t.textSub,textTransform:"capitalize"}}>{multiFactorPred.day}{multiFactorPred.factors.length>0?" · "+multiFactorPred.factors.join(", "):""}</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <MC label="Ham" value={`${multiFactorPred.hamQty} dz`} sub="commander" accent="#f97316"/>
          <MC label="Hot" value={`${multiFactorPred.hotQty} dz`} sub="commander" accent="#f97316"/>
          {multiFactorPred.salesEst>0&&<MC label="Ventes est." value={fmt(multiFactorPred.salesEst)} sub={`${multiFactorPred.n} ${multiFactorPred.day}s`} accent={t.posColor}/>}
        </div>
        <div style={{fontSize:9.5,color:t.textDim}}>{multiFactorPred.hasContext?"Ajusté selon météo, température et jours fériés":"Ajoutez météo de demain dans Facteurs externes pour affiner la prévision"}</div>
      </div>):(<div style={{fontSize:12,color:t.textMuted,textAlign:"center",padding:8}}>Besoin de 2+ données pour ce jour de semaine</div>)}
    </ICard>
    <ICard>
      <span style={{fontSize:13,fontWeight:700,marginBottom:6,display:"block",color:t.text}}>📱 Livraisons — analyse des plateformes</span>
      {(platforms||[]).length===0?(<div style={{fontSize:12,color:t.textMuted,textAlign:"center",padding:8}}>Aucune plateforme configurée dans Config</div>):(()=>{
        const platStats=(platforms||[]).map(p=>{
          const commissions=[];let totalV=0,totalD=0;
          Object.entries(liveData).forEach(([,dd])=>{const pd=(dd.platformLivraisons||{})[p.id]||{};if(pd.ventes!=null&&pd.depot!=null){const cp=pd.ventes>0?((pd.ventes-pd.depot)/pd.ventes*100):0;commissions.push(cp);totalV+=pd.ventes;totalD+=pd.depot;}});
          const avgComm=commissions.length>0?commissions.reduce((a,b)=>a+b,0)/commissions.length:null;
          return{...p,avgComm,totalVentes:totalV,totalDepots:totalD,n:commissions.length};
        });
        const overdue=[];
        Object.entries(liveData).forEach(([date,dd])=>{
          const daysAgo=Math.round((new Date()-new Date(date+"T12:00:00"))/(1000*60*60*24));
          if(daysAgo>=7)(platforms||[]).forEach(p=>{const pd=(dd.platformLivraisons||{})[p.id]||{};if(pd.ventes!=null&&pd.depot==null)overdue.push({date,platform:p,ventes:pd.ventes,daysAgo});});
        });
        const hasData=platStats.some(p=>p.n>0);
        return(<div>
          {hasData?(<div>
            <div style={{display:"grid",gridTemplateColumns:"1.5fr 0.6fr 1fr 1fr",gap:4,padding:"4px 0",borderBottom:`1px solid ${t.dividerMid}`,marginBottom:3}}>
              {["Plateforme","n","Comm. moy.","Ventes tot."].map((h,i)=>(<span key={i} style={{fontSize:10,color:t.textMuted,fontWeight:600,textAlign:i>0?"right":"left"}}>{h}</span>))}
            </div>
            {platStats.map(p=>p.n>0&&(<div key={p.id} style={{display:"grid",gridTemplateColumns:"1.5fr 0.6fr 1fr 1fr",gap:4,padding:"3px 0",borderBottom:`1px solid ${t.divider}`,alignItems:"center"}}>
              <span style={{fontSize:11,color:t.text}}>{p.emoji} {p.name}</span>
              <span style={{fontSize:11,color:t.textMuted,textAlign:"right"}}>{p.n}</span>
              <span style={{fontSize:12,fontFamily:"'DM Mono',monospace",textAlign:"right",color:"#f97316"}}>{p.avgComm!=null?`${p.avgComm.toFixed(1)}%`:"—"}</span>
              <span style={{fontSize:12,fontFamily:"'DM Mono',monospace",textAlign:"right",color:t.text}}>{fmt(p.totalVentes)}</span>
            </div>))}
          </div>):(<div style={{fontSize:12,color:t.textMuted,textAlign:"center",padding:"4px 0"}}>Aucune donnée de livraison enregistrée</div>)}
          {overdue.length>0&&(<div style={{marginTop:8,padding:"7px 10px",borderRadius:6,background:"rgba(239,68,68,0.05)",border:"1px solid rgba(239,68,68,0.15)"}}>
            <div style={{fontSize:9.5,color:"#dc2626",fontWeight:700,textTransform:"uppercase",letterSpacing:0.7,marginBottom:5}}>⚠️ Dépôts en retard (7+ jours)</div>
            {overdue.map((o,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"2px 0",borderBottom:`1px solid rgba(239,68,68,0.1)`,fontSize:11}}>
              <span style={{color:t.textSub}}>{o.platform.emoji} {o.platform.name} — {o.date}</span>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{color:t.textMuted,fontSize:10}}>il y a {o.daysAgo}j</span>
                <span style={{fontFamily:"'DM Mono',monospace",color:"#dc2626",fontWeight:600}}>{fmt(o.ventes)}</span>
              </div>
            </div>))}
          </div>)}
        </div>);
      })()}
    </ICard>
    <ICard>
      <span style={{fontSize:13,fontWeight:700,marginBottom:6,display:"block",color:t.text}}>💵 Encaisse — analyse mensuelle</span>
      {(()=>{
        const n=new Date();const y=n.getFullYear();const m=String(n.getMonth()+1).padStart(2,"0");const dim=new Date(y,n.getMonth()+1,0).getDate();
        const catTotals={};(encaisseConfig?.sortieCategories||DEFAULT_SORTIE_CATS).forEach(c=>{catTotals[c.id]={name:c.name,total:0,prevTotal:0}});
        let totalSort=0,totalSortPrev=0,daysWithData=0;
        const pm=n.getMonth()===0?12:n.getMonth();const py=n.getMonth()===0?y-1:y;const pmStr=`${py}-${String(pm).padStart(2,"0")}`;
        const dimPrev=new Date(py,pm,0).getDate();
        for(let day=1;day<=dim;day++){const k=`${y}-${m}-${String(day).padStart(2,"0")}`;const enc=encaisseData[k];if(!enc)continue;daysWithData++;(enc.sorties||[]).forEach(s=>{const amt=s.montant||0;totalSort+=amt;if(catTotals[s.categorie])catTotals[s.categorie].total+=amt;});}
        for(let day=1;day<=dimPrev;day++){const k=`${pmStr}-${String(day).padStart(2,"0")}`;const enc=encaisseData[k];if(!enc)continue;(enc.sorties||[]).forEach(s=>{const amt=s.montant||0;totalSortPrev+=amt;if(catTotals[s.categorie])catTotals[s.categorie].prevTotal+=amt;});}
        const avgDailySort=daysWithData>0?totalSort/daysWithData:0;
        const anomalyCats=Object.values(catTotals).filter(c=>c.prevTotal>0&&c.total>c.prevTotal*1.4);
        if(daysWithData===0)return(<div style={{fontSize:12,color:t.textMuted,textAlign:"center",padding:8}}>Aucune donnée d'encaisse ce mois</div>);
        return(<div>
          <div style={{fontSize:11,color:t.textSub,marginBottom:8}}>Mois en cours — {daysWithData} jour{daysWithData!==1?"s":""} avec données</div>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:4,padding:"3px 0",borderBottom:`1px solid ${t.dividerMid}`,marginBottom:3}}>
            {["Catégorie","Total"].map((h,i)=>(<span key={i} style={{fontSize:10,color:t.textMuted,fontWeight:600,textAlign:i>0?"right":"left"}}>{h}</span>))}
          </div>
          {Object.values(catTotals).filter(c=>c.total>0).map((c,i)=>(<div key={i} style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:4,padding:"3px 0",borderBottom:`1px solid ${t.divider}`,alignItems:"center"}}>
            <span style={{fontSize:11,color:t.text}}>{c.name}</span>
            <span style={{fontSize:12,fontFamily:"'DM Mono',monospace",textAlign:"right",color:"#ef4444"}}>{fmt(c.total)}</span>
          </div>))}
          <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",marginTop:2,borderTop:`1px solid ${t.dividerStrong}`}}>
            <span style={{fontSize:11.5,fontWeight:700,color:t.text}}>Total sorties</span>
            <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:700,color:"#ef4444"}}>{fmt(totalSort)}</span>
          </div>
          {avgDailySort>0&&<div style={{fontSize:10.5,color:t.textSub,marginTop:2}}>Moyenne quotidienne: {fmt(avgDailySort)}</div>}
          {anomalyCats.length>0&&(<div style={{marginTop:8,padding:"7px 10px",borderRadius:6,background:"rgba(239,68,68,0.05)",border:"1px solid rgba(239,68,68,0.15)"}}>
            <div style={{fontSize:9.5,color:"#dc2626",fontWeight:700,textTransform:"uppercase",letterSpacing:0.7,marginBottom:4}}>⚠️ Hausses inhabituelles vs mois dernier</div>
            {anomalyCats.map((c,i)=>(<div key={i} style={{fontSize:11,color:t.textSub,padding:"2px 0"}}>{c.name}: {fmt(c.total)} <span style={{color:"#dc2626",fontWeight:600}}>(+{Math.round((c.total/c.prevTotal-1)*100)}% vs M-1)</span></div>))}
          </div>)}
        </div>);
      })()}
    </ICard>
  </div>);
}

// ── UPGRADE PROMPT MODAL ──
function UpgradePrompt({onClose}){
  const t=useT();
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:24}}>
      <div style={{background:t.name==="dark"?"#16181f":t.bg,border:`1px solid ${t.cardBorder}`,borderRadius:12,padding:24,maxWidth:380,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,0.4)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
          <div style={{width:34,height:30,borderRadius:6,background:"linear-gradient(135deg,#f97316,#ea580c)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:"#fff"}}>PRO</div>
          <span style={{fontSize:14,fontWeight:700,color:t.text}}>BalanceIQ Pro</span>
        </div>
        <p style={{fontSize:13,color:t.textSub,lineHeight:1.6,margin:"0 0 18px"}}>
          Cette fonctionnalité est disponible avec <strong style={{color:"#f97316"}}>BalanceIQ Pro</strong>.<br/>
          Accès illimité à toutes les fonctionnalités avancées — synchronisation cloud, envoi d'emails direct, rapports Excel, et plus.
        </p>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>window.open("https://balanceiq.ca","_blank")} style={{flex:1,padding:"8px 14px",borderRadius:7,border:"none",background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:12,fontFamily:"'Outfit',sans-serif"}}>En savoir plus</button>
          <button onClick={onClose} style={{flex:1,padding:"8px 14px",borderRadius:7,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:"pointer",fontWeight:600,fontSize:12,fontFamily:"'Outfit',sans-serif"}}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

// ── WELCOME SCREEN ──
function WelcomeScreen({onSelect}){
  const [franchiseurMsg,setFranchiseurMsg]=useState(false);
  return(
    <div style={{minHeight:"100vh",background:DARK.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Outfit','Helvetica Neue',sans-serif",padding:24}}>
      <div style={{maxWidth:480,width:"100%",textAlign:"center"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:32}}>
          <div style={{width:44,height:38,borderRadius:8,background:"linear-gradient(135deg,#f97316,#ea580c)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:"#fff",letterSpacing:-0.5}}>BIQ</div>
          <span style={{fontSize:22,fontWeight:800,color:"#e8e8ec",letterSpacing:-0.5}}>BalanceIQ</span>
        </div>
        <h1 style={{fontSize:24,fontWeight:700,color:"#e8e8ec",margin:"0 0 10px"}}>Bienvenue sur BalanceIQ</h1>
        <p style={{fontSize:15,color:"#8b8fa3",margin:"0 0 36px",lineHeight:1.5}}>Comment utilisez-vous l'application?</p>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <button onClick={()=>onSelect("restaurant")} style={{padding:"18px 24px",borderRadius:12,border:"1.5px solid rgba(249,115,22,0.3)",background:"rgba(249,115,22,0.08)",color:"#f97316",cursor:"pointer",fontWeight:700,fontSize:16,fontFamily:"'Outfit',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:10,transition:"all 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.background="rgba(249,115,22,0.14)"}
            onMouseLeave={e=>e.currentTarget.style.background="rgba(249,115,22,0.08)"}>
            <span style={{fontSize:22}}>🏪</span>
            <div style={{textAlign:"left"}}>
              <div style={{fontSize:16,fontWeight:700}}>Restaurant / Franchisé</div>
              <div style={{fontSize:12,color:"rgba(249,115,22,0.7)",fontWeight:400,marginTop:2}}>Fermeture de caisse, P&L, inventaire, facturation</div>
            </div>
          </button>
          <button onClick={()=>setFranchiseurMsg(true)} style={{padding:"18px 24px",borderRadius:12,border:`1.5px solid rgba(255,255,255,0.07)`,background:"rgba(255,255,255,0.025)",color:"#5a5e70",cursor:"pointer",fontWeight:700,fontSize:16,fontFamily:"'Outfit',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:10}}
            onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.04)"}
            onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.025)"}>
            <span style={{fontSize:22}}>🏢</span>
            <div style={{textAlign:"left"}}>
              <div style={{fontSize:16,fontWeight:700}}>Franchiseur / Siège social</div>
              <div style={{fontSize:12,color:"#4a4e5e",fontWeight:400,marginTop:2}}>Dashboard multi-franchises, redevances, consolidation</div>
            </div>
          </button>
        </div>
        {franchiseurMsg&&(
          <div style={{marginTop:20,padding:"14px 18px",borderRadius:9,background:"rgba(251,191,36,0.08)",border:"1px solid rgba(251,191,36,0.2)",textAlign:"left"}}>
            <div style={{fontSize:13,fontWeight:600,color:"#fbbf24",marginBottom:6}}>Mode Franchiseur — disponible prochainement</div>
            <div style={{fontSize:12,color:"#8b8fa3",marginBottom:6,lineHeight:1.5}}>Le mode Franchiseur (dashboard multi-succursales, redevances automatiques, consolidation) est en développement. Vous serez notifié dès sa disponibilité.</div>
            <div style={{fontSize:11,color:"#6b7280",marginBottom:12,padding:"8px 10px",borderRadius:6,background:"rgba(139,92,246,0.06)",border:"1px solid rgba(139,92,246,0.15)"}}>📋 Journal d'audit réseau — disponible avec synchronisation cloud</div>
            <button onClick={()=>onSelect("restaurant")} style={{padding:"8px 16px",borderRadius:7,border:"none",background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:12,fontFamily:"'Outfit',sans-serif"}}>Continuer en mode Restaurant</button>
          </div>
        )}
        <p style={{fontSize:11,color:"#3e4254",marginTop:28}}>Version {appVersion} · BalanceIQ</p>
      </div>
    </div>
  );
}

// ── AUDIT VIEWER ──
const MODULE_LABELS={daily:"Quotidien",inventory:"Inventaire",caisse:"Caisse",employee:"Employé",encaisse:"Encaisse",pl:"P&L",livraisons:"Livraisons",invoice:"Facturation",payment:"Paiement",client:"Client",product:"Produit",config:"Config"};
const ACTION_LABELS={create:"Création",update:"Modification",void:"Annulation",correct:"Correction",restore:"Restauration"};
const ACTION_COLORS={create:"#22c55e",update:"#3b82f6",void:"#ef4444",correct:"#f59e0b",restore:"#8b5cf6"};

function AuditViewer(){
  const t=useT();
  const [entries,setEntries]=useState([]);
  const [loading,setLoading]=useState(false);
  const [filters,setFilters]=useState({module:"",action:"",dateFrom:"",dateTo:""});
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(0);
  const PAGE=50;

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const q={};
      if(filters.module)q.module=filters.module;
      if(filters.action)q.action=filters.action;
      if(filters.dateFrom)q.dateFrom=filters.dateFrom+" 00:00:00";
      if(filters.dateTo)q.dateTo=filters.dateTo+" 23:59:59";
      const rows=await window.api.audit.query(q);
      setEntries(rows||[]);setPage(0);
    }catch(e){setEntries([]);}
    setLoading(false);
  },[filters]);

  useEffect(()=>{load();},[load]);

  const filtered=useMemo(()=>{
    if(!search.trim())return entries;
    const s=search.toLowerCase();
    return entries.filter(r=>[r.module,r.action,r.record_type,r.record_id,r.field_name,r.old_value,r.new_value,r.reason].some(v=>v&&String(v).toLowerCase().includes(s)));
  },[entries,search]);

  const paged=filtered.slice(page*PAGE,(page+1)*PAGE);
  const totalPages=Math.ceil(filtered.length/PAGE);

  const exportCSV=()=>{
    const BOM="\uFEFF";
    const hdr="Horodatage,Appareil,Module,Action,Type,ID,Champ,Ancienne valeur,Nouvelle valeur,Raison\n";
    const rows=filtered.map(r=>[r.timestamp,r.device_id,r.module,r.action,r.record_type,r.record_id,r.field_name||"",r.old_value||"",r.new_value||"",r.reason||""].map(v=>`"${String(v||"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob=new Blob([BOM+hdr+rows],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");
    a.href=url;a.download=`audit-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);a.click();document.body.removeChild(a);
  };

  const sel={background:t.inputBg,border:`1px solid ${t.inputBorder}`,borderRadius:5,color:t.inputText,fontSize:11,padding:"4px 7px",outline:"none"};
  const inp={...sel,width:120};

  return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    {/* Filters */}
    <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:11,display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
      <div style={{display:"flex",flexDirection:"column",gap:3}}>
        <span style={{fontSize:9,color:t.textMuted,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Module</span>
        <select value={filters.module} onChange={e=>setFilters(p=>({...p,module:e.target.value}))} style={sel}>
          <option value="">Tous</option>
          {Object.entries(MODULE_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:3}}>
        <span style={{fontSize:9,color:t.textMuted,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Action</span>
        <select value={filters.action} onChange={e=>setFilters(p=>({...p,action:e.target.value}))} style={sel}>
          <option value="">Toutes</option>
          {Object.entries(ACTION_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:3}}>
        <span style={{fontSize:9,color:t.textMuted,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Du</span>
        <input type="date" value={filters.dateFrom} onChange={e=>setFilters(p=>({...p,dateFrom:e.target.value}))} style={inp}/>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:3}}>
        <span style={{fontSize:9,color:t.textMuted,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Au</span>
        <input type="date" value={filters.dateTo} onChange={e=>setFilters(p=>({...p,dateTo:e.target.value}))} style={inp}/>
      </div>
      <input placeholder="Rechercher…" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} style={{...inp,width:140}}/>
      <button onClick={load} style={{padding:"4px 12px",borderRadius:6,border:"none",background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:11}}>Actualiser</button>
      <button onClick={exportCSV} disabled={!filtered.length} style={{padding:"4px 12px",borderRadius:6,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:"pointer",fontWeight:600,fontSize:11}}>⬇ CSV</button>
      <span style={{fontSize:10.5,color:t.textMuted,marginLeft:"auto"}}>{filtered.length} entr{filtered.length!==1?"ées":"ée"}</span>
    </div>

    {/* Table */}
    <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,overflow:"hidden"}}>
      {loading?<div style={{padding:20,textAlign:"center",color:t.textMuted,fontSize:12}}>Chargement…</div>
      :!paged.length?<div style={{padding:20,textAlign:"center",color:t.textMuted,fontSize:12}}>Aucune entrée</div>
      :<>
        {/* Header */}
        <div style={{display:"grid",gridTemplateColumns:"130px 80px 80px 90px 90px 100px 100px 1fr",gap:4,padding:"7px 10px",borderBottom:`1px solid ${t.dividerStrong}`,background:t.section}}>
          {["Horodatage","Module","Action","Type","ID","Champ","Avant","Après / Raison"].map((h,i)=>(
            <span key={i} style={{fontSize:9,color:t.textMuted,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5}}>{h}</span>
          ))}
        </div>
        {paged.map(r=>(
          <div key={r.id} style={{display:"grid",gridTemplateColumns:"130px 80px 80px 90px 90px 100px 100px 1fr",gap:4,padding:"5px 10px",borderBottom:`1px solid ${t.divider}`,alignItems:"start"}}>
            <span style={{fontSize:9.5,color:t.textMuted,fontFamily:"'DM Mono',monospace"}}>{r.timestamp}</span>
            <span style={{fontSize:10,color:t.textSub}}>{MODULE_LABELS[r.module]||r.module}</span>
            <span style={{fontSize:10,fontWeight:700,color:ACTION_COLORS[r.action]||t.text,background:`${ACTION_COLORS[r.action]||"#888"}18`,padding:"1px 5px",borderRadius:4}}>{ACTION_LABELS[r.action]||r.action}</span>
            <span style={{fontSize:9.5,color:t.textSub,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.record_type}</span>
            <span style={{fontSize:9,color:t.textDim,fontFamily:"'DM Mono',monospace",overflow:"hidden",textOverflow:"ellipsis"}}>{r.record_id}</span>
            <span style={{fontSize:9.5,color:t.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.field_name||"—"}</span>
            <span style={{fontSize:9.5,color:t.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:r.old_value?"line-through":"none"}}>{r.old_value||"—"}</span>
            <span style={{fontSize:9.5,color:r.action==="correct"?"#f59e0b":r.action==="void"?"#ef4444":r.action==="create"?"#22c55e":t.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={r.reason?`Raison: ${r.reason}`:undefined}>
              {r.action==="void"?<span style={{color:"#ef4444"}}>{r.reason||"—"}</span>
               :r.reason?<><span style={{opacity:0.7}}>{r.new_value||"—"}</span><span style={{color:"#f59e0b",marginLeft:4}}>· {r.reason}</span></>
               :r.new_value||"—"}
            </span>
          </div>
        ))}
        {totalPages>1&&<div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:8,padding:"6px 0",borderTop:`1px solid ${t.divider}`}}>
          <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0} style={{padding:"3px 10px",borderRadius:5,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:page===0?"default":"pointer",fontSize:11}}>←</button>
          <span style={{fontSize:11,color:t.textSub}}>Page {page+1} / {totalPages}</span>
          <button onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} disabled={page===totalPages-1} style={{padding:"3px 10px",borderRadius:5,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:page===totalPages-1?"default":"pointer",fontSize:11}}>→</button>
        </div>}
      </>}
    </div>
  </div>);
}

// ── AUDIT REPORTS (Step 8) ──

function CorrectionReport(){
  const t=useT();
  const [entries,setEntries]=useState([]);const [loading,setLoading]=useState(true);
  useEffect(()=>{(async()=>{try{const rows=await window.api.audit.query({action:"correct"});setEntries(rows||[]);}catch(e){setEntries([]);}setLoading(false)})()},[]);
  if(loading)return<div style={{padding:12,color:t.textMuted,fontSize:12}}>Chargement…</div>;
  if(!entries.length)return<div style={{padding:12,color:t.textMuted,fontSize:12}}>Aucune correction enregistrée.</div>;
  // Group by date (YYYY-MM-DD)
  const byDate={};
  entries.forEach(r=>{const day=r.timestamp.slice(0,10);if(!byDate[day])byDate[day]=[];byDate[day].push(r);});
  return(<div style={{display:"flex",flexDirection:"column",gap:6}}>
    {Object.keys(byDate).sort().reverse().map(day=>(
      <div key={day} style={{background:t.section,border:`1px solid ${t.sectionBorder}`,borderRadius:7,padding:8}}>
        <div style={{fontSize:10,fontWeight:700,color:"#f59e0b",marginBottom:5}}>{day} — {byDate[day].length} correction{byDate[day].length>1?"s":""}</div>
        {byDate[day].map(r=>(
          <div key={r.id} style={{fontSize:10,color:t.text,padding:"3px 0",borderTop:`1px solid ${t.divider}`,display:"grid",gridTemplateColumns:"80px 80px 1fr 80px 80px 1fr",gap:4,alignItems:"center"}}>
            <span style={{color:t.textMuted,fontFamily:"'DM Mono',monospace"}}>{r.timestamp.slice(11,16)}</span>
            <span style={{color:t.textSub}}>{MODULE_LABELS[r.module]||r.module}</span>
            <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.record_type} {r.record_id}</span>
            <span style={{color:t.textMuted,textDecoration:"line-through"}}>{r.old_value||"—"}</span>
            <span style={{color:"#f59e0b"}}>{r.new_value||"—"}</span>
            <span style={{color:t.textSub,fontStyle:"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.reason||"—"}</span>
          </div>
        ))}
      </div>
    ))}
  </div>);
}

function VoidReport(){
  const t=useT();
  const [entries,setEntries]=useState([]);const [loading,setLoading]=useState(true);
  useEffect(()=>{(async()=>{try{const rows=await window.api.audit.query({action:"void"});setEntries(rows||[]);}catch(e){setEntries([]);}setLoading(false)})()},[]);
  if(loading)return<div style={{padding:12,color:t.textMuted,fontSize:12}}>Chargement…</div>;
  if(!entries.length)return<div style={{padding:12,color:t.textMuted,fontSize:12}}>Aucune annulation enregistrée.</div>;
  return(<div style={{display:"flex",flexDirection:"column",gap:0}}>
    <div style={{display:"grid",gridTemplateColumns:"130px 80px 100px 1fr 1fr",gap:4,padding:"5px 8px",background:t.section,borderRadius:"7px 7px 0 0",borderBottom:`1px solid ${t.dividerStrong}`}}>
      {["Date/heure","Module","Type","ID","Raison"].map((h,i)=><span key={i} style={{fontSize:9,color:t.textMuted,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5}}>{h}</span>)}
    </div>
    {entries.map(r=>(
      <div key={r.id} style={{display:"grid",gridTemplateColumns:"130px 80px 100px 1fr 1fr",gap:4,padding:"5px 8px",borderBottom:`1px solid ${t.divider}`,alignItems:"center"}}>
        <span style={{fontSize:9.5,color:t.textMuted,fontFamily:"'DM Mono',monospace"}}>{r.timestamp}</span>
        <span style={{fontSize:10,color:t.textSub}}>{MODULE_LABELS[r.module]||r.module}</span>
        <span style={{fontSize:9.5,color:t.text}}>{r.record_type}</span>
        <span style={{fontSize:9,color:t.textDim,fontFamily:"'DM Mono',monospace",overflow:"hidden",textOverflow:"ellipsis"}}>{r.record_id}</span>
        <span style={{fontSize:10,color:"#ef4444",fontStyle:"italic"}}>{r.reason||"—"}</span>
      </div>
    ))}
  </div>);
}

function IntegrityCheck(){
  const t=useT();
  const [results,setResults]=useState(null);const [loading,setLoading]=useState(false);
  const run=async()=>{
    setLoading(true);setResults(null);
    try{
      const dates=await window.api.snapshot.listDates();
      const diffs=[];
      for(const row of dates){
        const snap=await window.api.snapshot.getLatest(row.date);
        if(!snap)continue;
        const live=await window.api.storage.get("dicann-v7");
        if(!live?.value)continue;
        const allData=JSON.parse(live.value);
        const current=allData[row.date];
        if(!current)continue;
        const snapData=JSON.parse(snap.data);
        // Compare all top-level financial fields
        const WATCH=["hamEnd","hotEnd","hamReceived","hotReceived"];
        WATCH.forEach(f=>{
          if(snapData[f]!==current[f])diffs.push({date:row.date,field:f,snapValue:snapData[f],current:current[f],snapTime:snap.snapshot_timestamp});
        });
        // Compare caisses
        const snapC=snapData.cashes||[];const curC=current.cashes||[];
        snapC.forEach((sc,i)=>{
          const cc=curC[i];if(!cc)return;
          ["posVentes","posTPS","posTVQ","finalCash","float","interac"].forEach(f=>{
            if(sc[f]!==cc[f])diffs.push({date:row.date,field:`caisse[${i}].${f}`,snapValue:sc[f],current:cc[f],snapTime:snap.snapshot_timestamp});
          });
        });
      }
      setResults(diffs);
    }catch(e){setResults([]);}
    setLoading(false);
  };
  return(<div style={{display:"flex",flexDirection:"column",gap:8}}>
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <button onClick={run} disabled={loading} style={{padding:"6px 16px",borderRadius:6,border:"none",background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#fff",cursor:loading?"default":"pointer",fontWeight:700,fontSize:11}}>{loading?"Vérification…":"🔍 Lancer la vérification"}</button>
      {results&&<span style={{fontSize:11,color:results.length?'#ef4444':'#22c55e',fontWeight:700}}>{results.length?`${results.length} divergence${results.length>1?"s":""} détectée${results.length>1?"s":""}`:"✓ Aucune divergence"}</span>}
    </div>
    {results&&results.length>0&&(<div style={{background:t.card,border:`1px solid rgba(239,68,68,0.2)`,borderRadius:7,overflow:"hidden"}}>
      <div style={{display:"grid",gridTemplateColumns:"90px 150px 1fr 1fr 130px",gap:4,padding:"5px 8px",background:t.section,borderBottom:`1px solid ${t.dividerStrong}`}}>
        {["Date","Champ","Valeur snapshot","Valeur actuelle","Snapshot pris le"].map((h,i)=><span key={i} style={{fontSize:9,color:t.textMuted,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5}}>{h}</span>)}
      </div>
      {results.map((r,i)=>(
        <div key={i} style={{display:"grid",gridTemplateColumns:"90px 150px 1fr 1fr 130px",gap:4,padding:"5px 8px",borderBottom:`1px solid ${t.divider}`,alignItems:"center"}}>
          <span style={{fontSize:10,fontFamily:"'DM Mono',monospace",color:t.text}}>{r.date}</span>
          <span style={{fontSize:10,color:t.text}}>{r.field}</span>
          <span style={{fontSize:10,color:"#22c55e",fontFamily:"'DM Mono',monospace"}}>{r.snapValue??'—'}</span>
          <span style={{fontSize:10,color:"#ef4444",fontFamily:"'DM Mono',monospace",fontWeight:700}}>{r.current??'—'}</span>
          <span style={{fontSize:9,color:t.textMuted,fontFamily:"'DM Mono',monospace"}}>{r.snapTime}</span>
        </div>
      ))}
    </div>)}
  </div>);
}

// Enhanced AuditViewer with sub-tabs that wraps the existing viewer + reports
function AuditSection(){
  const t=useT();
  const [sub,setSub]=useState("journal");
  const TABS=[["journal","📋 Journal"],["corrections","⚠ Corrections"],["annulations","🚫 Annulations"],["integrite","🔍 Intégrité"]];
  const btnStyle=active=>({padding:"5px 12px",borderRadius:"6px 6px 0 0",border:`1px solid ${active?t.cardBorder:"transparent"}`,borderBottom:active?"none":"transparent",background:active?t.card:t.section,color:active?"#f97316":t.textSub,cursor:"pointer",fontWeight:active?700:400,fontSize:11,marginBottom:active?"-1px":"0"});
  return(<div>
    <div style={{display:"flex",gap:4,borderBottom:`1px solid ${t.cardBorder}`,marginBottom:10}}>
      {TABS.map(([id,label])=><button key={id} onClick={()=>setSub(id)} style={btnStyle(sub===id)}>{label}</button>)}
    </div>
    {sub==="journal"&&<AuditViewer/>}
    {sub==="corrections"&&<CorrectionReport/>}
    {sub==="annulations"&&<VoidReport/>}
    {sub==="integrite"&&<IntegrityCheck/>}
  </div>);
}

// ── MAIN ──
export default function App(){
  const [demoData]=useState(()=>genDemo());
  const [liveData,setLiveData]=useState({});
  const [roster,setRoster]=useState([]);
  const [empRoster,setEmpRoster]=useState([]);
  const [suppliers,setSuppliers]=useState(DEFAULT_SUPPLIERS);
  const [apiConfig,setApiConfig]=useState({auphanKey:"",weatherKey:"",gasKey:""});
  const [restoreMsg,setRestoreMsg]=useState('');
  const [backupInfo,setBackupInfo]=useState(null);
  const [updateAvailable,setUpdateAvailable]=useState(false);
  const [updating,setUpdating]=useState(false);
  const [themeName,setThemeName]=useState('dark');
  const theme=themeName==='light'?LIGHT:DARK;

  const [selectedDate,setSelectedDate]=useState(()=>dk(new Date()));
  const [activeTab,setActiveTab]=useState("daily");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [collapseMap,setCollapseMap]=useState({});
  const [empOpen,setEmpOpen]=useState(false);
  const [newCN,setNewCN]=useState("");
  const [newEN,setNewEN]=useState("");
  const [newEW,setNewEW]=useState("");
  const saveTimer=useRef(null);
  // Audit tracking refs (persist across renders, no re-render on change)
  const liveDataRef=useRef({});          // always-current copy of liveData for old-value reads
  const initialDatesRef=useRef(new Set()); // dates that existed on app load
  const sessionCreatedRef=useRef(new Set()); // new dates created this session
  const sessionCorrectionRef=useRef(new Map()); // date → correction reason already captured
  const [editingSupId,setEditingSupId]=useState(null);
  const [editingSupName,setEditingSupName]=useState("");
  const [platforms,setPlatforms]=useState(DEFAULT_PLATFORMS);
  const [newPlatformName,setNewPlatformName]=useState("");
  const [gasCheckLoading,setGasCheckLoading]=useState(false);
  const [gasCheckMsg,setGasCheckMsg]=useState(null);
  const [encaisseData,setEncaisseData]=useState({});
  const [encaisseConfig,setEncaisseConfig]=useState(DEFAULT_ENCAISSE_CONFIG);
  const encaisseTimer=useRef(null);
  const [appMode,setAppMode]=useState(null);
  const [upgradePromptOpen,setUpgradePromptOpen]=useState(false);
  const [companyInfo,setCompanyInfo]=useState(DEFAULT_COMPANY_INFO);
  const [docNums,setDocNums]=useState(DEFAULT_DOC_NUMS);
  const [facCategories,setFacCategories]=useState([]);
  const [facProduits,setFacProduits]=useState([]);
  const [facClients,setFacClients]=useState([]);
  const [facSoumissions,setFacSoumissions]=useState([]);
  const [facCommandes,setFacCommandes]=useState([]);
  const [facFactures,setFacFactures]=useState([]);
  const [facCreditNotes,setFacCreditNotes]=useState([]);

  const t=theme;

  useEffect(()=>{(async()=>{
    try{const r=await window.api.storage.get("dicann-v7");if(r?.value){const ld=JSON.parse(r.value);setLiveData(ld);liveDataRef.current=ld;initialDatesRef.current=new Set(Object.keys(ld).filter(k=>Object.keys(ld[k]||{}).length>0));}}catch(e){}
    try{const r2=await window.api.storage.get("dicann-roster");if(r2?.value)setRoster(JSON.parse(r2.value))}catch(e){}
    try{const r2b=await window.api.storage.get("dicann-emp-roster");if(r2b?.value)setEmpRoster(JSON.parse(r2b.value))}catch(e){}
    try{const r3=await window.api.storage.get("dicann-suppliers-v2");if(r3?.value)setSuppliers(JSON.parse(r3.value))}catch(e){}
    try{const r4=await window.api.storage.get("dicann-api-config");if(r4?.value)setApiConfig(JSON.parse(r4.value))}catch(e){}
    try{const r5=await window.api.storage.get("balanceiq-theme");if(r5?.value==='light'||r5?.value==='dark')setThemeName(r5.value)}catch(e){}
    try{const r6=await window.api.storage.get("dicann-platforms");if(r6?.value)setPlatforms(JSON.parse(r6.value))}catch(e){}
    try{const r7=await window.api.storage.get("dicann-encaisse");if(r7?.value)setEncaisseData(JSON.parse(r7.value))}catch(e){}
    try{const r8=await window.api.storage.get("dicann-encaisse-config");if(r8?.value)setEncaisseConfig(prev=>({...DEFAULT_ENCAISSE_CONFIG,...JSON.parse(r8.value)}))}catch(e){}
    try{const r9=await window.api.storage.get("balanceiq-mode");if(r9?.value)setAppMode(r9.value);else setAppMode(null)}catch(e){setAppMode(null)}
    try{const r10=await window.api.storage.get("dicann-company-info");if(r10?.value)setCompanyInfo(prev=>({...DEFAULT_COMPANY_INFO,...JSON.parse(r10.value)}))}catch(e){}
    try{const r11=await window.api.storage.get("dicann-fac-categories");if(r11?.value)setFacCategories(JSON.parse(r11.value))}catch(e){}
    try{const r12=await window.api.storage.get("dicann-fac-produits");if(r12?.value)setFacProduits(JSON.parse(r12.value))}catch(e){}
    try{const r13=await window.api.storage.get("dicann-fac-clients");if(r13?.value)setFacClients(JSON.parse(r13.value))}catch(e){}
    try{const r14=await window.api.storage.get("dicann-doc-nums");if(r14?.value)setDocNums(prev=>({...DEFAULT_DOC_NUMS,...JSON.parse(r14.value)}))}catch(e){}
    try{const r15=await window.api.storage.get("dicann-fac-soumissions");if(r15?.value)setFacSoumissions(JSON.parse(r15.value))}catch(e){}
    try{const r16=await window.api.storage.get("dicann-fac-commandes");if(r16?.value)setFacCommandes(JSON.parse(r16.value))}catch(e){}
    try{const r17=await window.api.storage.get("dicann-fac-factures");if(r17?.value)setFacFactures(JSON.parse(r17.value))}catch(e){}
    try{const r18=await window.api.storage.get("dicann-fac-creditnotes");if(r18?.value)setFacCreditNotes(JSON.parse(r18.value))}catch(e){}
    setLoading(false);
    // Load auto-backup info after a short delay (backup runs at t+3s)
    setTimeout(async()=>{try{const info=await window.api.backup.getInfo();setBackupInfo(info)}catch(_){}},4000);
  })()},[]);

  useEffect(()=>{
    if(window.api?.updater){
      window.api.updater.onAvailable(()=>setUpdateAvailable(true));
    }
  },[]);

  // Keep liveDataRef in sync so audit callbacks can read old values synchronously
  useEffect(()=>{liveDataRef.current=liveData;},[liveData]);

  // Track which dates have had a snapshot taken this session (avoid duplicates)
  const snapshotTakenRef=useRef(new Set());

  useEffect(()=>{
    if(loading)return;
    const today=dk(new Date());
    if(selectedDate!==today)return;
    if(!apiConfig.weatherLat||!apiConfig.weatherLng)return;
    const r=getLR(selectedDate);
    if(r.weather||r.tempC!=null)return;
    (async()=>{try{
      const res=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${apiConfig.weatherLat}&longitude=${apiConfig.weatherLng}&current=temperature_2m,weather_code`);
      const data=await res.json();
      const code=data?.current?.weather_code;
      const temp=data?.current?.temperature_2m;
      if(code!=null)upd(today,"weather",WMO_FR(code));
      if(temp!=null)upd(today,"tempC",Math.round(temp));
    }catch(e){}})();
  },[loading,selectedDate,apiConfig.weatherLat,apiConfig.weatherLng]);

  const toggleTheme=useCallback(()=>{
    const next=themeName==='dark'?'light':'dark';
    setThemeName(next);
    window.api.storage.set("balanceiq-theme",next).catch(()=>{});
  },[themeName]);

  const setThemeTo=useCallback(name=>{
    setThemeName(name);
    window.api.storage.set("balanceiq-theme",name).catch(()=>{});
  },[]);

  const persist=useCallback(data=>{if(saveTimer.current)clearTimeout(saveTimer.current);setSaving(true);saveTimer.current=setTimeout(async()=>{try{await window.api.storage.set("dicann-v7",JSON.stringify(data))}catch(e){}setSaving(false)},600)},[]);
  const saveRoster=useCallback(async r=>{try{await window.api.storage.set("dicann-roster",JSON.stringify(r))}catch(e){}},[]);
  const saveEmpRoster=useCallback(async r=>{try{await window.api.storage.set("dicann-emp-roster",JSON.stringify(r))}catch(e){}},[]);
  const saveSup=useCallback(async s=>{try{await window.api.storage.set("dicann-suppliers-v2",JSON.stringify(s))}catch(e){}},[]);
  const savePlatforms=useCallback(async p=>{try{await window.api.storage.set("dicann-platforms",JSON.stringify(p))}catch(e){}},[]);
  const saveApiCfg=useCallback(async c=>{try{await window.api.storage.set("dicann-api-config",JSON.stringify(c))}catch(e){}},[]);
  const persistEncaisse=useCallback(data=>{setEncaisseData(data);if(encaisseTimer.current)clearTimeout(encaisseTimer.current);encaisseTimer.current=setTimeout(async()=>{try{await window.api.storage.set("dicann-encaisse",JSON.stringify(data))}catch(e){}},600)},[]);
  const saveEncaisseConfig=useCallback(cfg=>{setEncaisseConfig(cfg);window.api.storage.set("dicann-encaisse-config",JSON.stringify(cfg)).catch(()=>{})},[]);
  const saveAppMode=useCallback(mode=>{setAppMode(mode);window.api.storage.set("balanceiq-mode",mode).catch(()=>{})},[]);
  const showUpgradePrompt=useCallback(featureName=>{if(shouldShowUpgradePrompt(featureName))setUpgradePromptOpen(true)},[]);
  const saveCompanyInfo=useCallback(info=>{setCompanyInfo(info);window.api.storage.set("dicann-company-info",JSON.stringify(info)).catch(()=>{})},[]);
  const saveFacCategories=useCallback(cats=>{setFacCategories(cats);window.api.storage.set("dicann-fac-categories",JSON.stringify(cats)).catch(()=>{})},[]);
  const saveFacProduits=useCallback(prods=>{setFacProduits(prods);window.api.storage.set("dicann-fac-produits",JSON.stringify(prods)).catch(()=>{})},[]);
  const saveFacClients=useCallback(list=>{setFacClients(list);window.api.storage.set("dicann-fac-clients",JSON.stringify(list)).catch(()=>{})},[]);
  const saveDocNums=useCallback(nums=>{setDocNums(nums);window.api.storage.set("dicann-doc-nums",JSON.stringify(nums)).catch(()=>{})},[]);
  const saveFacSoumissions=useCallback(list=>{setFacSoumissions(list);window.api.storage.set("dicann-fac-soumissions",JSON.stringify(list)).catch(()=>{})},[]);
  const saveFacCommandes=useCallback(list=>{setFacCommandes(list);window.api.storage.set("dicann-fac-commandes",JSON.stringify(list)).catch(()=>{})},[]);
  const saveFacFactures=useCallback(list=>{setFacFactures(list);window.api.storage.set("dicann-fac-factures",JSON.stringify(list)).catch(()=>{})},[]);
  const saveFacCreditNotes=useCallback(list=>{setFacCreditNotes(list);window.api.storage.set("dicann-fac-creditnotes",JSON.stringify(list)).catch(()=>{})},[]);

  // ── raw state updaters (no audit) ──
  const _updRaw=useCallback((dt,f,v)=>{setLiveData(p=>{const u={...p,[dt]:{...(p[dt]||{}),[f]:v}};persist(u);return u})},[persist]);
  const _updCashRaw=useCallback((dt,i,c)=>{setLiveData(p=>{const d={...(p[dt]||{})};const cs=[...(d.cashes||[{...BLANK_CASH}])];cs[i]=c;const u={...p,[dt]:{...d,cashes:cs}};persist(u);return u})},[persist]);
  const _updEmpRaw=useCallback((dt,i,e)=>{setLiveData(p=>{const d={...(p[dt]||{})};const es=[...(d.employees||[])];es[i]=e;const u={...p,[dt]:{...d,employees:es}};persist(u);return u})},[persist]);

  // ── audit-aware updaters ──
  const upd=useCallback((dt,f,v)=>{
    const oldVal=liveDataRef.current[dt]?.[f];
    _updRaw(dt,f,v);
    const isExisting=initialDatesRef.current.has(dt);
    if(!isExisting&&!sessionCreatedRef.current.has(dt)){
      logCreate('daily','jour',dt,{[f]:v});sessionCreatedRef.current.add(dt);
    }else if(isExisting&&isFinancialField('daily',f)){
      if(sessionCorrectionRef.current.has(dt)){
        logCorrection('daily','jour',dt,f,oldVal,v,sessionCorrectionRef.current.get(dt));
      }else{
        promptCorrectionReason(DAILY_FIELD_LABELS[f]||f).then(reason=>{
          if(reason){sessionCorrectionRef.current.set(dt,reason);logCorrection('daily','jour',dt,f,oldVal,v,reason);}
          else{_updRaw(dt,f,oldVal??null);}
        });
      }
    }else{logUpdate('daily','jour',dt,f,oldVal,v);}
  },[_updRaw]);

  const checkGasPrice=useCallback(async()=>{
    setGasCheckLoading(true);setGasCheckMsg(null);
    try{
      const result=await window.api.gas.getPrice();
      if(result?.price){
        upd(selectedDate,"gas",result.price);
        setGasCheckMsg({ok:true,text:`✓ Prix mis à jour: ${Number(result.price).toFixed(3)} $/L`});
      }else{
        setGasCheckMsg({ok:false,text:"Impossible de vérifier — entrer le prix manuellement"});
      }
    }catch(e){
      setGasCheckMsg({ok:false,text:"Impossible de vérifier — entrer le prix manuellement"});
    }finally{
      setGasCheckLoading(false);
    }
  },[selectedDate,upd]);
  const updCash=useCallback((dt,i,newCash)=>{
    const oldCash=(liveDataRef.current[dt]?.cashes||[])[i]||{};
    _updCashRaw(dt,i,newCash);
    const isExisting=initialDatesRef.current.has(dt);
    const allKeys=new Set([...Object.keys(oldCash),...Object.keys(newCash)]);
    for(const key of allKeys){
      if(oldCash[key]===newCash[key])continue;
      if(isExisting&&isFinancialField('daily',key)){
        if(sessionCorrectionRef.current.has(dt)){
          logCorrection('daily','caisse',`${dt}:${i}`,key,oldCash[key],newCash[key],sessionCorrectionRef.current.get(dt));
        }else{
          const snap={...oldCash};
          promptCorrectionReason(DAILY_FIELD_LABELS[key]||key).then(reason=>{
            if(reason){sessionCorrectionRef.current.set(dt,reason);logCorrection('daily','caisse',`${dt}:${i}`,key,snap[key],newCash[key],reason);}
            else{_updCashRaw(dt,i,snap);}
          });
        }
        break;
      }else{logUpdate('daily','caisse',`${dt}:${i}`,key,oldCash[key],newCash[key]);}
    }
  },[_updCashRaw]);
  const addCash=useCallback(dt=>{setLiveData(p=>{const d={...(p[dt]||{})};const cs=[...(d.cashes||[{...BLANK_CASH}])];cs.push({...BLANK_CASH});const u={...p,[dt]:{...d,cashes:cs}};persist(u);return u});logUpdate('daily','jour',dt,'caisses',null,'ajout');},[persist]);
  const rmCash=useCallback((dt,i)=>{setLiveData(p=>{const d={...(p[dt]||{})};const cs=[...(d.cashes||[])];cs.splice(i,1);const u={...p,[dt]:{...d,cashes:cs}};persist(u);return u});logUpdate('daily','jour',dt,'caisses',null,`retrait:${i}`);},[persist]);
  const updEmp=useCallback((dt,i,newEmp)=>{
    const oldEmp=(liveDataRef.current[dt]?.employees||[])[i]||{};
    _updEmpRaw(dt,i,newEmp);
    const allKeys=new Set([...Object.keys(oldEmp),...Object.keys(newEmp)]);
    allKeys.forEach(key=>{if(oldEmp[key]!==newEmp[key])logUpdate('daily','employe',`${dt}:${i}`,key,oldEmp[key],newEmp[key]);});
  },[_updEmpRaw]);
  const addEmp=useCallback((dt,empEntry)=>{setLiveData(p=>{const d={...(p[dt]||{})};const es=[...(d.employees||[])];es.push(empEntry||{...BLANK_EMP});const u={...p,[dt]:{...d,employees:es}};persist(u);return u});logUpdate('daily','employe',dt,'ajout',null,JSON.stringify(empEntry));},[persist]);
  const rmEmp=useCallback((dt,i)=>{setLiveData(p=>{const d={...(p[dt]||{})};const es=[...(d.employees||[])];es.splice(i,1);const u={...p,[dt]:{...d,employees:es}};persist(u);return u});logUpdate('daily','employe',dt,'retrait',null,`index:${i}`);},[persist]);

  const getLR=useCallback(dt=>{const l=liveData[dt];if(!l||!Object.keys(l).length)return{...BLANK_DAY,cashes:[{...BLANK_CASH}],employees:[]};return{...BLANK_DAY,...l,cashes:l.cashes||[{...BLANK_CASH}],employees:l.employees||[]}},[liveData]);
  const getIC=useCallback(dt=>{const p=liveData[prevDk(dt)];return p?{hamEnd:p.hamEnd??null,hotEnd:p.hotEnd??null}:{hamEnd:null,hotEnd:null}},[liveData]);
  const computeDay=useCallback(dt=>{
    const r=getLR(dt);const carry=getIC(dt);
    const hamS=r.hamStartOverride!=null?r.hamStartOverride:(carry.hamEnd??null);const hotS=r.hotStartOverride!=null?r.hotStartOverride:(carry.hotEnd??null);
    const hR=r.hamReceived||0,hoR=r.hotReceived||0;
    const hamU=(hamS!=null&&r.hamEnd!=null)?hamS+hR-r.hamEnd:null;const hotU=(hotS!=null&&r.hotEnd!=null)?hotS+hoR-r.hotEnd:null;
    const tDoz=(hamU||0)+(hotU||0);const cashes=r.cashes||[];
    let vN=0,allB=true,anyD=false;
    cashes.forEach(c=>{const mc=c.float!=null&&c.deposits!=null&&c.finalCash!=null;const manT=mc?(c.interac||0)+(c.livraisons||0)+(c.deposits||0)+(c.finalCash||0)-(c.float||0):0;vN+=manT;const posT=(c.posVentes||0)+(c.posTPS||0)+(c.posTVQ||0)+(c.posLivraisons||0);if(c.posVentes!=null||c.interac!=null||c.finalCash!=null)anyD=true;if(!mc||!c.posVentes||Math.abs(manT-posT)>1)allB=false});
    const tps=Math.round(vN*0.05*100)/100;const tvq=Math.round(vN*0.09975*100)/100;const tot=Math.round((vN+tps+tvq)*100)/100;
    const moy=vN>0&&tDoz>0?vN/tDoz:null;
    const emps=r.employees||[];let labC=0,labH=0;emps.forEach(e=>{if(e.hours&&e.wage){labC+=e.hours*e.wage;labH+=e.hours}});
    const labP=vN>0&&labC>0?(labC/vN)*100:null;
    return{...r,venteNet:vN,tps,tvq,total:tot,allBal:allB,anyData:anyD,hamStart:hamS,hamEnd:r.hamEnd,hamReceived:hR,hamUsed:hamU,hotStart:hotS,hotEnd:r.hotEnd,hotReceived:hoR,hotUsed:hotU,totalDoz:tDoz,moyenne:moy,labourCost:labC,labourHrs:labH,labourPct:labP};
  },[getLR,getIC]);

  const today=computeDay(selectedDate);const d=new Date(selectedDate+"T12:00:00");const holiday=getHol(d);const raw=getLR(selectedDate);const cashes=raw.cashes;const emps=raw.employees;
  const isDayComplete=today.anyData&&today.allBal&&raw.hamEnd!=null&&raw.hotEnd!=null;

  // Auto-snapshot when a day becomes "complete" — once per date per session
  useEffect(()=>{
    if(!isDayComplete||loading)return;
    const key=selectedDate;
    if(snapshotTakenRef.current.has(key))return;
    snapshotTakenRef.current.add(key);
    // Take snapshot asynchronously — fire and forget
    const dayData=liveDataRef.current[key];
    if(dayData&&Object.keys(dayData).length>0){
      window.api.snapshot.save(key,dayData).catch(()=>{});
      logUpdate('daily','snapshot',key,'fermeture',null,'journée complète');
    }
  },[isDayComplete,selectedDate,loading]);

  const encaisseStatus=useMemo(()=>{
    const dayEnc=encaisseData[selectedDate];
    if(!dayEnc)return"empty";
    const hasAny=(dayEnc.autreEntrees?.length>0)||(dayEnc.deposits?.length>0)||(dayEnc.sorties?.length>0)||Object.values(dayEnc.physicalCount||{}).some(v=>v!=null)||dayEnc.openingOverride!=null;
    if(!hasAny)return"empty";
    const locs=encaisseConfig.cashLocations;
    const physEntered=locs.some(loc=>(dayEnc.physicalCount||{})[loc.id]!=null);
    if(!physEntered)return"pending";
    const dates=Object.keys(encaisseData).filter(k=>!k.startsWith("_")&&k<=selectedDate).sort();
    const allDates=[...new Set([...dates,selectedDate])].sort();
    let prevClosing=null,result=null;
    for(const dt of allDates){
      const enc={openingOverride:null,autreEntrees:[],deposits:[],sorties:[],physicalCount:{},carryForwardMode:"calculated",...(encaisseData[dt]||{})};
      const opening=enc.openingOverride!=null?enc.openingOverride:(prevClosing??null);
      const cDay=liveData[dt];let cashVentes=0;
      if(cDay?.cashes)cDay.cashes.forEach(c=>{if(c.finalCash!=null&&c.float!=null)cashVentes+=(c.finalCash-c.float);});
      const autreEntreesTotal=enc.autreEntrees.reduce((s,e)=>s+(e.montant||0),0);
      const depositsTotal=enc.deposits.reduce((s,d2)=>s+(d2.montant||0),0);
      const sortiesTotal=enc.sorties.reduce((s,s2)=>s+(s2.montant||0),0);
      const calculated=(opening||0)+cashVentes+autreEntreesTotal-depositsTotal-sortiesTotal;
      const physTotal=locs.reduce((s,loc)=>s+((enc.physicalCount[loc.id])||0),0);
      const pEntered=locs.some(loc=>enc.physicalCount[loc.id]!=null);
      const ecart=pEntered?physTotal-calculated:null;
      const carryMode=enc.carryForwardMode||"calculated";
      const closing=carryMode==="physical"&&pEntered?physTotal:calculated;
      if(dt===selectedDate)result={physEntered:pEntered,balanced:ecart!=null&&Math.abs(ecart)<=2};
      prevClosing=closing;
    }
    if(!result)return"empty";
    if(!result.physEntered)return"pending";
    return result.balanced?"balanced":"error";
  },[encaisseData,encaisseConfig,liveData,selectedDate]);

  const lastGas=useMemo(()=>{
    if(raw.gas!=null&&raw.gas!=="")return null;
    for(let i=1;i<=14;i++){
      const prev=new Date(d);prev.setDate(d.getDate()-i);const pk=dk(prev);
      const pd=liveData[pk];
      if(pd?.gas!=null&&pd.gas!=="")return{price:pd.gas,daysAgo:i,date:pk};
    }
    return null;
  },[raw.gas,d,liveData]);

  const velocityProfiles=useMemo(()=>{
    const vp=Array(7).fill(null).map(()=>Array(4).fill(null).map(()=>({ham:[],hot:[]})));
    Object.entries(liveData).forEach(([date,dayData])=>{
      const cd=computeDay(date);
      const hamAvail=(cd.hamStart??0)+(cd.hamReceived||0);
      const hotAvail=(cd.hotStart??0)+(cd.hotReceived||0);
      if(hamAvail<=0&&hotAvail<=0)return;
      const dow2=new Date(date+"T12:00:00").getDay();
      const hB14=dayData.hamB14,hB17=dayData.hamB17,hB19=dayData.hamB19,hB20=dayData.hamB20;
      const oB14=dayData.hotB14,oB17=dayData.hotB17,oB19=dayData.hotB19,oB20=dayData.hotB20;
      if(hB14!=null&&hamAvail>0)vp[dow2][0].ham.push(hamAvail-hB14);
      if(hB14!=null&&hB17!=null)vp[dow2][1].ham.push(hB14-hB17);
      if(hB17!=null&&hB19!=null)vp[dow2][2].ham.push(hB17-hB19);
      if(hB19!=null&&hB20!=null)vp[dow2][3].ham.push(hB19-hB20);
      if(oB14!=null&&hotAvail>0)vp[dow2][0].hot.push(hotAvail-oB14);
      if(oB14!=null&&oB17!=null)vp[dow2][1].hot.push(oB14-oB17);
      if(oB17!=null&&oB19!=null)vp[dow2][2].hot.push(oB17-oB19);
      if(oB19!=null&&oB20!=null)vp[dow2][3].hot.push(oB19-oB20);
    });
    return vp;
  },[liveData,computeDay]);

  const displayGas=raw.gas!=null&&raw.gas!==""?raw.gas:lastGas?.price??null;
  const dow=d.getDay();const mOff=(dow+6)%7;let wkC=0;for(let i=0;i<=(dow===0?6:dow-1);i++){const wd=new Date(d);wd.setDate(d.getDate()-mOff+i);wkC+=computeDay(dk(wd)).venteNet}
  let mtdTotal=0,mtdDays=0;{const[sy,sm,sd]=selectedDate.split("-");const sdi=parseInt(sd);for(let day=1;day<=sdi;day++){const k=`${sy}-${sm}-${String(day).padStart(2,"0")}`;const cd=computeDay(k);if(cd.venteNet>0){mtdTotal+=cd.venteNet;mtdDays++;}}}
  const hasL=Object.keys(liveData[selectedDate]||{}).length>0;
  const togC=i=>setCollapseMap(p=>({...p,[`${selectedDate}-${i}`]:!p[`${selectedDate}-${i}`]}));
  const addRC=()=>{if(!newCN.trim())return;const nr=[...roster,{id:Date.now().toString(),name:newCN.trim()}];setRoster(nr);saveRoster(nr);setNewCN("")};

  const buildDailyHTML=()=>{
    const dateStr=fmtD(d);
    let h=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Rapport — ${selectedDate}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font:13px/1.6 Arial,sans-serif;padding:30px;color:#222}h1{font-size:20px;color:#ea580c;margin-bottom:4px}h3{font-size:13px;color:#555;margin:16px 0 6px;text-transform:uppercase;letter-spacing:0.5px}table{border-collapse:collapse;width:100%;margin-bottom:8px}th,td{border:1px solid #ddd;padding:6px 10px;font-size:12px}th{background:#f7f7f7;font-weight:600;text-align:left}td:first-child{text-align:left}td{text-align:right}.g{color:#16a34a;font-weight:700}.r{color:#dc2626;font-weight:700}.sub{font-size:11px;color:#888}@media print{body{padding:15px}}</style></head><body>`;
    h+=`<h1>BalanceIQ — Rapport journalier</h1><p class="sub" style="text-transform:capitalize">${dateStr}${holiday?` · ${holiday}`:""}</p>`;
    h+=`<h3>Ventes</h3><table><tr><th>Vente nette</th><th>TPS</th><th>TVQ</th><th>Total brut</th></tr><tr><td>${fmt(today.venteNet)}</td><td>${fmt(today.tps)}</td><td>${fmt(today.tvq)}</td><td>${fmt(today.total)}</td></tr></table>`;
    h+=`<h3>Caisses</h3><table><tr><th>Caisse</th><th>Total compté</th><th>Total POS</th><th>Statut</th></tr>`;
    cashes.forEach((c,i)=>{const rN=roster.find(r=>r.id===c.cashierId)?.name||`Caisse ${i+1}`;const mc=c.float!=null&&c.deposits!=null&&c.finalCash!=null;const manT=mc?(c.interac||0)+(c.livraisons||0)+(c.deposits||0)+(c.finalCash||0)-(c.float||0):null;const posT=(c.posVentes||0)+(c.posTPS||0)+(c.posTVQ||0)+(c.posLivraisons||0);const bal=mc&&c.posVentes!=null&&Math.abs(manT-posT)<=1;h+=`<tr><td>${rN}</td><td>${manT!=null?fmt(manT):"—"}</td><td>${c.posVentes!=null?fmt(posT):"—"}</td><td class="${bal?"g":"r"}">${bal?"✓ Balancé":mc&&c.posVentes!=null?`Écart: ${fmt(manT-posT)}`:"Incomplet"}</td></tr>`});
    h+=`</table>`;
    h+=`<h3>Inventaire</h3><table><tr><th>Produit</th><th>Début</th><th>+Reçu</th><th>Fin</th><th>Utilisé</th></tr>`;
    h+=`<tr><td>Hamburger</td><td>${today.hamStart??"-"}</td><td>${today.hamReceived||0}</td><td>${today.hamEnd??"-"}</td><td>${today.hamUsed??"-"}</td></tr>`;
    h+=`<tr><td>Hot Dog</td><td>${today.hotStart??"-"}</td><td>${today.hotReceived||0}</td><td>${today.hotEnd??"-"}</td><td>${today.hotUsed??"-"}</td></tr>`;
    h+=`</table>`;
    if(today.totalDoz>0)h+=`<p class="sub">$/douzaine: ${fmt(today.moyenne)} (${fmt(today.venteNet)} ÷ ${today.totalDoz} dz)</p>`;
    if(raw.weather||raw.tempC!=null||raw.gas!=null){h+=`<h3>Facteurs externes</h3><table><tr>`;if(raw.weather)h+=`<th>Météo</th><td>${raw.weather}</td>`;if(raw.tempC!=null)h+=`<th>Température</th><td>${raw.tempC}°C</td>`;if(raw.gas!=null)h+=`<th>Essence</th><td>${Number(raw.gas).toFixed(3)} $/L</td>`;if(raw.events)h+=`<th>Événement</th><td>${raw.events}</td>`;h+=`</tr></table>`;}
    if(emps.length>0){h+=`<h3>Main d'œuvre</h3><table><tr><th>Employé</th><th>Heures</th><th>$/h</th><th>Coût</th></tr>`;emps.forEach(e=>{const cost=(e.hours||0)*(e.wage||0);h+=`<tr><td>${e.name||"—"}</td><td>${e.hours??"-"}</td><td>${e.wage?`${e.wage.toFixed(2)}`:"-"}</td><td>${cost>0?fmt(cost):"—"}</td></tr>`});h+=`<tr style="font-weight:700"><td colspan="2">Total: ${today.labourHrs}h</td><td></td><td>${fmt(today.labourCost)}${today.labourPct!=null?` (${today.labourPct.toFixed(1)}%)`:""}</td></tr></table>`;}
    if(raw.notes)h+=`<h3>Notes</h3><p style="font-size:12px;white-space:pre-wrap;padding:8px;background:#f9f9f9;border-radius:4px">${raw.notes}</p>`;
    h+=`<p class="sub" style="margin-top:24px">BalanceIQ · ${OWNER_EMAIL}</p></body></html>`;
    return h;
  };

  const tabs=[{id:"daily",label:"Quotidien"},{id:"monthly",label:"P&L Mensuel"},{id:"encaisse",label:"💵 Encaisse"},{id:"intelligence",label:"Intelligence"},{id:"settings",label:"Config"}];

  const inputStyle={background:t.inputBg,border:`1px solid ${t.inputBorder}`,borderRadius:5,color:t.text,fontSize:12,padding:"5px 8px",outline:"none"};

  if(loading)return(<div style={{minHeight:"100vh",background:DARK.bg,display:"flex",alignItems:"center",justifyContent:"center",color:"#4a4e5e",fontFamily:"'Outfit',sans-serif"}}>Chargement...</div>);
  if(!appMode)return(<WelcomeScreen onSelect={saveAppMode}/>);

  return(
    <ThemeCtx.Provider value={theme}>
      {upgradePromptOpen&&<UpgradePrompt onClose={()=>setUpgradePromptOpen(false)}/>}
      <div style={{minHeight:"100vh",background:t.bg,fontFamily:"'Outfit','Helvetica Neue',sans-serif",color:t.text,transition:"background 0.2s,color 0.2s"}}>

        {/* ── HEADER ── */}
        <div style={{background:t.headerBg,borderBottom:`1px solid ${t.headerBorder}`,padding:"9px 15px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",maxWidth:1120,margin:"0 auto"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:32,height:28,borderRadius:6,background:"linear-gradient(135deg,#f97316,#ea580c)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:"#fff",letterSpacing:-0.5}}>BIQ</div>
              <span style={{fontSize:14,fontWeight:700,color:t.text}}>BalanceIQ</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              {saving&&<span style={{fontSize:9,color:"#f97316",fontFamily:"'DM Mono',monospace"}}>sauvegarde...</span>}
              {hasL&&<Pill ok label="Saisie"/>}
              <button onClick={toggleTheme} style={{background:t.section,border:`1px solid ${t.cardBorder}`,borderRadius:5,color:t.textSub,fontSize:11,padding:"3px 8px",cursor:"pointer",fontWeight:600,fontFamily:"'DM Mono',monospace"}}>
                {themeName==='dark'?'☀ Clair':'☾ Foncé'}
              </button>
            </div>
          </div>
        </div>

        {/* ── UPDATE BAR ── */}
        {updateAvailable&&<div style={{background:"linear-gradient(90deg,rgba(249,115,22,0.15),rgba(234,88,12,0.1))",borderBottom:"1px solid rgba(249,115,22,0.3)",padding:"7px 15px",display:"flex",alignItems:"center",justifyContent:"center",gap:12}}>
          <span style={{fontSize:12,color:"#f97316",fontWeight:600}}>
            {updating?"Téléchargement en cours...":"Nouvelle version disponible — Cliquer pour mettre à jour"}
          </span>
          {!updating&&<button onClick={async()=>{setUpdating(true);await window.api.updater.downloadAndInstall();}} style={{padding:"3px 12px",borderRadius:5,border:"1px solid rgba(249,115,22,0.5)",background:"rgba(249,115,22,0.2)",color:"#f97316",cursor:"pointer",fontWeight:700,fontSize:11}}>Installer</button>}
        </div>}

        {/* ── DATE NAV + TABS ── */}
        <div style={{maxWidth:1120,margin:"0 auto",padding:"8px 15px 0"}}>
          {activeTab==="daily"&&(
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <button onClick={()=>{const n=new Date(d);n.setDate(n.getDate()-1);setSelectedDate(dk(n))}} style={{background:t.section,border:`1px solid ${t.cardBorder}`,borderRadius:5,color:t.text,padding:"3px 8px",cursor:"pointer",fontSize:13}}>←</button>
                <div>
                  <div style={{fontSize:15,fontWeight:700,textTransform:"capitalize",color:t.text,display:"flex",alignItems:"center",gap:6}}>{fmtD(d)}{isDayComplete&&<span style={{fontSize:9.5,fontWeight:700,color:"#16a34a",background:"rgba(34,197,94,0.1)",border:"1px solid rgba(34,197,94,0.2)",borderRadius:10,padding:"1px 7px",lineHeight:1.6}}>✓ Journée complète</span>}</div>
                  <div style={{display:"flex",gap:3,marginTop:1,flexWrap:"wrap"}}>
                    {holiday&&<span style={{fontSize:9,background:t.warnBg,color:t.warnText,padding:"1px 5px",borderRadius:8,fontWeight:600}}>{holiday}</span>}
                    {today.weather&&<span style={{fontSize:9,background:"rgba(56,189,248,0.07)",color:"#38bdf8",padding:"1px 5px",borderRadius:8}}>{today.weather}{today.tempC!=null?` ${today.tempC}°C`:""}</span>}
                    {displayGas!=null&&<span style={{fontSize:9,background:lastGas?t.warnBg:t.section,color:lastGas?t.warnText:t.textSub,padding:"1px 5px",borderRadius:8}}>⛽ {Number(displayGas).toFixed(3)}$/L{lastGas?" (auto)":""}</span>}
                  </div>
                </div>
                <button onClick={()=>{const n=new Date(d);n.setDate(n.getDate()+1);setSelectedDate(dk(n))}} style={{background:t.section,border:`1px solid ${t.cardBorder}`,borderRadius:5,color:t.text,padding:"3px 8px",cursor:"pointer",fontSize:13}}>→</button>
              </div>
              <input type="date" value={selectedDate} onChange={e=>e.target.value&&setSelectedDate(e.target.value)} style={{...inputStyle,fontFamily:"'DM Mono',monospace",fontSize:11}}/>
            </div>
          )}
          <div style={{display:"flex",gap:1,marginTop:8,borderBottom:`1px solid ${t.dividerMid}`,overflowX:"auto",alignItems:"center"}}>
            {tabs.map(tab=>(<button key={tab.id} onClick={()=>setActiveTab(tab.id)} style={{background:"none",border:"none",color:activeTab===tab.id?"#f97316":t.textMuted,fontSize:11.5,fontWeight:600,padding:"5px 9px",cursor:"pointer",borderBottom:activeTab===tab.id?"2px solid #f97316":"2px solid transparent",whiteSpace:"nowrap"}}>{tab.label}</button>))}
            <div style={{flex:1}}/>
            <div style={{width:1,height:16,background:t.dividerMid,margin:"0 6px",flexShrink:0}}/>
            <button onClick={()=>setActiveTab("facturation")} style={{background:"none",border:"none",color:activeTab==="facturation"?"#f97316":t.textMuted,fontSize:11.5,fontWeight:600,padding:"5px 9px",cursor:"pointer",borderBottom:activeTab==="facturation"?"2px solid #f97316":"2px solid transparent",whiteSpace:"nowrap"}}>🧾 Facturation</button>
          </div>
        </div>

        {/* ── CONTENT ── */}
        <div style={{maxWidth:1120,margin:"0 auto",padding:"10px 15px 30px"}}>

          {/* DAILY TAB */}
          {activeTab==="daily"&&(<div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
              <MC label="Vente nette" value={fmt(today.venteNet)} accent={t.posColor}/>
              <MC label="Total brut" value={fmt(today.total)} accent="#f97316"/>
              <MC label="$/douzaine" value={today.moyenne?fmt(today.moyenne):"—"} accent="#7c3aed"/>
              <MC label="Cumul sem." value={fmt(wkC)}/>
              <MC label="Mois en cours" value={fmt(mtdTotal)} sub={`${mtdDays} jr${mtdDays!==1?"s":""}`}/>
              {today.labourPct!=null&&<MC label="Main d'œuvre" value={`${today.labourPct.toFixed(1)}%`} sub={fmt(today.labourCost)} accent={today.labourPct>35?"#ef4444":today.labourPct>28?t.warnText:"#22c55e"}/>}
              <div style={{background:t.section,border:`1px solid ${t.sectionBorder}`,borderRadius:8,padding:"9px 13px",display:"flex",flexDirection:"column",gap:1,minWidth:100,flex:"0 0 auto",cursor:"pointer"}} onClick={()=>setActiveTab("encaisse")}>
                <span style={{fontSize:8.5,color:t.textMuted,textTransform:"uppercase",letterSpacing:0.8,fontWeight:600}}>Encaisse</span>
                <span style={{fontSize:18,fontWeight:700,fontFamily:"'DM Mono',monospace",color:encaisseStatus==="balanced"?"#22c55e":encaisseStatus==="error"?"#ef4444":encaisseStatus==="pending"?"#f97316":t.textDim}}>
                  {encaisseStatus==="balanced"?"✓":encaisseStatus==="error"?"✗":encaisseStatus==="pending"?"⏳":"—"}
                </span>
                <span style={{fontSize:9.5,color:t.textMuted}}>{encaisseStatus==="balanced"?"Balancé":encaisseStatus==="error"?"Écart":encaisseStatus==="pending"?"En cours":"Non saisi"}</span>
              </div>
            </div>

            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                <span style={{fontSize:13.5,fontWeight:700,color:t.text}}>Caisses</span>
                <button onClick={()=>addCash(selectedDate)} style={{fontSize:10.5,padding:"3px 10px",borderRadius:5,border:"1px solid rgba(249,115,22,0.18)",background:"rgba(249,115,22,0.06)",color:"#f97316",cursor:"pointer",fontWeight:600}}>+ Caisse</button>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {cashes.map((c,i)=>(<CashBlock key={`${selectedDate}-${i}-${cashes.length}`} cash={c} index={i} onChange={c=>updCash(selectedDate,i,c)} onRemove={()=>rmCash(selectedDate,i)} canRemove={cashes.length>1} collapsed={!!collapseMap[`${selectedDate}-${i}`]} onToggle={()=>togC(i)} roster={roster}/>))}
              </div>
            </div>

            {today.anyData&&(<div style={{padding:"6px 10px",borderRadius:6,textAlign:"center",background:today.allBal?t.balStatusBg:t.warnStatusBg,border:`1px solid ${today.allBal?t.reconBalBorder:t.reconErrBorder}`}}>
              {today.allBal
                ?<span style={{fontSize:12,color:"#16a34a",fontWeight:600}}>✓ Toutes les caisses balancent</span>
                :<span style={{fontSize:12,color:t.warnText,fontWeight:600}}>Vérifier les caisses</span>}
            </div>)}

            <LivraisonsSection platforms={platforms} selectedDate={selectedDate} raw={raw} upd={upd} liveData={liveData} apiConfig={apiConfig} saveApiCfg={nc=>{setApiConfig(nc);saveApiCfg(nc);}}/>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {/* Inventory */}
              <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:11}}>
                <span style={{fontSize:13,fontWeight:700,marginBottom:5,display:"block",color:t.text}}>Inventaire</span>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  {[["HAMBURGER","ham",raw.hamStartOverride!=null,today.hamStart,today.hamUsed,today.hamEnd],["HOT DOG","hot",raw.hotStartOverride!=null,today.hotStart,today.hotUsed,today.hotEnd]].map(([title,pre,hasOv,startV,usedV,endV])=>(<div key={pre}>
                    <div style={{fontSize:10,color:"#f97316",fontWeight:700,marginBottom:2}}>{title}</div>
                    {!hasOv
                      ?(<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"3.5px 0",borderBottom:`1px solid ${t.divider}`}}><span style={{fontSize:11.5,color:t.textSub}}>Début</span><div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:t.text,fontWeight:600}}>{startV??"-"}</span><button onClick={()=>upd(selectedDate,`${pre}StartOverride`,startV??0)} style={{fontSize:9,padding:"1px 5px",borderRadius:3,border:"1px solid rgba(251,191,36,0.2)",background:"rgba(251,191,36,0.08)",color:t.warnText,cursor:"pointer"}}>✎</button></div></div>)
                      :(<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"3.5px 0",borderBottom:"1px solid rgba(251,191,36,0.2)"}}><span style={{fontSize:11.5,color:t.warnText}}>Ajusté</span><div style={{display:"flex",alignItems:"center",gap:3}}><input type="number" value={raw[`${pre}StartOverride`]??""} onChange={e=>upd(selectedDate,`${pre}StartOverride`,e.target.value===""?null:parseFloat(e.target.value))} style={{width:50,padding:"2px 5px",borderRadius:4,border:"1px solid rgba(251,191,36,0.25)",background:"rgba(251,191,36,0.06)",color:t.warnText,fontFamily:"'DM Mono',monospace",fontSize:12,textAlign:"right",outline:"none"}}/><button onClick={()=>upd(selectedDate,`${pre}StartOverride`,null)} style={{fontSize:9,padding:"1px 4px",borderRadius:3,border:"none",background:"rgba(239,68,68,0.1)",color:"#ef4444",cursor:"pointer"}}>✕</button></div></div>)}
                    <F label="+ Reçu" value={raw[`${pre}Received`]} onChange={v=>upd(selectedDate,`${pre}Received`,v)} warn={raw[`${pre}Received`]!=null&&raw[`${pre}Received`]<0?"⚠️ Ne peut pas être négatif":null}/>
                    <F label="Fin journée" value={raw[`${pre}End`]} onChange={v=>upd(selectedDate,`${pre}End`,v)} warn={endV!=null&&endV<0?"⚠️ Ne peut pas être négatif":startV!=null&&endV!=null&&endV>(startV+(raw[`${pre}Received`]||0))?"⚠️ Fin > Début + Reçu — vérifier":null}/>
                    <div style={{marginTop:3,paddingTop:3,borderTop:`1px solid ${t.divider}`}}><RR label="Utilisé" value={usedV} unit=""/></div>
                    {endV!=null&&endV<5&&endV>=0&&<div style={{fontSize:9.5,color:t.warnText,marginTop:2}}>Stock faible</div>}
                  </div>))}
                </div>
                {today.totalDoz>0&&(<div style={{marginTop:8,padding:"8px 10px",borderRadius:7,background:"rgba(124,58,237,0.06)",border:"1px solid rgba(124,58,237,0.15)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div><div style={{fontSize:10,color:"#7c3aed",fontWeight:700,textTransform:"uppercase"}}>$ / douzaine</div><div style={{fontSize:10,color:t.textMuted}}>{fmt(today.venteNet)} ÷ {today.totalDoz} dz</div></div>
                  <span style={{fontSize:20,fontWeight:700,color:"#7c3aed",fontFamily:"'DM Mono',monospace"}}>{fmt(today.moyenne)}</span>
                </div>)}
                {/* ── BREAD CHECKPOINTS ── */}
                {(()=>{
                  const TIMES=[["14h","B14"],["17h","B17"],["19h","B19"],["20h","B20"]];
                  const hamAvail=(today.hamStart??0)+(today.hamReceived||0);
                  const hotAvail=(today.hotStart??0)+(today.hotReceived||0);
                  const showHamPassed=hamAvail>0;const showHotPassed=hotAvail>0;
                  const inpStyle=(val)=>({width:"100%",padding:"3px 4px",borderRadius:4,border:`1px solid rgba(249,115,22,${val!=null?0.25:0.08})`,background:t.inputBg,color:t.inputText,fontFamily:"'DM Mono',monospace",fontSize:11,textAlign:"center",outline:"none",boxSizing:"border-box"});
                  const passedStyle=(p)=>({fontSize:11,fontFamily:"'DM Mono',monospace",textAlign:"center",color:p==null?t.textDim:p<0?"#ef4444":t.text,fontWeight:p!=null?600:400});
                  return(<div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${t.divider}`}}>
                    <div style={{fontSize:10,color:"#f97316",fontWeight:700,textTransform:"uppercase",letterSpacing:0.7,marginBottom:5}}>Suivi du pain — Restant</div>
                    <div style={{display:"grid",gridTemplateColumns:"80px repeat(4,1fr)",gap:"4px 6px",alignItems:"center"}}>
                      {/* Header */}
                      <span/>
                      {TIMES.map(([h])=>(<span key={h} style={{fontSize:9.5,color:t.textMuted,fontWeight:700,textAlign:"center"}}>{h}</span>))}
                      {/* Ham inputs */}
                      <span style={{fontSize:10.5,color:t.textSub,fontWeight:600}}>Ham</span>
                      {TIMES.map(([,sfx])=>{const k=`ham${sfx}`;return(<input key={k} type="number" inputMode="decimal" value={raw[k]??""} onChange={e=>upd(selectedDate,k,e.target.value===""?null:parseFloat(e.target.value))} style={inpStyle(raw[k])}/>);})}
                      {/* Ham passed */}
                      {showHamPassed&&<span style={{fontSize:9,color:t.textMuted}}>Passé</span>}
                      {showHamPassed&&TIMES.map(([,sfx])=>{const v=raw[`ham${sfx}`];const p=v!=null?hamAvail-v:null;return(<span key={sfx} style={passedStyle(p)}>{p!=null?p:"—"}</span>);})}
                      {/* Hot inputs */}
                      <span style={{fontSize:10.5,color:t.textSub,fontWeight:600}}>Hot</span>
                      {TIMES.map(([,sfx])=>{const k=`hot${sfx}`;return(<input key={k} type="number" inputMode="decimal" value={raw[k]??""} onChange={e=>upd(selectedDate,k,e.target.value===""?null:parseFloat(e.target.value))} style={inpStyle(raw[k])}/>);})}
                      {/* Hot passed */}
                      {showHotPassed&&<span style={{fontSize:9,color:t.textMuted}}>Passé</span>}
                      {showHotPassed&&TIMES.map(([,sfx])=>{const v=raw[`hot${sfx}`];const p=v!=null?hotAvail-v:null;return(<span key={sfx} style={passedStyle(p)}>{p!=null?p:"—"}</span>);})}
                    </div>
                    {(showHamPassed||showHotPassed)&&<div style={{fontSize:9,color:t.textDim,marginTop:3}}>Passé = Début + Reçu − Restant à l'heure</div>}
                  </div>);
                })()}
                {(()=>{
                  const TSEQ=[["B20","20h",4/4],["B19","19h",3/4],["B17","17h",2/4],["B14","14h",1/4]];
                  const hamAvail2=(today.hamStart??0)+(today.hamReceived||0);
                  const hotAvail2=(today.hotStart??0)+(today.hotReceived||0);
                  if(hamAvail2<=0&&hotAvail2<=0)return null;
                  let latestSfx=null,latestLabel=null,latestFrac=null;
                  for(const[sfx,label,frac] of TSEQ){if(raw[`ham${sfx}`]!=null||raw[`hot${sfx}`]!=null){latestSfx=sfx;latestLabel=label;latestFrac=frac;break;}}
                  if(!latestSfx)return null;
                  const hamConsumed=raw[`ham${latestSfx}`]!=null?hamAvail2-raw[`ham${latestSfx}`]:null;
                  const hotConsumed=raw[`hot${latestSfx}`]!=null?hotAvail2-raw[`hot${latestSfx}`]:null;
                  if(hamConsumed==null&&hotConsumed==null)return null;
                  const hamProj=hamConsumed!=null&&latestFrac>0?Math.round(hamConsumed/latestFrac):null;
                  const hotProj=hotConsumed!=null&&latestFrac>0?Math.round(hotConsumed/latestFrac):null;
                  return(<div style={{marginTop:6,padding:"6px 8px",borderRadius:6,background:"rgba(249,115,22,0.05)",border:"1px solid rgba(249,115,22,0.12)"}}>
                    <div style={{fontSize:9.5,color:"#f97316",fontWeight:700,textTransform:"uppercase",letterSpacing:0.6,marginBottom:4}}>Projection fin de journée</div>
                    <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                      {hamProj!=null&&<span style={{fontSize:12,color:t.text}}>Ham: <span style={{fontWeight:700,fontFamily:"'DM Mono',monospace"}}>~{hamProj}</span> <span style={{fontSize:10,color:t.textMuted}}>dz</span></span>}
                      {hotProj!=null&&<span style={{fontSize:12,color:t.text}}>Hot: <span style={{fontWeight:700,fontFamily:"'DM Mono',monospace"}}>~{hotProj}</span> <span style={{fontSize:10,color:t.textMuted}}>dz</span></span>}
                    </div>
                    <div style={{fontSize:9,color:t.textDim,marginTop:2}}>Basé sur votre rythme à {latestLabel}</div>
                  </div>);
                })()}
              </div>

              {/* Right column */}
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:11}}>
                  <span style={{fontSize:13,fontWeight:700,marginBottom:4,display:"block",color:t.text}}>Semaine</span>
                  <WeekChart selectedDate={selectedDate} computeDay={computeDay} getLR={getLR}/>
                </div>
                <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:11}}>
                  <span style={{fontSize:13,fontWeight:700,marginBottom:4,display:"block",color:t.text}}>Facteurs externes</span>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
                    <F label="Météo" value={raw.weather} onChange={v=>upd(selectedDate,"weather",v)} type="text" placeholder="Ensoleillé..." wide/>
                    <F label="Temp." value={raw.tempC} onChange={v=>upd(selectedDate,"tempC",v)} suffix="°C"/>
                    <div>
                      <F label="Essence" value={raw.gas} onChange={v=>upd(selectedDate,"gas",v)} suffix="$/L"/>
                      {lastGas&&(<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"2px 0"}}>
                        <span style={{fontSize:10,color:t.warnText}}>Auto: {Number(lastGas.price).toFixed(3)}$/L (il y a {lastGas.daysAgo}j)</span>
                        <button onClick={()=>upd(selectedDate,"gas",lastGas.price)} style={{fontSize:9,padding:"1px 6px",borderRadius:3,border:"1px solid rgba(34,197,94,0.2)",background:"rgba(34,197,94,0.08)",color:"#16a34a",cursor:"pointer",fontWeight:600}}>Confirmer</button>
                      </div>)}
                      <button onClick={checkGasPrice} disabled={gasCheckLoading} style={{marginTop:3,fontSize:9.5,padding:"3px 8px",borderRadius:4,border:"1px solid rgba(56,189,248,0.2)",background:"rgba(56,189,248,0.06)",color:"#38bdf8",cursor:gasCheckLoading?"default":"pointer",fontWeight:600,width:"100%",textAlign:"center",opacity:gasCheckLoading?0.65:1}}>{gasCheckLoading?"Vérification...":"Vérifier le prix (Régie de l'énergie)"}</button>
                      {gasCheckMsg&&<div style={{fontSize:9.5,marginTop:2,padding:"1px 4px",color:gasCheckMsg.ok?"#16a34a":"#f97316"}}>{gasCheckMsg.text}</div>}
                    </div>
                    <F label="Événement" value={raw.events} onChange={v=>upd(selectedDate,"events",v)} type="text" placeholder="Festival..." wide/>
                  </div>
                </div>
              </div>
            </div>

            {/* Employees */}
            <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,overflow:"hidden"}}>
              <div onClick={()=>setEmpOpen(!empOpen)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 11px",cursor:"pointer",userSelect:"none"}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:12,color:empOpen?"#f97316":t.textMuted,transform:empOpen?"rotate(0deg)":"rotate(-90deg)",display:"inline-block"}}>▾</span>
                  <span style={{fontSize:13,fontWeight:700,color:t.text}}>Main d'œuvre</span>
                  {today.labourPct!=null&&<Pill ok={today.labourPct<=30} warn={today.labourPct>30&&today.labourPct<=35} label={`${today.labourPct.toFixed(1)}%`}/>}
                </div>
                <span style={{fontSize:10.5,color:t.textMuted}}>{emps.length} emp.</span>
              </div>
              {empOpen&&(<div style={{padding:"0 11px 11px"}}>
                <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr auto",gap:6,padding:"4px 0",borderBottom:`1px solid ${t.dividerMid}`,marginBottom:4}}>
                  {["Employé","Heures","$/h","Coût",""].map((h,i)=>(<span key={i} style={{fontSize:10,color:t.textMuted,fontWeight:600,textAlign:i>0&&i<4?"right":"left"}}>{h}</span>))}
                </div>
                {emps.map((emp,i)=>(<EmpRow key={i} emp={emp} index={i} empRoster={empRoster} selectedDate={selectedDate} updEmp={updEmp} rmEmp={rmEmp}/>))}
                <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
                  <select id="addEmpSelect" style={{background:t.inputBg,border:`1px solid rgba(249,115,22,0.18)`,borderRadius:5,color:t.text,fontSize:12,padding:"4px 8px",outline:"none"}}>
                    <option value="" style={{background:t.optionBg}}>— Ajouter un employé —</option>
                    {empRoster.filter(r=>!emps.some(e=>e.empId===r.id)).map(r=>(<option key={r.id} value={r.id} style={{background:t.optionBg}}>{r.name}</option>))}
                  </select>
                  <button onClick={()=>{const sel=document.getElementById("addEmpSelect");const eid=sel?.value;if(!eid)return;const re=empRoster.find(r=>r.id===eid);if(re)addEmp(selectedDate,{empId:re.id,name:re.name,hours:null,wage:re.wage});sel.value=""}} style={{fontSize:10.5,padding:"4px 10px",borderRadius:5,border:"1px solid rgba(249,115,22,0.18)",background:"rgba(249,115,22,0.06)",color:"#f97316",cursor:"pointer",fontWeight:600}}>+ Ajouter</button>
                  {(()=>{const prevDay=liveData[prevDk(selectedDate)];const prevEmps=prevDay?.employees;if(!prevEmps||prevEmps.length===0||emps.length>0)return null;return(<button onClick={()=>{prevEmps.forEach(e=>addEmp(selectedDate,{empId:e.empId||"",name:e.name||"",hours:null,wage:e.wage||null}))}} style={{fontSize:10.5,padding:"4px 10px",borderRadius:5,border:`1px solid rgba(${t.posRgb},0.18)`,background:`rgba(${t.posRgb},0.06)`,color:t.posColor,cursor:"pointer",fontWeight:600}}>Copier d'hier</button>)})()}
                </div>
                {today.labourCost>0&&(<div style={{marginTop:8,padding:"8px 10px",borderRadius:7,background:today.labourPct!=null&&today.labourPct>35?"rgba(239,68,68,0.06)":today.labourPct!=null&&today.labourPct>28?t.warnStatusBg:"rgba(34,197,94,0.06)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:10,fontWeight:700,color:today.labourPct!=null&&today.labourPct>35?"#dc2626":today.labourPct!=null&&today.labourPct>28?t.warnText:"#16a34a",textTransform:"uppercase"}}>Main d'œuvre</div>
                    <div style={{fontSize:10,color:t.textMuted}}>{today.labourHrs}h · {fmt(today.labourCost)}</div>
                  </div>
                  {today.labourPct!=null&&<span style={{fontSize:22,fontWeight:700,fontFamily:"'DM Mono',monospace",color:today.labourPct>35?"#dc2626":today.labourPct>28?t.warnText:"#16a34a"}}>{today.labourPct.toFixed(1)}%</span>}
                </div>)}
              </div>)}
            </div>

            {/* Notes */}
            <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:11}}>
              <span style={{fontSize:13,fontWeight:700,marginBottom:2,display:"block",color:t.text}}>Notes</span>
              <textarea value={raw.notes||""} onChange={e=>upd(selectedDate,"notes",e.target.value)} placeholder="Notes..." style={{width:"100%",padding:5,borderRadius:5,border:`1px solid ${t.divider}`,background:t.inputBg,color:t.text,fontSize:11.5,fontFamily:"'Outfit',sans-serif",minHeight:36,resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
            </div>

            {/* Print */}
            <div style={{display:"flex",justifyContent:"flex-end"}}>
              <button onClick={()=>openPDF(buildDailyHTML())} style={{padding:"8px 16px",borderRadius:7,border:`1px solid rgba(${t.posRgb},0.2)`,background:`rgba(${t.posRgb},0.07)`,color:t.posColor,cursor:"pointer",fontWeight:600,fontSize:12}}>🖨️ Imprimer le rapport</button>
            </div>
          </div>)}

          {activeTab==="monthly"&&<MonthlyPL computeDay={computeDay} suppliers={suppliers} liveData={liveData} platforms={platforms}/>}
          {activeTab==="encaisse"&&<EncaisseTab liveData={liveData} encaisseData={encaisseData} persistEncaisse={persistEncaisse} encaisseConfig={encaisseConfig} saveEncaisseConfig={saveEncaisseConfig}/>}
          {activeTab==="facturation"&&<FacturationTab categories={facCategories} saveCategories={saveFacCategories} produits={facProduits} saveProduits={saveFacProduits} clients={facClients} saveClients={saveFacClients} soumissions={facSoumissions} saveSoumissions={saveFacSoumissions} commandes={facCommandes} saveCommandes={saveFacCommandes} factures={facFactures} saveFactures={saveFacFactures} creditNotes={facCreditNotes} saveCreditNotes={saveFacCreditNotes} docNums={docNums} saveDocNums={saveDocNums} companyInfo={companyInfo} encaisseData={encaisseData} persistEncaisse={persistEncaisse} showUpgradePrompt={showUpgradePrompt}/>}
          {activeTab==="intelligence"&&<IntelligenceTab liveData={liveData} computeDay={computeDay} demoData={demoData} selectedDate={selectedDate} velocityProfiles={velocityProfiles} getLR={getLR} platforms={platforms} encaisseData={encaisseData} encaisseConfig={encaisseConfig}/>}

          {/* SETTINGS TAB */}
          {activeTab==="settings"&&(<div style={{display:"flex",flexDirection:"column",gap:10,maxWidth:560}}>

            {/* Company Info */}
            <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:11}}>
              <span style={{fontSize:13,fontWeight:700,marginBottom:10,display:"block",color:t.text}}>🏢 Informations de l'entreprise</span>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {/* Logo */}
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:`1px solid ${t.divider}`,marginBottom:2}}>
                  <div style={{width:56,height:56,borderRadius:7,border:`1px dashed ${t.cardBorder}`,background:t.section,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",flexShrink:0}}>
                    {companyInfo.logo
                      ?<img src={companyInfo.logo} alt="Logo" style={{width:"100%",height:"100%",objectFit:"contain"}}/>
                      :<span style={{fontSize:20}}>🏢</span>}
                  </div>
                  <div>
                    <div style={{fontSize:11.5,fontWeight:600,color:t.text,marginBottom:4}}>Logo de l'entreprise</div>
                    <div style={{display:"flex",gap:6}}>
                      <label style={{padding:"4px 10px",borderRadius:5,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:"pointer",fontWeight:600,fontSize:11,fontFamily:"'Outfit',sans-serif"}}>
                        Choisir une image
                        <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=ev=>saveCompanyInfo({...companyInfo,logo:ev.target.result});reader.readAsDataURL(file);e.target.value="";}}/>
                      </label>
                      {companyInfo.logo&&<button onClick={()=>saveCompanyInfo({...companyInfo,logo:null})} style={{padding:"4px 10px",borderRadius:5,border:"1px solid rgba(239,68,68,0.2)",background:"rgba(239,68,68,0.07)",color:"#ef4444",cursor:"pointer",fontWeight:600,fontSize:11}}>Supprimer</button>}
                    </div>
                    <div style={{fontSize:9.5,color:t.textMuted,marginTop:3}}>PNG, JPG ou SVG · Apparaît sur les factures et documents</div>
                  </div>
                </div>
                {/* Text fields */}
                {[
                  ["Nom de l'entreprise","nom","text",true],
                  ["Adresse","adresse","text",false],
                  ["Ville","ville","text",false],
                  ["Code postal","codePostal","text",false],
                  ["Téléphone","telephone","tel",false],
                  ["Courriel","courriel","email",false],
                  ["Site web","siteWeb","text",false],
                  ["Numéro TPS","numeroTPS","text",false],
                  ["Numéro TVQ","numeroTVQ","text",false],
                ].map(([label,key,type,required])=>(
                  <div key={key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"3.5px 0",borderBottom:`1px solid ${t.divider}`,gap:8}}>
                    <span style={{fontSize:11.5,color:t.textSub,fontWeight:500,whiteSpace:"nowrap",flexShrink:0}}>{label}{required&&<span style={{color:"#f97316",marginLeft:2}}>*</span>}</span>
                    <input type={type} value={companyInfo[key]||""} onChange={e=>saveCompanyInfo({...companyInfo,[key]:e.target.value})}
                      placeholder={key==="numeroTPS"?"ex: 123456789 RT0001":key==="numeroTVQ"?"ex: 1234567890 TQ0001":""}
                      style={{background:t.inputBg,border:`1px solid rgba(249,115,22,${companyInfo[key]?"0.25":"0.1"})`,borderRadius:4,color:t.inputText,fontSize:12,padding:"3.5px 6px",outline:"none",textAlign:"right",width:200,fontFamily:"'DM Mono',monospace"}}/>
                  </div>
                ))}
                {/* Province dropdown */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"3.5px 0",borderBottom:`1px solid ${t.divider}`,gap:8}}>
                  <span style={{fontSize:11.5,color:t.textSub,fontWeight:500}}>Province</span>
                  <select value={companyInfo.province||"QC"} onChange={e=>saveCompanyInfo({...companyInfo,province:e.target.value})}
                    style={{background:t.inputBg,border:`1px solid rgba(249,115,22,0.15)`,borderRadius:4,color:t.inputText,fontSize:12,padding:"3.5px 6px",outline:"none",width:200,fontFamily:"'DM Mono',monospace"}}>
                    {PROVINCES_CA.map(p=>(<option key={p} value={p}>{p}</option>))}
                  </select>
                </div>
                {companyInfo.nom&&(<div style={{marginTop:4,padding:"6px 8px",borderRadius:6,background:t.section,border:`1px solid ${t.sectionBorder}`}}>
                  <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>Aperçu en-tête facture</div>
                  <div style={{fontSize:12,fontWeight:700,color:t.text}}>{companyInfo.nom}</div>
                  {companyInfo.adresse&&<div style={{fontSize:11,color:t.textSub}}>{companyInfo.adresse}</div>}
                  {(companyInfo.ville||companyInfo.province)&&<div style={{fontSize:11,color:t.textSub}}>{[companyInfo.ville,companyInfo.province,companyInfo.codePostal].filter(Boolean).join(", ")}</div>}
                  {companyInfo.telephone&&<div style={{fontSize:11,color:t.textSub}}>{companyInfo.telephone}</div>}
                  {companyInfo.courriel&&<div style={{fontSize:11,color:t.textSub}}>{companyInfo.courriel}</div>}
                  {companyInfo.numeroTPS&&<div style={{fontSize:10,color:t.textMuted,marginTop:2}}>TPS: {companyInfo.numeroTPS}{companyInfo.numeroTVQ?` · TVQ: ${companyInfo.numeroTVQ}`:""}</div>}
                </div>)}
              </div>
            </div>

            {/* Document numbering */}
            <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:11}}>
              <span style={{fontSize:13,fontWeight:700,marginBottom:10,display:"block",color:t.text}}>🔢 Numérotation des documents</span>
              {/* Prefix */}
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
                <span style={{fontSize:11,color:t.textSub,minWidth:160}}>Préfixe (optionnel)</span>
                <input value={docNums.prefix||""} onChange={e=>saveDocNums({...docNums,prefix:e.target.value})} placeholder='ex: BIQ-' style={{background:t.inputBg,border:`1px solid ${t.inputBorder}`,borderRadius:4,color:t.inputText,fontSize:12,padding:"3.5px 6px",outline:"none",width:100,fontFamily:"'DM Mono',monospace"}}/>
                <span style={{fontSize:10,color:t.textMuted}}>Apparaîtra avant chaque numéro de document</span>
              </div>
              {/* Doc types */}
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {[
                  {key:"soumission",label:"Soumission",code:"S"},
                  {key:"commande",label:"Commande",code:"C"},
                  {key:"facture",label:"Facture",code:"F"},
                  {key:"creditNote",label:"Note de crédit",code:"NC"},
                  {key:"encaissement",label:"Encaissement",code:"E"},
                ].map(({key,label,code})=>(
                  <div key={key} style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    <span style={{fontSize:11,color:t.textSub,minWidth:160}}>{label}</span>
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      <span style={{fontSize:11,color:t.textMuted}}>Prochain #</span>
                      <input type="number" min="1" value={docNums[key]||1} onChange={e=>{const v=parseInt(e.target.value)||1;saveDocNums({...docNums,[key]:Math.max(1,v)});}} style={{background:t.inputBg,border:`1px solid ${t.inputBorder}`,borderRadius:4,color:t.inputText,fontSize:12,padding:"3.5px 6px",outline:"none",width:70,fontFamily:"'DM Mono',monospace",textAlign:"right"}}/>
                    </div>
                    <span style={{fontSize:11,color:"#f97316",fontFamily:"'DM Mono',monospace",fontWeight:700}}>→ {fmtDocNum(docNums.prefix,code,docNums[key]||1)}</span>
                  </div>
                ))}
              </div>
              <div style={{fontSize:10,color:t.textMuted,marginTop:10}}>Les numéros s'incrémentent automatiquement à la création de chaque document.</div>
            </div>

            {/* App Mode */}
            <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:11}}>
              <span style={{fontSize:13,fontWeight:700,marginBottom:6,display:"block",color:t.text}}>Mode de l'application</span>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:18}}>🏪</span>
                  <div>
                    <div style={{fontSize:12,fontWeight:600,color:t.text}}>Restaurant / Franchisé</div>
                    <div style={{fontSize:10.5,color:t.textMuted}}>Mode actif — fermeture de caisse, P&L, facturation</div>
                  </div>
                </div>
                <span style={{fontSize:10,fontWeight:700,color:"#16a34a",background:"rgba(34,197,94,0.1)",border:"1px solid rgba(34,197,94,0.2)",borderRadius:10,padding:"2px 8px"}}>Actif</span>
              </div>
              <div style={{fontSize:10.5,color:t.textMuted,marginTop:8}}>Mode Franchiseur / Siège social disponible prochainement.</div>
            </div>

            {/* Theme */}
            <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:11}}>
              <span style={{fontSize:13,fontWeight:700,marginBottom:8,display:"block",color:t.text}}>Apparence</span>
              <div style={{display:"flex",gap:8}}>
                {[['dark','☾ Foncé'],['light','☀ Clair — Chaleureux']].map(([name,label])=>(
                  <button key={name} onClick={()=>setThemeTo(name)} style={{flex:1,padding:"8px 12px",borderRadius:7,border:`2px solid ${themeName===name?"#f97316":t.cardBorder}`,background:themeName===name?"rgba(249,115,22,0.08)":t.section,color:themeName===name?"#f97316":t.textSub,cursor:"pointer",fontWeight:themeName===name?700:500,fontSize:12,transition:"all 0.15s"}}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Cashier roster */}
            <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:11}}>
              <span style={{fontSize:13,fontWeight:700,marginBottom:6,display:"block",color:t.text}}>Caissiers</span>
              {roster.map(r=>(<div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 8px",background:t.rowBg,border:`1px solid ${t.rowBorder}`,borderRadius:5,marginBottom:3}}><span style={{fontSize:12,color:t.text}}>{r.name}</span><button onClick={()=>{const n=roster.filter(x=>x.id!==r.id);setRoster(n);saveRoster(n)}} style={{background:"rgba(239,68,68,0.07)",border:"none",borderRadius:4,color:"#ef4444",fontSize:10,padding:"2px 6px",cursor:"pointer"}}>✕</button></div>))}
              <div style={{display:"flex",gap:6,marginTop:4}}>
                <input value={newCN} onChange={e=>setNewCN(e.target.value)} placeholder="Nom..." onKeyDown={e=>e.key==="Enter"&&addRC()} style={{...inputStyle,flex:1}}/>
                <button onClick={addRC} style={{padding:"5px 14px",borderRadius:5,border:"none",cursor:"pointer",fontWeight:600,fontSize:12,background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#fff"}}>+</button>
              </div>
            </div>

            {/* Employee roster */}
            <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:11}}>
              <span style={{fontSize:13,fontWeight:700,marginBottom:6,display:"block",color:t.text}}>Employés</span>
              <div style={{fontSize:11,color:t.textMuted,marginBottom:6}}>Ajoutez vos employés avec leur taux horaire. Le salaire sera auto-rempli dans le rapport quotidien.</div>
              {empRoster.map(r=>(<div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 8px",background:t.rowBg,border:`1px solid ${t.rowBorder}`,borderRadius:5,marginBottom:3}}>
                <span style={{fontSize:12,color:t.text}}>{r.name} <span style={{fontSize:11,color:t.textSub,fontFamily:"'DM Mono',monospace"}}>{r.wage?`${r.wage.toFixed(2)}$/h`:""}</span></span>
                <button onClick={()=>{const n=empRoster.filter(x=>x.id!==r.id);setEmpRoster(n);saveEmpRoster(n)}} style={{background:"rgba(239,68,68,0.07)",border:"none",borderRadius:4,color:"#ef4444",fontSize:10,padding:"2px 6px",cursor:"pointer"}}>✕</button>
              </div>))}
              <div style={{display:"flex",gap:4,marginTop:4}}>
                <input value={newEN} onChange={e=>setNewEN(e.target.value)} placeholder="Nom..." style={{...inputStyle,flex:2}}/>
                <input value={newEW} onChange={e=>setNewEW(e.target.value)} placeholder="$/h" type="number" style={{...inputStyle,flex:1,fontFamily:"'DM Mono',monospace",textAlign:"right"}}/>
                <button onClick={()=>{if(!newEN.trim())return;const nr=[...empRoster,{id:Date.now().toString(),name:newEN.trim(),wage:newEW?parseFloat(newEW):null}];setEmpRoster(nr);saveEmpRoster(nr);setNewEN("");setNewEW("")}} style={{padding:"5px 14px",borderRadius:5,border:"none",cursor:"pointer",fontWeight:600,fontSize:12,background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#fff"}}>+</button>
              </div>
            </div>

            {/* Suppliers */}
            <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:11}}>
              <span style={{fontSize:13,fontWeight:700,marginBottom:6,display:"block",color:t.text}}>Fournisseurs (P&L)</span>
              {suppliers.map(s=>(<div key={s.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 8px",background:t.rowBg,border:`1px solid ${t.rowBorder}`,borderRadius:5,marginBottom:3}}>
                {editingSupId===s.id
                  ?(<input value={editingSupName} onChange={e=>setEditingSupName(e.target.value)}
                      onBlur={()=>{if(editingSupName.trim()){const ns=suppliers.map(x=>x.id===s.id?{...x,name:editingSupName.trim()}:x);setSuppliers(ns);saveSup(ns)}setEditingSupId(null)}}
                      onKeyDown={e=>{if(e.key==="Enter")e.target.blur();if(e.key==="Escape")setEditingSupId(null)}}
                      autoFocus style={{flex:1,...inputStyle,border:"1px solid rgba(249,115,22,0.3)",marginRight:6}}/>)
                  :(<span style={{fontSize:12,cursor:"pointer",color:t.text}} onClick={()=>{setEditingSupId(s.id);setEditingSupName(s.name)}}>{s.name} <span style={{fontSize:9,color:t.textDim}}>✎</span></span>)}
                <button onClick={()=>{const ns=suppliers.filter(x=>x.id!==s.id);setSuppliers(ns);saveSup(ns)}} style={{background:"rgba(239,68,68,0.07)",border:"none",borderRadius:4,color:"#ef4444",fontSize:10,padding:"2px 6px",cursor:"pointer"}}>✕</button>
              </div>))}
              <div style={{display:"flex",gap:6,marginTop:4}}>
                <input placeholder="Nouveau fournisseur..." onKeyDown={e=>{if(e.key==="Enter"&&e.target.value.trim()){const ns=[...suppliers,{id:Date.now().toString(),name:e.target.value.trim()}];setSuppliers(ns);saveSup(ns);e.target.value=""}}} style={{...inputStyle,flex:1}}/>
              </div>
            </div>

            {/* Plateformes de livraison */}
            <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:11}}>
              <span style={{fontSize:13,fontWeight:700,marginBottom:6,display:"block",color:t.text}}>Plateformes de livraison</span>
              <div style={{fontSize:11,color:t.textMuted,marginBottom:6}}>Configurez vos plateformes. Les commissions sont suivies dans le rapport quotidien, le P&L et l'Intelligence.</div>
              {platforms.map(p=>(<div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 8px",background:t.rowBg,border:`1px solid ${t.rowBorder}`,borderRadius:5,marginBottom:3}}>
                <span style={{fontSize:12,color:t.text}}>{p.emoji} {p.name}</span>
                <button onClick={()=>{const np=platforms.filter(x=>x.id!==p.id);setPlatforms(np);savePlatforms(np)}} style={{background:"rgba(239,68,68,0.07)",border:"none",borderRadius:4,color:"#ef4444",fontSize:10,padding:"2px 6px",cursor:"pointer"}}>✕</button>
              </div>))}
              <div style={{display:"flex",gap:6,marginTop:4}}>
                <input value={newPlatformName} onChange={e=>setNewPlatformName(e.target.value)} placeholder="Nom de la plateforme..." onKeyDown={e=>{if(e.key==="Enter"&&newPlatformName.trim()){const np=[...platforms,{id:Date.now().toString(),name:newPlatformName.trim(),emoji:"📦"}];setPlatforms(np);savePlatforms(np);setNewPlatformName("")}}} style={{...inputStyle,flex:1}}/>
                <button onClick={()=>{if(!newPlatformName.trim())return;const np=[...platforms,{id:Date.now().toString(),name:newPlatformName.trim(),emoji:"📦"}];setPlatforms(np);savePlatforms(np);setNewPlatformName("")}} style={{padding:"5px 14px",borderRadius:5,border:"none",cursor:"pointer",fontWeight:600,fontSize:12,background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#fff"}}>+</button>
              </div>
            </div>

            {/* Coordonnées météo */}
            <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:11}}>
              <span style={{fontSize:13,fontWeight:700,marginBottom:4,display:"block",color:t.text}}>Coordonnées météo</span>
              <div style={{fontSize:11,color:t.textMuted,marginBottom:8}}>Recherchez votre ville pour auto-remplir la météo sur le rapport quotidien. Défaut: Montréal.</div>
              <GeoSearch apiConfig={apiConfig} saveApiCfg={nc=>{setApiConfig(nc);saveApiCfg(nc);}}/>
            </div>

            {/* API Config */}
            <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:11}}>
              <span style={{fontSize:13,fontWeight:700,marginBottom:6,display:"block",color:t.text}}>Intégrations API</span>
              <div style={{fontSize:11,color:t.textMuted,marginBottom:8}}>Entrer vos clés API ici. Les données seront importées automatiquement une fois configurées.</div>
              {[["auphanKey","Auphan POS","Clé API ou URL...","À venir — contacter Auphan pour documentation"],
                ["gasKey","Prix essence (Régie de l'énergie)","URL de scraping...","Auto-rempli du dernier prix connu."]].map(([key,label,ph,note])=>(
                <div key={key} style={{marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}><span style={{fontSize:12,fontWeight:600,color:t.text}}>{label}</span><Pill ok={apiConfig[key]?.length>0} label={apiConfig[key]?.length>0?"Configuré":"Non configuré"}/></div>
                  <input value={apiConfig[key]||""} onChange={e=>{const nc={...apiConfig,[key]:e.target.value};setApiConfig(nc);saveApiCfg(nc)}} placeholder={ph} style={{...inputStyle,width:"100%",boxSizing:"border-box",fontFamily:"'DM Mono',monospace"}}/>
                  <div style={{fontSize:10,color:t.textDim,marginTop:2}}>{note}</div>
                </div>
              ))}
            </div>

            {/* Export */}
            <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:11}}>
              <span style={{fontSize:13,fontWeight:700,marginBottom:6,display:"block",color:t.text}}>Export</span>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <button onClick={()=>{const h="Date,Vente Nette,Total Brut,TPS,TVQ\n";let r="";Object.keys(liveData).sort().forEach(k=>{const c=computeDay(k);if(c.venteNet>0)r+=`${k},${c.venteNet},${c.total},${c.tps},${c.tvq}\n`});const b=new Blob([h+r],{type:"text/csv"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download="balanceiq.csv";document.body.appendChild(a);a.click();document.body.removeChild(a)}} style={{padding:"7px 14px",borderRadius:6,border:"1px solid rgba(34,197,94,0.2)",background:"rgba(34,197,94,0.08)",color:"#16a34a",cursor:"pointer",fontWeight:600,fontSize:12}}>CSV</button>
                <button onClick={()=>{let h=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>BalanceIQ</title><style>body{font:12px Arial;margin:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:3px 6px;text-align:right}th{background:#f5f5f5}td:first-child{text-align:left}h1{color:#ea580c}</style></head><body><h1>Rapport BalanceIQ</h1><table><tr><th>Date</th><th>Vente Nette</th><th>Total</th></tr>`;Object.keys(liveData).sort().forEach(k=>{const c=computeDay(k);if(c.venteNet>0)h+=`<tr><td>${k}</td><td>${c.venteNet.toFixed(2)}</td><td>${c.total.toFixed(2)}</td></tr>`});h+=`</table></body></html>`;openPDF(h)}} style={{padding:"7px 14px",borderRadius:6,border:`1px solid rgba(${t.posRgb},0.2)`,background:`rgba(${t.posRgb},0.08)`,color:t.posColor,cursor:"pointer",fontWeight:600,fontSize:12}}>PDF</button>
                <button onClick={()=>{const b=new Blob([JSON.stringify({liveData,roster,empRoster,suppliers,apiConfig},null,2)],{type:"application/json"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download="balanceiq-backup.json";document.body.appendChild(a);a.click();document.body.removeChild(a)}} style={{padding:"7px 14px",borderRadius:6,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:"pointer",fontWeight:600,fontSize:12}}>Backup JSON</button>
                <button onClick={async()=>{setRestoreMsg('');const r=await window.api.backup.restore();if(r?.error)setRestoreMsg(r.error);}} style={{padding:"7px 14px",borderRadius:6,border:"1px solid rgba(249,115,22,0.3)",background:"rgba(249,115,22,0.08)",color:"#f97316",cursor:"pointer",fontWeight:600,fontSize:12}}>Restaurer depuis backup</button>
              </div>
              {restoreMsg&&<div style={{marginTop:6,fontSize:12,color:"#ef4444"}}>{restoreMsg}</div>}
            </div>

            {/* Auto-backup info */}
            <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:11}}>
              <span style={{fontSize:13,fontWeight:700,marginBottom:6,display:"block",color:t.text}}>Sauvegardes automatiques</span>
              <div style={{fontSize:11,color:t.textMuted,marginBottom:8}}>1 fichier par jour · 30 jours conservés · dossier Documents</div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
                <span style={{fontSize:11.5,color:t.textSub}}>
                  {backupInfo==null?"Chargement...":backupInfo.lastBackup?`✓ Dernière: ${backupInfo.lastBackup} · ${backupInfo.count} fichier${backupInfo.count!==1?"s":""}`:"Aucune sauvegarde encore"}
                </span>
                <button onClick={()=>window.api.backup.openDir()} style={{padding:"5px 12px",borderRadius:6,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:"pointer",fontWeight:600,fontSize:11}}>📁 Ouvrir le dossier</button>
              </div>
              {backupInfo?.dir&&<div style={{marginTop:5,fontSize:9.5,color:t.textMuted,fontFamily:"'DM Mono',monospace",wordBreak:"break-all"}}>{backupInfo.dir}</div>}
            </div>

            <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:11}}>
              <span style={{fontSize:11.5,color:t.textSub}}>Jours: <strong style={{color:"#f97316"}}>{Object.keys(liveData).length}</strong> · Caissiers: <strong style={{color:"#f97316"}}>{roster.length}</strong> · Employés: <strong style={{color:"#f97316"}}>{empRoster.length}</strong> · Fournisseurs: <strong style={{color:"#f97316"}}>{suppliers.length}</strong> · Plateformes: <strong style={{color:"#f97316"}}>{platforms.length}</strong></span>
            </div>
            {/* Audit log viewer */}
            <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:11}}>
              <span style={{fontSize:13,fontWeight:700,marginBottom:10,display:"block",color:t.text}}>📋 Journal d'audit</span>
              <AuditSection/>
            </div>

            <div style={{textAlign:"center",padding:"4px 0 2px"}}>
              <span style={{fontSize:10.5,color:t.textSub,fontFamily:"'DM Mono',monospace"}}>BalanceIQ v{appVersion}</span>
            </div>
          </div>)}

        </div>
      </div>
    </ThemeCtx.Provider>
  );
}
