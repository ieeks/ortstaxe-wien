/* Gegen einen separat gestarteten, ausschließlich lokalen Demo-Emulator.
   java -jar firestore.jar --port 8088 --project_id demo-ortstaxe-review --rules firestore.rules */
import assert from 'node:assert/strict';
const host=process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8088';
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(host))throw new Error('Nur lokaler Emulator erlaubt.');
const root='projects/demo-ortstaxe-review/databases/(default)/documents';
const url='http://'+host+'/v1/'+root;
function token(uid){const b=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const now=Math.floor(Date.now()/1000);return b({alg:'none',typ:'JWT'})+'.'+b({iss:'https://securetoken.google.com/demo-ortstaxe-review',aud:'demo-ortstaxe-review',auth_time:now,sub:uid,user_id:uid,iat:now,exp:now+3600,firebase:{sign_in_provider:'custom',identities:{}}})+'.';}
function wert(x){if(x===null)return {nullValue:null};if(typeof x==='string')return {stringValue:x};if(typeof x==='number')return Number.isInteger(x)?{integerValue:String(x)}:{doubleValue:x};if(Array.isArray(x))return {arrayValue:{values:x.map(wert)}};return {mapValue:{fields:felder(x)}};}
const felder=x=>Object.fromEntries(Object.entries(x).map(([k,v])=>[k,wert(v)]));
const update=(p,d)=>({update:{name:root+'/'+p,fields:felder(d)}});
let n=0;
async function commit(writes,uid,erlaubt){const r=await fetch(url+':commit',{method:'POST',headers:{'Content-Type':'application/json',...(uid?{Authorization:'Bearer '+token(uid)}:{})},body:JSON.stringify({writes})});const msg=await r.text();assert.equal(r.ok,erlaubt,msg);n++;}
const o='users/u1/objekte/rules-'+Date.now(),guard=o+'/verwaltung/aktuell';
const d={schemaVersion:1,code:'A',name:'Gast',von:'2026-08-01',bis:'2026-08-03',auszahlung:100,gastbetrag:150};
await commit([update(o+'/buchungen/A',d)],'u1',false);
await commit([update(o+'/buchungen/A',d),update(guard,{revision:1,sperren:{}})],'u1',true);
await commit([update(o+'/buchungen/A',{...d,gastbetrag:200})],'u1',false);
await commit([update(o+'/buchungen/A',{...d,gastbetrag:200}),update(guard,{revision:2,sperren:{}})],'u1',true);
await commit([update(o+'/buchungen/A',{...d,code:'WRONG'}),update(guard,{revision:3,sperren:{}})],'u1',false);
await commit([update(guard,{revision:3,sperren:{}})],'u2',false);
await commit([update(guard,{revision:3,sperren:{}})],null,false);
await commit([update(o+'/verlauf/e1',{codes:['A'],grund:'test'})],'u1',true);
await commit([update(o+'/verlauf/e1',{codes:['A'],grund:'manipuliert'})],'u1',false);
await commit([{delete:root+'/'+o+'/verlauf/e1'}],'u1',false);
await commit([update(o+'/abschlusshistorie/e1',{monat:'2026-08'})],'u1',true);
await commit([update(o+'/abschlusshistorie/e1',{monat:'2026-09'})],'u1',false);
await commit([{delete:root+'/'+o+'/buchungen/A'},update(guard,{revision:3,sperren:{}})],'u1',true);
// Foreign reads must be denied as well.
const r=await fetch(url+'/'+guard,{headers:{Authorization:'Bearer '+token('u2')}});assert.equal(r.status,403);n++;
console.log(n+' Firestore-Regelprüfungen bestanden');
