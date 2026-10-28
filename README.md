# Menjalankan Aplikasi Aduan

Panduan ini untuk menjalankan aplikasi di Windows dengan PowerShell.

## Yang Dibutuhkan

- Node.js versi 22.5 atau lebih baru. Node.js juga memasang npm, alat yang dipakai untuk memasang paket aplikasi.
- Koneksi internet saat pertama kali memasang paket.

Jika Node.js belum ada, unduh dan pasang versi LTS dari [nodejs.org](https://nodejs.org/). Setelah pemasangan selesai, tutup lalu buka kembali VS Code.

## Menjalankan di Debian 13 Tanpa sudo

Dari folder utama proyek pada server Debian 13, jalankan sebagai pengguna biasa (bukan `root`):

```bash
bash ./run-debian13.sh
```

Script ini memakai Node.js 22.5 atau lebih baru jika sudah tersedia. Jika belum, script memasang Node.js 24 melalui nvm di folder home pengguna, tanpa `sudo`. Pada penggunaan pertama, koneksi internet diperlukan untuk mengunduh Node.js atau paket aplikasi. Script memasang paket npm yang belum tersedia, lalu menjalankan aplikasi di port 3000 dengan binding `0.0.0.0`, sehingga perangkat lain dapat terhubung melalui alamat IP server. Biarkan terminal tetap terbuka; tekan **Ctrl+C** untuk menghentikannya.

Cari alamat IP LAN server dengan `hostname -I`, lalu buka `http://ALAMAT-IP-SERVER:3000` dari perangkat di jaringan yang sama, misalnya `http://192.168.1.50:3000`. Izinkan koneksi TCP ke port aplikasi di firewall server atau jaringan menggunakan pengaturan administrator/jaringan; script tidak mengubah firewall. Batasi akses ke jaringan tepercaya: aplikasi ini tidak menyediakan login atau HTTPS, jadi jangan membuka portnya langsung ke internet publik.

Untuk memakai port lain, misalnya 3001:

```bash
PORT=3001 bash ./run-debian13.sh
```

Jika port tersebut juga perlu diakses perangkat lain, izinkan port TCP yang dipilih di firewall dan buka `http://ALAMAT-IP-SERVER:3001`.

### Memasang Node.js dan npm dari Terminal Windows

1. Buka PowerShell sebagai pengguna biasa.
2. Periksa apakah Windows Package Manager tersedia:

   ```powershell
   winget --version
   ```

3. Pasang Node.js versi LTS. npm akan ikut terpasang:

   ```powershell
   winget install --id OpenJS.NodeJS.LTS --exact
   ```

   Jika diminta menyetujui persyaratan, baca dan setujui untuk melanjutkan pemasangan.
4. Tutup dan buka kembali PowerShell, lalu periksa pemasangan:

   ```powershell
   node --version
   npm --version
   ```

   Pastikan Node.js versi 22.5 atau lebih baru. Jika perintah `winget` tidak tersedia, gunakan installer LTS dari [nodejs.org](https://nodejs.org/).

## Langkah Menjalankan Aplikasi

1. Buka folder proyek ini di VS Code.
2. Buka terminal di VS Code dengan memilih **Terminal > New Terminal**.
3. Pastikan terminal berada di folder proyek utama, lalu masuk ke folder aplikasi:

   ```powershell
   cd .\webapp
   ```

4. Periksa versi Node.js dan npm:

   ```powershell
   node --version
   npm --version
   ```

   Pastikan versi Node.js adalah 22.5 atau lebih baru.

5. Pasang semua paket yang diperlukan:

   ```powershell
   npm install
   ```

   Perintah ini memasang Chart.js secara otomatis. SQLite sudah tersedia di Node.js, jadi tidak perlu memasang paket database terpisah.

6. Jalankan aplikasi:

   ```powershell
   npm start
   ```

7. Buka alamat ini di browser:

   [http://localhost:3000](http://localhost:3000)

Biarkan terminal tetap terbuka selama aplikasi digunakan. Untuk menghentikan aplikasi, pilih terminal lalu tekan **Ctrl+C**. Jalankan kembali dengan `npm start` saat ingin membukanya lagi.

## Paket Dan Data

- Chart.js dipasang oleh `npm install` berdasarkan daftar paket proyek.
- SQLite adalah fitur bawaan Node.js versi yang dibutuhkan.
- Data aduan disimpan di `webapp\entries.sqlite` dan tetap ada setelah aplikasi dihentikan.
- Logo aplikasi berada di folder proyek utama. Jangan pindahkan atau mengganti nama file logo.

Jika port 3000 sedang digunakan, jalankan aplikasi pada port lain:

```powershell
$env:PORT = 3001
npm start
```

Lalu buka [http://localhost:3001](http://localhost:3001).

## Deploy ke Proxmox LXC

Panduan alternatif ini menjalankan aplikasi di container Debian atau Ubuntu dengan Nginx sebagai reverse proxy. Server aplikasi menerima koneksi pada `0.0.0.0:3000`, tetapi firewall sebaiknya hanya mengizinkan koneksi ke port 80 melalui Nginx; jangan buka port 3000 jika memakai konfigurasi proxy ini.

### 1. Buat Container

1. Di antarmuka Proxmox, pilih **Create CT**.
2. Beri nama, misalnya `aduan-app`, dan pilih template Debian 13 atau Ubuntu 24.04.
3. Untuk awal, alokasikan sekitar 1 CPU, RAM 1 GB, dan disk 8 GB.
4. Pilih jaringan yang dapat dijangkau dari komputer pengguna. Gunakan DHCP tetap atau alamat IP tetap, lalu catat alamat IP container.
5. Setelah container dibuat, jalankan dan buka **Console** sebagai `root`.

### 2. Pasang Node.js, npm, Nginx, dan SSH

Jalankan perintah berikut di console container:

```bash
apt update
apt upgrade -y
apt install -y ca-certificates curl nginx openssh-server sudo
curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/nodesource_setup.sh
bash /tmp/nodesource_setup.sh
apt install -y nodejs
node --version
npm --version
```

Pastikan versi Node.js yang tampil setidaknya 22.5.

### 3. Buat Akun untuk Menjalankan Aplikasi

Buat akun bernama `aduan-deploy`. Perintah `adduser` akan meminta kata sandi dan beberapa informasi akun:

```bash
adduser aduan-deploy
usermod -aG sudo aduan-deploy
systemctl enable --now ssh nginx
```

### 4. Salin File Aplikasi ke Container

Di PowerShell pada komputer yang memiliki folder proyek, pastikan terminal berada di folder utama proyek, bukan di dalam `webapp`. Ganti alamat IP contoh dengan alamat container yang dicatat tadi:

```powershell
scp .\webapp\app.js .\webapp\index.html .\webapp\server.mjs .\webapp\styles.css .\webapp\package.json .\webapp\package-lock.json .\logo_mika_sigap_high_resolution.png aduan-deploy@192.168.1.50:/home/aduan-deploy/
```

Masukkan kata sandi akun `aduan-deploy` jika diminta. Setelah file selesai disalin, kembali ke **Proxmox Console sebagai root** untuk menyiapkan folder aplikasi dan mengatur kepemilikannya:

```bash
mkdir -p /opt/entry-register/webapp
cp /home/aduan-deploy/app.js /home/aduan-deploy/index.html /home/aduan-deploy/server.mjs /home/aduan-deploy/styles.css /home/aduan-deploy/package.json /home/aduan-deploy/package-lock.json /opt/entry-register/webapp/
cp /home/aduan-deploy/logo_mika_sigap_high_resolution.png /opt/entry-register/
chown -R aduan-deploy:aduan-deploy /opt/entry-register
su - aduan-deploy -c 'cd /opt/entry-register/webapp && npm ci'
```

Perintah salin ini sengaja tidak menyalin `entries.sqlite`. File database produksi tidak boleh tertimpa oleh salinan file aplikasi.

### 5. Atur Aplikasi agar Berjalan Otomatis

Buat layanan systemd. Salin seluruh blok berikut ke terminal container:

```bash
cat > /etc/systemd/system/entry-register.service <<'EOF'
[Unit]
Description=Entry Register Web App
After=network.target

[Service]
Type=simple
User=aduan-deploy
WorkingDirectory=/opt/entry-register/webapp
Environment=PORT=3000
ExecStart=/usr/bin/node /opt/entry-register/webapp/server.mjs
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now entry-register
systemctl status entry-register --no-pager
```

Jika status menunjukkan `active (running)`, aplikasi sudah berjalan. Dengan default host `0.0.0.0`, Nginx tetap dapat meneruskan permintaan melalui `127.0.0.1:3000`; gunakan firewall untuk mencegah klien jaringan mengakses port aplikasi secara langsung.

### 6. Atur Nginx

Nginx akan meneruskan permintaan web ke aplikasi di container yang sama:

```bash
cat > /etc/nginx/sites-available/entry-register <<'EOF'
server {
   listen 80 default_server;
   server_name _;

   location / {
      proxy_pass http://127.0.0.1:3000;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
   }
}
EOF

ln -sf /etc/nginx/sites-available/entry-register /etc/nginx/sites-enabled/entry-register
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

Jika `nginx -t` menampilkan `syntax is ok` dan `test is successful`, pengaturan Nginx valid.

### 7. Buka Aplikasi

Di pengaturan firewall Proxmox, izinkan koneksi masuk TCP port 80 ke container dari jaringan yang akan menggunakan aplikasi. Saat menyalin file melalui SCP, izinkan juga TCP port 22 dari komputer administrator; aturan port 22 dapat dibatasi kembali setelah penyalinan selesai. Buka browser dan masukkan alamat IP container, misalnya:

```text
http://192.168.1.50
```

Ganti alamat contoh dengan alamat IP container Anda. Jangan membuka port 3000 ke jaringan; Nginx yang menerima koneksi pada port 80 dan meneruskannya secara lokal.

### Memeriksa dan Memulai Ulang Layanan

```bash
systemctl status entry-register --no-pager
systemctl restart entry-register
systemctl status nginx --no-pager
```

### Memperbarui Aplikasi

Salin ulang file pada Langkah 4 dari PowerShell. Di console container sebagai `root`, salin file baru ke folder aplikasi, pasang paket, lalu mulai ulang layanan:

```bash
cp /home/aduan-deploy/app.js /home/aduan-deploy/index.html /home/aduan-deploy/server.mjs /home/aduan-deploy/styles.css /home/aduan-deploy/package.json /home/aduan-deploy/package-lock.json /opt/entry-register/webapp/
cp /home/aduan-deploy/logo_mika_sigap_high_resolution.png /opt/entry-register/
chown -R aduan-deploy:aduan-deploy /opt/entry-register
su - aduan-deploy -c 'cd /opt/entry-register/webapp && npm ci'
systemctl restart entry-register
```

Jangan hapus atau timpa `/opt/entry-register/webapp/entries.sqlite`; file tersebut berisi data aduan. Buat salinan cadangan secara berkala. Untuk penggunaan dari internet publik, siapkan HTTPS dan aturan firewall yang sesuai; jangan langsung meneruskan port 3000 atau membuka akses publik tanpa HTTPS.
