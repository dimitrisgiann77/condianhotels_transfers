(function(){
  var map=null, marker=null;
  function brand(){return (window.MAP_CFG&&window.MAP_CFG.pin)||'#193847';}
  function pinIcon(){return L.divIcon({className:'pin-div',html:'<svg width="28" height="28" viewBox="0 0 24 24" fill="'+brand()+'" stroke="#ffffff" stroke-width="1.4"><path d="M12 22s7-7 7-12a7 7 0 1 0-14 0c0 5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5" fill="#fff" stroke="none"/></svg>',iconSize:[26,26],iconAnchor:[13,26]});}
  function writeLatLng(lat,lng){var a=document.getElementById('pointLat'),b=document.getElementById('pointLng');if(a)a.value=Number(lat).toFixed(6);if(b)b.value=Number(lng).toFixed(6);}
  function setPin(lat,lng){
    if(marker) marker.setLatLng([lat,lng]);
    else { marker=L.marker([lat,lng],{draggable:true,icon:pinIcon()}).addTo(map); marker.on('dragend',function(e){var p=e.target.getLatLng();writeLatLng(p.lat,p.lng);}); }
    map.panTo([lat,lng]); writeLatLng(lat,lng);
  }
  function init(){
    var el=document.getElementById('adminMap'); if(!el || typeof L==='undefined') return;
    var s=window.ADMIN_POINT; var has=s&&s.lat!=null&&s.lng!=null;
    var c=has?[+s.lat,+s.lng]:[35.3387,25.1442];
    map=L.map(el).setView(c, has?15:11);
    var cfg=window.MAP_CFG||{tile:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',subdomains:'abc',attribution:'© OpenStreetMap'}; L.tileLayer(cfg.tile,{maxZoom:19,subdomains:cfg.subdomains||'abc',attribution:cfg.attribution}).addTo(map);
    if(has) setPin(c[0],c[1]);
    map.on('click',function(e){setPin(e.latlng.lat,e.latlng.lng);});
    setTimeout(function(){map.invalidateSize();},250);
  }
  window.refreshAdminMap=function(){ if(map) setTimeout(function(){map.invalidateSize();},100); };
  window.geocodeStopAddress=function(){
    var msg=document.getElementById('geoMsg'); var addr=(document.getElementById('geoAddr')||{}).value||'';
    if(!addr.trim()){ if(msg)msg.textContent='Γράψε μια διεύθυνση.'; return; }
    if(msg)msg.textContent='Αναζήτηση…';
    fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=gr&q='+encodeURIComponent(addr),{headers:{'Accept':'application/json'}})
      .then(function(r){return r.json();})
      .then(function(d){ if(d&&d[0]){ setPin(parseFloat(d[0].lat),parseFloat(d[0].lon)); map.setView([parseFloat(d[0].lat),parseFloat(d[0].lon)],16); if(msg)msg.textContent='Βρέθηκε: '+d[0].display_name; } else { if(msg)msg.textContent='Δεν βρέθηκε. Κάνε κλικ στον χάρτη.'; } })
      .catch(function(){ if(msg)msg.textContent='Σφάλμα αναζήτησης. Κάνε κλικ στον χάρτη.'; });
  };
  if(document.readyState!=='loading') init(); else document.addEventListener('DOMContentLoaded', init);
})();
