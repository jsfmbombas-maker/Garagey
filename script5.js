
/* v27: after changing vehicle, ensure the current detail sheet is redrawn */
const _deleteVehicleV27=window.deleteVehicle;
window.deleteVehicle=function(id){
  const v=data.vehicles.find(x=>x.id===id);
  if(!v)return;
  if(!confirm(`¿Eliminar «${v.name||[v.brand,v.model].filter(Boolean).join(' ')||'este vehículo'}» y todo su historial?`))return;
  data.vehicles=data.vehicles.filter(x=>x.id!==id);
  data.selected=data.vehicles[0]?.id||null;
  closeModal('vehicleDetailModal');
  closeModal('historyModal');
  save();
  render();
};
