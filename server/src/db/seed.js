/**
 * Seeds the database with demo accounts and a starter medication catalog.
 * Safe to run repeatedly: existing accounts are kept and medications are only
 * inserted when the catalog is empty.
 *
 * Usage: npm run db:seed
 *
 * Demo accounts (password in brackets):
 *   staff@pharmacy.com   (Staff123!)   - role: staff
 *   patient@example.com  (Patient123!) - role: patient
 */
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const userModel = require('../models/userModel');
const medicationModel = require('../models/medicationModel');
const { ROLES } = require('../../../shared/constants.json');

const DEMO_USERS = [
  { name: 'Pharmacy Staff', email: 'staff@pharmacy.com', password: 'Staff123!', role: ROLES.STAFF },
  { name: 'Demo Patient', email: 'patient@example.com', password: 'Patient123!', role: ROLES.PATIENT },
];

/** Returns a YYYY-MM-DD date `days` days from today. */
function dateFromToday(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const DEMO_MEDICATIONS = [
  { name: 'Paracetamol 500mg', category: 'Analgesic', quantity: 120, unit_price: 1.5, expiry_date: dateFromToday(400), supplier_info: 'Hikma Pharmaceuticals - +962 6 580 2900' },
  { name: 'Ibuprofen 400mg', category: 'Analgesic', quantity: 80, unit_price: 2.25, expiry_date: dateFromToday(300), supplier_info: 'Dar Al Dawa - orders@dad.jo' },
  { name: 'Amoxicillin 500mg', category: 'Antibiotic', quantity: 45, unit_price: 4.8, expiry_date: dateFromToday(200), supplier_info: 'Hikma Pharmaceuticals - +962 6 580 2900' },
  { name: 'Azithromycin 250mg', category: 'Antibiotic', quantity: 8, unit_price: 6.5, expiry_date: dateFromToday(150), supplier_info: 'JOSWE Medical - sales@joswe.com' },
  { name: 'Metformin 850mg', category: 'Antidiabetic', quantity: 60, unit_price: 3.1, expiry_date: dateFromToday(500), supplier_info: 'Dar Al Dawa - orders@dad.jo' },
  { name: 'Amlodipine 5mg', category: 'Antihypertensive', quantity: 35, unit_price: 2.9, expiry_date: dateFromToday(20), supplier_info: 'Pharma International - +962 6 402 1000' },
  { name: 'Omeprazole 20mg', category: 'Antacid', quantity: 0, unit_price: 3.75, expiry_date: dateFromToday(250), supplier_info: 'JOSWE Medical - sales@joswe.com' },
  { name: 'Cetirizine 10mg', category: 'Antihistamine', quantity: 90, unit_price: 1.2, expiry_date: dateFromToday(365), supplier_info: 'Hikma Pharmaceuticals - +962 6 580 2900' },
  { name: 'Salbutamol Inhaler', category: 'Respiratory', quantity: 15, unit_price: 8.0, expiry_date: dateFromToday(180), supplier_info: 'Pharma International - +962 6 402 1000' },
  { name: 'Vitamin D3 1000IU', category: 'Supplement', quantity: 200, unit_price: 5.5, expiry_date: dateFromToday(600), supplier_info: 'Dar Al Dawa - orders@dad.jo' },
];

async function seedUsers() {
  for (const user of DEMO_USERS) {
    const existing = await userModel.findByEmail(user.email);
    if (existing) {
      console.log(`  user ${user.email} already exists - skipped`);
      continue;
    }
    const passwordHash = await bcrypt.hash(user.password, 10);
    await userModel.create({ name: user.name, email: user.email, passwordHash, role: user.role });
    console.log(`  created ${user.role} account ${user.email}`);
  }
}

async function seedMedications() {
  const existing = await medicationModel.findAll();
  if (existing.length > 0) {
    console.log(`  medications table already has ${existing.length} rows - skipped`);
    return;
  }
  for (const med of DEMO_MEDICATIONS) await medicationModel.create(med);
  console.log(`  inserted ${DEMO_MEDICATIONS.length} medications`);
}

async function seed() {
  console.log('Seeding users...');
  await seedUsers();
  console.log('Seeding medications...');
  await seedMedications();
}

seed()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Seed failed:', err.message);
    process.exit(1);
  });
