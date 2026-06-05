var _adminMap = null, _adminMarker = null, _geocoder = null;

function _setPin(pos) {
  if (!_adminMap) return;
  if (_adminMarker) _adminMarker.setPosition(pos);
  else {
    _adminMarker = new google.maps.Marker({ position: pos, map: _adminMap, draggable: true });
    _adminMarker.addListener('dragend', function (e) {
      _setPin({ lat: e.latLng.lat(), lng: e.latLng.lng() });
    });
  }
  _adminMap.panTo(pos);
  document.getElementById('stopLat').value = (typeof pos.lat === 'function' ? pos.lat() : pos.lat).toFixed(6);
  document.getElementById('stopLng').value = (typeof pos.lng === 'function' ? pos.lng() : pos.lng).toFixed(6);
}

function initAdminMap() {
  var s = window.ADMIN_STOP;
  var hasPos = s && s.lat != null && s.lng != null;
  var center = hasPos ? { lat: Number(s.lat), lng: Number(s.lng) } : { lat: 35.3387, lng: 25.1442 };
  _adminMap = new google.maps.Map(document.getElementById('adminMap'), {
    center: center, zoom: hasPos ? 15 : 11, mapTypeControl: false, streetViewControl: false
  });
  _geocoder = new google.maps.Geocoder();
  if (hasPos) _setPin(center);
  _adminMap.addListener('click', function (e) {
    _setPin({ lat: e.latLng.lat(), lng: e.latLng.lng() });
  });
}

function geocodeStopAddress() {
  var msg = document.getElementById('geoMsg');
  var addr = (document.getElementById('geoAddr') || {}).value || '';
  if (!addr.trim()) { msg.textContent = 'Γράψε μια διεύθυνση.'; return; }
  if (!_geocoder) { msg.textContent = 'Ο χάρτης δεν φόρτωσε (λείπει το API key;).'; return; }
  msg.textContent = 'Αναζήτηση…';
  _geocoder.geocode({ address: addr, region: 'gr' }, function (results, status) {
    if (status === 'OK' && results[0]) {
      _setPin(results[0].geometry.location);
      if (_adminMap) _adminMap.setZoom(16);
      msg.textContent = 'Βρέθηκε: ' + results[0].formatted_address;
    } else {
      msg.textContent = 'Δεν βρέθηκε θέση (' + status + '). Δοκίμασε πιο συγκεκριμένη διεύθυνση ή κλικ στον χάρτη.';
    }
  });
}
