# CONDIAN Hotels — Summer Transfers 2026

Web εφαρμογή δήλωσης βάρδιας προσωπικού & προγράμματος παραλαβών οδηγών.

- **Προσωπικό**: μπαίνει με username/κωδικό και δηλώνει για κάθε μέρα *Εργασία/Ρεπό*, διαλέγει **δρομολόγιο** και **στάση** (η ώρα μπαίνει αυτόματα).
- **Οδηγοί**: βλέπουν ζωντανά ποιοι θα παραληφθούν, ανά στάση/ώρα, με **πινέζες σε Google Maps**, και ποιοι δεν έχουν δηλώσει.
- **Admin**: διαχειρίζεται δρομολόγια, στάσεις (ορισμός πινέζας με κλικ στον χάρτη), προσωπικό, οδηγούς.
- **Emails** (μέσω εταιρικού SMTP): υπενθύμιση στο προσωπικό **18:00** & λίστα μη-δηλωμένων στους οδηγούς **23:00** (ώρα Ελλάδας).

## Στοίβα
Node.js + Express + PostgreSQL + EJS · nodemailer · node-cron · Google Maps JS API.

---

## Τοπική εκτέλεση

```bash
npm install
cp .env.example .env      # συμπλήρωσε τις τιμές
# χρειάζεται ένα PostgreSQL· βάλε το DATABASE_URL στο .env
npm start
```
Άνοιξε http://localhost:3000 και μπες με τον admin (ADMIN_USERNAME/ADMIN_PASSWORD).

---

## Deploy σε Railway (μέσω GitHub)

1. **GitHub**: ανέβασε αυτόν τον φάκελο σε νέο repository.
   ```bash
   git init && git add . && git commit -m "CONDIAN transfers"
   git branch -M main
   git remote add origin https://github.com/<you>/condian-transfers.git
   git push -u origin main
   ```
2. **Railway** → *New Project* → *Deploy from GitHub repo* → διάλεξε το repo.
3. Στο project, *New* → **Database → PostgreSQL**. Το Railway δημιουργεί αυτόματα τη μεταβλητή `DATABASE_URL` (σύνδεσέ τη στο service αν χρειαστεί από *Variables → Add Reference*).
4. Στο service → **Variables**, πρόσθεσε (δες `.env.example`):
   - `SESSION_SECRET` (μεγάλη τυχαία συμβολοσειρά)
   - `PUBLIC_URL` (το public domain του Railway, π.χ. `https://condian.up.railway.app`)
   - `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`
   - `GOOGLE_MAPS_API_KEY`
   - (προαιρετικά) `APP_TZ=Europe/Athens`, `STAFF_REMINDER_CRON=0 18 * * *`, `DRIVER_SUMMARY_CRON=0 23 * * *`, `ENABLE_CRON=true`
5. Railway → *Settings → Networking* → **Generate Domain**. Βάλε αυτό το URL και στο `PUBLIC_URL`.
6. Το deploy τρέχει `npm start`. Στο πρώτο boot δημιουργούνται οι πίνακες, ο admin, και το πρωινό δρομολόγιο Ηρακλείου (seed).

> Η βάση δεν χρειάζεται SSL με το εσωτερικό `DATABASE_URL` του Railway. Αν συνδεθείς εξωτερικά, βάλε `DATABASE_SSL=true`.

---

## Google Maps API key
Google Cloud Console → APIs & Services → ενεργοποίησε **Maps JavaScript API** (και προαιρετικά Geocoding). Δημιούργησε API key και βάλ' το στο `GOOGLE_MAPS_API_KEY`. Περιόρισέ το (HTTP referrers) στο domain σου.

## Εταιρικός mailserver (SMTP)
Συμπλήρωσε `SMTP_*`. Για TLS στη θύρα 465 βάλε `SMTP_SECURE=true`· για 587 (STARTTLS) `SMTP_SECURE=false`.

---

## Χρήση
- **Admin** (`/admin`): πρόσθεσε δρομολόγια & στάσεις (κλικ στον χάρτη για πινέζα), δημιούργησε χρήστες (προσωπικό/οδηγούς), ανάθεσε δρομολόγια σε κάθε οδηγό, και στείλε δοκιμαστικά emails.
- **Προσωπικό** (`/staff`): επιλογή ημερομηνίας, Εργασία/Ρεπό, δρομολόγιο, στάση → η ώρα μπαίνει αυτόματα.
- **Οδηγός** (`/driver`): ημερομηνία, μετρικά, χάρτης με πινέζες, λίστα επιβατών ανά στάση, και ποιοι δεν δήλωσαν.

## Ρόλοι
`admin`, `staff` (προσωπικό), `driver` (οδηγός). Κάθε ρόλος βλέπει διαφορετική οθόνη μετά το login.

## Χρονοπρογραμματισμός
Οι εργασίες τρέχουν εντός της εφαρμογής (node-cron, `APP_TZ`). Με `ENABLE_CRON=false` απενεργοποιούνται. Μπορείς πάντα να στείλεις χειροκίνητα από το admin.

---

## Νέα χαρακτηριστικά
- **Auto-εύρεση πινέζας**: στο admin, στη φόρμα στάσης, γράψε διεύθυνση και πάτα «Βρες στον χάρτη» (Google Geocoder) — ή κλικ/σύρε την πινέζα. Μπορείς επίσης να αλλάξεις το δρομολόγιο μιας υπάρχουσας στάσης.
- **Export ημερήσιου προγράμματος** (κουμπιά στην οθόνη οδηγού):
  - `/driver/print?date=YYYY-MM-DD` — εκτυπώσιμη σελίδα (Αποθήκευση ως PDF από τον browser)
  - `/driver/export.pdf?date=YYYY-MM-DD` — έτοιμο PDF (ελληνικά, ενσωματωμένη γραμματοσειρά)
  - `/driver/export.csv?date=YYYY-MM-DD` — CSV (UTF-8 με BOM, ανοίγει σωστά σε Excel)

## Στοιχεία SMTP (CONDIAN)
Προ-συμπληρωμένα στο `.env.example`: `SMTP_HOST=condian.gr`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER=report@condian.gr`. Βάλε μόνο το `SMTP_PASS` ως μεταβλητή στο Railway (όχι στον κώδικα).

---

## Branding (CONDIAN)
Παλέτα: `#193847` (navy), `#BB9549` (χρυσό), `#3CA9AF` (teal), `#3C56A6` (indigo), `#275671` (deep teal), `#3F7DA3` (steel). Εφαρμόζεται σε όλη την εφαρμογή, στα PDF και στα emails.

**Λογότυπο**: ρίξε τα αρχεία σου στον φάκελο `public/`:
- `public/logo.png` — για λευκό φόντο (οθόνη σύνδεσης)
- `public/logo-white.png` — εκδοχή για σκούρο φόντο (πάνω μπάρα)

Αν δεν υπάρχουν, εμφανίζεται αυτόματα ένα διακριτικό `logo-mark.svg` στα χρώματα CONDIAN ως placeholder.

## Νέες δυνατότητες (αυτός ο γύρος)
- **Προφίλ χρήστη** (`/profile`, όλοι οι ρόλοι): email & κινητό επικοινωνίας, επιλογή **αγαπημένου δρομολογίου** (προεπιλογή στη δήλωση, με δυνατότητα αλλαγής).
- **Όριο θέσεων ανά δρομολόγιο** (προεπιλογή **9**, ρυθμιζόμενο στο admin). Η δήλωση μπλοκάρεται όταν γεμίσει· οι διαθέσιμες θέσεις φαίνονται live.
- **PDF προγράμματος συνημμένο** στα emails των οδηγών (23:00).
- **Στατιστικά** (`/admin/stats`): ανά δρομολόγιο & προσωπικό, μέσοι όροι αξιολογήσεων, ανά οδηγό, πρόσφατα σχόλια.
- **Ερωτήματα & αξιολογήσεις** (`/feedback`): το προσωπικό υποβάλλει ερωτήματα και αξιολογεί **δρομολόγιο + οδηγό + όχημα** (1-5). Ο admin τα βλέπει και απαντά (`/admin/questions`).

## Branding από το admin (μόνιμο)
Στο `/admin` → «Branding»:
- **Χρώματα**: επιλογή των 6 χρωμάτων με color pickers· εφαρμόζονται άμεσα σε όλη την εφαρμογή, στα PDF και στα emails.
- **Λογότυπα**: ανέβασμα `logo` (λευκό φόντο), `logo-white` (σκούρο φόντο/μπάρα), `favicon`.

Χρώματα & λογότυπα αποθηκεύονται **στη βάση** (πίνακες `settings`/`assets`), οπότε **παραμένουν** ακόμη και μετά από νέο deploy στο Railway (σε αντίθεση με αρχεία στο filesystem). Σερβίρονται από `/brand.css`, `/brand/logo`, `/brand/logo-white`, `/brand/favicon`. Αν δεν έχει ανέβει κάτι, χρησιμοποιούνται τα προεπιλεγμένα αρχεία στο `public/`.

## Email troubleshooting
Η αποστολή δοκιμάζει αυτόματα πολλαπλές ρυθμίσεις SMTP με τη σειρά: την προκαθορισμένη (`SMTP_PORT`/`SMTP_SECURE`), μετά `587/STARTTLS`, μετά `465/SSL`, και για κάθε μία δοκιμάζει `SMTP_HOST` και `mail.<host>`. Χρησιμοποιεί ανεκτικό TLS και timeouts 8s. Η πρώτη που δουλεύει «κλειδώνεται» (cache).

Στο admin → «Δοκιμαστικό email»: βάλε μια διεύθυνση, πάτα αποστολή, και βλέπεις στην οθόνη είτε «στάλθηκε (μέσω host:port)» είτε το ακριβές σφάλμα.

## Αποστολή μέσω Microsoft 365 (Graph / OAuth2) — προτεινόμενο
Αν ο tenant έχει MFA (χωρίς app passwords), το Basic SMTP δεν δουλεύει. Χρησιμοποίησε Microsoft Graph:
1. Entra admin (entra.microsoft.com) → **App registrations → New registration** (π.χ. «CONDIAN Transfers Mailer»), Single tenant.
2. **API permissions → Add → Microsoft Graph → Application permissions → Mail.Send** → **Grant admin consent**.
3. **Certificates & secrets → New client secret** → αντίγραψε την τιμή (Value).
4. Από την Overview πάρε **Application (client) ID** και **Directory (tenant) ID**.
5. (Συνιστάται) Περιόρισε την εφαρμογή να στέλνει μόνο από το info@condianhotels.gr με **Application Access Policy** (PowerShell: `New-ApplicationAccessPolicy`).
6. Railway Variables:
   - `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`
   - `GRAPH_SENDER=info@condianhotels.gr`
   - `MAIL_FROM=CONDIAN Hotels <info@condianhotels.gr>`
Όταν οριστεί το `GRAPH_CLIENT_ID`, η εφαρμογή στέλνει μέσω Graph (το SMTP αγνοείται). Δεν χρειάζονται κωδικοί/app passwords.

## Αυτο-εγγραφή προσωπικού (/register)
- Στο admin → «Κωδικός εγγραφής» όρισε έναν κωδικό (π.χ. CONDIAN2026). Κενό = απενεργοποιημένη εγγραφή.
- Μοίρασε στο προσωπικό τον σύνδεσμο `<PUBLIC_URL>/register` και τον κωδικό.
- Ο νέος εγγράφεται (ρόλος «προσωπικό») και ο λογαριασμός μένει **ανενεργός** μέχρι να τον **εγκρίνει admin ή superuser** (admin → «Εγκρίσεις εγγραφών» → Έγκριση/Απόρριψη).
- Οι οδηγοί/admin/superuser δημιουργούνται πάντα από τον admin (δεν προκύπτουν από αυτο-εγγραφή).

## Theme editor (πλήρες εικαστικό)
admin → «Θέμα εφαρμογής»: ξεχωριστά χρώματα ανά στοιχείο (μπάρα, κουμπιά, links, κεφαλίδες πινάκων, φόντο, footer), γραμματοσειρά, μέγεθος βάσης, στρογγυλεμένες γωνίες, ύψος λογοτύπου, τίτλος εφαρμογής, κείμενο footer, μήνυμα σύνδεσης, εμφάνιση/απόκρυψη τίτλου, και πεδίο **Custom CSS**. Υπάρχει **live preview** πριν την αποθήκευση. Όλα αποθηκεύονται στη βάση (πίνακας settings, κλειδιά theme_*) και σερβίρονται μέσω `/brand.css`. (Τα 6 «brand χρώματα» παραμένουν για PDF/email/λογότυπο.)

## Ειδοποιήσεις ανά χρήστη
Κάθε χρήστης (προσωπικό/οδηγός) ορίζει από το **Προφίλ** αν λαμβάνει email και **τι ώρα**. Ο scheduler τρέχει ανά λεπτό και στέλνει στον καθένα στην ώρα του (προεπιλογές: προσωπικό 18:00 για υπενθύμιση δήλωσης, οδηγοί 23:00 για το πρόγραμμα παραλαβών με PDF). Οι παλιές μεταβλητές STAFF_REMINDER_CRON/DRIVER_SUMMARY_CRON δεν χρησιμοποιούνται πλέον· για ολική απενεργοποίηση χρησιμοποίησε `ENABLE_CRON=false`.

## Rename δρομολογίων
admin → Δρομολόγια: κάθε δρομολόγιο έχει πεδίο ονόματος με «Μετονομασία».
