(function(){
  var map=null, bounds=[];
  function esc(s){return String(s==null?'':s).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];});}
  function brand(){return (window.MAP_CFG&&window.MAP_CFG.pin)||'#193847';}
  function pinIcon(){return L.divIcon({className:'pin-div',html:'<svg width="28" height="28" viewBox="0 0 24 24" fill="'+brand()+'" stroke="#ffffff" stroke-width="1.4"><path d="M12 22s7-7 7-12a7 7 0 1 0-14 0c0 5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5" fill="#fff" stroke="none"/></svg>',iconSize:[26,26],iconAnchor:[13,26],popupAnchor:[0,-24]});}
  function init(){
    var el=document.getElementById('map'); if(!el || typeof L==='undefined') return;
    var pts=(window.PICKUPS||[]).filter(function(p){return p.lat!=null && p.lng!=null;});
    var center=pts.length?[Number(pts[0].lat),Number(pts[0].lng)]:[35.3387,25.1442];
    map=L.map(el).setView(center, pts.length?12:11);
    var cfg=window.MAP_CFG||{tile:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',subdomains:'abc',attribution:'© OpenStreetMap'}; L.tileLayer(cfg.tile,{maxZoom:19,subdomains:cfg.subdomains||'abc',attribution:cfg.attribution}).addTo(map);
    var groups={};
    pts.forEach(function(p){var k=p.stop_id+':'+p.lat+','+p.lng;if(!groups[k])groups[k]={lat:+p.lat,lng:+p.lng,stop:p.stop,time:p.pickup_time,people:[]};groups[k].people.push(p.person);});
    bounds=[];
    Object.keys(groups).forEach(function(k){var g=groups[k];var m=L.marker([g.lat,g.lng],{icon:pinIcon()}).addTo(map);m.bindPopup('<b>'+esc(g.stop)+'</b>'+(g.time?' — '+esc(g.time):'')+'<br>'+g.people.map(function(n){return '• '+esc(n);}).join('<br>'));bounds.push([g.lat,g.lng]);});
    if(bounds.length>1) map.fitBounds(bounds,{padding:[30,30]});
    setTimeout(function(){map.invalidateSize();},250);
  }
  window.refreshDriverMap=function(){ if(map){ map.invalidateSize(); if(bounds.length>1) map.fitBounds(bounds,{padding:[30,30]}); } };
  if(document.readyState!=='loading') init(); else document.addEventListener('DOMContentLoaded', init);
})();
