/* Echter daten.js-Code mit SDK-Attrappe: atomare Änderungen, Abschlussrennen,
   Sperren und Verlauf. Kein Ersatz für die Firestore-Emulatorprüfung der Rules. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {monatsStand} from '../js/abschluss.js';
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'ortstaxe-daten-'));
const kopie=structuredClone, store=new Map();let vorTransaktion=null,fehler=false,sammlungsReads=0;
const snap=p=>({exists:()=>store.has(p),data:()=>kopie(store.get(p))});
const f={doc:(_, ...p)=>p.join('/'),collection:(_, ...p)=>p.join('/'),
  getDocFromServer:async p=>snap(p),getDoc:async p=>snap(p),
  getDocsFromServer:async p=>{sammlungsReads++;return {docs:[...store].filter(([k])=>k.startsWith(p+'/')&&!k.slice(p.length+1).includes('/')).map(([k,v])=>({id:k.split('/').at(-1),data:()=>kopie(v)}))};},
  where:(field,op,value)=>({field,op,value}),query:(p,...q)=>({p,q}),
  getDocs:async ({p,q})=>({docs:[...store].filter(([k,v])=>k.startsWith(p+'/')&&q.every(x=>v[x.field]?.includes(x.value))).map(([k,v])=>({data:()=>kopie(v)}))}),
  runTransaction:async(_,fn)=>{
    if(vorTransaktion){const h=vorTransaktion;vorTransaktion=null;h();}
    const staged=[];await fn({get:async p=>snap(p),set:(p,d,opt)=>staged.push(()=>store.set(p,kopie(opt?.merge?{...store.get(p),...d}:d))),delete:p=>staged.push(()=>store.delete(p))});
    if(fehler)throw new Error('Simulierter Commitfehler');for(const write of staged)write();
  },initializeFirestore:()=>({}),persistentLocalCache:()=>({})};
globalThis.__abschlussSDK={f,a:{getApps:()=>[],initializeApp:()=>({})},u:{getAuth:()=>({currentUser:{uid:'u1'}})}};
for(const n of ['kern.js','abschluss.js','firebase-config.js'])await fs.copyFile(new URL('../js/'+n,import.meta.url),path.join(tmp,n));
let src=await fs.readFile(new URL('../js/daten.js',import.meta.url),'utf8');
src=src.replace(/async function sdk\(\)\{[\s\S]*?\n\}\n\nasync function start/, 'async function sdk(){ teile=globalThis.__abschlussSDK; return teile; }\n\nasync function start');
await fs.writeFile(path.join(tmp,'daten.mjs'),src);
const d=await import(pathToFileURL(path.join(tmp,'daten.mjs')));
const opt={basis:'net',fee:0,gastfee:0,uid:'ja',zaehl:'nights',konto:'123'};
const a={schemaVersion:1,objektId:'a',code:'A',name:'Gast',status:'',von:'2026-08-01',bis:'2026-08-03',auszahlung:100,gastbetrag:150,gastbetragQuelle:'datei'};
const b={...a,code:'B',von:'2026-09-01',bis:'2026-09-03'};
const p='users/u1/objekte/a/',details=()=>[...store.keys()].filter(k=>k.startsWith(p+'verlauf/')).length;
let tests=0;function ok(v){assert.ok(v);tests++;}async function block(fn){const vorher=kopie([...store]);await assert.rejects(fn);assert.deepEqual([...store],vorher);tests++;}
try{
 await d.schreibeBuchungen('a',[a,b],{grund:'import',datei:'original.csv',einstellungen:opt});ok(details()===1);
 const readsVorAuto=sammlungsReads;
 ok((await d.ladeVerlauf('a','A'))[0].nachher.gastbetrag===150);
 await d.schreibeBuchungen('a',[a,b],{grund:'manuell',einstellungen:opt});ok(details()===1);ok(sammlungsReads===readsVorAuto);
 const stand=monatsStand([a,b],opt,'2026-08');
 await block(()=>d.schliesseMonat('a','2026-08',opt,{},stand));
 await d.schliesseMonat('a','2026-08',opt,{vollstaendig:true,geprueft:true,hinweise:true},stand);
 ok(!!(await d.ladeAbschluesse('a'))['2026-08']);
 ok(!store.get(p+'verwaltung/aktuell').sperren['2026-08'].buchungen);
 ok((await d.ladeAbschluss('a','2026-08')).buchungen[0].code==='A');
 await block(()=>d.schreibeBuchungen('a',[{...a,gastbetrag:200}],{einstellungen:opt}));
 await block(()=>d.schreibeBuchungen('a',[{...a,code:'NEU'}],{einstellungen:opt}));
 await block(()=>d.schreibeBuchungen('a',[{...a,von:'2026-09-01',bis:'2026-09-02'}],{einstellungen:opt}));
 await block(()=>d.loescheBuchung('a','A'));
 await block(()=>d.ersetzeBuchungen('a',[b],['A'],opt));
 await block(()=>d.schreibeBuchungen('a',[b],{einstellungen:{...opt,basis:'gross'}}));
 await d.schreibeBuchungen('a',[{...b,gastbetrag:180}],{einstellungen:opt});ok(store.get(p+'buchungen/B').gastbetrag===180);
 await block(()=>d.oeffneMonat('a','2026-08',''));
 await d.oeffneMonat('a','2026-08','Beleg korrigiert');ok(!(await d.ladeAbschluesse('a'))['2026-08']);
 await d.schreibeBuchungen('a',[{...a,gastbetrag:200}],{grund:'manuell',einstellungen:opt});ok(store.get(p+'buchungen/A').gastbetrag===200);
 fehler=true;await block(()=>d.schreibeBuchungen('a',[{...a,gastbetrag:250}],{einstellungen:opt}));fehler=false;
 const logs=details();vorTransaktion=()=>{const k=p+'verwaltung/aktuell';store.set(k,{...store.get(k),revision:store.get(k).revision+1});};
 await assert.rejects(()=>d.schreibeBuchungen('a',[{...a,gastbetrag:250}],{einstellungen:opt}));ok(details()===logs&&store.get(p+'buchungen/A').gastbetrag===200);
 const viele=Array.from({length:255},(_,i)=>({...b,code:'V'+i,objektId:'viele'}));
 await d.schreibeBuchungen('viele',viele,{grund:'import',einstellungen:opt});ok(store.has('users/u1/objekte/viele/buchungen/V254'));
 await block(()=>d.schreibeBuchungen('viele',Array.from({length:401},(_,i)=>({...b,code:'X'+i,objektId:'viele'})),{einstellungen:opt}));
 const volle=Array.from({length:400},(_,i)=>({...b,code:'G'+i,objektId:'gross',notiz:'x'.repeat(2000)}));
 await d.schreibeBuchungen('gross',volle,{grund:'import',einstellungen:opt});
 ok([...store.keys()].filter(k=>k.startsWith('users/u1/objekte/gross/verlauf/')).length>1);
 ok((await d.ladeVerlauf('gross','G399'))[0].nachher.notiz.length===2000);
 const vorRestore=kopie([...store]);
 await assert.rejects(()=>d.ersetzeBuchungen('gross',[{...b,code:'ANDERS'}],volle.map(d=>d.code),opt),/kontrollierte Migration/);
 assert.deepEqual([...store],vorRestore);tests++;
 // The entire previously loaded snapshot is bound to its revision, not just writes.
 await d.ladeBuchungen('a');
 const stale=monatsStand([store.get(p+'buchungen/A'),store.get(p+'buchungen/B')],opt,'2026-08');
 vorTransaktion=()=>{const k=p+'verwaltung/aktuell';store.set(k,{...store.get(k),revision:store.get(k).revision+1});};
 await assert.rejects(()=>d.schliesseMonat('a','2026-08',opt,{vollstaendig:true,geprueft:true,hinweise:true},stale),/Bestand geändert/);tests++;
 await d.schreibeBuchungen('performance',[{...a,objektId:'performance'}],{einstellungen:opt});
 const vorEdit=sammlungsReads;
 await d.schreibeBuchungen('performance',[{...a,objektId:'performance',gastbetrag:175}],{einstellungen:opt});
 ok(sammlungsReads===vorEdit);
 console.log(tests+' Transaktionsprüfungen bestanden');
}finally{await fs.rm(tmp,{recursive:true,force:true});delete globalThis.__abschlussSDK;}
