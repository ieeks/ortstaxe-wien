/* Führt dieselben Browser-Selbsttests ohne DOM-Renderer im Node-Kontext aus. */
let html='';
globalThis.location={search:'?selftest'};
globalThis.document={createElement:()=>({}),head:{appendChild(){}},body:{set innerHTML(x){html=x;},get innerHTML(){return html;}}};
await import('../selftest.js');
const ergebnis=html.match(/<div class="sub">([^<]+)/)?.[1];
console.log(ergebnis||html);
if(!ergebnis || !/0 fehlgeschlagen/.test(ergebnis))process.exitCode=1;
