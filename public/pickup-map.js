(function(){
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function times(pt){var t=[];(pt.services||[]).forEach(function(s){if(s.time&&t.indexOf(s.time)<0)t.push(s.time);});t.sort();return t.join(' / ');}
  function pinIcon(label){
    var lbl=label?'<div class="pin-time">'+esc(label)+'</div>':'';
    return L.divIcon({className:'pin-div',html:'<div class="pin-wrap"><svg width="28" height="28" viewBox="0 0 24 24" fill="#BB9549" stroke="#193847" stroke-width="1.5"><path d="M12 22s7-7 7-12a7 7 0 1 0-14 0c0 5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5" fill="#fff" stroke="none"/></svg>'+lbl+'</div>',iconSize:[28,28],iconAnchor:[14,28],popupAnchor:[0,-26]});
  }
  window.createPickupMap=function(o){
    var el=document.getElementById(o.elId); if(!el||typeof L==='undefined') return null;
    var pts=(o.points||[]).filter(function(p){return p.lat!=null&&p.lng!=null;});
    var center=pts.length?[+pts[0].lat,+pts[0].lng]:[35.3387,25.1442];
    var map=L.map(el).setView(center, pts.length?12:11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
    var bounds=[];
    function seats(svc){var used=(o.usage&&o.usage[svc.routeId])||0;var mineHere=o.mineStopId&&String(o.mineStopId)===String(svc.stopId);return Math.max(0, (svc.capacity||8)-used+(mineHere?1:0));}
    function popupHtml(pt){
      var rows=(pt.services||[]).map(function(svc){
        var s=seats(svc);
        var lbl=(svc.destination?esc(svc.destination)+' · ':'')+esc(svc.routeName)+' — '+esc(svc.time||'')+' · '+s+' '+(o.seatsWord||'θέσ.');
        if(o.mode==='select'){
          var dis=s<=0?'disabled':'';
          return '<button type="button" class="pk-svc" '+dis+' data-r="'+esc(svc.routeId)+'" data-s="'+esc(svc.stopId)+'" data-label="'+esc(pt.name+' · '+(svc.destination?svc.destination+' · ':'')+svc.routeName+' — '+(svc.time||''))+'">'+lbl+(s<=0?' ('+(o.fullWord||'πλήρες')+')':'')+'</button>';
        }
        return '<div class="pk-svc-v">'+lbl+'</div>';
      }).join('');
      return '<div class="pk-pop"><b>'+esc(pt.name)+'</b>'+rows+'</div>';
    }
    pts.forEach(function(pt){
      var m=L.marker([+pt.lat,+pt.lng],{icon:pinIcon(times(pt))}).addTo(map);
      m.bindPopup(popupHtml(pt));
      m.on('popupopen',function(e){
        if(o.mode!=='select')return; var c=e.popup.getElement(); if(!c)return;
        c.querySelectorAll('.pk-svc').forEach(function(b){ b.addEventListener('click',function(){ if(o.onSelect)o.onSelect(b.dataset.r,b.dataset.s,b.dataset.label); map.closePopup(); }); });
      });
      bounds.push([+pt.lat,+pt.lng]);
    });
    if(bounds.length>1) map.fitBounds(bounds,{padding:[30,30]});
    setTimeout(function(){map.invalidateSize();},250);
    return { map:map, refresh:function(){ map.invalidateSize(); if(bounds.length>1)map.fitBounds(bounds,{padding:[30,30]}); } };
  };
})();
