'use strict';
/**
 * In-memory SQLite database powered by sql.js (pure JS/WASM).
 * Evidence data is static/read-only — loaded once on cold start.
 * All mutable state (game_state, overrides, submissions) lives in store.js.
 */
const path = require('path');

let _dbPromise = null;

function getDb() {
  if (_dbPromise) return _dbPromise;

  _dbPromise = (async () => {
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs({
      locateFile: f => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', f)
    });

    const db = new SQL.Database();

    // ── schema ──────────────────────────────────────────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS flight_telemetry (
        id INTEGER PRIMARY KEY, timestamp TEXT, latitude REAL, longitude REAL,
        altitude_ft INTEGER, airspeed_kts INTEGER, heading_deg INTEGER,
        anomaly_flag INTEGER DEFAULT 0, notes TEXT
      );
      CREATE TABLE IF NOT EXISTS passenger_manifest (
        passenger_id TEXT PRIMARY KEY, full_name TEXT, seat TEXT, class TEXT,
        nationality TEXT, boarding_time TEXT, ticket_no TEXT, special_notes TEXT
      );
      CREATE TABLE IF NOT EXISTS passport_database (
        passport_id TEXT PRIMARY KEY, passenger_id TEXT, full_name TEXT,
        nationality TEXT, dob TEXT, travel_history TEXT,
        flagged INTEGER DEFAULT 0, flag_reason TEXT
      );
      CREATE TABLE IF NOT EXISTS fuel_logs (
        id INTEGER PRIMARY KEY, timestamp TEXT, fuel_remaining_kg REAL,
        consumption_rate_kgh REAL, waypoint TEXT, expected_rate_kgh REAL,
        deviation_pct REAL, anomaly INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS atc_logs (
        id INTEGER PRIMARY KEY, timestamp TEXT, callsign TEXT,
        frequency_mhz TEXT, message TEXT, direction TEXT, flagged INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS insurance_claims (
        id INTEGER PRIMARY KEY, claim_id TEXT, policyholder TEXT,
        insured_party TEXT, policy_type TEXT, coverage_usd INTEGER,
        claim_date TEXT, claim_reason TEXT, status TEXT, notes TEXT
      );
      CREATE TABLE IF NOT EXISTS cargo_cctv (
        id INTEGER PRIMARY KEY, timestamp TEXT, person_id TEXT,
        person_name TEXT, zone TEXT, action TEXT,
        duration_sec INTEGER, authorized INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS medical_examiner (
        id INTEGER PRIMARY KEY, victim_id TEXT, victim_name TEXT, seat TEXT,
        time_of_death TEXT, cause_of_death TEXT, toxin_detected TEXT,
        toxin_source TEXT, delivery_method TEXT, examiner_notes TEXT
      );
    `);

    // ── seed evidence data ──────────────────────────────────────
    seedTelemetry(db);
    seedPassengers(db);
    seedPassports(db);
    seedFuel(db);
    seedATC(db);
    seedInsurance(db);
    seedCCTV(db);
    seedMedical(db);

    console.log('✅ sql.js evidence database ready (pure JS — no native bindings)');
    return db;
  })();

  return _dbPromise;
}

// ── query helper ────────────────────────────────────────────────
async function query(sql, params = []) {
  const db = await getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

// ── run (non-select) ────────────────────────────────────────────
async function run(sql) {
  const db = await getDb();
  db.run(sql);
}

module.exports = { getDb, query };

// ═══════════════════════════════════════════════════════════════
//  EVIDENCE SEED DATA
// ═══════════════════════════════════════════════════════════════

function seedTelemetry(db) {
  const rows = [
    [1,'2024-03-15 01:00:00',25.2048,55.2708,35000,480,312,0,'Departed DXB — normal cruise established'],
    [2,'2024-03-15 01:30:00',27.8000,50.1000,35000,482,314,0,'Passing Muscat FIR — all normal'],
    [3,'2024-03-15 02:00:00',30.1000,44.5000,35000,479,316,0,'Over Gulf of Oman — steady'],
    [4,'2024-03-15 02:30:00',32.4000,38.9000,35000,481,315,0,'Entering Turkish FIR'],
    [5,'2024-03-15 03:00:00',34.8000,33.2000,35000,480,318,0,'Mediterranean entry — clear weather'],
    [6,'2024-03-15 03:30:00',36.9000,27.8000,35000,483,317,0,'Athens FIR — cruising normally'],
    [7,'2024-03-15 03:44:00',37.8000,24.9000,34820,471,317,1,'ANOMALY: Altitude drop 180 ft — cabin pressure equalization detected'],
    [8,'2024-03-15 03:45:00',37.8200,24.8500,34800,469,317,1,'ANOMALY: Cargo hold pressure spike — possible door event'],
    [9,'2024-03-15 03:46:00',37.8500,24.8000,34870,472,317,1,'Altitude recovering — stabilising'],
    [10,'2024-03-15 03:47:00',37.8800,24.7500,35000,480,317,0,'Returned to cruise altitude — all systems nominal'],
    [11,'2024-03-15 04:00:00',38.9000,22.1000,35000,481,315,0,'Normal cruise resumed'],
    [12,'2024-03-15 04:12:00',40.1000,19.8000,35000,479,316,0,'Passenger emergency declared onboard'],
    [13,'2024-03-15 04:15:00',40.3000,19.4000,35000,477,314,1,'MAYDAY declared — requesting emergency divert Athens'],
    [14,'2024-03-15 05:00:00',37.9364,23.9475,5000,220,145,0,'Descending into LGAV Athens'],
    [15,'2024-03-15 05:30:00',37.9364,23.9475,0,0,0,0,'Landed ATH — emergency services on ground'],
  ];
  rows.forEach(r => db.run(
    'INSERT INTO flight_telemetry VALUES (?,?,?,?,?,?,?,?,?)', r
  ));
}

function seedPassengers(db) {
  const rows = [
    ['PAX001','Victor Harman','2A','Business','British','22:45','TK-40291-A','VICTIM — found unresponsive 04:12 UTC'],
    ['PAX002','Dr. Elena Vasquez','3B','Business','Spanish','22:47','TK-40291-B','Biochemist — declared research equipment in hold'],
    ['PAX003','James Okafor','4C','Business','Nigerian','22:43','TK-40291-C','Finance executive'],
    ['PAX004','Mei Lin Zhao','1A','First','Chinese','22:30','TK-40291-D','Diplomat — pre-cleared, full immunity'],
    ['PAX005','Ravi Krishnamurthy','12C','Economy','Indian','23:00','TK-40291-E','Software engineer'],
    ['PAX006','Aisha Al-Rashid','14B','Economy','Emirati','23:02','TK-40291-F','Student'],
    ['PAX007','Thomas Brennan','15A','Economy','Irish','22:58','TK-40291-G','Retired'],
    ['PAX008','Yuki Tanaka','16D','Economy','Japanese','23:05','TK-40291-H','Marine biologist — declared fugu research specimens in cargo container CONT-JP-007'],
    ['PAX009','Carlos Mendes','5A','Business','Brazilian','22:49','TK-40291-I','Pharmaceutical sales rep'],
    ['PAX010','Nadia Ostrova','3A','Business','Russian','22:51','TK-40291-J','Art dealer'],
  ];
  rows.forEach(r => db.run('INSERT INTO passenger_manifest VALUES (?,?,?,?,?,?,?,?)', r));
}

function seedPassports(db) {
  const rows = [
    ['PP-BRT-7734','PAX001','Victor Harman','British','1978-04-12','UAE(Mar-24),UAE(Jan-24),USA(Nov-23),SGP(Sep-23)',0,null],
    ['PP-ESP-4421','PAX002','Dr. Elena Vasquez','Spanish','1985-09-23','JPN(Feb-24),JPN(Nov-23),JPN(Jun-23),UAE(Mar-24),USA(Aug-23)',1,'FLAGGED: Three Japan trips in 9 months. Carries biochemistry research materials. Cross-ref cargo manifest CONT-JP-007.'],
    ['PP-NGA-8812','PAX003','James Okafor','Nigerian','1972-07-15','UAE(Mar-24),GBR(Jan-24),USA(Dec-23)',0,null],
    ['PP-CHN-0019','PAX004','Mei Lin Zhao','Chinese','1980-11-30','DIPLOMATIC — RESTRICTED',0,'Full diplomatic immunity — DXB clearance on file'],
    ['PP-IND-3356','PAX005','Ravi Krishnamurthy','Indian','1991-03-22','UAE(Mar-24),GBR(Oct-23)',0,null],
    ['PP-UAE-7741','PAX006','Aisha Al-Rashid','Emirati','2001-06-14','GBR(Mar-24)',0,null],
    ['PP-IRL-2289','PAX007','Thomas Brennan','Irish','1956-08-03','UAE(Feb-24)',0,null],
    ['PP-JPN-5504','PAX008','Yuki Tanaka','Japanese','1988-12-05','UAE(Mar-24),GBR(Jul-23),AUS(Mar-23)',1,'FLAGGED: Declared Takifugu rubripes (tiger puffer fish) specimens for marine research. Tetrodotoxin source — customs notified.'],
    ['PP-BRA-6630','PAX009','Carlos Mendes','Brazilian','1983-05-17','UAE(Mar-24),USA(Jan-24),DEU(Sep-23)',0,null],
    ['PP-RUS-1198','PAX010','Nadia Ostrova','Russian','1979-02-28','UAE(Mar-24),UAE(Nov-23),CHE(Jul-23)',0,null],
  ];
  rows.forEach(r => db.run('INSERT INTO passport_database VALUES (?,?,?,?,?,?,?,?)', r));
}

function seedFuel(db) {
  const rows = [
    [1,'2024-03-15 01:00:00',82000,2850,'DXB-DEP',2850,0.0,0],
    [2,'2024-03-15 01:30:00',80580,2840,'OMAA-FIR',2840,0.0,0],
    [3,'2024-03-15 02:00:00',79150,2860,'OOSA-FIR',2860,0.0,0],
    [4,'2024-03-15 02:30:00',77680,2940,'ORBB-FIR',2860,2.8,0],
    [5,'2024-03-15 03:00:00',76200,2960,'LTBB-FIR',2860,3.5,0],
    [6,'2024-03-15 03:30:00',74700,3100,'LGGG-ENTRY',2860,8.4,1],
    [7,'2024-03-15 03:44:00',74020,3890,'LGGG-MED',2860,35.7,1],
    [8,'2024-03-15 03:45:00',73960,4120,'LGGG-MED',2860,44.1,1],
    [9,'2024-03-15 03:46:00',73900,3200,'LGGG-MED',2860,11.9,1],
    [10,'2024-03-15 03:47:00',73840,2870,'LGGG-MED',2860,0.3,0],
    [11,'2024-03-15 04:00:00',73450,2855,'LGGG-FIR',2860,-0.2,0],
    [12,'2024-03-15 04:15:00',72920,2840,'LGGG-FIR',2860,0.0,0],
    [13,'2024-03-15 04:30:00',72400,3100,'ATH-DIVERT',2860,8.4,1],
    [14,'2024-03-15 05:00:00',68900,8200,'ATH-DESCENT',7000,17.1,1],
    [15,'2024-03-15 05:30:00',61800,0,'ATH-LANDED',0,0.0,0],
  ];
  rows.forEach(r => db.run(
    'INSERT INTO fuel_logs (id,timestamp,fuel_remaining_kg,consumption_rate_kgh,waypoint,expected_rate_kgh,deviation_pct,anomaly) VALUES (?,?,?,?,?,?,?,?)', r
  ));
}

function seedATC(db) {
  const rows = [
    [1,'2024-03-15 00:55:00','F404','121.9','F404 requesting pushback clearance, gate B12 Dubai','OUTBOUND',0],
    [2,'2024-03-15 01:02:00','F404','118.75','F404 cleared FL350 via EMERU departure','OUTBOUND',0],
    [3,'2024-03-15 01:30:00','F404','132.4','F404 FL350 — estimating GOMTU 02:15Z','OUTBOUND',0],
    [4,'2024-03-15 02:00:00','F404','125.6','F404 requesting minor weather deviation 5 degrees north','OUTBOUND',0],
    [5,'2024-03-15 03:00:00','F404','133.2','F404 entering Athens FIR FL350 — estimating ADOLA 03:48Z','OUTBOUND',0],
    [6,'2024-03-15 03:44:00','F404','126.8','F404 SELCAL check — crew notified of minor pressure equalization, no emergency','INBOUND',0],
    [7,'2024-03-15 03:52:00','F404','130.5','[INFLIGHT PHONE LOG] Seat 3B outgoing call → +34-91-XXX-XXXX (Madrid, ESP) — Content: "Package has been delivered. Please confirm receipt."','INTERNAL',1],
    [8,'2024-03-15 04:10:00','F404','121.5','F404 declaring PAN PAN — passenger unresponsive, doctor on board assisting','OUTBOUND',0],
    [9,'2024-03-15 04:15:00','F404','121.5','F404 upgrading to MAYDAY — passenger condition critical, requesting emergency divert Athens LGAV','OUTBOUND',1],
    [10,'2024-03-15 04:16:00','LGGG','121.5','F404 cleared direct LGAV — emergency services on standby, runway 03L clear','INBOUND',0],
    [11,'2024-03-15 04:45:00','F404','119.1','F404 descending FL100 — passenger pronounced deceased at 04:15Z — police requested','OUTBOUND',1],
    [12,'2024-03-15 05:30:00','F404','118.3','F404 on ground Athens — forensics and homicide team on site','OUTBOUND',0],
  ];
  rows.forEach(r => db.run(
    'INSERT INTO atc_logs VALUES (?,?,?,?,?,?,?)', r
  ));
}

function seedInsurance(db) {
  const rows = [
    [1,'CLM-2024-001','Dr. Elena Vasquez','Victor Harman','Life Insurance — Business Partner',2000000,'2024-03-16','Death of insured party','PENDING','Filed 19 hours post-death — same day as Athens landing. Policy issued 6 months prior by Vasquez as sole beneficiary.'],
    [2,'CLM-2024-002','Victor Harman Estate','Victor Harman','Travel Insurance',50000,'2024-03-16','Death during international travel','PENDING','Standard estate claim.'],
    [3,'CLM-2024-003','James Okafor','James Okafor','Travel Delay',1200,'2024-03-16','Flight diversion — Athens','APPROVED','Standard delay claim — approved.'],
    [4,'CLM-2023-441','Dr. Elena Vasquez','Research Assets','Cargo Insurance — Specimens',85000,'2023-11-20','Loss of research specimens in transit','CLOSED','Prior claim: similar specimen loss on Japan→Spain route. Tetrodotoxin-bearing cargo.'],
    [5,'CLM-2024-004','Yuki Tanaka','Research Specimens','Cargo Insurance',12000,'2024-03-16','Specimens accessed/tampered','PENDING','CONT-JP-007 contents disturbed mid-flight. Cross-ref CLM-2024-001 person of interest.'],
  ];
  rows.forEach(r => db.run(
    'INSERT INTO insurance_claims VALUES (?,?,?,?,?,?,?,?,?,?)', r
  ));
}

function seedCCTV(db) {
  const rows = [
    [1,'2024-03-15 00:30:00','CREW-01','Loading Officer Patel','CARGO-FWD','Loading containers per manifest',1800,1],
    [2,'2024-03-15 00:45:00','CREW-01','Loading Officer Patel','CARGO-FWD','Manifest sign-off — all containers sealed and secured',300,1],
    [3,'2024-03-15 02:15:00','CREW-02','Cabin Crew Hassan','CARGO-FWD','Crew rest supplies retrieval — authorised',180,1],
    [4,'2024-03-15 03:43:00','PAX002','Dr. Elena Vasquez','CARGO-FWD','Accessed cargo hold — stated: checking personal medical equipment',127,0],
    [5,'2024-03-15 03:44:00','PAX002','Dr. Elena Vasquez','CARGO-FWD','Opened container CONT-JP-007 (Tanaka fugu specimens)',45,0],
    [6,'2024-03-15 03:45:15','PAX002','Dr. Elena Vasquez','CARGO-DOOR','Moved to cargo door area — UNAUTHORISED ZONE',30,0],
    [7,'2024-03-15 03:46:00','PAX002','Dr. Elena Vasquez','CARGO-EXIT','Exited cargo hold — carrying small item (not declared)',0,0],
    [8,'2024-03-15 03:55:00','PAX002','Dr. Elena Vasquez','GALLEY-FWD','Requested ice from galley attendant — reason: migraine',90,1],
    [9,'2024-03-15 04:00:00','PAX001','Victor Harman','GALLEY-FWD','Accepted drink from galley — interaction with PAX002 observed',120,1],
    [10,'2024-03-15 04:12:00','CREW-03','Crew — Sgt. Williams','SEAT-2A','Passenger 2A unresponsive — emergency protocol initiated',0,1],
  ];
  rows.forEach(r => db.run(
    'INSERT INTO cargo_cctv VALUES (?,?,?,?,?,?,?,?)', r
  ));
}

function seedMedical(db) {
  db.run(`INSERT INTO medical_examiner VALUES (
    1,'PAX001','Victor Harman','2A','2024-03-15 04:15:00 UTC',
    'Acute respiratory failure secondary to neurotoxin poisoning',
    'Tetrodotoxin (TTX) — blood serum concentration 12.8 μg/L (lethal threshold: 2 μg/L)',
    'Takifugu rubripes (Tiger Puffer Fish) — matches specimens in cargo container CONT-JP-007 per DNA assay',
    'Oral ingestion via contaminated beverage — estimated 30–45 minutes prior to death onset',
    'Toxin extracted from cargo hold 03:43–03:46 UTC. Victim consumed galley beverage at 04:00 UTC. Onset ~04:10 UTC. Death 04:15 UTC. CONCLUSION: Premeditated poisoning. PRIME SUSPECT: Individual with (a) access to cargo hold between 03:43–03:46 UTC, (b) biochemical knowledge of tetrodotoxin, (c) proximity to victim at beverage consumption 04:00 UTC, and (d) financial motive. All four criteria satisfied by: DR. ELENA VASQUEZ — PAX002, seat 3B, biochemist, filed $2,000,000 life insurance claim on Victor Harman the following morning.'
  )`);
}
