
/* GARAGEY AUTO-SYNC v5.1.1 — capa mínima sobre el guardado local.
   Espera 5 segundos desde el último cambio antes de intentar la copia.
   No altera el modelo de datos ni las funciones de la aplicación. */
(function(){
  let timer=null;
  window.garageyScheduleAutoBackup=function(){
    clearTimeout(timer);
    const status=document.getElementById('gdriveStatus');
    if(status) status.textContent='Estado: cambios locales guardados · copia en 5 s';
    timer=setTimeout(function(){
      if(typeof window.garageyGoogleBackup==='function') window.garageyGoogleBackup(true);
    },5000);
  };
})();
