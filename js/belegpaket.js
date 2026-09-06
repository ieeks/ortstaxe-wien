/* Kleines, unkomprimiertes ZIP und Text-PDF ohne CDN oder Build-Schritt.
   Originale Unicode-Daten stehen vollständig in CSV und JSON. Das PDF nutzt
   WinAnsi/Courier; nicht darstellbare Zeichen werden dort als ? ausgegeben. */
import {alsCsvZeilen,csvZeile,fmt} from './kern.js';
const utf8=s=>new TextEncoder().encode(s);
 
function concat(teile){const out=new Uint8Array(teile.reduce((n,a)=>n+a.length,0));let p=0;for(const a of teile){out.set(a,p);p+=a.length;}return out;}
function crc32(a){let c=0xffffffff;for(const b of a){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function header(n,werte){const a=new Uint8Array(n),v=new DataView(a.buffer);for(const [pos,size,x]of werte){if(size===2)v.setUint16(pos,x,true);else v.setUint32(pos,x,true);}return a;}
export function zipDateien(dateien){
  const lokal=[],zentral=[];let offset=0;
  for(const [name,inhalt] of Object.entries(dateien)){
    const n=utf8(name),b=typeof inhalt==='string'?utf8(inhalt):inhalt,c=crc32(b);
    const h=header(30,[[0,4,0x04034b50],[4,2,20],[6,2,0x800],[12,2,33],[14,4,c],[18,4,b.length],[22,4,b.length],[26,2,n.length]]);
    lokal.push(h,n,b);
    zentral.push(header(46,[[0,4,0x02014b50],[4,2,20],[6,2,20],[8,2,0x800],[14,2,33],[16,4,c],[20,4,b.length],[24,4,b.length],[28,2,n.length],[42,4,offset]]),n);
    offset+=h.length+n.length+b.length;
  }
  const z=concat(zentral),anz=Object.keys(dateien).length;
  return concat([...lokal,z,header(22,[[0,4,0x06054b50],[8,2,anz],[10,2,anz],[12,4,z.length],[16,4,offset]])]);
}
function ansi(s){return Uint8Array.from(Array.from(s,c=>{const n=c.codePointAt(0);return c==='€'?128:n<=255?n:63;}));}
function pdfText(s){return String(s).replace(/[\r\n\t]/g,' ').replace(/([\\()])/g,'\\$1');}
export function berichtPdf(zeilen){
  const umbruch=zeilen.flatMap(s=>{const a=[];let t=String(s);while(t.length>80){let i=t.lastIndexOf(' ',80);if(i<20)i=80;a.push(t.slice(0,i));t=t.slice(i).trimStart();}return [...a,t];});
  const seiten=[];for(let i=0;i<umbruch.length;i+=48)seiten.push(umbruch.slice(i,i+48));
  const obj=[];obj[1]='<< /Type /Catalog /Pages 2 0 R >>';
  obj[2]='<< /Type /Pages /Count '+seiten.length+' /Kids ['+seiten.map((_,i)=>(4+i*2)+' 0 R').join(' ')+'] >>';
  obj[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>';
  seiten.forEach((lines,i)=>{
    const p=4+i*2,inhalt='BT /F1 10 Tf 48 795 Td 15 TL '+lines.map(s=>'('+pdfText(s)+') Tj T*').join('\n')+' ET\nBT /F1 9 Tf 48 30 Td (Seite '+(i+1)+' / '+seiten.length+') Tj ET';
    obj[p]='<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents '+(p+1)+' 0 R >>';
    obj[p+1]='<< /Length '+ansi(inhalt).length+' >>\nstream\n'+inhalt+'\nendstream';
  });
  const teile=[ansi('%PDF-1.4\n')],offsets=[0];let pos=teile[0].length;
  for(let i=1;i<obj.length;i++){offsets.push(pos);const b=ansi(i+' 0 obj\n'+obj[i]+'\nendobj\n');teile.push(b);pos+=b.length;}
  teile.push(ansi('xref\n0 '+obj.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+obj.length+' /Root 1 0 R >>\nstartxref\n'+pos+'\n%%EOF'));
  return concat(teile);
}
export function paketDateien(s,objekt){
  const zeilen=['ORTSTAXE WIEN - MONATSABSCHLUSS',objekt+' / '+s.monat,'',
    'Abgeschlossen: '+s.abgeschlossen,'Geprüft durch: '+s.benutzer,
    'Ortstaxe: '+fmt(s.ortstaxe)+' EUR','Steuerpflichtige Nächte im Monat: '+s.naechte,'Befreite Nächte: '+(s.befreiteNaechte||0),'',
    'Prüfung: Vollständigkeit und Belege bestätigt.',
    'Hinweise akzeptiert: '+(s.bestaetigung?.hinweise?'ja':'nein / keine Hinweise'),'','Einstellungen:',
    ...Object.entries(s.einstellungen).map(([k,v])=>({basis:'USt-Basis',fee:'Wirksame Gastgebergebühr (%)',gastfee:'Gast-Servicegebühr (%)',uid:'UID hinterlegt',zaehl:'Zählweise',konto:'Abgabenkonto'}[k]||k)+': '+v),'',
    'Prüfhinweise:',...(s.hinweise.length?s.hinweise:['Keine rechnerischen Hinweise.']),
    '', 'Buchungen (vollständiger Aufenthalt; Steuer oben nur ausgewählter Monat):',
    ...s.buchungen.flatMap(d=>[d.code+' | '+d.name+' | '+d.von+' bis '+d.bis,
      'Gastbetrag: '+(d.gastbetrag==null?'geschätzt':fmt(d.gastbetrag)+' EUR')+' | Auszahlung: '+fmt(d.auszahlung)+' EUR | Status: '+d.status]),
    '', 'Dokumentiert den gespeicherten Prüfstand; keine Bestätigung einer Behördenmeldung.',
    'Originalbelege sind separat aufzubewahren. Unicode-Originaldaten: CSV/JSON im Paket.'];
  return {'monatsabschluss.pdf':berichtPdf(zeilen),
    'buchungen.csv':'\uFEFF'+alsCsvZeilen(s.buchungen).map(csvZeile).join('\r\n'),
    'abschluss.json':JSON.stringify({objekt,...s},null,2),
    'einstellungen.json':JSON.stringify(s.einstellungen,null,2),
    'LESEMICH.txt':'Eingefrorener Monatsabschluss '+s.monat+'.\nBuchungen enthalten vollständige Aufenthalte, auch bei Monatsüberschneidung.\nOriginalbelege von Airbnb sind nicht enthalten.\nDer Abschluss bestätigt keine abgegebene Behördenmeldung.\n'};
}
export function belegpaket(stand,objekt){return new Blob([zipDateien(paketDateien(stand,objekt))],{type:'application/zip'});}
