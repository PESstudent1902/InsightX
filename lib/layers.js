'use strict';

const LAYERS = [
  { id: '1',  name: 'Flight Telemetry',   table: 'flight_telemetry',   unlockMins: 0,   icon: '✈',  desc: 'GPS coordinates, altitude, airspeed and anomaly flags for Flight 404.' },
  { id: '2',  name: 'Passenger Manifest', table: 'passenger_manifest', unlockMins: 30,  icon: '🪪',  desc: 'Full passenger list including seat assignments and boarding records.' },
  { id: '2b', name: 'Passport Database',  table: 'passport_database',  unlockMins: 30,  icon: '🛂',  desc: 'International travel history and customs flags for every passenger.' },
  { id: '3',  name: 'Fuel Logs',          table: 'fuel_logs',          unlockMins: 60,  icon: '⛽',  desc: 'Fuel consumption data with deviations from expected burn rate.' },
  { id: '4',  name: 'ATC Logs',           table: 'atc_logs',           unlockMins: 90,  icon: '📡',  desc: 'Air Traffic Control communications and in-flight phone records.' },
  { id: '5',  name: 'Insurance Claims',   table: 'insurance_claims',   unlockMins: 120, icon: '📋',  desc: 'Insurance policies and claims filed on and after the date of the incident.' },
  { id: '6',  name: 'Cargo CCTV',         table: 'cargo_cctv',         unlockMins: 150, icon: '🎥',  desc: 'Timestamped CCTV log of every person who accessed the cargo hold.' },
  { id: '7',  name: 'Medical Examiner',   table: 'medical_examiner',   unlockMins: 180, icon: '🔬',  desc: 'Autopsy results including cause of death, toxicology and forensic notes.' },
];

module.exports = { LAYERS };
