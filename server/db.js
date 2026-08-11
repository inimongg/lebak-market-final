/**
 * Lapisan database Lebak.market — SQLite bawaan Node (node:sqlite).
 * File DB dibuat otomatis di server/data.db; hapus file itu untuk reset total.
 * Catatan: TIDAK ada data produk contoh — semua postingan berasal dari
 * pengguna asli yang terdaftar (100% real).
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

/* Lokasi DB: env DB_PATH > volume /data (Railway/Render) > folder server.
 * PENTING utk produksi: pasang Volume di Railway (mount path /data) agar
 * database TIDAK hilang setiap deploy — tanpa volume, filesystem di-reset. */
const DB_PATH = process.env.DB_PATH
  || (fs.existsSync('/data') ? '/data/data.db' : path.join(__dirname, 'data.db'));
console.log('🗄️  Database:', DB_PATH, DB_PATH.startsWith('/data') ? '(volume persisten ✓)' : '(EPHEMERAL — pasang Volume /data di Railway agar data awet!)');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL,
    kec TEXT NOT NULL,
    pass_hash TEXT NOT NULL,
    verified INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS otps (
    email TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    payload TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seller_id INTEGER NOT NULL REFERENCES users(id),
    cat TEXT NOT NULL,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    stock INTEGER NOT NULL,
    cond TEXT NOT NULL DEFAULT 'baru',
    loc TEXT NOT NULL,
    dist REAL NOT NULL,          -- warisan lama; kini jarak dihitung live via Haversine dari lat/lng
    lat REAL,                    -- posisi GPS penjual saat posting (fallback: titik pusat kecamatan)
    lng REAL,
    cod INTEGER NOT NULL DEFAULT 1,
    freeship INTEGER NOT NULL DEFAULT 0,
    lebak INTEGER NOT NULL DEFAULT 1,
    emoji TEXT NOT NULL DEFAULT '📦',
    g TEXT NOT NULL DEFAULT 'g-1',
    img TEXT,                    -- path foto produk (/uploads/xxx.jpg), NULL = tanpa foto
    descr TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS likes (
    user_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (user_id, product_id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    buyer_id INTEGER NOT NULL,
    seller_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    mode TEXT NOT NULL,           -- rekber | driver | cod
    method TEXT,
    method_id TEXT,
    price INTEGER NOT NULL,
    ship INTEGER NOT NULL DEFAULT 0,
    app_fee INTEGER NOT NULL DEFAULT 0,
    gateway_fee INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL,
    status TEXT NOT NULL,
    recv_name TEXT,
    recv_addr TEXT,
    meet_point TEXT,
    meet_time TEXT,
    va TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS order_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    status TEXT NOT NULL,
    note TEXT NOT NULL,
    at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL REFERENCES users(id),
    recipient_id INTEGER NOT NULL REFERENCES users(id),
    text TEXT NOT NULL,
    read INTEGER NOT NULL DEFAULT 0,
    at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS revenue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    amount INTEGER NOT NULL,
    at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    k TEXT PRIMARY KEY,
    v TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    descr TEXT NOT NULL DEFAULT '',
    reward INTEGER NOT NULL,         -- hadiah saldo (Rp) per orang yang di-ACC
    slots INTEGER NOT NULL DEFAULT 0,-- kuota peserta; 0 = tanpa batas
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quest_subs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quest_id INTEGER NOT NULL REFERENCES quests(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    proof TEXT,                      -- path screenshot bukti (opsional)
    note TEXT NOT NULL DEFAULT '',   -- keterangan/link dari pengerja
    status TEXT NOT NULL DEFAULT 'Menunggu ACC', -- Menunggu ACC | Disetujui | Ditolak
    at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS wallet_txns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL,          -- escrow_in | withdraw | purchase
    amount INTEGER NOT NULL,     -- + masuk, - keluar
    note TEXT NOT NULL DEFAULT '',
    order_id TEXT,
    at INTEGER NOT NULL
  );
`);

// Migrasi ringan untuk database lama (sebelum kolom img/lat/lng/dst ada)
try { db.exec('ALTER TABLE products ADD COLUMN img TEXT'); } catch {}
try { db.exec('ALTER TABLE products ADD COLUMN lat REAL'); } catch {}
try { db.exec('ALTER TABLE products ADD COLUMN lng REAL'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN cod_debt INTEGER NOT NULL DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN balance INTEGER NOT NULL DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE orders ADD COLUMN snap_token TEXT'); } catch {}
try { db.exec('ALTER TABLE orders ADD COLUMN pay_url TEXT'); } catch {}
try { db.exec('ALTER TABLE products ADD COLUMN ship_cost INTEGER'); } catch {} // ongkir tetap dari penjual (peternakan dll.)
try { db.exec("UPDATE products SET cat = 'ternak' WHERE cat = 'ikan'"); } catch {} // Ikan Hias → Peternakan
try { db.exec('ALTER TABLE orders ADD COLUMN pay_proof TEXT'); } catch {} // bukti transfer (pembayaran manual)
try { db.exec('ALTER TABLE orders ADD COLUMN vpay_id TEXT'); } catch {} // ID transaksi QRIS dinamis VPay

/* ==================================================================
 * TABEL REVIEWS — sistem rating & ulasan setelah pesanan selesai
 * Satu order cuma boleh direview 1x oleh pembeli (dicek via UNIQUE).
 * rating: 1-5 bintang. comment: opsional, boleh kosong.
 * ================================================================== */
db.exec(`
  CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL UNIQUE,
    product_id TEXT NOT NULL,
    seller_id TEXT NOT NULL,
    buyer_id TEXT NOT NULL,
    rating INTEGER NOT NULL,
    comment TEXT,
    created_at TEXT NOT NULL
  )
`);
db.exec('CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_reviews_seller ON reviews(seller_id)');
try { db.exec('ALTER TABLE users ADD COLUMN avatar TEXT'); } catch {} // foto profil
try { db.exec('ALTER TABLE products ADD COLUMN imgs TEXT'); } catch {} // galeri foto produk (JSON array path)
try { db.exec('ALTER TABLE orders ADD COLUMN buyer_hide INTEGER NOT NULL DEFAULT 0'); } catch {} // sembunyikan dari riwayat pembeli
try { db.exec('ALTER TABLE orders ADD COLUMN seller_hide INTEGER NOT NULL DEFAULT 0'); } catch {} // sembunyikan dari riwayat penjual
try { db.exec('ALTER TABLE products ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0'); } catch {} // soft-delete produk oleh penjual
try { db.exec('ALTER TABLE orders ADD COLUMN buyer_lat REAL'); } catch {} // titik GPS pembeli saat checkout (utk share-loc ke driver)
try { db.exec('ALTER TABLE orders ADD COLUMN buyer_lng REAL'); } catch {}
try { db.exec('ALTER TABLE wallet_txns ADD COLUMN status TEXT'); } catch {} // status penarikan: Diproses | Sukses

/* ==================================================================
 * FITUR: LUPA PASSWORD, LAPORKAN/BLOKIR PENGGUNA, RESOLUSI SENGKETA
 * ================================================================== */
try { db.exec('ALTER TABLE users ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN block_reason TEXT'); } catch {}
try { db.exec('ALTER TABLE orders ADD COLUMN dispute_reason TEXT'); } catch {} // alasan komplain dari pembeli
try { db.exec('ALTER TABLE orders ADD COLUMN dispute_note TEXT'); } catch {}   // catatan keputusan admin

db.exec(`
  CREATE TABLE IF NOT EXISTS password_resets (
    email TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id INTEGER NOT NULL REFERENCES users(id),
    reported_id INTEGER NOT NULL REFERENCES users(id),
    order_id TEXT,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Menunggu',   -- Menunggu | Ditindak | Ditolak
    at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS push_subs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

/* ==================================================================
 * BACKUP OTOMATIS DATABASE
 * ---------------------------------------------------------------
 * Kenapa perlu ini WALAUPUN sudah pasang Volume di Railway:
 * Volume cuma melindungi dari "data hilang pas redeploy". Volume
 * TIDAK melindungi dari: file database korup akibat bug, salah hapus
 * data secara tidak sengaja, atau volume itu sendiri kena masalah.
 * Backup ini bikin salinan snapshot .db terpisah tiap 24 jam,
 * disimpan di folder backups/ sebelah data.db, dan otomatis buang
 * yang lebih lama dari 7 hari (biar disk tidak penuh).
 *
 * Cara restore manual kalau suatu saat butuh:
 *   1. Matikan server
 *   2. Cari file terbaru di folder backups/ (nama ada tanggalnya)
 *   3. Copy & timpa file itu ke lokasi data.db yang asli
 *   4. Nyalakan lagi server
 * ================================================================== */
const BACKUP_DIR = path.join(path.dirname(DB_PATH), 'backups');
const BACKUP_KEEP_DAYS = 7;

function backupNow(){
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-'); // aman utk nama file
    const dest = path.join(BACKUP_DIR, `data-${stamp}.db`);
    // VACUUM INTO = snapshot konsisten dari SQLite (termasuk data yg masih
    // di WAL, belum ke-flush ke file utama) — lebih aman drpd fs.copyFile biasa.
    db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
    // beresin backup lama biar disk gak penuh
    const cutoff = Date.now() - BACKUP_KEEP_DAYS * 24 * 60 * 60 * 1000;
    for (const f of fs.readdirSync(BACKUP_DIR)){
      const full = path.join(BACKUP_DIR, f);
      if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
    }
    console.log('🗄️  Backup database tersimpan:', dest);
  } catch (err) {
    console.error('⚠️  Backup database gagal:', err.message);
  }
}
// backup pertama 2 menit setelah server nyala (biar gak ganggu startup),
// lalu berulang tiap 24 jam selama server hidup
setTimeout(backupNow, 2 * 60 * 1000);
setInterval(backupNow, 24 * 60 * 60 * 1000);

module.exports = db;
