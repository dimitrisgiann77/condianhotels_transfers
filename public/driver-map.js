function initDriverMap() {
  var pts = (window.PICKUPS || []).filter(function(p){ return p.lat != null && p.lng != null; });
  var center = pts.length ? { lat: Number(pts[0].lat), lng: Number(pts[0].lng) } : { lat: 35.3387, lng: 25.1442 };
  var map = new google.maps.Map(document.getElementById('map'), { center: center, zoom: 12, mapTypeControl: false, streetViewControl: false });
  // Group people by stop coordinate
  var groups = {};
  pts.forEach(function(p){
    var key = p.stop_id + ':' + p.lat + ',' + p.lng;
    if (!groups[key]) groups[key] = { lat: Number(p.lat), lng: Number(p.lng), stop: p.stop, time: p.pickup_time, people: [] };
    groups[key].people.push(p.person);
  });
  var bounds = new google.maps.LatLngBounds();
  Object.keys(groups).forEach(function(k){
    var g = groups[k];
    var pos = { lat: g.lat, lng: g.lng };
    var marker = new google.maps.Marker({ position: pos, map: map, title: g.stop + (g.time ? ' (' + g.time + ')' : '') });
    var info = new google.maps.InfoWindow({
      content: '<b>' + g.stop + '</b>' + (g.time ? ' — ' + g.time : '') +
               '<br>' + g.people.map(function(n){ return '• ' + n; }).join('<br>')
    });
    marker.addListener('click', function(){ info.open(map, marker); });
    bounds.extend(pos);
  });
  if (pts.length > 1) map.fitBounds(bounds);
}
