
/* ARQUITECTURA DE DATOS VERSIONADA
   La interfaz puede cambiar sin modificar ni perder los datos.
   Cada futura actualización incrementará schemaVersion y aplicará migraciones. */
const STORAGE_KEY='garagey_data';
const CURRENT_SCHEMA=9; // v28.2: logotipos de marca actualizados + fotos de moto con encuadre completo
function freshData(){return {schemaVersion:CURRENT_SCHEMA,vehicles:[],selected:null}}
let data;
let editVehicle=null;
try{data=JSON.parse(localStorage.getItem(STORAGE_KEY))||freshData()}catch(e){data=freshData()}
function migrate(){
 data.schemaVersion=data.schemaVersion||1;
 if(data.schemaVersion<2){
   data.vehicles=(data.vehicles||[]).map(v=>({...v,brand:v.brand||'',model:v.model||'',interventions:v.interventions||[]}));
   data.schemaVersion=2;
 }
 if(data.schemaVersion<3){
   data.vehicles=(data.vehicles||[]).map(v=>({...v,interventions:(v.interventions||[])}));
   data.schemaVersion=3;
 }
 if(data.schemaVersion<5){
   data.vehicles=(data.vehicles||[]).map(v=>({...v,year:v.year||'',fuel:v.fuel||''}));
   data.schemaVersion=5;
 }
 if(data.schemaVersion<6){
   data.vehicles=(data.vehicles||[]).map(v=>({...v,vehicleType:v.vehicleType||(v.type==='Moto'?'motorcycle':'car'),motoType:v.motoType||'',displacement:v.displacement||''}));
   data.schemaVersion=6;
 }
 if(data.schemaVersion<7){
   data.vehicles=(data.vehicles||[]).map(v=>({...v,interventions:(v.interventions||[]).map(i=>{
     const parts=Array.isArray(i.parts)?i.parts:[];
     const partsTotal=parts.reduce((a,p)=>a+Number(p?.cost||0),0);
     return {...i,parts,totalCost:partsTotal>0?partsTotal:Number(i.totalCost||0)};
   })}));
   data.schemaVersion=7;
 }
 if(data.schemaVersion<8){
   data.vehicles=(data.vehicles||[]).map(v=>({...v,vehicleType:v.vehicleType||(v.type==='Moto'?'motorcycle':'car')}));
   data.schemaVersion=8;
 }
 save();
}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(data));if(window.garageyScheduleAutoBackup)window.garageyScheduleAutoBackup();}
migrate();
const $=id=>document.getElementById(id), euro=n=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(n||0));
function interventionCost(i){const parts=Array.isArray(i?.parts)?i.parts:[];const partsTotal=parts.reduce((a,p)=>a+Number(p?.cost||0),0);return partsTotal>0?partsTotal:Number(i?.totalCost||0)}


function daysUntil(dateString){
 if(!dateString)return null;
 const today=new Date(); today.setHours(0,0,0,0);
 const target=new Date(dateString+'T00:00:00');
 return Math.ceil((target-today)/86400000);
}
function addMonths(date, months){
 const d=new Date(date);
 const day=d.getDate();
 d.setDate(1); d.setMonth(d.getMonth()+months);
 const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
 d.setDate(Math.min(day,last));
 d.setHours(0,0,0,0);
 return d;
}
function getAlerts(){
 const alerts=[];
 data.vehicles.forEach(v=>{
   const km=Number(v.km||0);
   (v.interventions||[]).forEach(i=>{
     // Kilometre-based maintenance warnings
     if(i.nextKm){
       const remaining=Number(i.nextKm)-km;
       if(remaining<=0) alerts.push({level:'red',icon:'🔴',vehicle:v.name,title:i.type,detail:`Vencido por ${Math.abs(remaining).toLocaleString('es-ES')} km · Objetivo: ${Number(i.nextKm).toLocaleString('es-ES')} km`,id:i.id});
       else if(remaining<=1500) alerts.push({level:'orange',icon:'🟠',vehicle:v.name,title:i.type,detail:`Próximo en ${remaining.toLocaleString('es-ES')} km`,id:i.id});
     }
     // ITV dates
     if(i.type==='ITV'){
       const match=(i.details||'').match(/Próxima ITV:\s*(\d{4}-\d{2}-\d{2})/);
       if(match){
         const d=daysUntil(match[1]);
         if(d!==null && d<0) alerts.push({level:'red',icon:'🔴',vehicle:v.name,title:'ITV caducada',detail:`Venció hace ${Math.abs(d)} días`,id:i.id});
         else if(d!==null && new Date(match[1]+'T00:00:00')<=addMonths(new Date(),3)) alerts.push({level:'orange',icon:'🟠',vehicle:v.name,title:'ITV próxima',detail:`Faltan ${d} días · ${match[1]}`,id:i.id});
       }
     }
     // Insurance dates
     if(i.type==='Seguro'){
       const match=(i.details||'').match(/Vence:\s*(\d{4}-\d{2}-\d{2})/);
       if(match){
         const d=daysUntil(match[1]);
         if(d!==null && d<0) alerts.push({level:'red',icon:'🔴',vehicle:v.name,title:'Seguro vencido',detail:`Venció hace ${Math.abs(d)} días`,id:i.id});
         else if(d!==null && new Date(match[1]+'T00:00:00')<=addMonths(new Date(),3)) alerts.push({level:'orange',icon:'🟠',vehicle:v.name,title:'Seguro próximo a vencer',detail:`Faltan ${d} días · ${match[1]}`,id:i.id});
       }
     }
     // Tax dates
     if(i.type==='Impuestos'){
       const match=(i.details||'').match(/Pago:\s*(\d{4}-\d{2}-\d{2})/);
       if(match){
         const d=daysUntil(match[1]);
         if(d!==null && d<0) alerts.push({level:'red',icon:'🔴',vehicle:v.name,title:'Impuesto pendiente/vencido',detail:`Fecha superada hace ${Math.abs(d)} días`,id:i.id});
         else if(d!==null && d<=30) alerts.push({level:'orange',icon:'🟠',vehicle:v.name,title:'Impuesto próximo',detail:`Faltan ${d} días · ${match[1]}`,id:i.id});
       }
     }
   });
 });
 return alerts.sort((a,b)=>a.level==='red'?-1:b.level==='red'?1:0);
}
function renderNoticePanel(){
 const alerts=getAlerts();
 const critical=alerts.filter(a=>a.level==='red').length;
 const upcoming=alerts.filter(a=>a.level==='orange').length;
 const panel=`<section class="card notice-panel">
 <div class="top"><div><h2>🔔 Centro de avisos</h2><div style="color:#cbd5e1">Todo lo que necesita tu atención, en un solo lugar.</div></div><span class="badge" style="background:#ffffff22;color:white">${alerts.length} activos</span></div>
 <div class="notice-grid" style="margin-top:16px"><div class="notice">Críticos<b>${critical}</b><small>Caducados o vencidos</small></div><div class="notice">Próximos<b>${upcoming}</b><small>Próximos 3 meses / 1.500 km</small></div><div class="notice">Vehículos<b>${new Set(alerts.map(a=>a.vehicle)).size}</b><small>Con avisos activos</small></div></div>
 ${alerts.length?`<div style="margin-top:16px">${alerts.map(a=>`<div class="alert ${a.level}">${a.icon} <b>${a.vehicle} · ${a.title}</b><br><small>${a.detail}</small></div>`).join('')}</div>`:'<div class="alert blue" style="margin-top:16px">✨ <b>Todo bajo control.</b><br><small>No tienes avisos pendientes actualmente.</small></div>'}
 </section>`;
 return panel;
}

let vehicleListQuery=''; let vehicleListType='all';
const CAR_BRANDS=[
 ['Toyota','toyota','svg'],['Mitsubishi','mitsubishi','svg'],['Honda','honda','svg'],['Citroën','citroen','svg'],['Suzuki','suzuki','svg'],['Volvo','volvo','svg'],['Nissan','nissan','png'],['Mazda','mazda','svg'],['Fiat','fiat','svg'],['SEAT','seat','svg'],['Lexus','lexus','svg'],['Dacia','dacia','svg'],['Ford','ford','svg'],['Kia','kia','svg'],['Audi','audi','png'],['Škoda','skoda','svg'],['Tesla','tesla','svg'],['Renault','renault','svg'],['Hyundai','hyundai','svg'],['Peugeot','peugeot','svg'],['CUPRA','cupra','svg'],['Mercedes-Benz','mercedes','svg'],['BMW','bmw','png'],['Jeep','jeep','svg'],['Volkswagen','volkswagen','svg'],['MG','mg','svg'],['Opel','opel','svg']
];
const MOTO_BRANDS=[
 ['Aprilia','aprilia'],['Benda','benda'],['Benelli','benelli'],['BMW Motorrad','bmw_motorrad'],['CFMoto','cfmoto'],['Ducati','ducati'],['GasGas','gasgas'],['Harley-Davidson','harley_davidson'],['Hero MotoCorp','hero_motocorp'],['Honda','honda'],['Husqvarna','husqvarna'],['Indian','indian'],['Kawasaki','kawasaki'],['Keeway','keeway'],['Kove','kove'],['KTM','ktm'],['Kymco','kymco'],['Macbor','macbor'],['Mash','mash'],['Mitt','mitt'],['Moto Guzzi','moto_guzzi'],['Moto Morini','moto_morini'],['MV Agusta','mv_agusta'],['Peugeot','peugeot'],['Piaggio','piaggio'],['QJ Motor','qj_motor'],['Rieju','rieju'],['Royal Enfield','royal_enfield'],['Suzuki','suzuki'],['SYM','sym'],['Triumph','triumph'],['Vespa','vespa'],['Voge','voge'],['Yamaha','yamaha'],['Zontes','zontes'],['Zero','zero']
];
const MOTO_HERO={
 'Aprilia':'sport','Benda':'naked','Benelli':'naked','BMW Motorrad':'adventure','CFMoto':'adventure','Ducati':'sport','GasGas':'adventure','Harley-Davidson':'naked','Hero MotoCorp':'naked','Honda':'adventure','Husqvarna':'adventure','Indian':'naked','Kawasaki':'sport','Keeway':'naked','Kove':'adventure','KTM':'adventure','Kymco':'naked','Macbor':'adventure','Mash':'naked','Mitt':'naked','Moto Guzzi':'naked','Moto Morini':'naked','MV Agusta':'sport','Peugeot':'naked','Piaggio':'naked','QJ Motor':'naked','Rieju':'adventure','Royal Enfield':'naked','Suzuki':'sport','SYM':'naked','Triumph':'naked','Vespa':'naked','Voge':'adventure','Yamaha':'sport','Zontes':'naked','Zero':'naked'
};
function normBrand(b){return (b||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ')}
function vehicleTypeOf(v){return v?.vehicleType || (v?.type==='Moto'?'motorcycle':'car')}
const CAR_HERO_MAP={Toyota:'toyota',Mitsubishi:'mitsubishi',Honda:'honda','Citroën':'citroen',Suzuki:'suzuki',Volvo:'volvo',Nissan:'nissan',Mazda:'mazda',Fiat:'fiat',SEAT:'seat',Lexus:'lexus',Dacia:'dacia',Ford:'ford',Kia:'kia',Audi:'audi','Škoda':'skoda',Tesla:'tesla',Renault:'renault',Hyundai:'hyundai',Peugeot:'peugeot',CUPRA:'cupra','Mercedes-Benz':'mercedes',BMW:'bmw',Jeep:'jeep',Volkswagen:'volkswagen',MG:'mg',Opel:'opel'};
function vehicleAssetKey(v){const exact=Object.keys(CAR_HERO_MAP).find(k=>normBrand(k)===normBrand(v?.brand)); if(exact)return CAR_HERO_MAP[exact]; let b=normBrand(v?.brand); for(const k of Object.keys(CAR_HERO_MAP)){if(b.includes(normBrand(k)))return CAR_HERO_MAP[k]} return 'generic'}
function motorcycleBrandKey(v){const found=MOTO_BRANDS.find(x=>normBrand(x[0])===normBrand(v?.brand)); return found?found[1]:'generic'}
function motorcycleHeroKey(v){return MOTO_HERO[v?.brand]||'naked'}
function heroPhoto(v){
  if(vehicleTypeOf(v)==='motorcycle'){
    const key=motorcycleBrandKey(v);
    return key==='generic'?'assets/vehicle_images/motos/generic/moto_naked.jpg':`assets/vehicle_images/motos/brands/${key}.jpg`;
  }
  const key=vehicleAssetKey(v);
  return key==='nissan'?'assets/vehicle_images/cars/nissan_hero_tall.jpg':`assets/vehicle_images/cars/${key}.jpg`;
}
function heroPhotoFallback(v){
  if(vehicleTypeOf(v)==='motorcycle') return 'assets/vehicle_images/motos/generic/moto_naked.jpg';
  return 'assets/vehicle_images/cars/generic.jpg';
}
function safePhotoMarkup(v, extraClass=''){
  const src=heroPhoto(v), fallback=heroPhotoFallback(v);
  return `<img class="vehicle-photo ${extraClass}" src="${src}" data-fallback="${fallback}" onerror="if(this.dataset.fallback && this.src!==this.dataset.fallback){this.src=this.dataset.fallback}else{this.style.display='none';this.parentElement.classList.add('photo-fallback')}" alt="${[v.brand,v.model].filter(Boolean).join(' ')||'Vehículo'}">`;
}
const BRAND_LOGO_SLUGS={
  'Toyota':'toyota','Mitsubishi':'mitsubishi','Honda':'honda','Citroën':'citroen','Suzuki':'suzuki','Volvo':'volvo','Nissan':'nissan','Mazda':'mazda','Fiat':'fiat','SEAT':'seat','Lexus':'lexus','Dacia':'dacia','Ford':'ford','Kia':'kia','Audi':'audi','Škoda':'skoda','Tesla':'tesla','Renault':'renault','Hyundai':'hyundai','Peugeot':'peugeot','CUPRA':'cupra','Mercedes-Benz':'mercedes','BMW':'bmw','Jeep':'jeep','Volkswagen':'volkswagen','MG':'mg','Opel':'opel',
  'Aprilia':'aprilia','Benda':'benda','Benelli':'benelli','BMW Motorrad':'bmw','CFMoto':'cfmoto','Ducati':'ducati','GasGas':'gasgas','Harley-Davidson':'harleydavidson','Hero MotoCorp':'heromotocorp','Husqvarna':'husqvarna','Indian':'indianmotorcycle','Kawasaki':'kawasaki','Keeway':'keeway','Kove':'kove','KTM':'ktm','Kymco':'kymco','Macbor':'macbor','Mash':'mash','Mitt':'mitt','Moto Guzzi':'motoguzzi','Moto Morini':'motomorini','MV Agusta':'mvagusta','Piaggio':'piaggio','QJ Motor':'qjmotor','Rieju':'rieju','Royal Enfield':'royalenfield','SYM':'sym','Triumph':'triumph','Vespa':'vespa','Voge':'voge','Yamaha':'yamahamotorcorporation','Zontes':'zontes','Zero':'zero'
};
const AUTH_LOGOS={
  'Honda':'assets/brand_logos/motos/honda.png',
  'Kawasaki':'assets/brand_logos/motos/kawasaki.png',
  'Ducati':'assets/brand_logos/motos/ducati.png'
};
const INDIVIDUAL_LOGOS_CAR=new Set(['audi','bmw','citroen','dacia','fiat','ford','honda','hyundai','kia','mazda','mercedes','nissan','opel','peugeot','renault','seat','skoda','toyota','volkswagen','volvo']);
const INDIVIDUAL_LOGOS_MOTO=new Set(['aprilia','benelli','bmw_motorrad','ducati','harley_davidson','honda','kawasaki','ktm','moto_guzzi','piaggio','royal_enfield','suzuki','triumph','yamaha','vespa','beta','cfmoto','malaguti','rieju','sherco','tm','husqvarna','gasgas','indian','zontes','voge','qj_motor','brixton','keeway','ksr_moto','fantic','mondial','rvm','swm','um','victory']);
function individualLogoPath(brand,type){ const key=type==='Moto'?motorcycleBrandKey({brand}):vehicleAssetKey({brand}); const set=type==='Moto'?INDIVIDUAL_LOGOS_MOTO:INDIVIDUAL_LOGOS_CAR; return set.has(key)?`assets/brand_logos/${type==='Moto'?'motos':'cars'}/${key}.png`:''; }
const BRAND_LOGO_COLORS={
  'Toyota':'EB0A1E','Mitsubishi':'E60012','Honda':'CC0000','Citroën':'E0002A','Suzuki':'E30613','Volvo':'111111','Nissan':'C3002F','Mazda':'111111','Fiat':'8B1E2D','SEAT':'111111','Lexus':'111111','Dacia':'646B72','Ford':'003478','Kia':'111111','Audi':'BB0A30','Škoda':'4BA82E','Tesla':'E82127','Renault':'111111','Hyundai':'002C5F','Peugeot':'111111','CUPRA':'111111','Mercedes-Benz':'111111','BMW':'0066B1','Jeep':'111111','Volkswagen':'001E50','MG':'A6192E','Opel':'F2A900',
  'Aprilia':'D71920','Benda':'111111','Benelli':'008C44','BMW Motorrad':'0066B1','CFMoto':'00AEEF','Ducati':'D50000','GasGas':'E30613','Harley-Davidson':'F58220','Hero MotoCorp':'E31837','Husqvarna':'006F9B','Indian':'111111','Kawasaki':'5A9E1B','Keeway':'111111','Kove':'E30613','KTM':'FF6600','Kymco':'111111','Macbor':'E30613','Mash':'111111','Mitt':'E30613','Moto Guzzi':'111111','Moto Morini':'B40000','MV Agusta':'E30613','Peugeot':'111111','Piaggio':'0066A1','QJ Motor':'D71920','Rieju':'E30613','Royal Enfield':'C62828','SYM':'D71920','Triumph':'111111','Vespa':'008C95','Voge':'111111','Yamaha':'E60012','Zontes':'111111','Zero':'111111'
};
function logoSlug(brand){return BRAND_LOGO_SLUGS[brand]||''}
function logoRemote(brand){const slug=logoSlug(brand); if(!slug)return ''; const color=BRAND_LOGO_COLORS[brand]||'111111'; return `https://cdn.simpleicons.org/${slug}/${color}`;}
function brandLogo(v){
  const brand=(v?.brand||'').trim();
  const slug=logoSlug(brand);
  const key=vehicleTypeOf(v)==='motorcycle'?motorcycleBrandKey(v):vehicleAssetKey(v);
  const local=individualLogoPath(brand, vehicleTypeOf(v)==='motorcycle'?'Moto':'Coche') || (vehicleTypeOf(v)==='motorcycle'?`assets/brand_logos/motos/${key}.png`:`assets/brand_logos/cars/${key}.png`);
  if(!brand) return '<div class="vehicle-brand-fallback">MARCA</div>';
  const auth=AUTH_LOGOS[brand]&&vehicleTypeOf(v)==='motorcycle'?AUTH_LOGOS[brand]:'';
  const individual=individualLogoPath(brand, vehicleTypeOf(v)==='motorcycle'?'Moto':'Coche');
  const remote=auth||individual?'':logoRemote(brand);
  const src=auth||individual||remote||local;
  return `<img class="vehicle-brand-logo real-brand-logo" src="${src}" data-fallback="${local}" alt="Logotipo ${brand}" loading="lazy" onerror="if(this.dataset.fallback && this.src!==this.dataset.fallback){this.src=this.dataset.fallback}else{this.replaceWith(Object.assign(document.createElement('span'),{className:'vehicle-brand-fallback',textContent:'${brand.replace("'","\'")}' }))}">`;
}
function vehicleBg(v){return heroPhoto(v)}
function populateBrandSelect(type,current){const sel=$('vbrand');if(!sel)return;const list=type==='Moto'?MOTO_BRANDS:CAR_BRANDS;sel.innerHTML='<option value="">Seleccionar marca</option>'+list.map(x=>`<option value="${x[0].replace(/&/g,'&amp;').replace(/"/g,'&quot;')}">${x[0]}</option>`).join('');sel.value=current||'';updateBrandPreview()}
function updateBrandPreview(){const sel=$('vbrand');if(!sel)return;const b=sel.value;const dlg=$('vehicleFormDialog');const isMoto=dlg.classList.contains('moto-mode');const type=isMoto?'Moto':'Coche';const badge=$('formBrandBadge'),hero=$('vehicleFormHeroPhoto'),typeLabel=$('formVehicleTypeLabel'),nameLabel=$('formVehicleNameLabel'),brandLabel=$('formVehicleBrandLabel');typeLabel.textContent=type;if(!b){badge.innerHTML='';nameLabel.textContent='Nuevo vehículo';brandLabel.textContent='Selecciona una marca';hero.style.backgroundImage='none';return}const key=isMoto?motorcycleBrandKey({brand:b}):vehicleAssetKey({brand:b});const local=individualLogoPath(b,type)||(isMoto?`assets/brand_logos/motos/${key}.png`:(()=>{const row=CAR_BRANDS.find(x=>x[0]===b);return row?`assets/brand_logos/cars/${row[1]}.png`:''})());const auth=AUTH_LOGOS[b]&&isMoto?AUTH_LOGOS[b]:'';const individual=individualLogoPath(b,type);const remote=auth||individual?'':logoRemote(b);const src=auth||individual||remote||local;badge.innerHTML=`<img src="${src}" data-fallback="${local}" alt="Logotipo ${b}" onerror="if(this.dataset.fallback && this.src!==this.dataset.fallback){this.src=this.dataset.fallback}">`;nameLabel.textContent=$('vname')?.value.trim()||'Nuevo vehículo';brandLabel.textContent=b;const temp={brand:b,vehicleType:isMoto?'motorcycle':'car'};const photo=heroPhoto(temp);hero.style.backgroundImage=`url("${photo}")`;hero.dataset.fallback=heroPhotoFallback(temp)}
function filterVehicleList(q){vehicleListQuery=(q||'').toLowerCase().trim(); renderVehicleList()}
function cycleVehicleFilter(){vehicleListType=vehicleListType==='all'?'Coche':vehicleListType==='Coche'?'Moto':'all'; const b=$('vehicleFilter'); if(b)b.title=vehicleListType==='all'?'Todos':vehicleListType; renderVehicleList()}
function renderVehicleList(){
 const box=$('vehicles'); if(!box)return;
 const list=data.vehicles.filter(v=>{const text=[v.name,v.brand,v.model,v.year,v.fuel,v.type].join(' ').toLowerCase(); const q=!vehicleListQuery||text.includes(vehicleListQuery); const t=vehicleListType==='all'||v.type===vehicleListType; return q&&t;});
 box.innerHTML=list.length?list.map(v=>{
   const ints=[...(v.interventions||[])]; const cost=ints.reduce((a,x)=>a+interventionCost(x),0); const due=ints.filter(i=>i.nextKm&&Number(v.km)>=Number(i.nextKm)).length;
   const meta=[v.year||'—',v.fuel||'—',v.type||'—'].join(' · ');
   return `<article class="vehicle-card-premium ${v.id===data.selected?'selected':''}" onclick="selectVehicle(${v.id})">
    ${safePhotoMarkup(v,'vehicle-card-photo')}
    <div class="vehicle-card-inner">
      <div><div class="vehicle-card-top">${brandLogo(v)}<span class="vehicle-card-arrow">›</span></div>
      <div class="vehicle-card-name">${v.name||[v.brand,v.model].filter(Boolean).join(' ')||'Mi vehículo'}</div>
      <div class="vehicle-card-meta">${v.brand||''}${v.model?' · '+v.model:''}${meta?' · '+meta:''}</div>
      <div class="vehicle-card-km">🛣️ &nbsp;${Number(v.km||0).toLocaleString('es-ES')} km</div></div>
      <div class="vehicle-card-stats">
       <div class="vehicle-card-stat blue"><span class="stat-icon">🔧</span><div><b>${ints.length}</b><small>Intervenciones</small></div></div>
       <div class="vehicle-card-stat green"><span class="stat-icon">€</span><div><b>${euro(cost)}</b><small>Gasto acumulado</small></div></div>
       <div class="vehicle-card-stat red"><span class="stat-icon">🔔</span><div><b>${due}</b><small>Avisos pendientes</small></div></div>
      </div>
    </div></article>`
 }).join(''):'<div class="vehicle-empty-premium">🚘<br><br>No hay vehículos que coincidan con la búsqueda.</div>';
}
function renderGarageyPanel(){
 return `<section class="hero garagey-bottom"><div class="brand"><div><h1>Garagey ✨</h1><p>Tu garaje, siempre bajo control.</p></div><button class="gear" onclick="openSettings()">⚙️</button></div>
 <div class="quick"><div class="q">Vehículos<b id="qVehicles">${data.vehicles.length}</b></div><div class="q">Intervenciones<b id="qInterventions">${data.vehicles.flatMap(v=>v.interventions||[]).length}</b></div><div class="q">Gasto total<b id="qCost">${euro(data.vehicles.flatMap(v=>v.interventions||[]).reduce((a,x)=>a+interventionCost(x),0))}</b></div><div class="q">Avisos<b id="qAlerts">${getAlerts().length}</b></div></div></section>`;
}
function renderVehicleSection(){
 return `<section class="panel vehicle-list-panel"><div class="section-title vehicle-list-title"><div><strong>MIS VEHÍCULOS</strong><small>Gestiona y controla todos tus vehículos</small></div><span>🚘</span></div><div class="vehicle-list-toolbar"><div class="vehicle-search"><span>⌕</span><input id="vehicleSearch" type="search" placeholder="Buscar vehículo…" value="${vehicleListQuery.replace(/"/g,'&quot;')}" oninput="filterVehicleList(this.value)"></div><button class="vehicle-filter" id="vehicleFilter" onclick="cycleVehicleFilter()">☷</button></div><div id="vehicles"></div><button class="add vehicle-add-premium" onclick="openVehicle()"><span>＋</span> Añadir vehículo</button></section>`;
}
function svgIcon(name){const p={
 calendar:'<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M16 2v4M8 2v4M3 9h18M8 13h3M13 13h3M8 17h3"/>',
 fuel:'<path d="M6 21V4a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v17"/><path d="M5 21h13M18 6h2l2 3v8a2 2 0 0 1-2 2h-1M9 6h5v5H9z"/>',
 car:'<path d="m5 11 2-5h10l2 5"/><path d="M3 11h18v7H3z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
 wrench:'<path d="M14 6a5 5 0 0 0-6.5 6.5L3 17l4 4 4.5-4.5A5 5 0 0 0 18 10l-3 3-4-4z"/>',
 coins:'<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>',
 bell:'<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
 power:'<path d="M13 2 4 14h6l-1 8 11-14h-6z"/>', engine:'<path d="M4 9h4l2-3h4l2 3h4v8H4z"/><path d="M8 9v5h4v-5M16 12h3"/>', gauge:'<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 14l4-4"/><circle cx="12" cy="18" r="1"/>', transmission:'<path d="M5 4v16M12 4v16M19 4v16M5 9h7M12 15h7"/><circle cx="5" cy="9" r="2"/><circle cx="12" cy="15" r="2"/><circle cx="19" cy="9" r="2"/>', palette:'<path d="M12 3a9 9 0 1 0 0 18h2.2a2 2 0 0 0 0-4H13a2 2 0 0 1 0-4h2a6 6 0 0 0-3-10z"/><circle cx="7" cy="10" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="6" cy="14" r="1"/>', id:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M8 11h8M8 15h5"/>', license:'<path d="M4 5h16v14H4z"/><path d="M7 9h10M7 13h7M7 17h5"/>', gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-2.6V20a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H4v-2.6h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V5h2.6v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v2.6H20a1.7 1.7 0 0 0-1.6 1z"/>'
};return `<svg class="premium-svg" viewBox="0 0 24 24" aria-hidden="true">${p[name]||p.car}</svg>`}
function hydrateVehicleFormIcons(){document.querySelectorAll('.vehicle-form-icon-slot').forEach(el=>{if(!el.dataset.icon)return;el.innerHTML=svgIcon(el.dataset.icon)})}
function dataItem(icon,label,value,v){const mark=icon==='brand'?brandLogo(v):svgIcon(icon);return `<div class="vehicle-data-item"><span class="data-icon">${mark}</span><div><span>${label}</span><b>${value||'—'}</b></div></div>`}
function renderVehicleDetailModal(){
 const modal=$('vehicleDetailModal'),box=$('vehicleDetailContent'); if(!modal||!box)return;
 const v=data.vehicles.find(x=>x.id===data.selected); if(!v){modal.classList.remove('show');return}
 const ints=[...(v.interventions||[])]; const cost=ints.reduce((a,x)=>a+interventionCost(x),0); const due=ints.filter(i=>i.nextKm&&Number(v.km)>=Number(i.nextKm)); const allAlerts=getAlerts().filter(a=>a.vehicle===v.name); const isMoto=vehicleTypeOf(v)==='motorcycle';
 const detailType=isMoto?'Moto':'Coche';
 let dataHtml;
 if(isMoto){
   dataHtml=`${dataItem('brand','Marca',v.brand,v)}${dataItem('car','Modelo',v.model,v)}${dataItem('car','Tipo de moto',v.motoType,v)}${dataItem('calendar','Año de matriculación',v.year,v)}${dataItem('engine','Cilindrada',v.displacement,v)}${dataItem('power','Potencia',v.power,v)}${dataItem('fuel','Combustible',v.fuel,v)}${dataItem('transmission','Transmisión',v.transmission,v)}${dataItem('gauge','Kilometraje',Number(v.km||0).toLocaleString('es-ES')+' km',v)}`;
 }else{
   dataHtml=`${dataItem('brand','Marca',v.brand,v)}${dataItem('car','Tipo vehículo',v.type,v)}${dataItem('car','Modelo',v.model,v)}${dataItem('calendar','Año de matriculación',v.year,v)}${dataItem('engine','Versión',v.version,v)}${dataItem('power','Potencia',v.power,v)}${dataItem('fuel','Combustible',v.fuel,v)}${dataItem('transmission','Transmisión',v.transmission,v)}${dataItem('gauge','Kilometraje',Number(v.km||0).toLocaleString('es-ES')+' km',v)}`;
 }
 let html=`<div class="vehicle-detail-modal-top"><div><span class="eyebrow">FICHA DEL VEHÍCULO</span><small>${[v.brand,v.model].filter(Boolean).join(' · ')||'Sin marca/modelo'}</small></div><button class="vehicle-detail-close" onclick="closeModal('vehicleDetailModal')">Cerrar ×</button></div><div class="vehicle-detail-scroll">
 <section class="vehicle-signature-card vehicle-detail-dropdown">
   <div class="vehicle-hero"><div class="vehicle-hero-image ${isMoto?'is-moto':'is-car'}">${safePhotoMarkup(v)}</div>
    <div class="vehicle-hero-content"><div class="vehicle-page-title"><span>Mi vehículo</span></div><div class="vehicle-hero-bottom"><div class="vehicle-model vehicle-model-bottom">${[v.brand,v.model].filter(Boolean).join(' · ')||'Vehículo sin marca/modelo'} <button class="hero-edit" onclick="openVehicle(${v.id})">✎</button></div><div class="vehicle-spec-line"><span><i class="spec-icon">${svgIcon('calendar')}</i><small>Año matriculación</small><b>${v.year||'—'}</b></span><span><i class="spec-icon">${svgIcon('fuel')}</i><small>Combustible</small><b>${v.fuel||'—'}</b></span><span><i class="spec-icon">${svgIcon('car')}</i><small>Tipo vehículo</small><b>${detailType}</b></span></div></div></div></div>
    <div class="vehicle-mileage"><div><span class="eyebrow">KILOMETRAJE ACTUAL</span><strong>${Number(v.km||0).toLocaleString('es-ES')} km</strong></div><button class="vehicle-link" onclick="openHistoryModal()">Ver historial <span>›</span></button></div>
    <div class="vehicle-stats-pro"><div class="vstat vstat-blue"><span><span class="vehicle-form-icon-slot" data-icon="wrench"></span></span><div><b>${ints.length}</b><small>Intervenciones</small></div><i>›</i></div><div class="vstat vstat-green"><span><span class="vehicle-form-icon-slot" data-icon="coins"></span></span><div><b>${euro(cost)}</b><small>Gasto acumulado</small></div><i>›</i></div><div class="vstat vstat-red"><span><span class="vehicle-form-icon-slot" data-icon="bell"></span></span><div><b>${allAlerts.length}</b><small>Avisos pendientes</small></div><i>›</i></div></div>
    <div class="vehicle-data-panel"><div class="vehicle-data-head"><h3><span class="vehicle-form-icon-slot" data-icon="car"></span> Datos del vehículo</h3><button class="soft" onclick="openVehicle(${v.id})">✎ Editar</button></div><div class="vehicle-data-grid">${dataHtml}</div></div>
    <div class="vehicle-data-panel additional"><div class="vehicle-data-head"><h3><span class="vehicle-form-icon-slot" data-icon="gear"></span> Detalles adicionales</h3></div><div class="vehicle-data-grid">${dataItem('license','Matrícula',v.plate,v)}${dataItem('id','Bastidor (VIN)',v.vin,v)}${dataItem('palette','Color',v.color,v)}${dataItem('calendar','Fecha de compra',v.purchaseDate,v)}</div></div>
    <div class="vehicle-actions-pro"><button class="delete-vehicle-btn" onclick="deleteVehicle(${v.id})">🗑️ Eliminar vehículo</button><button class="primary" onclick="openIntervention()">＋ Nueva intervención</button></div>
 </section>${due.length?`<div class="vehicle-detail-alerts">${due.map(i=>`<div class="alert red">⚠️ <b>${i.type}</b> requiere atención. Próximo objetivo: ${Number(i.nextKm).toLocaleString('es-ES')} km.</div>`).join('')}</div>`:''}
 <button class="history-launch" onclick="openHistoryModal()">📚 Abrir historial de intervenciones <span>›</span></button></div>`;
 box.innerHTML=html;
  hydrateVehicleFormIcons();
}
function renderHistoryModal(){
 const modal=$('historyModal'), box=$('historyModalContent'); if(!modal||!box)return;
 const v=data.vehicles.find(x=>x.id===data.selected); if(!v){modal.classList.remove('show');return}
 const ints=[...(v.interventions||[])].sort((a,b)=>b.id-a.id);
 let html=`<div class="history-modal-top"><div><span class="eyebrow">HISTORIAL DE INTERVENCIONES</span><strong>${v.name||'Mi vehículo'}</strong><small>${[v.brand,v.model].filter(Boolean).join(' · ')||'Sin marca/modelo'} · ${Number(v.km||0).toLocaleString('es-ES')} km</small></div><button class="history-modal-close" onclick="closeModal('historyModal')">Cerrar ×</button></div><div class="history-modal-scroll"><div class="history-modal-body"><div class="history-modal-summary"><div><b>${ints.length}</b><span>intervenciones</span></div><div><b>${euro(ints.reduce((a,x)=>a+interventionCost(x),0))}</b><span>gasto acumulado</span></div></div><div class="intervention-list">${ints.length?ints.map(i=>{
   let meta={Mantenimiento:['🛢️','Cambio de aceite y filtro','mantenimiento'],Neumáticos:['🛞','Neumáticos','neumaticos'],'Correa/Cadena':['⚙️','Correa de distribución','correa'],Varios:['🔧','Intervención general','varios'],ITV:['📋','ITV','itv'],Seguro:['🛡️','Seguro','seguro'],Impuestos:['🏛️','Impuestos','impuestos']}[i.type]||['🔧',i.type,'varios'];
   let raw=(i.details||'Sin descripción').split(' · ').filter(Boolean); let detailLines=raw.length?raw:['Sin descripción']; let parts=(i.parts||[]).filter(p=>p.name||p.cost); let items=parts.length?parts.map(p=>`<div class="detail-item"><span class="dot"></span><span>${p.name||'Elemento'}</span>${p.cost?`<span class="item-cost">${euro(p.cost)}</span>`:''}</div>`).join(''):detailLines.map(x=>`<div class="detail-item"><span class="dot"></span><span>${x}</span></div>`).join('');
   const partsTotal=(i.parts||[]).reduce((a,p)=>a+Number(p?.cost||0),0);
   return `<article class="intervention-card"><div class="detail-hero ${meta[2]}"><div class="detail-icon">${meta[0]}</div><div class="detail-heading"><div class="detail-title">${meta[1]}</div><span class="detail-status">✓ Realizada</span><div class="detail-date">${i.date||'Fecha no indicada'}</div></div></div><div class="detail-body"><div class="detail-meta"><div class="detail-meta-item">📅 Fecha<b>${i.date||'—'}</b></div><div class="detail-meta-item">🚗 Kilómetros<b>${Number(i.km||0).toLocaleString('es-ES')} km</b></div></div><div class="detail-label">Detalles de la intervención</div><div class="detail-items">${items}</div>${i.nextKm?`<div class="detail-meta" style="margin-top:10px;margin-bottom:0"><div class="detail-meta-item">↗ Próxima intervención<b>${Number(i.nextKm).toLocaleString('es-ES')} km</b></div><div class="detail-meta-item">📏 Intervalo<b>${Number(i.interval||0).toLocaleString('es-ES')} km</b></div></div>`:''}<div class="detail-cost"><div><span>Coste total</span>${partsTotal>0?`<div class="detail-cost-parts"><span>✓ Piezas y elementos</span><b>${euro(partsTotal)}</b></div>`:''}</div><strong>${euro(interventionCost(i))}</strong></div><div class="detail-actions"><button class="edit" onclick="openIntervention(${i.id})">✎ Editar</button><button class="delete" onclick="deleteIntervention(${i.id})">▣ Eliminar</button></div></div></article>`;
 }).join(''):'<div class="empty">Todavía no hay intervenciones registradas.</div>'}</div></div></div>`;
 box.innerHTML=html;
}
function openHistoryModal(){renderHistoryModal();$('historyModal').classList.add('show')}

function render(){
 if($('qVehicles'))$('qVehicles').textContent=data.vehicles.length;
 const all=data.vehicles.flatMap(v=>v.interventions||[]);
 if($('qInterventions'))$('qInterventions').textContent=all.length;if($('qCost'))$('qCost').textContent=euro(all.reduce((a,x)=>a+interventionCost(x),0));if($('qAlerts'))$('qAlerts').textContent=getAlerts().length;
 const m=$('main');
 m.innerHTML=renderNoticePanel()+renderVehicleSection()+renderGarageyPanel();
 renderVehicleList();
 if($('vehicleDetailModal')?.classList.contains('show')) renderVehicleDetailModal();
 const filter=$('vehicleFilter'); if(filter) filter.title=vehicleListType==='all'?'Todos':vehicleListType;
}
function selectVehicle(id){closeModal('historyModal');data.selected=id;save();render();renderVehicleDetailModal();$('vehicleDetailModal').classList.add('show')}
function resetVehicleForm(){['vname','vmodel','vyear','vversion','vmototype','vdisplacement','vpower','vplate','vvin','vcolor','vpurchase','vkm'].forEach(id=>{if($(id))$(id).value=''});$('vfuel').value='';$('vtransmission').value='';}
function chooseVehicleType(type){closeModal('vehicleTypeModal');requestAnimationFrame(()=>openVehicleForm(null,type))}
function openVehicle(id){if(id){const v=data.vehicles.find(x=>x.id===id);openVehicleForm(v,vehicleTypeOf(v)==='motorcycle'?'Moto':'Coche')}else{editVehicle=null;closeModal('vehicleModal');$('vehicleTypeModal').classList.add('show')}}
document.addEventListener('input',e=>{if(e.target&&e.target.id==='vname'){const el=$('formVehicleNameLabel');if(el)el.textContent=e.target.value.trim()||'Nuevo vehículo'}});
function openVehicleForm(v,type){editVehicle=v?.id||null;const isNew=!v;const mode=type==='Moto'?'moto':'car';const dlg=$('vehicleFormDialog');dlg.classList.toggle('moto-mode',mode==='moto');dlg.classList.toggle('car-mode',mode==='car');if($('vehicleFormCaption'))$('vehicleFormCaption').textContent=mode==='moto'?'Datos de la moto y características principales':'Datos del coche y características principales';$('formVehicleTypeLabel').textContent=mode==='moto'?'Moto':'Coche';$('formVehicleNameLabel').textContent=isNew?'Nuevo vehículo':(v.name||'Nuevo vehículo');resetVehicleForm();populateBrandSelect(type,v?.brand||'');$('vname').value=v?.name||'';$('vmodel').value=v?.model||'';$('vyear').value=v?.year||'';$('vfuel').value=v?.fuel||'';$('vversion').value=v?.version||'';$('vmototype').value=v?.motoType||'';$('vdisplacement').value=v?.displacement||'';$('vpower').value=v?.power||'';$('vtransmission').value=v?.transmission||'';$('vplate').value=v?.plate||'';$('vvin').value=v?.vin||'';$('vcolor').value=v?.color||'';$('vpurchase').value=v?.purchaseDate||'';$('vkm').value=v?.km||'';hydrateVehicleFormIcons();$('vehicleModal').classList.add('show');if(isNew){setTimeout(()=>{resetVehicleForm();populateBrandSelect(type,'');hydrateVehicleFormIcons();$('formVehicleTypeLabel').textContent=mode==='moto'?'Moto':'Coche';$('formVehicleNameLabel').textContent='Nuevo vehículo';},120)}}
function saveVehicle(){let name=$('vname').value.trim();if(!name)return alert('Pon un nombre al vehículo');const isMoto=$('vehicleFormDialog').classList.contains('moto-mode');const type=isMoto?'Moto':'Coche';const vehicleFields={name,type,vehicleType:isMoto?'motorcycle':'car',brand:$('vbrand').value.trim(),model:$('vmodel').value.trim(),year:$('vyear').value.trim(),fuel:$('vfuel').value,version:isMoto?'':$('vversion').value.trim(),motoType:isMoto?$('vmototype').value:'',displacement:isMoto?$('vdisplacement').value.trim():'',power:$('vpower').value.trim(),transmission:$('vtransmission').value,plate:$('vplate').value.trim().toUpperCase(),vin:$('vvin').value.trim().toUpperCase(),color:$('vcolor').value.trim(),purchaseDate:$('vpurchase').value,km:Number($('vkm').value||0)};if(editVehicle){Object.assign(data.vehicles.find(x=>x.id===editVehicle),vehicleFields);data.selected=editVehicle}else{let v={id:Date.now(),...vehicleFields,interventions:[]};data.vehicles.push(v);data.selected=v.id;}save();closeModal('vehicleModal');render();if($('vehicleDetailModal').classList.contains('show'))renderVehicleDetailModal()}
function openIntervention(id){
 let v=data.vehicles.find(x=>x.id===data.selected);
 let item=id?(v.interventions||[]).find(x=>x.id===id):null;
 window.editIntervention=id||null;
 $('interventionModal').classList.add('show');
 $('idate').value=item?.date||new Date().toISOString().slice(0,10);
 $('ikm').value=item?.km??v.km??'';
 $('itype').value=item?.type||'Mantenimiento';
 $('inext').value=item?.interval||'';
 $('totalCost').value=item?interventionCost(item):0;
 $('manualDetails').value=item?.details||'';
 $('costItems').innerHTML='';
 (item?.parts?.length?item.parts:[{name:'',cost:''}]).forEach(p=>{
   addCost();
   let r=$('costItems').lastElementChild, inputs=r.querySelectorAll('input');
   inputs[0].value=p.name||''; inputs[1].value=p.cost??'';
 });
 // Recuperación aproximada de los campos específicos al editar registros antiguos.
 document.querySelectorAll('#maintenanceFields input[type=checkbox]').forEach(x=>x.checked=false);
 if(item){
   let d=item.details||'';
   if(item.type==='Mantenimiento')document.querySelectorAll('#maintenanceFields input[type=checkbox]').forEach(x=>x.checked=d.includes(x.value));
   if(item.type==='Neumáticos'){let a=d.split(' · ');$('tireSize').value=a[0]||'';$('tireBrand').value=a[1]||'';}
   if(item.type==='Correa/Cadena'){let a=d.split(' · ');$('beltType').value=a[0]||$('beltType').value;$('beltBrand').value=a[1]||'';}
   if(item.type==='Varios')$('otherDescription').value=d;
 }
 typeFields();
 updateTotalCost();
 document.querySelector('#interventionModal h2').textContent=item?'✏️ Editar intervención':'🔧 Nueva intervención';
 document.querySelector('#interventionModal .primary').textContent=item?'Guardar cambios':'Guardar intervención';
}
function typeFields(){
 ['maintenanceFields','tireFields','beltFields','otherFields','itvFields','insuranceFields','taxFields'].forEach(x=>$(x).classList.add('hidden'));
 let t=$('itype').value;
 let map={'Mantenimiento':'maintenanceFields','Neumáticos':'tireFields','Correa/Cadena':'beltFields','Varios':'otherFields','ITV':'itvFields','Seguro':'insuranceFields','Impuestos':'taxFields'};
 $(map[t]).classList.remove('hidden');
}
function updateTotalCost(){const total=[...document.querySelectorAll('#costItems .cost-row input[type=number]')].reduce((a,x)=>a+Number(x.value||0),0);$('totalCost').value=total.toFixed(2);return total}
function addCost(){let d=document.createElement('div');d.className='cost-row';d.innerHTML='<input placeholder="Pieza o elemento"><input type="number" step=".01" min="0" placeholder="Coste €"><button class="danger" type="button" onclick="this.parentElement.remove();updateTotalCost()">×</button>';d.querySelector('input[type=number]').addEventListener('input',updateTotalCost);$('costItems').appendChild(d);updateTotalCost()}
function saveIntervention(){
 let v=data.vehicles.find(x=>x.id===data.selected),type=$('itype').value,details='';
 if(type==='Mantenimiento')details=[...document.querySelectorAll('#maintenanceFields input:checked')].map(x=>x.value).join(', ')||'Mantenimiento general';
 if(type==='Neumáticos')details=`${$('tireSize').value||'Medida no indicada'} · ${$('tireBrand').value||'Marca no indicada'}`;
 if(type==='Correa/Cadena')details=`${$('beltType').value} · ${$('beltBrand').value||'Marca no indicada'}`;
 if(type==='Varios')details=$('otherDescription').value||'Intervención sin descripción';
 if(type==='ITV')details=`Resultado: ${$('itvResult').value}${$('itvNextDate').value?' · Próxima ITV: '+$('itvNextDate').value:''}${$('itvNotes').value?' · '+$('itvNotes').value:''}`;
 if(type==='Seguro')details=`${$('insuranceCompany').value||'Aseguradora no indicada'} · ${$('insurancePeriod').value}${$('insuranceExpiry').value?' · Vence: '+$('insuranceExpiry').value:''}${$('insurancePolicy').value?' · Póliza: '+$('insurancePolicy').value:''}`;
 if(type==='Impuestos')details=`${$('taxType').value}${$('taxDueDate').value?' · Pago: '+$('taxDueDate').value:''}${$('taxNotes').value?' · '+$('taxNotes').value:''}`;
 let manual=$('manualDetails').value.trim(); if(manual)details=manual;
 let km=Number($('ikm').value||0),interval=Number($('inext').value||0);
 let parts=[...document.querySelectorAll('.cost-row')].map(r=>({name:r.querySelectorAll('input')[0].value,cost:Number(r.querySelectorAll('input')[1].value||0)})).filter(x=>x.name||x.cost);
 let partsTotal=parts.reduce((a,p)=>a+Number(p.cost||0),0);let record={type,date:$('idate').value,km,nextKm:interval?km+interval:null,interval,details,parts,totalCost:partsTotal};
 if(window.editIntervention){
   let existing=(v.interventions||[]).find(x=>x.id===window.editIntervention);
   if(existing)Object.assign(existing,record);
 }else{
   record.id=Date.now();v.interventions.push(record);
 }
 window.editIntervention=null;
 if(km>Number(v.km||0))v.km=km;
 save();closeModal('interventionModal');render();if($('historyModal')?.classList.contains('show'))renderHistoryModal();
}
function deleteIntervention(id){let v=data.vehicles.find(x=>x.id===data.selected);if(confirm('¿Eliminar esta intervención?')){v.interventions=v.interventions.filter(x=>x.id!==id);save();render();if($('historyModal')?.classList.contains('show'))renderHistoryModal()}}
function deleteVehicle(id){if(confirm('¿Eliminar vehículo y todo su historial?')){data.vehicles=data.vehicles.filter(x=>x.id!==id);data.selected=data.vehicles[0]?.id||null;closeModal('historyModal');save();render()}}
function closeModal(id){$(id).classList.remove('show')}
function openSettings(){$('settingsModal').classList.add('show');$('schemaVersion').textContent='v'+data.schemaVersion}
function exportData(){let blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='garagey_backup.json';a.click();URL.revokeObjectURL(a.href)}
function importData(e){let f=e.target.files[0];if(!f)return;let r=new FileReader();r.onload=()=>{try{let imported=JSON.parse(r.result);if(!Array.isArray(imported.vehicles))throw 0;data=imported;migrate();if(!data.selected)data.selected=data.vehicles[0]?.id||null;save();closeModal('settingsModal');render();alert('Copia restaurada correctamente')}catch(err){alert('Archivo de copia no válido')}};r.readAsText(f)}

render();
