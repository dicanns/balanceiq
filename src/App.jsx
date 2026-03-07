import { useState, useEffect, useCallback, useRef, useMemo, useContext, createContext } from "react";
import { version as appVersion } from "../package.json";

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
const DEFAULT_SUPPLIERS=[{id:"1",name:"Dubord"},{id:"2",name:"Carrousel"},{id:"3",name:"St. Sylvain"},{id:"4",name:"Pepsi"},{id:"5",name:"Pain"},{id:"6",name:"Sauce"},{id:"7",name:"Costco"}];
const EXPENSE_ITEMS=[["hydro","Hydro"],["gazNat","Gaz Nat/Prop"],["allocAuto","Alloc. d'auto"],["depenseAuto","Dépense Auto"],["cell","Cell"],["telInternet","Tel/Internet"],["fraisProf","Frais Prof"],["assurances","Assurances"],["adPromo","Ad & Promo"],["dons","Dons"],["taxMuni","Tax Muni"],["permisGov","Permis Gov't"],["loyer","Loyer"],["csst","CSST"],["reparations","Réparations"],["equipDecor","Équipement/Décor"]];
const BLANK_CASH={cashierId:"",posVentes:null,posTPS:null,posTVQ:null,posLivraisons:null,float:null,interac:null,livraisons:null,deposits:null,finalCash:null};
const BLANK_EMP={name:"",hours:null,wage:null};
const BLANK_DAY={cashes:[{...BLANK_CASH}],employees:[],hamEnd:null,hamReceived:null,hamStartOverride:null,hotEnd:null,hotReceived:null,hotStartOverride:null,weather:"",tempC:null,gas:null,notes:"",events:""};
const OWNER_EMAIL="info@dicanns.ca";

function genDemo(){const data={};const base=new Date(2024,0,1);for(let i=0;i<366;i++){const d=new Date(base);d.setDate(d.getDate()+i);const dow=d.getDay(),isWe=dow===0||dow===6;const total=Math.max(800,Math.round((isWe?2800:1900)+Math.sin((d.getMonth()/12)*Math.PI)*400+(Math.random()-0.5)*600));data[dk(d)]={venteNet:total,hamUsed:Math.round((18+Math.random()*12)*(0.7+Math.random()*0.25)),hotUsed:Math.round((12+Math.random()*8)*(0.7+Math.random()*0.25))}}return data}

// ── ATOMS ──
function F({label,value,onChange,disabled,prefix,suffix,type="number",placeholder,wide,accent:ac,tabIndex:ti}){
  const t=useT();
  const border=disabled?`1px solid ${t.disabledBorder}`:ac?`1px solid rgba(${ac},0.25)`:`1px solid rgba(249,115,22,${value!=null&&value!==""?0.25:0.1})`;
  return(<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"3.5px 0",borderBottom:`1px solid ${t.divider}`,gap:4}}>
    <span style={{fontSize:11.5,color:disabled?t.textDisabled:t.textSub,fontWeight:500,whiteSpace:"nowrap"}}>{label}</span>
    <div style={{display:"flex",alignItems:"center",gap:2}}>
      {prefix&&<span style={{fontSize:10.5,color:t.textDisabled}}>{prefix}</span>}
      <input type={type} inputMode={type==="number"?"decimal":"text"} placeholder={placeholder||""} value={value??""}
        onChange={e=>{if(type==="number")onChange(e.target.value===""?null:parseFloat(e.target.value));else onChange(e.target.value)}}
        onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();const all=Array.from(document.querySelectorAll('input[type="number"]:not([disabled]),input[type="text"]:not([disabled])'));const idx=all.indexOf(e.target);const next=all.slice(idx+1).find(i=>i.value==='');if(next)next.focus();else e.target.blur();}}}
        disabled={disabled} tabIndex={ti}
        style={{width:wide?125:80,padding:"3.5px 6px",borderRadius:4,border,background:disabled?t.disabledBg:t.inputBg,color:disabled?t.disabledText:t.inputText,fontFamily:"'DM Mono',monospace",fontSize:12,textAlign:"right",outline:"none"}}/>
      {suffix&&<span style={{fontSize:10,color:t.textDisabled}}>{suffix}</span>}
    </div>
  </div>);
}

function PL({label,value,onChange,prefix}){
  const t=useT();
  const [local,setLocal]=useState(value??"");
  const [focused,setFocused]=useState(false);
  useEffect(()=>{if(!focused)setLocal(value??"")},[value,focused]);
  return(<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"3.5px 0",borderBottom:`1px solid ${t.divider}`,gap:4}}>
    <span style={{fontSize:11.5,color:t.textSub,fontWeight:500,whiteSpace:"nowrap"}}>{label}</span>
    <div style={{display:"flex",alignItems:"center",gap:2}}>
      {prefix&&<span style={{fontSize:10.5,color:t.textDisabled}}>{prefix}</span>}
      <input type="number" inputMode="decimal" value={local}
        onChange={e=>setLocal(e.target.value)}
        onFocus={()=>setFocused(true)}
        onBlur={()=>{setFocused(false);const n=local===""?null:parseFloat(local);if(n!==value)onChange(n)}}
        onKeyDown={e=>{if(e.key==="Enter"){const tgt=e.target;tgt.blur();setTimeout(()=>{const all=Array.from(document.querySelectorAll('input[type="number"]:not([disabled])'));const idx=all.indexOf(tgt);const next=all.slice(idx+1).find(i=>i.value==='');if(next)next.focus();},50);}}}
        style={{width:80,padding:"3.5px 6px",borderRadius:4,border:`1px solid rgba(249,115,22,${local!==""?0.25:0.1})`,background:t.inputBg,color:t.inputText,fontFamily:"'DM Mono',monospace",fontSize:12,textAlign:"right",outline:"none"}}/>
    </div>
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
            <F label="Ventes av. taxes" value={cash.posVentes} onChange={v=>onChange({...cash,posVentes:v})} prefix="$" accent={t.posRgb} tabIndex={index*20+1}/>
            <F label="TPS" value={cash.posTPS} onChange={v=>onChange({...cash,posTPS:v})} prefix="$" accent={t.posRgb} tabIndex={index*20+2}/>
            <F label="TVQ" value={cash.posTVQ} onChange={v=>onChange({...cash,posTVQ:v})} prefix="$" accent={t.posRgb} tabIndex={index*20+3}/>
            <F label="Livraisons" value={cash.posLivraisons} onChange={v=>onChange({...cash,posLivraisons:v})} prefix="$" accent={t.posRgb} tabIndex={index*20+4}/>
            <div style={{marginTop:4,paddingTop:4,borderTop:`1px solid rgba(${t.posRgb},0.15)`}}><RR label="Total POS" value={posOk?posT:null} accent={t.posColor} bold/></div>
          </div>
        </div>
        <div>
          <div style={{fontSize:9.5,color:"#f97316",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}><span style={{width:8,height:8,borderRadius:2,background:"#f97316",display:"inline-block",marginRight:4}}/> Décompte</div>
          <div style={{background:"rgba(249,115,22,0.04)",borderRadius:7,padding:8,border:"1px solid rgba(249,115,22,0.1)"}}>
            <F label="Float" value={cash.float} onChange={v=>onChange({...cash,float:v})} prefix="$" tabIndex={index*20+5}/>
            <F label="Interac" value={cash.interac} onChange={v=>onChange({...cash,interac:v})} prefix="$" tabIndex={index*20+6}/>
            <F label="Livraisons" value={cash.livraisons} onChange={v=>onChange({...cash,livraisons:v})} prefix="$" tabIndex={index*20+7}/>
            <F label="Dépôts" value={cash.deposits} onChange={v=>onChange({...cash,deposits:v})} prefix="$" tabIndex={index*20+8}/>
            <F label="Cash final" value={cash.finalCash} onChange={v=>onChange({...cash,finalCash:v})} prefix="$" tabIndex={index*20+9}/>
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

// ── BILL ENTRY (accumulating bills for P&L) ──
function BillEntry({label,baseKey,plData,updPL,accent="249,115,22"}){
  const t=useT();
  const [open,setOpen]=useState(false);
  const [newDate,setNewDate]=useState('');
  const [newAmt,setNewAmt]=useState('');
  const [newNote,setNewNote]=useState('');
  const bills=plData[`${baseKey}_bills`]||[];
  const total=bills.length?bills.reduce((s,b)=>s+(b.amount||0),0):(plData[baseKey]||0);
  const addBill=()=>{
    const amt=parseFloat(newAmt);if(!amt||isNaN(amt))return;
    updPL(`${baseKey}_bills`,[...bills,{id:Date.now().toString(),date:newDate,amount:amt,note:newNote.trim()}]);
    setNewAmt('');setNewNote('');
  };
  const removeBill=id=>updPL(`${baseKey}_bills`,bills.filter(b=>b.id!==id));
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
        <input type="number" inputMode="decimal" value={newAmt} onChange={e=>setNewAmt(e.target.value)} placeholder="Montant HT"
          onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();addBill();}}}
          style={{padding:"3px 5px",borderRadius:3,border:`1px solid ${accentRgb+"0.25)"}`,background:t.inputBg,color:t.inputText,fontFamily:"'DM Mono',monospace",fontSize:10,textAlign:"right",outline:"none"}}/>
        <button onClick={addBill} style={{fontSize:10,padding:"3px 8px",borderRadius:3,border:`1px solid ${accentRgb+"0.25)"}`,background:accentRgb+"0.08)",color:`rgb(${accent})`,cursor:"pointer",fontWeight:700}}>+</button>
      </div>
      <div style={{fontSize:9,color:t.textDim,marginTop:3}}>Tous les montants avant taxes (HT)</div>
    </div>)}
  </div>);
}

// ── PDF GENERATOR ──
function openPDF(html){
  const w=window.open("","_blank");
  if(w){w.document.write(html);w.document.close();setTimeout(()=>w.print(),400)}
}

// ── P&L MONTHLY ──
function MonthlyPL({computeDay,suppliers}){
  const t=useT();
  const [month,setMonth]=useState(()=>{const n=new Date();return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`});
  const [plData,setPlData]=useState({});const [saved,setSaved]=useState(false);const [loaded,setLoaded]=useState(false);const saveRef=useRef(null);

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
          :(<div style={{display:"flex",gap:4,alignItems:"center"}}><input type="number" value={plData._revenueOverride??""} onChange={e=>updPL("_revenueOverride",e.target.value===""?null:parseFloat(e.target.value))} style={{width:100,padding:"3px 6px",borderRadius:4,border:"1px solid rgba(251,191,36,0.25)",background:"rgba(251,191,36,0.06)",color:t.warnText,fontFamily:"'DM Mono',monospace",fontSize:13,textAlign:"right",outline:"none"}}/><button onClick={()=>updPL("_revenueOverride",null)} style={{fontSize:9,padding:"1px 4px",borderRadius:3,border:"none",background:"rgba(239,68,68,0.1)",color:"#ef4444",cursor:"pointer"}}>✕</button></div>)}
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
      <PL label="Override mensuel" value={plData.labourOverride} onChange={v=>updPL("labourOverride",v)} prefix="$"/>
      <RR label="Total" value={labC} accent="#38bdf8" bold/>{revenue>0&&<RR label="%" value={`${labP.toFixed(1)}%`} unit="" accent={labP>35?"#ef4444":labP>28?t.warnText:"#22c55e"}/>}
    </Sec>
    <div style={{background:np>=0?t.reconBalBg:t.reconErrBg,border:`1px solid ${np>=0?t.reconBalBorder:t.reconErrBorder}`,borderRadius:10,padding:14}}>
      <div style={{fontSize:11,color:t.textSub,fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,marginBottom:8}}>Résultat — {MONTHS_FR[m-1]} {y}</div>
      <RR label="Revenus" value={revenue} accent="#22c55e" bold/><RR label="− F&P" value={fpT} accent="#f97316"/><div style={{paddingTop:4,borderTop:`1px solid ${t.dividerMid}`}}><RR label="= Profit brut" value={gp} bold/></div><RR label="− Main d'œuvre" value={labC} accent="#38bdf8"/><RR label="− Dépenses" value={expT} accent="#818cf8"/>
      <div style={{paddingTop:6,marginTop:4,borderTop:`2px solid ${t.dividerStrong}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:14,fontWeight:700,color:np>=0?"#16a34a":"#dc2626"}}>{np>=0?"PROFIT NET":"PERTE NETTE"}</span><div style={{textAlign:"right"}}><span style={{fontSize:22,fontWeight:700,color:np>=0?"#16a34a":"#dc2626",fontFamily:"'DM Mono',monospace"}}>{fmt(Math.abs(np))}</span>{revenue>0&&<div style={{fontSize:11,color:np>=0?"#16a34a":"#dc2626"}}>{npP.toFixed(1)}%</div>}</div></div>
    </div>
    <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
      <button onClick={handleSave} style={{padding:"9px 20px",borderRadius:7,border:"none",cursor:"pointer",fontWeight:700,fontSize:13,background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#fff"}}>Sauvegarder & Imprimer PDF</button>
      <button onClick={handleEmail} style={{padding:"9px 16px",borderRadius:7,border:"1px solid rgba(34,197,94,0.2)",background:"rgba(34,197,94,0.08)",color:"#16a34a",cursor:"pointer",fontWeight:600,fontSize:12}}>Envoyer à {OWNER_EMAIL}</button>
      {saved&&<span style={{fontSize:12,color:"#16a34a",fontWeight:600}}>✓ Sauvegardé</span>}
    </div>
  </div>);
}

// ── INTELLIGENCE HELPERS ──
function WEATHER_CAT(w){if(!w)return"inconnu";const lw=w.toLowerCase();if(/neige|snow|blizzard/.test(lw))return"neige";if(/pluie|rain|averse|pluvieux/.test(lw))return"pluie";if(/nuage|couvert|overcast|cloud/.test(lw))return"nuageux";if(/ensoleillé|soleil|sunny|clair|clear/.test(lw))return"ensoleillé";return"autre";}
function avArr(arr){if(!arr||arr.length===0)return null;return arr.reduce((a,b)=>a+b,0)/arr.length;}
const WIN_LABELS=["Début→14h","14h→17h","17h→19h","19h→20h"];

// ── INTELLIGENCE TAB ──
function IntelligenceTab({liveData,computeDay,demoData,selectedDate,velocityProfiles,getLR}){
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
  const [editingSupId,setEditingSupId]=useState(null);
  const [editingSupName,setEditingSupName]=useState("");
  const [gasCheckLoading,setGasCheckLoading]=useState(false);
  const [gasCheckMsg,setGasCheckMsg]=useState(null);

  const t=theme;

  useEffect(()=>{(async()=>{
    try{const r=await window.api.storage.get("dicann-v7");if(r?.value)setLiveData(JSON.parse(r.value))}catch(e){}
    try{const r2=await window.api.storage.get("dicann-roster");if(r2?.value)setRoster(JSON.parse(r2.value))}catch(e){}
    try{const r2b=await window.api.storage.get("dicann-emp-roster");if(r2b?.value)setEmpRoster(JSON.parse(r2b.value))}catch(e){}
    try{const r3=await window.api.storage.get("dicann-suppliers-v2");if(r3?.value)setSuppliers(JSON.parse(r3.value))}catch(e){}
    try{const r4=await window.api.storage.get("dicann-api-config");if(r4?.value)setApiConfig(JSON.parse(r4.value))}catch(e){}
    try{const r5=await window.api.storage.get("balanceiq-theme");if(r5?.value==='light'||r5?.value==='dark')setThemeName(r5.value)}catch(e){}
    setLoading(false);
  })()},[]);

  useEffect(()=>{
    if(window.api?.updater){
      window.api.updater.onAvailable(()=>setUpdateAvailable(true));
    }
  },[]);

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
  const saveApiCfg=useCallback(async c=>{try{await window.api.storage.set("dicann-api-config",JSON.stringify(c))}catch(e){}},[]);

  const upd=useCallback((dt,f,v)=>{setLiveData(p=>{const u={...p,[dt]:{...(p[dt]||{}),[f]:v}};persist(u);return u})},[persist]);

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
  const updCash=useCallback((dt,i,c)=>{setLiveData(p=>{const d={...(p[dt]||{})};const cs=[...(d.cashes||[{...BLANK_CASH}])];cs[i]=c;const u={...p,[dt]:{...d,cashes:cs}};persist(u);return u})},[persist]);
  const addCash=useCallback(dt=>{setLiveData(p=>{const d={...(p[dt]||{})};const cs=[...(d.cashes||[{...BLANK_CASH}])];cs.push({...BLANK_CASH});const u={...p,[dt]:{...d,cashes:cs}};persist(u);return u})},[persist]);
  const rmCash=useCallback((dt,i)=>{setLiveData(p=>{const d={...(p[dt]||{})};const cs=[...(d.cashes||[])];cs.splice(i,1);const u={...p,[dt]:{...d,cashes:cs}};persist(u);return u})},[persist]);
  const updEmp=useCallback((dt,i,e)=>{setLiveData(p=>{const d={...(p[dt]||{})};const es=[...(d.employees||[])];es[i]=e;const u={...p,[dt]:{...d,employees:es}};persist(u);return u})},[persist]);
  const addEmp=useCallback((dt,empEntry)=>{setLiveData(p=>{const d={...(p[dt]||{})};const es=[...(d.employees||[])];es.push(empEntry||{...BLANK_EMP});const u={...p,[dt]:{...d,employees:es}};persist(u);return u})},[persist]);
  const rmEmp=useCallback((dt,i)=>{setLiveData(p=>{const d={...(p[dt]||{})};const es=[...(d.employees||[])];es.splice(i,1);const u={...p,[dt]:{...d,employees:es}};persist(u);return u})},[persist]);

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

  const tabs=[{id:"daily",label:"Quotidien"},{id:"monthly",label:"P&L Mensuel"},{id:"intelligence",label:"Intelligence"},{id:"settings",label:"Config"}];

  const inputStyle={background:t.inputBg,border:`1px solid ${t.inputBorder}`,borderRadius:5,color:t.text,fontSize:12,padding:"5px 8px",outline:"none"};

  if(loading)return(<div style={{minHeight:"100vh",background:DARK.bg,display:"flex",alignItems:"center",justifyContent:"center",color:"#4a4e5e",fontFamily:"'Outfit',sans-serif"}}>Chargement...</div>);

  return(
    <ThemeCtx.Provider value={theme}>
      <div style={{minHeight:"100vh",background:t.bg,fontFamily:"'Outfit','Helvetica Neue',sans-serif",color:t.text,transition:"background 0.2s,color 0.2s"}}>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>

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
          <div style={{display:"flex",gap:1,marginTop:8,borderBottom:`1px solid ${t.dividerMid}`,overflowX:"auto"}}>
            {tabs.map(tab=>(<button key={tab.id} onClick={()=>setActiveTab(tab.id)} style={{background:"none",border:"none",color:activeTab===tab.id?"#f97316":t.textMuted,fontSize:11.5,fontWeight:600,padding:"5px 9px",cursor:"pointer",borderBottom:activeTab===tab.id?"2px solid #f97316":"2px solid transparent",whiteSpace:"nowrap"}}>{tab.label}</button>))}
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
                    <F label="+ Reçu" value={raw[`${pre}Received`]} onChange={v=>upd(selectedDate,`${pre}Received`,v)}/>
                    <F label="Fin journée" value={raw[`${pre}End`]} onChange={v=>upd(selectedDate,`${pre}End`,v)}/>
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
                {emps.map((emp,i)=>{const cost=(emp.hours||0)*(emp.wage||0);return(<div key={i} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr auto",gap:6,padding:"3px 0",borderBottom:`1px solid ${t.divider}`,alignItems:"center"}}>
                  <select value={emp.empId||""} onChange={e=>{const eid=e.target.value;const re=empRoster.find(r=>r.id===eid);updEmp(selectedDate,i,{...emp,empId:eid,name:re?.name||"",wage:re?.wage||emp.wage})}} style={{background:t.inputBg,border:`1px solid ${t.inputBorder}`,borderRadius:4,color:t.text,fontSize:12,padding:"4px 6px",outline:"none"}}>
                    <option value="" style={{background:t.optionBg}}>— Choisir —</option>
                    {empRoster.map(r=>(<option key={r.id} value={r.id} style={{background:t.optionBg}}>{r.name} ({fmt(r.wage)}/h)</option>))}
                  </select>
                  <input type="number" value={emp.hours??""} onChange={e=>updEmp(selectedDate,i,{...emp,hours:e.target.value===""?null:parseFloat(e.target.value)})} placeholder="hrs" style={{background:t.inputBg,border:`1px solid ${t.inputBorder}`,borderRadius:4,color:t.inputText,fontSize:12,padding:"3px 5px",textAlign:"right",outline:"none",fontFamily:"'DM Mono',monospace"}}/>
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:t.textMuted,textAlign:"right"}}>{emp.wage?`${emp.wage.toFixed(2)}`:""}</span>
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:t.textSub,textAlign:"right"}}>{cost>0?fmt(cost):"—"}</span>
                  <button onClick={()=>rmEmp(selectedDate,i)} style={{background:"rgba(239,68,68,0.07)",border:"none",borderRadius:4,color:"#ef4444",fontSize:10,padding:"2px 5px",cursor:"pointer"}}>✕</button>
                </div>)})}
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

          {activeTab==="monthly"&&<MonthlyPL computeDay={computeDay} suppliers={suppliers}/>}
          {activeTab==="intelligence"&&<IntelligenceTab liveData={liveData} computeDay={computeDay} demoData={demoData} selectedDate={selectedDate} velocityProfiles={velocityProfiles} getLR={getLR}/>}

          {/* SETTINGS TAB */}
          {activeTab==="settings"&&(<div style={{display:"flex",flexDirection:"column",gap:10,maxWidth:560}}>

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

            {/* API Config */}
            <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:11}}>
              <span style={{fontSize:13,fontWeight:700,marginBottom:6,display:"block",color:t.text}}>Intégrations API</span>
              <div style={{fontSize:11,color:t.textMuted,marginBottom:8}}>Entrer vos clés API ici. Les données seront importées automatiquement une fois configurées.</div>
              {[["auphanKey","Auphan POS","Clé API ou URL...","À venir — contacter Auphan pour documentation"],
                ["weatherKey","Météo (Open-Meteo)","Clé API...","Gratuit — open-meteo.com (aucune clé requise)"],
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

            <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:9,padding:11}}>
              <span style={{fontSize:11.5,color:t.textSub}}>Jours: <strong style={{color:"#f97316"}}>{Object.keys(liveData).length}</strong> · Caissiers: <strong style={{color:"#f97316"}}>{roster.length}</strong> · Employés: <strong style={{color:"#f97316"}}>{empRoster.length}</strong> · Fournisseurs: <strong style={{color:"#f97316"}}>{suppliers.length}</strong></span>
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
