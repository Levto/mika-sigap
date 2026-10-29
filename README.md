# MIKA SIGAP - Sistem Integrasi Aduan dan Pertanyaan

Panduan menjalankan aplikasi web ini di Windows dan Debian 13 Linux.

## Yang Dibutuhkan (Semua Platform)

- Node.js versi 22.5 atau lebih baru (menggunakan SQLite bawaan Node.js, tidak perlu database terpisah)
- Koneksi internet saat pertama kali memasang paket aplikasi (`npm install`)
- File logo `logo_mika_sigap_high_resolution.png` berada di folder utama proyek

---

## Menjalankan di Windows (PowerShell)

1. **Pasang Node.js**
   - Buka PowerShell sebagai pengguna biasa.
   - Periksa apakah Windows Package Manager tersedia:
     ```powershell
     winget --version
     ```
   - Pasang Node.js versi LTS (npm ikut terpasang):
     ```powershell
     winget install --id OpenJS.NodeJS.LTS --exact
     ```
   - Tutup dan buka kembali PowerShell, lalu periksa versi:
     ```powershell
     node --version
     npm --version
     ```
   - Pastikan Node.js versi 22.5 atau lebih baru. Jika `winget` tidak tersedia, unduh installer LTS dari [nodejs.org](https://nodejs.org/).

2. **Masuk ke folder aplikasi**
   ```powershell
   cd .\webapp
   ```

3. **Pasang paket aplikasi**
   ```powershell
   npm install
   ```

4. **Jalankan aplikasi**
   ```powershell
   npm start
   ```

5. **Buka di browser**
   Buka [http://localhost:3000](http://localhost:3000)

Biarkan terminal tetap terbuka. Tekan **Ctrl+C** untuk menghentikan aplikasi.

### Menggunakan port lain (Windows)

Jika port 3000 sedang digunakan:
```powershell
$env:PORT = 3001
npm start
```
Buka [http://localhost:3001](http://localhost:3001).

---

## Menjalankan di Debian 13 Linux (via run-debian13.sh)

1. **Buka terminal** di folder utama proyek (folder yang berisi `run-debian13.sh` dan `webapp/`).

2. **Berikan izin eksekusi** pada script:
   ```bash
   chmod +x run-debian13.sh
   ```

3. **Jalankan script**:
   ```bash
   bash ./run-debian13.sh
   ```

Script akan:
- Memeriksa Node.js versi 22.5+; jika belum ada, memasang Node.js 24 melalui nvm di folder home pengguna (tanpa `sudo`).
- Memasang paket npm yang diperlukan (`npm ci`).
- Menjalankan aplikasi di `0.0.0.0:3000`, sehingga perangkat lain di jaringan sama dapat terhubung.

Biarkan terminal tetap terbuka. Tekan **Ctrl+C** untuk menghentikan.

4. **Buka di browser**
   Dari perangkat lain di jaringan yang sama, buka:
   ```
   http://ALAMAT-IP-SERVER:3000
   ```
   Contoh: `http://192.168.1.50:3000`

   Cari alamat IP server dengan:
   ```bash
   hostname -I
   ```

5. **Menggunakan port lain**
   ```bash
   PORT=3001 bash ./run-debian13.sh
   ```
   Buka `http://ALAMAT-IP-SERVER:3001`.

### Catatan Keamanan (Debian)
- Izinkan koneksi TCP ke port aplikasi di firewall server atau jaringan; script tidak mengubah firewall.
- Aplikasi ini tidak menyediakan login atau HTTPS. Jangan membuka portnya langsung ke internet publik; batasi akses pada jaringan tepercaya.

---

## Struktur Folder

```
mika-sigap/
├── README.md
├── run-debian13.sh
├── logo_mika_sigap_high_resolution.png
├── parallax-bg.jpg
└── webapp/
    ├── server.mjs
    ├── app.js
    ├── styles.css
    ├── index.html
    ├── package.json
    ├── package-lock.json
    ├── chart.umd.js (node_modules)
    ├── uploads/            (gambar pendukung aduan disimpan di sini)
    └── entries.sqlite      (database lokal, dibuat otomatis)
```

Data aduan disimpan di `webapp/entries.sqlite` dan tetap tersimpan setelah aplikasi dihentikan. Jangan menghapus atau mengganti nama file logo.
