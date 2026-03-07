import { useState, useEffect, useCallback, useRef, useMemo } from "react";

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
function F({label,value,onChange,disabled,prefix,suffix,type="number",placeholder,wide,accent:ac}){
  return(<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"3.5px 0",borderBottom:"1px solid rgba(255,255,255,0.025)",gap:4}}>
    <span style={{fontSize:11.5,color:disabled?"#3e4254":"#8b8fa3",fontWeight:500,whiteSpace:"nowrap"}}>{label}</span>
    <div style={{display:"flex",alignItems:"center",gap:2}}>
      {prefix&&<span style={{fontSize:10.5,color:"#3e4254"}}>{prefix}</span>}
      <input type={type} inputMode={type==="number"?"decimal":"text"} placeholder={placeholder||""} value={value??""}
        onChange={e=>{if(type==="number")onChange(e.target.value===""?null:parseFloat(e.target.value));else onChange(e.target.value)}}
        disabled={disabled}
        style={{width:wide?125:80,padding:"3.5px 6px",borderRadius:4,border:`1px solid ${disabled?"rgba(255,255,255,0.04)":ac?`rgba(${ac},0.2)`:`rgba(249,115,22,${value!=null&&value!==""?0.2:0.07})`}`,background:disabled?"rgba(255,255,255,0.015)":"rgba(255,255,255,0.04)",color:disabled?"#4a4e5e":"#ededf0",fontFamily:"'DM Mono',monospace",fontSize:12,textAlign:"right",outline:"none"}}/>
      {suffix&&<span style={{fontSize:10,color:"#3e4254"}}>{suffix}</span>}
    </div>
  </div>);
}
// Buffered input for P&L — local state while typing, commits on blur
function PL({label,value,onChange,prefix}){
  const [local,setLocal]=useState(value??"");
  const [focused,setFocused]=useState(false);
  useEffect(()=>{if(!focused)setLocal(value??"")},[value,focused]);
  return(<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"3.5px 0",borderBottom:"1px solid rgba(255,255,255,0.025)",gap:4}}>
    <span style={{fontSize:11.5,color:"#8b8fa3",fontWeight:500,whiteSpace:"nowrap"}}>{label}</span>
    <div style={{display:"flex",alignItems:"center",gap:2}}>
      {prefix&&<span style={{fontSize:10.5,color:"#3e4254"}}>{prefix}</span>}
      <input type="number" inputMode="decimal" value={local}
        onChange={e=>setLocal(e.target.value)}
        onFocus={()=>setFocused(true)}
        onBlur={()=>{setFocused(false);const n=local===""?null:parseFloat(local);if(n!==value)onChange(n)}}
        onKeyDown={e=>{if(e.key==="Enter")e.target.blur()}}
        style={{width:80,padding:"3.5px 6px",borderRadius:4,border:`1px solid rgba(249,115,22,${local!==""?0.2:0.07})`,background:"rgba(255,255,255,0.04)",color:"#ededf0",fontFamily:"'DM Mono',monospace",fontSize:12,textAlign:"right",outline:"none"}}/>
    </div>
  </div>);
}
const RR=({label,value,accent,unit="$",bold})=>{const disp=value==null?"—":unit==="$"?fmt(value):value;return(<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"3.5px 0",borderBottom:"1px solid rgba(255,255,255,0.025)"}}><span style={{fontSize:11.5,color:"#8b8fa3",fontWeight:bold?600:500}}>{label}</span><span style={{fontFamily:"'DM Mono',monospace",fontSize:bold?13:12,color:accent||"#dddde2",fontWeight:bold?700:600,minWidth:80,textAlign:"right"}}>{disp}</span></div>)};
const Pill=({ok,label,warn})=>(<span style={{display:"inline-flex",alignItems:"center",gap:3,padding:"2px 7px",borderRadius:14,fontSize:9.5,fontWeight:600,background:warn?"rgba(251,191,36,0.12)":ok?"rgba(34,197,94,0.1)":"rgba(239,68,68,0.1)",color:warn?"#fbbf24":ok?"#16a34a":"#dc2626"}}><span style={{width:4,height:4,borderRadius:"50%",background:warn?"#fbbf24":ok?"#22c55e":"#ef4444"}}/>{label}</span>);
const MC=({label,value,sub,accent})=>(<div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.055)",borderRadius:8,padding:"9px 13px",display:"flex",flexDirection:"column",gap:1,minWidth:100,flex:"1 1 100px"}}><span style={{fontSize:8.5,color:"#7a7e90",textTransform:"uppercase",letterSpacing:0.8,fontWeight:600}}>{label}</span><span style={{fontSize:18,fontWeight:700,color:accent||"#ededf0",fontFamily:"'DM Mono',monospace"}}>{value}</span>{sub&&<span style={{fontSize:9.5,color:"#5a5e70"}}>{sub}</span>}</div>);
const CompBar=({label,current,previous,unit="$"})=>{const pct=previous?((current-previous)/previous*100):0;const up=pct>=0;return(<div style={{padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,0.03)"}}><div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:3,marginBottom:2}}><span style={{fontSize:11,color:"#7a7e90"}}>{label}</span><div style={{display:"flex",gap:8,alignItems:"center"}}><span style={{fontSize:10.5,color:"#5a5e70"}}>{previous!=null?`${unit==="$"?fmt(previous):previous}`:"—"} → {unit==="$"?fmt(current):current}</span>{previous!=null&&<span style={{fontSize:10,fontWeight:700,color:up?"#22c55e":"#ef4444",fontFamily:"'DM Mono',monospace"}}>{up?"▲":"▼"}{Math.abs(pct).toFixed(1)}%</span>}</div></div><div style={{display:"flex",gap:2,height:3,borderRadius:2,overflow:"hidden"}}><div style={{flex:Math.abs(previous)||1,background:"rgba(139,143,163,0.18)"}}/><div style={{flex:Math.abs(current)||1,background:up?"rgba(34,197,94,0.35)":"rgba(239,68,68,0.3)"}}/></div></div>)};
const WeekChart=({selectedDate,computeDay})=>{const d=new Date(selectedDate+"T12:00:00");const dow=d.getDay();const mon=new Date(d);mon.setDate(d.getDate()-((dow+6)%7));const days=[];for(let i=0;i<7;i++){const dd=new Date(mon);dd.setDate(mon.getDate()+i);days.push({key:dk(dd),label:DAYS_FR[dd.getDay()].slice(0,3),vn:computeDay(dk(dd)).venteNet})}const mx=Math.max(...days.map(x=>x.vn||0),1);return(<div style={{display:"flex",gap:4,alignItems:"flex-end",height:80}}>{days.map((x,i)=>{const h=Math.max(2,(x.vn/mx)*65);const sel=x.key===selectedDate;return(<div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}><span style={{fontSize:8,color:"#4a4e5e",fontFamily:"'DM Mono',monospace"}}>{x.vn>0?`${(x.vn/1000).toFixed(1)}k`:""}</span><div style={{width:"100%",height:h,borderRadius:3,background:sel?"linear-gradient(180deg,#f97316,#ea580c)":x.vn>0?"rgba(255,255,255,0.08)":"rgba(255,255,255,0.02)"}}/><span style={{fontSize:8.5,fontWeight:sel?700:400,color:sel?"#f97316":"#4a4e5e",textTransform:"capitalize"}}>{x.label}</span></div>)})}</div>)};
function ReconLine({label,value,negative,bold,accent,borderTop}){return(<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"3px 0",borderTop:borderTop?"1.5px solid rgba(255,255,255,0.08)":"none"}}><span style={{fontSize:11,color:bold?"#c0c3d4":"#7a7e90",fontWeight:bold?600:400}}>{label}</span><span style={{fontFamily:"'DM Mono',monospace",fontSize:bold?13:11.5,fontWeight:bold?700:500,color:accent||(negative?"#ef4444":"#c0c3d4")}}>{value==null?"—":`${negative?"− ":""}${fmt(Math.abs(value))}`}</span></div>)}

// ── CASH BLOCK ──
function CashBlock({cash,index,onChange,onRemove,canRemove,collapsed,onToggle,roster}){
  const posOk=cash.posVentes!=null;const posT=(cash.posVentes||0)+(cash.posTPS||0)+(cash.posTVQ||0)+(cash.posLivraisons||0);
  const mc=cash.float!=null&&cash.deposits!=null&&cash.finalCash!=null;
  const manT=mc?(cash.interac||0)+(cash.livraisons||0)+(cash.deposits||0)+(cash.finalCash||0)-(cash.float||0):null;
  const canR=posOk&&mc;const ecart=canR?manT-posT:null;const bal=canR&&Math.abs(ecart)<=1;
  const rN=roster.find(r=>r.id===cash.cashierId)?.name;const label=rN||`Caisse ${index+1}`;
  const fc=[cash.posVentes,cash.float,cash.interac,cash.deposits,cash.finalCash].filter(v=>v!=null).length;
  return(<div style={{background:"rgba(255,255,255,0.015)",border:`1px solid ${bal?"rgba(34,197,94,0.15)":canR&&!bal?"rgba(239,68,68,0.15)":"rgba(255,255,255,0.05)"}`,borderRadius:10,overflow:"hidden"}}>
    <div onClick={onToggle} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 11px",cursor:"pointer",background:bal?"rgba(34,197,94,0.03)":"rgba(255,255,255,0.01)",borderBottom:collapsed?"none":"1px solid rgba(255,255,255,0.035)",userSelect:"none"}}>
      <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:12,color:collapsed?"#5a5e70":"#f97316",transform:collapsed?"rotate(-90deg)":"rotate(0deg)",display:"inline-block"}}>▾</span><span style={{fontSize:12.5,fontWeight:700}}>{label}</span>{bal&&<Pill ok label="Balancé"/>}{canR&&!bal&&<Pill ok={false} label={`Écart: ${fmt(ecart)}`}/>}{!canR&&fc>0&&<Pill warn label="Incomplet"/>}</div>
      <div style={{display:"flex",gap:4,alignItems:"center"}} onClick={e=>e.stopPropagation()}>{manT!=null&&<span style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:"#8b8fa3",fontWeight:600}}>{fmt(manT)}</span>}{canRemove&&<button onClick={onRemove} style={{background:"rgba(239,68,68,0.07)",border:"none",borderRadius:4,color:"#ef4444",fontSize:10,padding:"2px 6px",cursor:"pointer",fontWeight:600}}>✕</button>}</div>
    </div>
    {!collapsed&&(<div style={{padding:11}}>
      <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:8,paddingBottom:7,borderBottom:"1px solid rgba(255,255,255,0.035)"}}><span style={{fontSize:11}}>👤</span><select value={cash.cashierId||""} onChange={e=>onChange({...cash,cashierId:e.target.value})} style={{flex:1,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:5,color:"#e8e8ec",fontSize:12,padding:"4px 7px",outline:"none"}}><option value="" style={{background:"#1a1c24"}}>— Sélectionner —</option>{roster.map(r=>(<option key={r.id} value={r.id} style={{background:"#1a1c24"}}>{r.name}</option>))}</select></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div><div style={{fontSize:9.5,color:"#818cf8",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}><span style={{width:8,height:8,borderRadius:2,background:"#818cf8",display:"inline-block",marginRight:4}}/> Lecture POS</div><div style={{background:"rgba(129,140,248,0.04)",borderRadius:7,padding:8,border:"1px solid rgba(129,140,248,0.08)"}}><F label="Ventes av. taxes" value={cash.posVentes} onChange={v=>onChange({...cash,posVentes:v})} prefix="$" accent="129,140,248"/><F label="TPS" value={cash.posTPS} onChange={v=>onChange({...cash,posTPS:v})} prefix="$" accent="129,140,248"/><F label="TVQ" value={cash.posTVQ} onChange={v=>onChange({...cash,posTVQ:v})} prefix="$" accent="129,140,248"/><F label="Livraisons" value={cash.posLivraisons} onChange={v=>onChange({...cash,posLivraisons:v})} prefix="$" accent="129,140,248"/><div style={{marginTop:4,paddingTop:4,borderTop:"1px solid rgba(129,140,248,0.1)"}}><RR label="Total POS" value={posOk?posT:null} accent="#818cf8" bold/></div></div></div>
        <div><div style={{fontSize:9.5,color:"#f97316",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}><span style={{width:8,height:8,borderRadius:2,background:"#f97316",display:"inline-block",marginRight:4}}/> Décompte</div><div style={{background:"rgba(249,115,22,0.03)",borderRadius:7,padding:8,border:"1px solid rgba(249,115,22,0.08)"}}><F label="Float" value={cash.float} onChange={v=>onChange({...cash,float:v})} prefix="$"/><F label="Interac" value={cash.interac} onChange={v=>onChange({...cash,interac:v})} prefix="$"/><F label="Livraisons" value={cash.livraisons} onChange={v=>onChange({...cash,livraisons:v})} prefix="$"/><F label="Dépôts" value={cash.deposits} onChange={v=>onChange({...cash,deposits:v})} prefix="$"/><F label="Cash final" value={cash.finalCash} onChange={v=>onChange({...cash,finalCash:v})} prefix="$"/></div></div>
      </div>
      <div style={{marginTop:10,padding:"10px 12px",borderRadius:8,background:bal?"rgba(34,197,94,0.05)":canR?"rgba(239,68,68,0.05)":"rgba(255,255,255,0.02)",border:`1px solid ${bal?"rgba(34,197,94,0.12)":canR?"rgba(239,68,68,0.12)":"rgba(255,255,255,0.04)"}`}}>
        <div style={{fontSize:10,color:"#9a9eb5",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,marginBottom:6}}>Réconciliation</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:8,alignItems:"start"}}>
          <div><div style={{fontSize:9,color:"#f97316",fontWeight:600,textTransform:"uppercase",marginBottom:4}}>Compté</div><ReconLine label="Interac" value={cash.interac??0}/><ReconLine label="Livraisons" value={cash.livraisons??0}/><ReconLine label="Dépôts" value={cash.deposits??0}/><ReconLine label="Cash final" value={cash.finalCash??0}/><ReconLine label="Float" value={cash.float??0} negative/><ReconLine label="TOTAL" value={manT} bold accent="#f97316" borderTop/></div>
          <div style={{display:"flex",alignItems:"center",paddingTop:40}}><span style={{fontSize:13,fontWeight:700,color:"#4a4e5e"}}>vs</span></div>
          <div><div style={{fontSize:9,color:"#818cf8",fontWeight:600,textTransform:"uppercase",marginBottom:4}}>POS</div><ReconLine label="Ventes" value={cash.posVentes??null}/><ReconLine label="TPS" value={cash.posTPS??0}/><ReconLine label="TVQ" value={cash.posTVQ??0}/><ReconLine label="Livraisons" value={cash.posLivraisons??0}/><ReconLine label="TOTAL" value={posOk?posT:null} bold accent="#818cf8" borderTop/></div>
        </div>
        {canR?(<div style={{marginTop:8,padding:"7px 10px",borderRadius:6,textAlign:"center",background:bal?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.08)"}}>{bal?<span style={{fontSize:13,fontWeight:700,color:"#22c55e"}}>✓ BALANCÉ — {fmt(manT)}</span>:<div><span style={{fontSize:13,fontWeight:700,color:"#ef4444"}}>✗ ÉCART {fmt(Math.abs(ecart))}</span><div style={{fontSize:11,color:"#ef4444",marginTop:1}}>{ecart>0?"Surplus":"Manque"} de {fmt(Math.abs(ecart))}</div></div>}</div>):(<div style={{marginTop:8,padding:"7px 10px",borderRadius:6,textAlign:"center",background:"rgba(255,255,255,0.02)"}}><span style={{fontSize:11.5,color:"#4a4e5e"}}>{fc===0?"Remplir pour réconcilier":!posOk?"⬅ Remplir POS":"➡ Compléter décompte"}</span></div>)}
      </div>
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
  const [month,setMonth]=useState(()=>{const n=new Date();return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`});
  const [plData,setPlData]=useState({});const [saved,setSaved]=useState(false);const [loaded,setLoaded]=useState(false);const saveRef=useRef(null);

  useEffect(()=>{setLoaded(false);setSaved(false);(async()=>{try{const r=await window.storage.get(`dicann-pl-${month}`);if(r?.value)setPlData(JSON.parse(r.value));else setPlData({})}catch(e){setPlData({})}setLoaded(true)})()},[month]);

  const dbSave=useCallback(data=>{if(saveRef.current)clearTimeout(saveRef.current);saveRef.current=setTimeout(async()=>{try{await window.storage.set(`dicann-pl-${month}`,JSON.stringify(data))}catch(e){}},800)},[month]);
  const updPL=useCallback((key,val)=>{setPlData(prev=>{const next={...prev,[key]:val};dbSave(next);return next});setSaved(false)},[dbSave]);

  const [y,m]=month.split("-").map(Number);const dim=new Date(y,m,0).getDate();
  let autoRev=0,autoLab=0;for(let d=1;d<=dim;d++){const k=`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;const cd=computeDay(k);autoRev+=cd.venteNet;autoLab+=cd.labourCost||0}
  const revenue=plData._revenueOverride!=null?plData._revenueOverride:autoRev;
  let fpT=plData.pettyCashFP||0;suppliers.forEach(s=>{fpT+=(plData[`sup_${s.id}`]||0)});
  let expT=plData.pettyCashMisc||0;EXPENSE_ITEMS.forEach(([k])=>{expT+=(plData[`exp_${k}`]||0)});
  const labC=plData.labourOverride!=null?plData.labourOverride:autoLab;
  const gp=revenue-fpT;const np=gp-labC-expT;
  const fpP=revenue>0?(fpT/revenue*100):0;const labP=revenue>0?(labC/revenue*100):0;const npP=revenue>0?(np/revenue*100):0;

  const buildHTML=()=>{
    let h=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>P&L — ${MONTHS_FR[m-1]} ${y}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font:13px/1.6 Arial,sans-serif;padding:30px;color:#222}h1{font-size:20px;color:#ea580c;margin-bottom:4px}h3{font-size:13px;color:#555;margin:16px 0 6px;text-transform:uppercase;letter-spacing:0.5px}table{border-collapse:collapse;width:100%;margin-bottom:8px}th,td{border:1px solid #ddd;padding:6px 10px;text-align:right;font-size:12px}th{background:#f7f7f7;font-weight:600}td:first-child,th:first-child{text-align:left}.g{color:#16a34a;font-weight:700}.r{color:#dc2626;font-weight:700}.sub{font-size:11px;color:#888}@media print{body{padding:15px}}</style></head><body>`;
    h+=`<h1>BalanceIQ — P&L Mensuel</h1><p class="sub">${MONTHS_FR[m-1]} ${y} · Généré le ${new Date().toLocaleDateString("fr-CA")}</p>`;
    h+=`<h3>Revenus</h3><table><tr><td><b>Vente nette</b></td><td><b>${fmt(revenue)}</b></td></tr></table>`;
    h+=`<h3>Coût des marchandises (Food & Paper)</h3><table><tr><td>Petite caisse F&P</td><td>${fmt(plData.pettyCashFP||0)}</td></tr>`;
    suppliers.forEach(s=>{h+=`<tr><td>${s.name}</td><td>${fmt(plData[`sup_${s.id}`]||0)}</td></tr>`});
    h+=`<tr style="font-weight:700"><td>Total F&P</td><td>${fmt(fpT)} (${fpP.toFixed(1)}%)</td></tr></table>`;
    h+=`<h3>Main d'œuvre</h3><table><tr><td><b>Total</b></td><td><b>${fmt(labC)} (${labP.toFixed(1)}%)</b></td></tr></table>`;
    h+=`<h3>Dépenses d'exploitation</h3><table><tr><td>Petite caisse Misc</td><td>${fmt(plData.pettyCashMisc||0)}</td></tr>`;
    EXPENSE_ITEMS.forEach(([k,l])=>{h+=`<tr><td>${l}</td><td>${fmt(plData[`exp_${k}`]||0)}</td></tr>`});
    h+=`<tr style="font-weight:700"><td>Total dépenses</td><td>${fmt(expT)}</td></tr></table>`;
    h+=`<h3>Résultat</h3><table><tr><td>Revenus</td><td>${fmt(revenue)}</td></tr><tr><td>− Food & Paper</td><td>${fmt(fpT)}</td></tr><tr style="font-weight:700"><td>Profit brut</td><td>${fmt(gp)}</td></tr><tr><td>− Main d'œuvre</td><td>${fmt(labC)}</td></tr><tr><td>− Dépenses</td><td>${fmt(expT)}</td></tr><tr><td class="${np>=0?"g":"r"}" style="font-size:14px">${np>=0?"PROFIT NET":"PERTE NETTE"}</td><td class="${np>=0?"g":"r"}" style="font-size:14px">${fmt(Math.abs(np))} (${npP.toFixed(1)}%)</td></tr></table>`;
    h+=`<p class="sub" style="margin-top:20px">BalanceIQ · ${OWNER_EMAIL}</p></body></html>`;
    return h;
  };

  const handleSave=async()=>{
    const fd={...plData,_month:month,_savedAt:new Date().toISOString()};
    try{await window.storage.set(`dicann-pl-${month}`,JSON.stringify(fd))}catch(e){}
    openPDF(buildHTML());
    setSaved(true);setTimeout(()=>setSaved(false),5000);
  };

  const handleEmail=()=>{
    const subj=encodeURIComponent(`BalanceIQ — P&L ${MONTHS_FR[m-1]} ${y}`);
    const body=encodeURIComponent(`P&L — ${MONTHS_FR[m-1]} ${y}\n\nRevenus: ${fmt(revenue)}\nF&P: ${fmt(fpT)} (${fpP.toFixed(1)}%)\nMain d'œuvre: ${fmt(labC)} (${labP.toFixed(1)}%)\nDépenses: ${fmt(expT)}\n\n${np>=0?"PROFIT NET":"PERTE NETTE"}: ${fmt(Math.abs(np))} (${npP.toFixed(1)}%)\n\n— BalanceIQ`);
    window.open(`mailto:${OWNER_EMAIL}?subject=${subj}&body=${body}`);
  };

  const Sec=({title,color,children})=>(<div style={{background:`rgba(${color},0.03)`,border:`1px solid rgba(${color},0.1)`,borderRadius:8,padding:10}}><div style={{fontSize:10,color:`rgb(${color})`,fontWeight:700,textTransform:"uppercase",letterSpacing:0.7,marginBottom:6}}>{title}</div>{children}</div>);

  if(!loaded)return(<div style={{padding:20,textAlign:"center",color:"#4a4e5e"}}>Chargement...</div>);

  return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><input type="month" value={month} onChange={e=>setMonth(e.target.value)} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:5,color:"#e8e8ec",padding:"5px 8px",fontSize:12,fontFamily:"'DM Mono',monospace"}}/><span style={{fontSize:14,fontWeight:700,textTransform:"capitalize"}}>{MONTHS_FR[m-1]} {y}</span></div>
    <div style={{display:"flex",gap:5,flexWrap:"wrap"}}><MC label="Revenus" value={fmt(revenue)} accent="#22c55e"/><MC label="F&P" value={fmt(fpT)} sub={`${fpP.toFixed(1)}%`} accent={fpP>35?"#ef4444":"#f97316"}/><MC label="Main d'œuvre" value={fmt(labC)} sub={`${labP.toFixed(1)}%`} accent={labP>35?"#ef4444":"#38bdf8"}/><MC label="Profit" value={fmt(np)} sub={`${npP.toFixed(1)}%`} accent={np>=0?"#22c55e":"#ef4444"}/></div>
    <Sec title="Revenus" color="34,197,94">
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 0"}}><span style={{fontSize:12,color:"#8b8fa3"}}>Ventes nettes <span style={{fontSize:10,color:"#5a5e70"}}>(auto: {fmt(autoRev)})</span></span>
        {plData._revenueOverride==null?(<div style={{display:"flex",gap:4,alignItems:"center"}}><span style={{fontFamily:"'DM Mono',monospace",fontSize:14,fontWeight:700,color:"#22c55e"}}>{fmt(autoRev)}</span><button onClick={()=>updPL("_revenueOverride",autoRev)} style={{fontSize:9,padding:"1px 5px",borderRadius:3,border:"1px solid rgba(251,191,36,0.2)",background:"rgba(251,191,36,0.08)",color:"#fbbf24",cursor:"pointer"}}>✎</button></div>)
        :(<div style={{display:"flex",gap:4,alignItems:"center"}}><input type="number" value={plData._revenueOverride??""} onChange={e=>updPL("_revenueOverride",e.target.value===""?null:parseFloat(e.target.value))} style={{width:100,padding:"3px 6px",borderRadius:4,border:"1px solid rgba(251,191,36,0.25)",background:"rgba(251,191,36,0.06)",color:"#fbbf24",fontFamily:"'DM Mono',monospace",fontSize:13,textAlign:"right",outline:"none"}}/><button onClick={()=>updPL("_revenueOverride",null)} style={{fontSize:9,padding:"1px 4px",borderRadius:3,border:"none",background:"rgba(239,68,68,0.1)",color:"#ef4444",cursor:"pointer"}}>✕</button></div>)}
      </div>
    </Sec>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
      <Sec title="Coût marchandises (F&P)" color="249,115,22">
        <PL label="Petite caisse F&P" value={plData.pettyCashFP} onChange={v=>updPL("pettyCashFP",v)} prefix="$"/>
        {suppliers.map(s=>(<PL key={s.id} label={s.name} value={plData[`sup_${s.id}`]} onChange={v=>updPL(`sup_${s.id}`,v)} prefix="$"/>))}
        <div style={{marginTop:6,paddingTop:6,borderTop:"1px solid rgba(249,115,22,0.15)"}}><RR label="Total F&P" value={fpT} accent="#f97316" bold/>{revenue>0&&<RR label="F&P %" value={`${fpP.toFixed(1)}%`} unit="" accent={fpP>35?"#ef4444":fpP>30?"#fbbf24":"#22c55e"}/>}</div>
      </Sec>
      <Sec title="Dépenses d'exploitation" color="129,140,248">
        <PL label="Petite caisse Misc" value={plData.pettyCashMisc} onChange={v=>updPL("pettyCashMisc",v)} prefix="$"/>
        {EXPENSE_ITEMS.map(([k,l])=>(<PL key={k} label={l} value={plData[`exp_${k}`]} onChange={v=>updPL(`exp_${k}`,v)} prefix="$"/>))}
        <div style={{marginTop:6,paddingTop:6,borderTop:"1px solid rgba(129,140,248,0.15)"}}><RR label="Total dépenses" value={expT} accent="#818cf8" bold/></div>
      </Sec>
    </div>
    <Sec title="Main d'œuvre" color="56,189,248">
      <div style={{fontSize:11,color:"#5a5e70",marginBottom:4}}>Auto (rapports quotidiens): {fmt(autoLab)}</div>
      <PL label="Override mensuel" value={plData.labourOverride} onChange={v=>updPL("labourOverride",v)} prefix="$"/>
      <RR label="Total" value={labC} accent="#38bdf8" bold/>{revenue>0&&<RR label="%" value={`${labP.toFixed(1)}%`} unit="" accent={labP>35?"#ef4444":labP>28?"#fbbf24":"#22c55e"}/>}
    </Sec>
    <div style={{background:np>=0?"rgba(34,197,94,0.04)":"rgba(239,68,68,0.04)",border:`1px solid ${np>=0?"rgba(34,197,94,0.12)":"rgba(239,68,68,0.12)"}`,borderRadius:10,padding:14}}>
      <div style={{fontSize:11,color:"#9a9eb5",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,marginBottom:8}}>Résultat — {MONTHS_FR[m-1]} {y}</div>
      <RR label="Revenus" value={revenue} accent="#22c55e" bold/><RR label="− F&P" value={fpT} accent="#f97316"/><div style={{paddingTop:4,borderTop:"1px solid rgba(255,255,255,0.04)"}}><RR label="= Profit brut" value={gp} bold/></div><RR label="− Main d'œuvre" value={labC} accent="#38bdf8"/><RR label="− Dépenses" value={expT} accent="#818cf8"/>
      <div style={{paddingTop:6,marginTop:4,borderTop:"2px solid rgba(255,255,255,0.08)",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:14,fontWeight:700,color:np>=0?"#22c55e":"#ef4444"}}>{np>=0?"PROFIT NET":"PERTE NETTE"}</span><div style={{textAlign:"right"}}><span style={{fontSize:22,fontWeight:700,color:np>=0?"#22c55e":"#ef4444",fontFamily:"'DM Mono',monospace"}}>{fmt(Math.abs(np))}</span>{revenue>0&&<div style={{fontSize:11,color:np>=0?"#22c55e":"#ef4444"}}>{npP.toFixed(1)}%</div>}</div></div>
    </div>
    <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
      <button onClick={handleSave} style={{padding:"9px 20px",borderRadius:7,border:"none",cursor:"pointer",fontWeight:700,fontSize:13,background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#fff"}}>💾 Sauvegarder & Imprimer PDF</button>
      <button onClick={handleEmail} style={{padding:"9px 16px",borderRadius:7,border:"1px solid rgba(34,197,94,0.2)",background:"rgba(34,197,94,0.08)",color:"#22c55e",cursor:"pointer",fontWeight:600,fontSize:12}}>📧 Envoyer à {OWNER_EMAIL}</button>
      {saved&&<span style={{fontSize:12,color:"#22c55e",fontWeight:600}}>✓ Sauvegardé — utiliser Ctrl+P / Cmd+P pour sauvegarder en PDF</span>}
    </div>
  </div>);
}

// ── INTELLIGENCE TAB ──
function IntelligenceTab({liveData,computeDay,demoData,selectedDate}){
  const d=new Date(selectedDate+"T12:00:00");
  // Day-of-week profiling
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

  // Anomaly detection — last 14 days
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

  // Cash variance per cashier (from liveData)
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

  // Projections from demo + live
  const dow=d.getDay();
  const samples=[];for(let w=1;w<=8;w++){const p=new Date(d);p.setDate(d.getDate()-(w*7));const k=dk(p);const cd=computeDay(k);const demo=demoData[k];const vn=cd.venteNet>0?cd.venteNet:(demo?.venteNet||0);if(vn>0)samples.push({venteNet:vn,hamUsed:cd.hamUsed||demo?.hamUsed||0,hotUsed:cd.hotUsed||demo?.hotUsed||0})}
  const hasProj=samples.length>=2;
  const avg=hasProj?Math.round(samples.reduce((a,x)=>a+x.venteNet,0)/samples.length):0;
  const aH=hasProj?Math.round(samples.reduce((a,x)=>a+x.hamUsed,0)/samples.length):0;
  const aHo=hasProj?Math.round(samples.reduce((a,x)=>a+x.hotUsed,0)/samples.length):0;
  const tr=samples.length>=3?((samples[0].venteNet-samples[samples.length-1].venteNet)/samples.length):0;
  const proj=Math.round(avg+tr);

  return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    {/* Projections */}
    <div style={{background:"rgba(255,255,255,0.015)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:9,padding:11}}>
      <span style={{fontSize:13,fontWeight:700,marginBottom:5,display:"block"}}>🔮 Projections — {DAYS_FR[dow]} {d.getDate()} {MONTHS_FR[d.getMonth()]}</span>
      {hasProj?(<div style={{display:"flex",flexDirection:"column",gap:8}}>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}><MC label="Projeté" value={fmt(proj)} sub={`${samples.length} ${DAYS_FR[dow]}s`} accent="#f97316"/><MC label="Moyenne" value={fmt(avg)} accent="#818cf8"/></div>
        <div style={{background:"rgba(255,255,255,0.02)",borderRadius:6,padding:8}}>
          <div style={{fontSize:9.5,color:"#7a7e90",fontWeight:600,textTransform:"uppercase",letterSpacing:0.7,marginBottom:4}}>Commande suggérée</div>
          <span style={{fontSize:13}}><span style={{color:"#f97316",fontWeight:700}}>{aH+3}</span> <span style={{color:"#5a5e70"}}>dz Ham</span></span>
          <span style={{fontSize:13,marginLeft:14}}><span style={{color:"#f97316",fontWeight:700}}>{aHo+2}</span> <span style={{color:"#5a5e70"}}>dz Hot</span></span>
        </div>
      </div>):(<div style={{fontSize:12,color:"#4a4e5e",textAlign:"center",padding:8}}>Besoin de 2+ semaines de données</div>)}
    </div>

    {/* Day-of-week profiling */}
    <div style={{background:"rgba(255,255,255,0.015)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:9,padding:11}}>
      <span style={{fontSize:13,fontWeight:700,marginBottom:6,display:"block"}}>📊 Profil par jour de la semaine</span>
      {hasDowData?(<div>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr",gap:4,padding:"4px 0",borderBottom:"1px solid rgba(255,255,255,0.04)",marginBottom:3}}>
          <span style={{fontSize:10,color:"#5a5e70",fontWeight:600}}>Jour</span><span style={{fontSize:10,color:"#5a5e70",fontWeight:600,textAlign:"right"}}>Données</span><span style={{fontSize:10,color:"#5a5e70",fontWeight:600,textAlign:"right"}}>Ventes moy.</span><span style={{fontSize:10,color:"#5a5e70",fontWeight:600,textAlign:"right"}}>Ham moy.</span><span style={{fontSize:10,color:"#5a5e70",fontWeight:600,textAlign:"right"}}>Hot moy.</span>
        </div>
        {dowProfiles.map((p,i)=>p.n>0&&(<div key={i} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr",gap:4,padding:"3px 0",borderBottom:"1px solid rgba(255,255,255,0.02)",alignItems:"center"}}>
          <span style={{fontSize:12,textTransform:"capitalize",fontWeight:d.getDay()===i?700:400,color:d.getDay()===i?"#f97316":"#e8e8ec"}}>{p.day}</span>
          <span style={{fontSize:11,color:"#5a5e70",textAlign:"right"}}>{p.n} jrs</span>
          <span style={{fontSize:12,fontFamily:"'DM Mono',monospace",textAlign:"right",color:"#818cf8"}}>{fmt(p.avgSales)}</span>
          <span style={{fontSize:12,fontFamily:"'DM Mono',monospace",textAlign:"right"}}>{p.avgHam}</span>
          <span style={{fontSize:12,fontFamily:"'DM Mono',monospace",textAlign:"right"}}>{p.avgHot}</span>
        </div>))}
      </div>):(<div style={{fontSize:12,color:"#4a4e5e",textAlign:"center",padding:8}}>Entrer des données quotidiennes pour voir les tendances</div>)}
    </div>

    {/* Anomalies */}
    <div style={{background:"rgba(255,255,255,0.015)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:9,padding:11}}>
      <span style={{fontSize:13,fontWeight:700,marginBottom:6,display:"block"}}>⚠️ Anomalies détectées (14 derniers jours)</span>
      {anomalies.length>0?anomalies.map((a,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",borderBottom:"1px solid rgba(255,255,255,0.02)"}}>
        <div><span style={{fontSize:12,textTransform:"capitalize"}}>{a.day} {a.date}</span></div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}><span style={{fontSize:11,color:"#5a5e70"}}>Moy: {fmt(a.avg)}</span><span style={{fontSize:11,color:"#8b8fa3"}}>→</span><span style={{fontSize:12,fontWeight:600,fontFamily:"'DM Mono',monospace"}}>{fmt(a.venteNet)}</span><span style={{fontSize:11,fontWeight:700,color:a.pct>0?"#22c55e":"#ef4444",fontFamily:"'DM Mono',monospace"}}>{a.pct>0?"+":""}{a.pct.toFixed(0)}%</span></div>
      </div>)):(<div style={{fontSize:12,color:"#4a4e5e",textAlign:"center",padding:8}}>Aucune anomalie — besoin de 3+ jours du même type</div>)}
    </div>

    {/* Cash variance per cashier */}
    <div style={{background:"rgba(255,255,255,0.015)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:9,padding:11}}>
      <span style={{fontSize:13,fontWeight:700,marginBottom:6,display:"block"}}>💰 Historique écarts de caisse</span>
      {Object.keys(cashierVariances).length>0?Object.entries(cashierVariances).map(([id,data])=>(<div key={id} style={{marginBottom:8}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}><span style={{fontSize:12,fontWeight:600}}>{id.length>8?`Caissier ${id.slice(-4)}`:id}</span><span style={{fontSize:12,fontFamily:"'DM Mono',monospace",color:data.total>=0?"#22c55e":"#ef4444",fontWeight:700}}>Total: {data.total>=0?"+":""}{fmt(data.total)}</span></div>
        {data.ecarts.slice(-5).map((e,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",padding:"2px 0",fontSize:11}}><span style={{color:"#5a5e70"}}>{e.date}</span><span style={{fontFamily:"'DM Mono',monospace",color:Math.abs(e.ecart)<=1?"#22c55e":"#ef4444"}}>{Math.abs(e.ecart)<=1?"✓ OK":e.ecart>0?`+${fmt(e.ecart)}`:fmt(e.ecart)}</span></div>))}
      </div>)):(<div style={{fontSize:12,color:"#4a4e5e",textAlign:"center",padding:8}}>Aucune donnée — les écarts apparaîtront après réconciliation</div>)}
    </div>
  </div>);
}

// ── MAIN ──
export default function App(){
  const [demoData]=useState(()=>genDemo());const [liveData,setLiveData]=useState({});const [roster,setRoster]=useState([]);const [empRoster,setEmpRoster]=useState([]);const [suppliers,setSuppliers]=useState(DEFAULT_SUPPLIERS);
  const [apiConfig,setApiConfig]=useState({auphanKey:"",weatherKey:"",gasKey:""});
  const [selectedDate,setSelectedDate]=useState(()=>dk(new Date()));const [activeTab,setActiveTab]=useState("daily");const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);
  const [collapseMap,setCollapseMap]=useState({});const [empOpen,setEmpOpen]=useState(false);const [newCN,setNewCN]=useState("");const [newEN,setNewEN]=useState("");const [newEW,setNewEW]=useState("");const saveTimer=useRef(null);
  const [editingSupId,setEditingSupId]=useState(null);const [editingSupName,setEditingSupName]=useState("");

  useEffect(()=>{(async()=>{
    try{const r=await window.storage.get("dicann-v7");if(r?.value)setLiveData(JSON.parse(r.value))}catch(e){}
    try{const r2=await window.storage.get("dicann-roster");if(r2?.value)setRoster(JSON.parse(r2.value))}catch(e){}
    try{const r2b=await window.storage.get("dicann-emp-roster");if(r2b?.value)setEmpRoster(JSON.parse(r2b.value))}catch(e){}
    try{const r3=await window.storage.get("dicann-suppliers-v2");if(r3?.value)setSuppliers(JSON.parse(r3.value))}catch(e){}
    try{const r4=await window.storage.get("dicann-api-config");if(r4?.value)setApiConfig(JSON.parse(r4.value))}catch(e){}
    setLoading(false);
  })()},[]);

  const persist=useCallback(data=>{if(saveTimer.current)clearTimeout(saveTimer.current);setSaving(true);saveTimer.current=setTimeout(async()=>{try{await window.storage.set("dicann-v7",JSON.stringify(data))}catch(e){}setSaving(false)},600)},[]);
  const saveRoster=useCallback(async r=>{try{await window.storage.set("dicann-roster",JSON.stringify(r))}catch(e){}},[]);
  const saveEmpRoster=useCallback(async r=>{try{await window.storage.set("dicann-emp-roster",JSON.stringify(r))}catch(e){}},[]);
  const saveSup=useCallback(async s=>{try{await window.storage.set("dicann-suppliers-v2",JSON.stringify(s))}catch(e){}},[]);
  const saveApiCfg=useCallback(async c=>{try{await window.storage.set("dicann-api-config",JSON.stringify(c))}catch(e){}},[]);

  const upd=useCallback((dt,f,v)=>{setLiveData(p=>{const u={...p,[dt]:{...(p[dt]||{}),[f]:v}};persist(u);return u})},[persist]);
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

  // Gas price auto-fill: walk back up to 14 days to find last known price
  const lastGas=useMemo(()=>{
    if(raw.gas!=null&&raw.gas!=="")return null; // user already entered one today
    for(let i=1;i<=14;i++){
      const prev=new Date(d);prev.setDate(d.getDate()-i);const pk=dk(prev);
      const pd=liveData[pk];
      if(pd?.gas!=null&&pd.gas!=="")return{price:pd.gas,daysAgo:i,date:pk};
    }
    return null;
  },[raw.gas,d,liveData]);
  const displayGas=raw.gas!=null&&raw.gas!==""?raw.gas:lastGas?.price??null;
  const dow=d.getDay();const mOff=(dow+6)%7;let wkC=0;for(let i=0;i<=(dow===0?6:dow-1);i++){const wd=new Date(d);wd.setDate(d.getDate()-mOff+i);wkC+=computeDay(dk(wd)).venteNet}
  const hasL=Object.keys(liveData[selectedDate]||{}).length>0;
  const togC=i=>setCollapseMap(p=>({...p,[`${selectedDate}-${i}`]:!p[`${selectedDate}-${i}`]}));
  const addRC=()=>{if(!newCN.trim())return;const nr=[...roster,{id:Date.now().toString(),name:newCN.trim()}];setRoster(nr);saveRoster(nr);setNewCN("")};

  const tabs=[{id:"daily",label:"📋 Quotidien"},{id:"monthly",label:"📊 P&L Mensuel"},{id:"intelligence",label:"🧠 Intelligence"},{id:"settings",label:"⚙️ Config"}];
  if(loading)return(<div style={{minHeight:"100vh",background:"#0c0e14",display:"flex",alignItems:"center",justifyContent:"center",color:"#4a4e5e",fontFamily:"'Outfit',sans-serif"}}>Chargement...</div>);

  return(<div style={{minHeight:"100vh",background:"#0c0e14",fontFamily:"'Outfit','Helvetica Neue',sans-serif",color:"#e8e8ec"}}>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
    <div style={{background:"linear-gradient(180deg,rgba(249,115,22,0.06) 0%,transparent 100%)",borderBottom:"1px solid rgba(255,255,255,0.04)",padding:"9px 15px"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",maxWidth:1120,margin:"0 auto"}}><div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:32,height:28,borderRadius:6,background:"linear-gradient(135deg,#f97316,#ea580c)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:"#fff",letterSpacing:-0.5}}>BIQ</div><span style={{fontSize:14,fontWeight:700}}>BalanceIQ</span></div><div style={{display:"flex",alignItems:"center",gap:4}}>{saving&&<span style={{fontSize:9,color:"#f97316",fontFamily:"'DM Mono',monospace"}}>sauvegarde...</span>}{hasL&&<Pill ok label="Saisie"/>}</div></div></div>

    <div style={{maxWidth:1120,margin:"0 auto",padding:"8px 15px 0"}}>
      {activeTab==="daily"&&(<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:6}}><div style={{display:"flex",alignItems:"center",gap:6}}><button onClick={()=>{const n=new Date(d);n.setDate(n.getDate()-1);setSelectedDate(dk(n))}} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:5,color:"#e8e8ec",padding:"3px 8px",cursor:"pointer",fontSize:13}}>←</button><div><div style={{fontSize:15,fontWeight:700,textTransform:"capitalize"}}>{fmtD(d)}</div><div style={{display:"flex",gap:3,marginTop:1,flexWrap:"wrap"}}>{holiday&&<span style={{fontSize:9,background:"rgba(251,191,36,0.12)",color:"#fbbf24",padding:"1px 5px",borderRadius:8,fontWeight:600}}>🎉 {holiday}</span>}{today.weather&&<span style={{fontSize:9,background:"rgba(56,189,248,0.07)",color:"#38bdf8",padding:"1px 5px",borderRadius:8}}>{today.weather}{today.tempC!=null?` ${today.tempC}°C`:""}</span>}{displayGas!=null&&<span style={{fontSize:9,background:lastGas?"rgba(251,191,36,0.08)":"rgba(139,143,163,0.07)",color:lastGas?"#fbbf24":"#7a7e90",padding:"1px 5px",borderRadius:8}}>⛽ {Number(displayGas).toFixed(3)}$/L{lastGas?" (auto)":""}</span>}</div></div><button onClick={()=>{const n=new Date(d);n.setDate(n.getDate()+1);setSelectedDate(dk(n))}} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:5,color:"#e8e8ec",padding:"3px 8px",cursor:"pointer",fontSize:13}}>→</button></div><input type="date" value={selectedDate} onChange={e=>e.target.value&&setSelectedDate(e.target.value)} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:5,color:"#e8e8ec",padding:"3px 6px",fontSize:11,fontFamily:"'DM Mono',monospace"}}/></div>)}
      <div style={{display:"flex",gap:1,marginTop:8,borderBottom:"1px solid rgba(255,255,255,0.04)",overflowX:"auto"}}>{tabs.map(t=>(<button key={t.id} onClick={()=>setActiveTab(t.id)} style={{background:"none",border:"none",color:activeTab===t.id?"#f97316":"#4a4e5e",fontSize:11.5,fontWeight:600,padding:"5px 9px",cursor:"pointer",borderBottom:activeTab===t.id?"2px solid #f97316":"2px solid transparent",whiteSpace:"nowrap"}}>{t.label}</button>))}</div>
    </div>

    <div style={{maxWidth:1120,margin:"0 auto",padding:"10px 15px 30px"}}>
      {activeTab==="daily"&&(<div style={{display:"flex",flexDirection:"column",gap:10}}>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}><MC label="Vente nette" value={fmt(today.venteNet)} accent="#818cf8"/><MC label="Total brut" value={fmt(today.total)} accent="#f97316"/><MC label="$/douzaine" value={today.moyenne?fmt(today.moyenne):"—"} accent="#a855f7"/><MC label="Cumul sem." value={fmt(wkC)}/>{today.labourPct!=null&&<MC label="Main d'œuvre" value={`${today.labourPct.toFixed(1)}%`} sub={fmt(today.labourCost)} accent={today.labourPct>35?"#ef4444":today.labourPct>28?"#fbbf24":"#22c55e"}/>}</div>
        <div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}><span style={{fontSize:13.5,fontWeight:700}}>🗃️ Caisses</span><button onClick={()=>addCash(selectedDate)} style={{fontSize:10.5,padding:"3px 10px",borderRadius:5,border:"1px solid rgba(249,115,22,0.18)",background:"rgba(249,115,22,0.06)",color:"#f97316",cursor:"pointer",fontWeight:600}}>+ Caisse</button></div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>{cashes.map((c,i)=>(<CashBlock key={`${selectedDate}-${i}-${cashes.length}`} cash={c} index={i} onChange={c=>updCash(selectedDate,i,c)} onRemove={()=>rmCash(selectedDate,i)} canRemove={cashes.length>1} collapsed={!!collapseMap[`${selectedDate}-${i}`]} onToggle={()=>togC(i)} roster={roster}/>))}</div>
        </div>
        {today.anyData&&(<div style={{padding:"6px 10px",borderRadius:6,textAlign:"center",background:today.allBal?"rgba(34,197,94,0.06)":"rgba(251,191,36,0.06)"}}>{today.allBal?<span style={{fontSize:12,color:"#22c55e",fontWeight:600}}>✓ Toutes les caisses balancent</span>:<span style={{fontSize:12,color:"#fbbf24",fontWeight:600}}>⏳ Vérifier les caisses</span>}</div>)}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div style={{background:"rgba(255,255,255,0.015)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:9,padding:11}}>
            <span style={{fontSize:13,fontWeight:700,marginBottom:5,display:"block"}}>📦 Inventaire</span>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {[["HAMBURGER","ham",raw.hamStartOverride!=null,today.hamStart,today.hamUsed,today.hamEnd],["HOT DOG","hot",raw.hotStartOverride!=null,today.hotStart,today.hotUsed,today.hotEnd]].map(([title,pre,hasOv,startV,usedV,endV])=>(<div key={pre}><div style={{fontSize:10,color:"#f97316",fontWeight:700,marginBottom:2}}>{title}</div>
                {!hasOv?(<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"3.5px 0",borderBottom:"1px solid rgba(255,255,255,0.025)"}}><span style={{fontSize:11.5,color:"#8b8fa3"}}>Début</span><div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#dddde2",fontWeight:600}}>{startV??"-"}</span><button onClick={()=>upd(selectedDate,`${pre}StartOverride`,startV??0)} style={{fontSize:9,padding:"1px 5px",borderRadius:3,border:"1px solid rgba(251,191,36,0.2)",background:"rgba(251,191,36,0.08)",color:"#fbbf24",cursor:"pointer"}}>✎</button></div></div>)
                :(<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"3.5px 0",borderBottom:"1px solid rgba(251,191,36,0.15)"}}><span style={{fontSize:11.5,color:"#fbbf24"}}>Ajusté</span><div style={{display:"flex",alignItems:"center",gap:3}}><input type="number" value={raw[`${pre}StartOverride`]??""} onChange={e=>upd(selectedDate,`${pre}StartOverride`,e.target.value===""?null:parseFloat(e.target.value))} style={{width:50,padding:"2px 5px",borderRadius:4,border:"1px solid rgba(251,191,36,0.25)",background:"rgba(251,191,36,0.06)",color:"#fbbf24",fontFamily:"'DM Mono',monospace",fontSize:12,textAlign:"right",outline:"none"}}/><button onClick={()=>upd(selectedDate,`${pre}StartOverride`,null)} style={{fontSize:9,padding:"1px 4px",borderRadius:3,border:"none",background:"rgba(239,68,68,0.1)",color:"#ef4444",cursor:"pointer"}}>✕</button></div></div>)}
                <F label="+ Reçu" value={raw[`${pre}Received`]} onChange={v=>upd(selectedDate,`${pre}Received`,v)}/><F label="Fin journée" value={raw[`${pre}End`]} onChange={v=>upd(selectedDate,`${pre}End`,v)}/><div style={{marginTop:3,paddingTop:3,borderTop:"1px solid rgba(255,255,255,0.03)"}}><RR label="Utilisé" value={usedV} unit=""/></div>{endV!=null&&endV<5&&endV>=0&&<div style={{fontSize:9.5,color:"#fbbf24",marginTop:2}}>⚠️ Stock faible</div>}
              </div>))}
            </div>
            {today.totalDoz>0&&(<div style={{marginTop:8,padding:"8px 10px",borderRadius:7,background:"rgba(168,85,247,0.06)",border:"1px solid rgba(168,85,247,0.12)",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:10,color:"#a855f7",fontWeight:700,textTransform:"uppercase"}}>$ / douzaine</div><div style={{fontSize:10,color:"#5a5e70"}}>{fmt(today.venteNet)} ÷ {today.totalDoz} dz</div></div><span style={{fontSize:20,fontWeight:700,color:"#a855f7",fontFamily:"'DM Mono',monospace"}}>{fmt(today.moyenne)}</span></div>)}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{background:"rgba(255,255,255,0.015)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:9,padding:11}}><span style={{fontSize:13,fontWeight:700,marginBottom:4,display:"block"}}>📈 Semaine</span><WeekChart selectedDate={selectedDate} computeDay={computeDay}/></div>
            <div style={{background:"rgba(255,255,255,0.015)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:9,padding:11}}><span style={{fontSize:13,fontWeight:700,marginBottom:4,display:"block"}}>🌤️ Externes</span><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
              <F label="Météo" value={raw.weather} onChange={v=>upd(selectedDate,"weather",v)} type="text" placeholder="Ensoleillé..." wide/>
              <F label="Temp." value={raw.tempC} onChange={v=>upd(selectedDate,"tempC",v)} suffix="°C"/>
              <div>
                <F label="Essence" value={raw.gas} onChange={v=>upd(selectedDate,"gas",v)} suffix="$/L"/>
                {lastGas&&(
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"2px 0"}}>
                    <span style={{fontSize:10,color:"#fbbf24"}}>↑ Auto: {Number(lastGas.price).toFixed(3)}$/L (il y a {lastGas.daysAgo}j)</span>
                    <button onClick={()=>upd(selectedDate,"gas",lastGas.price)} style={{fontSize:9,padding:"1px 6px",borderRadius:3,border:"1px solid rgba(34,197,94,0.2)",background:"rgba(34,197,94,0.08)",color:"#22c55e",cursor:"pointer",fontWeight:600}}>✓ Confirmer</button>
                  </div>
                )}
                <button onClick={()=>alert("🔌 Scraping de la Régie de l'énergie du Québec — disponible dans la version desktop (Electron). Le prix minimum actuel sera récupéré automatiquement.")} style={{marginTop:3,fontSize:9.5,padding:"3px 8px",borderRadius:4,border:"1px solid rgba(56,189,248,0.2)",background:"rgba(56,189,248,0.06)",color:"#38bdf8",cursor:"pointer",fontWeight:600,width:"100%",textAlign:"center"}}>🔍 Vérifier le prix (Régie de l'énergie)</button>
              </div>
              <F label="Événement" value={raw.events} onChange={v=>upd(selectedDate,"events",v)} type="text" placeholder="Festival..." wide/>
            </div></div>
          </div>
        </div>
        {/* Employees */}
        <div style={{background:"rgba(255,255,255,0.015)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:9,overflow:"hidden"}}>
          <div onClick={()=>setEmpOpen(!empOpen)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 11px",cursor:"pointer",userSelect:"none"}}><div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:12,color:empOpen?"#f97316":"#5a5e70",transform:empOpen?"rotate(0deg)":"rotate(-90deg)",display:"inline-block"}}>▾</span><span style={{fontSize:13,fontWeight:700}}>👷 Main d'œuvre</span>{today.labourPct!=null&&<Pill ok={today.labourPct<=30} warn={today.labourPct>30&&today.labourPct<=35} label={`${today.labourPct.toFixed(1)}%`}/>}</div><span style={{fontSize:10.5,color:"#5a5e70"}}>{emps.length} emp.</span></div>
          {empOpen&&(<div style={{padding:"0 11px 11px"}}>
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr auto",gap:6,padding:"4px 0",borderBottom:"1px solid rgba(255,255,255,0.04)",marginBottom:4}}><span style={{fontSize:10,color:"#5a5e70",fontWeight:600}}>Employé</span><span style={{fontSize:10,color:"#5a5e70",fontWeight:600,textAlign:"right"}}>Heures</span><span style={{fontSize:10,color:"#5a5e70",fontWeight:600,textAlign:"right"}}>$/h</span><span style={{fontSize:10,color:"#5a5e70",fontWeight:600,textAlign:"right"}}>Coût</span><span style={{width:20}}/></div>
            {emps.map((emp,i)=>{const cost=(emp.hours||0)*(emp.wage||0);return(<div key={i} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr auto",gap:6,padding:"3px 0",borderBottom:"1px solid rgba(255,255,255,0.02)",alignItems:"center"}}>
              <select value={emp.empId||""} onChange={e=>{const eid=e.target.value;const re=empRoster.find(r=>r.id===eid);updEmp(selectedDate,i,{...emp,empId:eid,name:re?.name||"",wage:re?.wage||emp.wage})}} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:4,color:"#e8e8ec",fontSize:12,padding:"4px 6px",outline:"none"}}><option value="" style={{background:"#1a1c24"}}>— Choisir —</option>{empRoster.map(r=>(<option key={r.id} value={r.id} style={{background:"#1a1c24"}}>{r.name} ({fmt(r.wage)}/h)</option>))}</select>
              <input type="number" value={emp.hours??""} onChange={e=>updEmp(selectedDate,i,{...emp,hours:e.target.value===""?null:parseFloat(e.target.value)})} placeholder="hrs" style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:4,color:"#ededf0",fontSize:12,padding:"3px 5px",textAlign:"right",outline:"none",fontFamily:"'DM Mono',monospace"}}/>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#5a5e70",textAlign:"right"}}>{emp.wage?`${emp.wage.toFixed(2)}`:""}</span>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#8b8fa3",textAlign:"right"}}>{cost>0?fmt(cost):"—"}</span>
              <button onClick={()=>rmEmp(selectedDate,i)} style={{background:"rgba(239,68,68,0.07)",border:"none",borderRadius:4,color:"#ef4444",fontSize:10,padding:"2px 5px",cursor:"pointer"}}>✕</button>
            </div>)})}
            <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
              <select id="addEmpSelect" style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(249,115,22,0.18)",borderRadius:5,color:"#e8e8ec",fontSize:12,padding:"4px 8px",outline:"none"}}><option value="" style={{background:"#1a1c24"}}>— Ajouter un employé —</option>{empRoster.filter(r=>!emps.some(e=>e.empId===r.id)).map(r=>(<option key={r.id} value={r.id} style={{background:"#1a1c24"}}>{r.name}</option>))}</select>
              <button onClick={()=>{const sel=document.getElementById("addEmpSelect");const eid=sel?.value;if(!eid)return;const re=empRoster.find(r=>r.id===eid);if(re)addEmp(selectedDate,{empId:re.id,name:re.name,hours:null,wage:re.wage});sel.value=""}} style={{fontSize:10.5,padding:"4px 10px",borderRadius:5,border:"1px solid rgba(249,115,22,0.18)",background:"rgba(249,115,22,0.06)",color:"#f97316",cursor:"pointer",fontWeight:600}}>+ Ajouter</button>
              {(()=>{const prevDay=liveData[prevDk(selectedDate)];const prevEmps=prevDay?.employees;if(!prevEmps||prevEmps.length===0||emps.length>0)return null;return(<button onClick={()=>{prevEmps.forEach(e=>addEmp(selectedDate,{empId:e.empId||"",name:e.name||"",hours:null,wage:e.wage||null}))}} style={{fontSize:10.5,padding:"4px 10px",borderRadius:5,border:"1px solid rgba(129,140,248,0.18)",background:"rgba(129,140,248,0.06)",color:"#818cf8",cursor:"pointer",fontWeight:600}}>📋 Copier d'hier</button>)})()}
            </div>
            {today.labourCost>0&&(<div style={{marginTop:8,padding:"8px 10px",borderRadius:7,background:today.labourPct>35?"rgba(239,68,68,0.06)":today.labourPct>28?"rgba(251,191,36,0.06)":"rgba(34,197,94,0.06)",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:10,fontWeight:700,color:today.labourPct>35?"#ef4444":today.labourPct>28?"#fbbf24":"#22c55e",textTransform:"uppercase"}}>Main d'œuvre</div><div style={{fontSize:10,color:"#5a5e70"}}>{today.labourHrs}h · {fmt(today.labourCost)}</div></div><span style={{fontSize:22,fontWeight:700,fontFamily:"'DM Mono',monospace",color:today.labourPct>35?"#ef4444":today.labourPct>28?"#fbbf24":"#22c55e"}}>{today.labourPct.toFixed(1)}%</span></div>)}
          </div>)}
        </div>
        <div style={{background:"rgba(255,255,255,0.015)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:9,padding:11}}><span style={{fontSize:13,fontWeight:700,marginBottom:2,display:"block"}}>📝 Notes</span><textarea value={raw.notes||""} onChange={e=>upd(selectedDate,"notes",e.target.value)} placeholder="Notes..." style={{width:"100%",padding:5,borderRadius:5,border:"1px solid rgba(255,255,255,0.04)",background:"rgba(255,255,255,0.025)",color:"#e8e8ec",fontSize:11.5,fontFamily:"'Outfit',sans-serif",minHeight:36,resize:"vertical",outline:"none",boxSizing:"border-box"}}/></div>
      </div>)}

      {activeTab==="monthly"&&<MonthlyPL computeDay={computeDay} suppliers={suppliers}/>}

      {activeTab==="intelligence"&&<IntelligenceTab liveData={liveData} computeDay={computeDay} demoData={demoData} selectedDate={selectedDate}/>}

      {activeTab==="settings"&&(<div style={{display:"flex",flexDirection:"column",gap:10,maxWidth:560}}>
        {/* Cashier roster */}
        <div style={{background:"rgba(255,255,255,0.015)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:9,padding:11}}>
          <span style={{fontSize:13,fontWeight:700,marginBottom:6,display:"block"}}>👥 Caissiers</span>
          {roster.map(r=>(<div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 8px",background:"rgba(255,255,255,0.03)",borderRadius:5,marginBottom:3}}><span style={{fontSize:12}}>{r.name}</span><button onClick={()=>{const n=roster.filter(x=>x.id!==r.id);setRoster(n);saveRoster(n)}} style={{background:"rgba(239,68,68,0.07)",border:"none",borderRadius:4,color:"#ef4444",fontSize:10,padding:"2px 6px",cursor:"pointer"}}>✕</button></div>))}
          <div style={{display:"flex",gap:6,marginTop:4}}><input value={newCN} onChange={e=>setNewCN(e.target.value)} placeholder="Nom..." onKeyDown={e=>e.key==="Enter"&&addRC()} style={{flex:1,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:5,color:"#e8e8ec",fontSize:12,padding:"5px 8px",outline:"none"}}/><button onClick={addRC} style={{padding:"5px 14px",borderRadius:5,border:"none",cursor:"pointer",fontWeight:600,fontSize:12,background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#fff"}}>+</button></div>
        </div>

        {/* Employee roster with wages */}
        <div style={{background:"rgba(255,255,255,0.015)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:9,padding:11}}>
          <span style={{fontSize:13,fontWeight:700,marginBottom:6,display:"block"}}>👷 Employés</span>
          <div style={{fontSize:11,color:"#5a5e70",marginBottom:6}}>Ajoutez vos employés avec leur taux horaire. Le salaire sera auto-rempli dans le rapport quotidien.</div>
          {empRoster.map(r=>(<div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 8px",background:"rgba(255,255,255,0.03)",borderRadius:5,marginBottom:3}}>
            <span style={{fontSize:12}}>{r.name} <span style={{fontSize:11,color:"#8b8fa3",fontFamily:"'DM Mono',monospace"}}>{r.wage?`${r.wage.toFixed(2)}$/h`:""}</span></span>
            <button onClick={()=>{const n=empRoster.filter(x=>x.id!==r.id);setEmpRoster(n);saveEmpRoster(n)}} style={{background:"rgba(239,68,68,0.07)",border:"none",borderRadius:4,color:"#ef4444",fontSize:10,padding:"2px 6px",cursor:"pointer"}}>✕</button>
          </div>))}
          <div style={{display:"flex",gap:4,marginTop:4}}>
            <input value={newEN} onChange={e=>setNewEN(e.target.value)} placeholder="Nom..." style={{flex:2,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:5,color:"#e8e8ec",fontSize:12,padding:"5px 8px",outline:"none"}}/>
            <input value={newEW} onChange={e=>setNewEW(e.target.value)} placeholder="$/h" type="number" style={{flex:1,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:5,color:"#e8e8ec",fontSize:12,padding:"5px 8px",outline:"none",fontFamily:"'DM Mono',monospace",textAlign:"right"}}/>
            <button onClick={()=>{if(!newEN.trim())return;const nr=[...empRoster,{id:Date.now().toString(),name:newEN.trim(),wage:newEW?parseFloat(newEW):null}];setEmpRoster(nr);saveEmpRoster(nr);setNewEN("");setNewEW("")}} style={{padding:"5px 14px",borderRadius:5,border:"none",cursor:"pointer",fontWeight:600,fontSize:12,background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#fff"}}>+</button>
          </div>
        </div>

        {/* Editable supplier list */}
        <div style={{background:"rgba(255,255,255,0.015)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:9,padding:11}}>
          <span style={{fontSize:13,fontWeight:700,marginBottom:6,display:"block"}}>📦 Fournisseurs (P&L)</span>
          {suppliers.map((s,i)=>(<div key={s.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 8px",background:"rgba(255,255,255,0.03)",borderRadius:5,marginBottom:3}}>
            {editingSupId===s.id?(
              <input value={editingSupName} onChange={e=>setEditingSupName(e.target.value)}
                onBlur={()=>{if(editingSupName.trim()){const ns=suppliers.map(x=>x.id===s.id?{...x,name:editingSupName.trim()}:x);setSuppliers(ns);saveSup(ns)}setEditingSupId(null)}}
                onKeyDown={e=>{if(e.key==="Enter")e.target.blur();if(e.key==="Escape")setEditingSupId(null)}}
                autoFocus
                style={{flex:1,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(249,115,22,0.3)",borderRadius:4,color:"#e8e8ec",fontSize:12,padding:"3px 6px",outline:"none",marginRight:6}}/>
            ):(
              <span style={{fontSize:12,cursor:"pointer"}} onClick={()=>{setEditingSupId(s.id);setEditingSupName(s.name)}}>{s.name} <span style={{fontSize:9,color:"#4a4e5e"}}>✎</span></span>
            )}
            <button onClick={()=>{const ns=suppliers.filter(x=>x.id!==s.id);setSuppliers(ns);saveSup(ns)}} style={{background:"rgba(239,68,68,0.07)",border:"none",borderRadius:4,color:"#ef4444",fontSize:10,padding:"2px 6px",cursor:"pointer"}}>✕</button>
          </div>))}
          <div style={{display:"flex",gap:6,marginTop:4}}><input placeholder="Nouveau fournisseur..." onKeyDown={e=>{if(e.key==="Enter"&&e.target.value.trim()){const ns=[...suppliers,{id:Date.now().toString(),name:e.target.value.trim()}];setSuppliers(ns);saveSup(ns);e.target.value=""}}} style={{flex:1,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:5,color:"#e8e8ec",fontSize:12,padding:"5px 8px",outline:"none"}}/></div>
        </div>

        {/* API Config */}
        <div style={{background:"rgba(255,255,255,0.015)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:9,padding:11}}>
          <span style={{fontSize:13,fontWeight:700,marginBottom:6,display:"block"}}>🔌 Intégrations API</span>
          <div style={{fontSize:11,color:"#5a5e70",marginBottom:8}}>Entrer vos clés API ici. Les données seront importées automatiquement une fois configurées.</div>
          {[["auphanKey","Auphan POS","Clé API ou URL...","À venir — contacter Auphan pour documentation"],
            ["weatherKey","Météo (Open-Meteo)","Clé API...","Gratuit — open-meteo.com (aucune clé requise)"],
            ["gasKey","Prix essence (Régie de l'énergie)","URL de scraping...","Auto-rempli du dernier prix connu. Scraping de la Régie à venir."]].map(([key,label,ph,note])=>(
            <div key={key} style={{marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}><span style={{fontSize:12,fontWeight:600}}>{label}</span><Pill ok={apiConfig[key]?.length>0} label={apiConfig[key]?.length>0?"Configuré":"Non configuré"}/></div>
              <input value={apiConfig[key]||""} onChange={e=>{const nc={...apiConfig,[key]:e.target.value};setApiConfig(nc);saveApiCfg(nc)}} placeholder={ph}
                style={{width:"100%",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:5,color:"#e8e8ec",fontSize:12,padding:"5px 8px",outline:"none",fontFamily:"'DM Mono',monospace",boxSizing:"border-box"}}/>
              <div style={{fontSize:10,color:"#3e4254",marginTop:2}}>{note}</div>
            </div>
          ))}
        </div>

        {/* Export */}
        <div style={{background:"rgba(255,255,255,0.015)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:9,padding:11}}>
          <span style={{fontSize:13,fontWeight:700,marginBottom:6,display:"block"}}>💾 Export</span>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <button onClick={()=>{const h="Date,Vente Nette,Total Brut,TPS,TVQ\n";let r="";Object.keys(liveData).sort().forEach(k=>{const c=computeDay(k);if(c.venteNet>0)r+=`${k},${c.venteNet},${c.total},${c.tps},${c.tvq}\n`});const b=new Blob([h+r],{type:"text/csv"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download="dicann.csv";document.body.appendChild(a);a.click();document.body.removeChild(a)}} style={{padding:"7px 14px",borderRadius:6,border:"1px solid rgba(34,197,94,0.2)",background:"rgba(34,197,94,0.08)",color:"#22c55e",cursor:"pointer",fontWeight:600,fontSize:12}}>📊 CSV</button>
            <button onClick={()=>{let h=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>BalanceIQ</title><style>body{font:12px Arial;margin:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:3px 6px;text-align:right}th{background:#f5f5f5}td:first-child{text-align:left}h1{color:#ea580c}</style></head><body><h1>Rapport</h1><table><tr><th>Date</th><th>Vente Nette</th><th>Total</th></tr>`;Object.keys(liveData).sort().forEach(k=>{const c=computeDay(k);if(c.venteNet>0)h+=`<tr><td>${k}</td><td>${c.venteNet.toFixed(2)}</td><td>${c.total.toFixed(2)}</td></tr>`});h+=`</table></body></html>`;openPDF(h)}} style={{padding:"7px 14px",borderRadius:6,border:"1px solid rgba(129,140,248,0.2)",background:"rgba(129,140,248,0.08)",color:"#818cf8",cursor:"pointer",fontWeight:600,fontSize:12}}>📄 PDF</button>
            <button onClick={()=>{const b=new Blob([JSON.stringify({liveData,roster,empRoster,suppliers,apiConfig},null,2)],{type:"application/json"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download="dicann-backup.json";document.body.appendChild(a);a.click();document.body.removeChild(a)}} style={{padding:"7px 14px",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.04)",color:"#8b8fa3",cursor:"pointer",fontWeight:600,fontSize:12}}>🔒 Backup</button>
          </div>
        </div>

        <div style={{background:"rgba(255,255,255,0.015)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:9,padding:11}}><span style={{fontSize:11.5,color:"#8b8fa3"}}>Jours: <strong style={{color:"#f97316"}}>{Object.keys(liveData).length}</strong> · Caissiers: <strong style={{color:"#f97316"}}>{roster.length}</strong> · Employés: <strong style={{color:"#f97316"}}>{empRoster.length}</strong> · Fournisseurs: <strong style={{color:"#f97316"}}>{suppliers.length}</strong></span></div>
      </div>)}
    </div>
  </div>);
}
