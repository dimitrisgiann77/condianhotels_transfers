const DICT = {
  el: {
    // nav
    home: 'Αρχική', my_declaration: 'Τα Pick up μου', evaluation: 'Αξιολόγηση', profile: 'Προφίλ',
    logout: 'Έξοδος', program: 'Πρόγραμμα',
    report_issue: 'Αναφορά προβλήματος', report_title: 'Αναφορά προβλήματος',
    report_intro: 'Περίγραψε το πρόβλημα ή τη δυσκολία που αντιμετωπίζεις με κάποια λειτουργία. Η διοίκηση θα ειδοποιηθεί.',
    report_area: 'Σχετική λειτουργία', report_message: 'Περιγραφή', report_submit: 'Αποστολή',
    report_sent: 'Ευχαριστούμε! Η αναφορά στάλθηκε στη διοίκηση.', report_cancel: 'Άκυρο',
    area_general: 'Γενικά', area_pickup: 'Δήλωση pick up', area_schedule: 'Πρόγραμμα / Οδηγός',
    area_account: 'Σύνδεση / Λογαριασμός', area_notify: 'Ειδοποιήσεις / Email', area_map: 'Χάρτης', area_other: 'Άλλο',
    // login / register
    signin: 'Σύνδεση', username: 'Όνομα χρήστη', password: 'Κωδικός', enter: 'Είσοδος',
    register_link: 'Εγγραφή νέου χρήστη', have_account: 'Έχω ήδη λογαριασμό',
    register_title: 'Εγγραφή προσωπικού', reg_disabled: 'Η εγγραφή δεν είναι αυτή τη στιγμή διαθέσιμη. Επικοινώνησε με τη διοίκηση.',
    lastname: 'Επώνυμο', firstname: 'Όνομα', email: 'Email', phone: 'Κινητό',
    reg_code: 'Κωδικός εγγραφής', register_btn: 'Εγγραφή', reg_note: 'Ο λογαριασμός θα ενεργοποιηθεί μόλις τον εγκρίνει η διοίκηση.',
    // profile
    my_profile: 'Το προφίλ μου', saved: 'Αποθηκεύτηκε.', contact_email: 'Email επικοινωνίας', contact_phone: 'Κινητό επικοινωνίας',
    hotel: 'Ξενοδοχείο', default_route: 'Προεπιλεγμένο δρομολόγιο', default_stop: 'Προεπιλεγμένη στάση',
    my_routes: 'Τα δρομολόγιά μου', notifications: 'Ειδοποιήσεις', recv_email: 'Να λαμβάνω ειδοποιήσεις με email',
    notify_times: 'Ώρες ειδοποίησης (μπορείς να βάλεις πολλές)', add_time: '+ Προσθήκη ώρας',
    weekly_reminder: 'Εβδομαδιαία υπενθύμιση', weekly_send: 'Στείλε μου εβδομαδιαίο πρόγραμμα (7 ημερών)',
    day: 'Ημέρα', time: 'Ώρα', save: 'Αποθήκευση', upload_photo: 'Ανέβασμα φωτογραφίας', language: 'Γλώσσα',
    none: '— Κανένα —', email_req: 'Το email και το κινητό είναι υποχρεωτικά.',
    // staff
    my_program: 'Το πρόγραμμά μου', click_day: 'Κάνε κλικ σε μια μέρα για το pick up σου.',
    shift_declaration: 'Δήλωση Pick up', date: 'Ημερομηνία', route: 'Δρομολόγιο', stop: 'Στάση παραλαβής',
    choose_route: '— Διάλεξε δρομολόγιο —', choose_stop: '— Διάλεξε στάση —', pickup_time: 'Ώρα παραλαβής',
    available_seats: 'Διαθέσιμες θέσεις', submit_decl: 'Καταχώρηση Pick up', my_declarations: 'Τα Pick up μου',
    no_my_decl: 'Δεν έχεις pick up για τις επόμενες μέρες.', decl_saved: 'Το pick up σου αποθηκεύτηκε.',
    route_full: 'Το δρομολόγιο είναι πλήρες (όριο θέσεων). Διάλεξε άλλο δρομολόγιο.', full: 'FULL (γεμάτο)',
    calendar: 'Ημερολόγιο', declare: 'Pick up',
    // driver
    pickup_program: 'Πρόγραμμα παραλαβών', weekly: 'Εβδομαδιαίο', daily: 'Ημερήσιο',
    today: 'Σήμερα', tomorrow: 'Αύριο', print: 'Εκτύπωση', download_pdf: 'Λήψη PDF',
    work: 'Εργασία', off: 'Ρεπό', pending: 'Εκκρεμούν', stops_passengers: 'Στάσεις & επιβάτες',
    no_work_decl: 'Καμία δήλωση εργασίας ακόμη.', not_declared: 'Δεν δήλωσαν ακόμη',
    remind_all: 'Υπενθύμιση σε όλους', all_declared: 'Όλο το προσωπικό έχει δηλώσει.',
    people: 'άτομα', seats_available: 'διαθέσιμες', no_decl: 'Καμία δήλωση.',
    // days
    d_mon: 'Δευ', d_tue: 'Τρι', d_wed: 'Τετ', d_thu: 'Πεμ', d_fri: 'Παρ', d_sat: 'Σαβ', d_sun: 'Κυρ',
    // feedback
    fb_rate_title: 'Αξιολόγηση δρομολογίου', fb_route_q: 'Δρομολόγιο (1-5)', fb_driver_q: 'Οδηγός (1-5)',
    fb_vehicle_q: 'Όχημα (1-5)', fb_comment: 'Σχόλιο (προαιρετικό)', fb_submit: 'Υποβολή αξιολόγησης', driver: 'Οδηγός',
  },
  en: {
    home: 'Home', my_declaration: 'My pick-ups', evaluation: 'Feedback', profile: 'Profile',
    logout: 'Logout', program: 'Schedule',
    report_issue: 'Report an issue', report_title: 'Report an issue',
    report_intro: 'Describe the problem or difficulty you are facing with a feature. The management will be notified.',
    report_area: 'Related feature', report_message: 'Description', report_submit: 'Send',
    report_sent: 'Thank you! Your report was sent to the management.', report_cancel: 'Cancel',
    area_general: 'General', area_pickup: 'Pick-up request', area_schedule: 'Schedule / Driver',
    area_account: 'Login / Account', area_notify: 'Notifications / Email', area_map: 'Map', area_other: 'Other',
    signin: 'Sign in', username: 'Username', password: 'Password', enter: 'Log in',
    register_link: 'Register new account', have_account: 'I already have an account',
    register_title: 'Staff registration', reg_disabled: 'Registration is currently unavailable. Please contact management.',
    lastname: 'Last name', firstname: 'First name', email: 'Email', phone: 'Mobile',
    reg_code: 'Registration code', register_btn: 'Register', reg_note: 'Your account will be activated once approved by management.',
    my_profile: 'My profile', saved: 'Saved.', contact_email: 'Contact email', contact_phone: 'Contact mobile',
    hotel: 'Hotel', default_route: 'Default route', default_stop: 'Default stop',
    my_routes: 'My routes', notifications: 'Notifications', recv_email: 'Receive email notifications',
    notify_times: 'Notification times (you can add several)', add_time: '+ Add time',
    weekly_reminder: 'Weekly reminder', weekly_send: 'Send me the weekly schedule (7 days)',
    day: 'Day', time: 'Time', save: 'Save', upload_photo: 'Upload photo', language: 'Language',
    none: '— None —', email_req: 'Email and mobile are required.',
    my_program: 'My schedule', click_day: 'Click a day to set your pick-up.',
    shift_declaration: 'Pick-up request', date: 'Date', route: 'Route', stop: 'Pickup stop',
    choose_route: '— Choose route —', choose_stop: '— Choose stop —', pickup_time: 'Pickup time',
    available_seats: 'Available seats', submit_decl: 'Submit pick-up', my_declarations: 'My pick-ups',
    no_my_decl: 'You have no pick-ups for the coming days.', decl_saved: 'Your pick-up has been saved.',
    route_full: 'This route is full (seat limit). Choose another route.', full: 'FULL',
    calendar: 'Calendar', declare: 'Pick-up',
    pickup_program: 'Pickup schedule', weekly: 'Weekly', daily: 'Daily',
    today: 'Today', tomorrow: 'Tomorrow', print: 'Print', download_pdf: 'Download PDF',
    work: 'Working', off: 'Off', pending: 'Pending', stops_passengers: 'Stops & passengers',
    no_work_decl: 'No work declarations yet.', not_declared: 'Not declared yet',
    remind_all: 'Remind everyone', all_declared: 'All staff have declared.',
    people: 'people', seats_available: 'available', no_decl: 'No declarations.',
    d_mon: 'Mon', d_tue: 'Tue', d_wed: 'Wed', d_thu: 'Thu', d_fri: 'Fri', d_sat: 'Sat', d_sun: 'Sun',
    fb_rate_title: 'Route feedback', fb_route_q: 'Route (1-5)', fb_driver_q: 'Driver (1-5)',
    fb_vehicle_q: 'Vehicle (1-5)', fb_comment: 'Comment (optional)', fb_submit: 'Submit feedback', driver: 'Driver',
  },
};
function t(lang, key) {
  const l = (lang === 'en') ? 'en' : 'el';
  return (DICT[l] && DICT[l][key] != null) ? DICT[l][key] : (DICT.el[key] != null ? DICT.el[key] : key);
}
function dayNames(lang) {
  const l = (lang === 'en') ? 'en' : 'el';
  return [DICT[l].d_mon, DICT[l].d_tue, DICT[l].d_wed, DICT[l].d_thu, DICT[l].d_fri, DICT[l].d_sat, DICT[l].d_sun];
}
module.exports = { t, dayNames };
