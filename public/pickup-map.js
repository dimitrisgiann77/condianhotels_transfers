(function(){
  function CFG(){return window.MAP_CFG||{tile:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',subdomains:'abc',attribution:'© OpenStreetMap',pin:'#193847'};}
  function brand(){return CFG().pin||'#193847';}
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function times(pt){var t=[];(pt.services||[]).forEach(function(s){if(s.time&&t.indexOf(s.time)<0)t.push(s.time);});t.sort();return t.join(' / ');}
  function pinIcon(idx,color,name,timeLabel){
    var num=idx+1;
    var html=''+
      '<div class="pin-wrap">'+
        '<div class="pin-label" style="border-color:'+color+'"><span class="pl-name">'+esc(name)+'</span>'+(timeLabel?'<span class="pl-time">'+esc(timeLabel)+'</span>':'')+'</div>'+
        '<svg width="34" height="34" viewBox="0 0 24 24" fill="'+color+'" stroke="#ffffff" stroke-width="1.3"><path d="M12 23s7.5-7.2 7.5-13A7.5 7.5 0 1 0 4.5 10c0 5.8 7.5 13 7.5 13z"/></svg>'+
        '<span class="pin-num">'+num+'</span>'+
      '</div>';
    return L.divIcon({className:'pin-div',html:html,iconSize:[34,34],iconAnchor:[17,34],popupAnchor:[0,-30]});
  }
  window.createPickupMap=function(o){
    var el=document.getElementById(o.elId); if(!el||typeof L==='undefined') return null;
    var pts=(o.points||[]).filter(function(p){return p.lat!=null&&p.lng!=null;});
    var center=pts.length?[+pts[0].lat,+pts[0].lng]:[35.3387,25.1442];
    var map=L.map(el).setView(center, pts.length?13:11);
    var cfg=CFG(); L.tileLayer(cfg.tile,{maxZoom:19,subdomains:cfg.subdomains||'abc',attribution:cfg.attribution}).addTo(map);
    var bounds=[];
    function seats(svc){var used=(o.usage&&o.usage[svc.routeId])||0;var mineHere=o.mineStopId&&String(o.mineStopId)===String(svc.stopId);return Math.max(0, (svc.capacity||8)-used+(mineHere?1:0));}
    function popupHtml(pt,idx){
      var rows=(pt.services||[]).map(function(svc){
        var s=seats(svc);
        var lbl=(svc.destination?esc(svc.destination)+' · ':'')+esc(svc.routeName)+' — '+esc(svc.time||'')+' · '+s+' '+(o.seatsWord||'θέσ.');
        if(o.mode==='select'){
          var dis=s<=0?'disabled':'';
          return '<button type="button" class="pk-svc" '+dis+' data-r="'+esc(svc.routeId)+'" data-s="'+esc(svc.stopId)+'">'+lbl+(s<=0?' ('+(o.fullWord||'πλήρες')+')':'')+'</button>';
        }
        return '<div class="pk-svc-v">'+lbl+'</div>';
      }).join('');
      return '<div class="pk-pop"><b><span class="pk-badge" style="background:'+brand()+'">'+(idx+1)+'</span> '+esc(pt.name)+'</b>'+rows+'</div>';
    }
    pts.forEach(function(pt,idx){
      var color=brand();
      var m=L.marker([+pt.lat,+pt.lng],{icon:pinIcon(idx,color,pt.name,times(pt))}).addTo(map);
      m.bindPopup(popupHtml(pt,idx));
      m.on('popupopen',function(e){
        if(o.mode!=='select')return; var c=e.popup.getElement(); if(!c)return;
        c.querySelectorAll('.pk-svc').forEach(function(b){ b.addEventListener('click',function(){ if(o.onSelect)o.onSelect(b.dataset.r,b.dataset.s); map.closePopup(); }); });
      });
      bounds.push([+pt.lat,+pt.lng]);
    });
    if(bounds.length>1) map.fitBounds(bounds,{padding:[40,40]});
    setTimeout(function(){map.invalidateSize();},250);
    return { map:map, refresh:function(){ map.invalidateSize(); if(bounds.length>1)map.fitBounds(bounds,{padding:[40,40]}); } };
  };
})();
