# 🏁 AR Checkers Online (เกมหมากฮอสไทยออนไลน์ WebAR)

> **โครงงานวิชาวิทยาการคอมพิวเตอร์ (Computer Science Project)**  
> เกมหมากฮอสออนไลน์ 2 ผู้เล่น เล่นผ่านเว็บบราวเซอร์บนมือถือด้วยเทคโนโลยี WebAR (A-Frame + MindAR) โดยไม่ต้องติดตั้งแอปพลิเคชัน พร้อมหน้าจอฉาย QR Code สำหรับให้เพื่อนในห้องเรียนสแกนเล่นพร้อมกัน

---

## 📋 สารบัญ
1. [จุดเด่นและฟีเจอร์หลัก](#-จุดเด่นและฟีเจอร์หลัก)
2. [เทคโนโลยีที่ใช้ (Tech Stack)](#-เทคโนโลยีที่ใช้-tech-stack)
3. [โครงสร้างโปรเจกต์ (Project Structure)](#-โครงสร้างโปรเจกต์-project-structure)
4. [กติกาหมากฮอสไทย (Ruleset)](#-กติกาหมากฮอสไทย-ruleset)
5. [การติดตั้งและรันในเครื่อง (Local Setup)](#-การติดตั้งและรันในเครื่อง-local-setup)
6. [การทดสอบระบบ (Automated Tests)](#-การทดสอบระบบ-automated-tests)
7. [การรัน HTTPS ในห้องเรียนด้วย Ngrok / Cloudflare](#-การรัน-https-ในห้องเรียนด้วย-ngrok--cloudflare)
8. [คู่มือการ Deploy สู่ Cloud (Render / Railway)](#-คู่มือการ-deploy-สู่-cloud-render--railway)

---

## ✨ จุดเด่นและฟีเจอร์หลัก

- **WebAR Image Tracking**: ใช้กล้องมือถือส่องภาพมาร์กเกอร์ กระดาน 3D จะถูก Anchor วางลงบนโต๊ะจริงเสมือนนั่งเล่นด้วยกัน
- **โหมดสำรอง (Fallback 3D Mode)**: กระดาน 3D ลอยกลางจอ ไม่ต้องเปิดกล้อง หมุนดูได้ สบายใจเมื่อกล้องมีปัญหาตอนนำเสนอ
- **โหมดตาราง 2D (Classic Grid)**: สลับไปดูกริด 2D ได้ตลอดเวลา สถานะเกมซิงก์กันแบบเรียลไทม์ 100%
- **Server-Authoritative Architecture**: เซิร์ฟเวอร์เป็นศูนย์กลางในการตัดสินกฎกติกา ป้องกันการโกง ตรวจสอบตาเดิน บังคับกิน เลื่อนขั้นฮอส และสลับตา
- **ระบบจับคู่ด่วน (Matchmaking Queue)**: ผู้เล่นกด "⚡ จับคู่ด่วน" เซิร์ฟเวอร์จะจับคู่และสุ่มสี (ขาว/ดำ) ให้อัตโนมัติ
- **ระบบฉายโปรเจกเตอร์ในห้องเรียน (`/qr.html`)**: หน้าจอสำหรับฉายขึ้นโปรเจกเตอร์ มี QR Code ขนาดใหญ่ อัปเดต URL ได้แบบสดๆ และขั้นตอนการเล่น 3 ขั้น
- **รองรับทั้ง iPhone (Safari) และ Android (Chrome)**: ไม่ต้องโหลดแอป เสียบสาย หรือลงปลั๊กอินใดๆ

---

## 🛠 เทคโนโลยีที่ใช้ (Tech Stack)

| ส่วนประกอบ | เทคโนโลยี | รายละเอียด |
|---|---|---|
| **Backend Server** | Node.js + Express | ให้บริการ HTTP Web Server และ Static Assets |
| **Realtime Networking** | Socket.io | ส่งสถานะการเดินหมากและจับคู่แบบเรียลไทม์ (WebSockets) |
| **Game Rules Engine** | Pure JavaScript | ตรรกะหมากฮอสไทยแบบ Pure Function มี Unit Tests 43 เคส |
| **Frontend UI** | HTML5 + Modern CSS | Dark Glassmorphism ออกแบบเหมาะสำหรับจอมือถือแนวตั้ง |
| **3D Engine** | A-Frame (1.5.0) | สร้างกระดาน ทรงกระบอกหมาก มงกุฎฮอส และ Raycaster |
| **Augmented Reality** | MindAR (1.2.5) | Image Tracking บนบราวเซอร์ ตรวจจับภาพมาร์กเกอร์ |
| **QR Code Generator** | QRCode.js | สร้าง QR Code ฝั่ง Client-side แบบไม่ต้องพึ่ง API ภายนอก |

---

## 📁 โครงสร้างโปรเจกต์ (Project Structure)

```
ar-checkers-online/
├── server/
│   ├── index.js              # ทางเข้าเซิร์ฟเวอร์ Express, Socket.io, Matchmaking, Room State
│   └── game/
│       ├── rules.js          # กติกาหมากฮอสไทย (pure logic ไม่ผูกกับ socket/ui)
│       └── rules.test.js     # Unit tests 43 test cases (node --test)
├── public/
│   ├── index.html            # หน้าเล่นเกมหลัก (ตั้งชื่อ, ล็อบบี้, กระดาน 3D/AR/2D, Modals)
│   ├── qr.html               # หน้าจอฉายโปรเจกเตอร์ห้องเรียน (QR Code จอใหญ่)
│   ├── css/
│   │   └── style.css         # สไตล์ Dark Theme, Glassmorphism, เรดาร์คิว, แอนิเมชัน
│   ├── js/
│   │   ├── net.js            # ตัวกลางสื่อสาร Socket.io Client
│   │   ├── game3d.js         # A-Frame 3D Scene, ตัวหมาก, Raycaster, MindAR AR Mode
│   │   └── ui.js             # ควบคุม UI, DOM, LocalStorage, สลับโหมด 3D/AR/2D
│   └── assets/
│       ├── marker.png        # ภาพมาร์กเกอร์เป้าหมาย AR
│       └── marker.mind       # โมเดล Tracking ของ MindAR
├── test-matchmaking.js       # Automated Integration Test (จำลอง 2 ผู้เล่นจับคู่และเดินหมาก)
├── test-disconnect.js        # Automated Disconnect Test (ตรวจจับเมื่อคู่แข่งหลุด)
├── package.json
└── README.md
```

---

## ♟️ กติกาหมากฮอสไทย (Ruleset)

ตรรกะใน [server/game/rules.js](file:///server/game/rules.js) เขียนตามกติกามาตรฐานหมากฮอสไทย:

1. **กระดาน 8×8**: เดินเฉพาะช่องสีเข้ม เริ่มต้นฝั่งละ 8 ตัว (แถว 0-1 สำหรับดำ, แถว 6-7 สำหรับขาว) ฝ่ายขาวเดินก่อน
2. **เบี้ยธรรมดา**: เดินทแยงหน้า 1 ช่อง และกินได้เฉพาะทิศข้างหน้า (ห้ามกินถอยหลัง)
3. **บังคับกิน (Mandatory Capture)**: หากมีตาที่สามารถกินได้ **ต้องกินเท่านั้น** เดินธรรมดาไม่ได้
4. **กินต่อเนื่อง (Multi-Capture)**: หากกินแล้วตัวถัดไปยังกินต่อได้ ต้องกระโดดกินต่อเนื่องในตาเดียวกัน
5. **เลื่อนขั้นเป็นฮอส (Promotion)**: เมื่อเบี้ยเดินถึงแถวสุดท้ายของคู่แข่ง จะเลื่อนขั้นเป็น "ฮอส" 👑 ทันที และหยุดกินต่อเนื่องในตานั้น
6. **พลังของฮอส**: เดินทแยงได้ไกลทุกทิศทาง และกินได้ทั้งหน้า-หลัง (กระโดดข้ามลงช่องถัดไปทันทีแบบ Short Capture)
7. **การตัดสินแพ้ชนะ**: ฝ่ายที่หมากหมด หรือถึงตาเดินแต่ไม่มีตาเดินเหลือ จะเป็นฝ่ายแพ้

---

## 💻 การติดตั้งและรันในเครื่อง (Local Setup)

### ความต้องการของระบบ
- **Node.js**: เวอร์ชัน 18 ขึ้นไป (แนะนำ v20 หรือ v22)
- **NPM**: ติดตั้งมาพร้อมกับ Node.js

### ขั้นตอนการรัน

1. ติดตั้ง Dependencies:
   ```bash
   npm install
   ```

2. เริ่มต้นรันเซิร์ฟเวอร์:
   ```bash
   npm start
   ```
   *(หรือใช้ `npm run dev` เพื่อรันแบบ Auto-reload เมื่อแก้ไขโค้ด)*

3. เปิดเบราว์เซอร์:
   - **หน้าเล่นเกม**: [http://localhost:3000](http://localhost:3000)
   - **หน้าฉายโปรเจกเตอร์ QR**: [http://localhost:3000/qr.html](http://localhost:3000/qr.html)
   - **ภาพมาร์กเกอร์ AR**: [http://localhost:3000/assets/marker.png](http://localhost:3000/assets/marker.png)

---

## 🧪 การทดสอบระบบ (Automated Tests)

โปรเจกต์มีชุดทดสอบอัตโนมัติครบถ้วน:

### 1. ทดสอบตรรกะหมากฮอส (Unit Tests)
```bash
npm test
```
- ทดสอบกฎกติกาทั้งหมด 43 เคส (การเดิน, การกิน, การกินต่อเนื่อง, บังคับกิน, ฮอส, การเลื่อนขั้น, การตัดสินแพ้ชนะ)

### 2. ทดสอบระบบจับคู่และเล่นเกมจริง (E2E Integration Test)
```bash
npm run test:e2e
```
- จำลองการเชื่อมต่อของ 2 ไคลเอนต์ผ่าน Socket.io, ตั้งชื่อ, เข้าคิว, สุ่มสี, ส่งตาเดิน และขอยอมแพ้

---

## 🔒 การรัน HTTPS ในห้องเรียนด้วย Ngrok / Cloudflare

> **สำคัญมาก**: เบราว์เซอร์บนมือถือ (iOS Safari / Android Chrome) จะอนุญาตให้เว็บเข้าถึงกล้องสำหรับ **WebAR** ได้ก็ต่อเมื่อเว็บเป็น **HTTPS** (หรือ `localhost` บนเครื่องเดียวกันเท่านั้น)

หากต้องการนำเสนอในห้องเรียนโดยรันเซิร์ฟเวอร์จากโน้ตบุ๊กของคุณ ให้ใช้เครื่องมือ Forwarding ฟรีต่อไปนี้:

### ทางเลือกที่ 1: Cloudflare Tunnel (แนะนำ — ไม่ต้องสมัครสมาชิก)
1. ดาวน์โหลด [cloudflared](https://github.com/cloudflare/cloudflared/releases)
2. รันคำสั่ง:
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```
3. จะได้ URL แบบ `https://xxxx.trycloudflare.com`
4. เปิดหน้า [http://localhost:3000/qr.html](http://localhost:3000/qr.html) แล้วนำ URL นั้นไปใส่ในช่อง **"เปลี่ยน URL"** -> QR Code จะอัปเดตทันที เพื่อนทั้งห้องสามารถสแกนและเปิดกล้อง AR ได้เลย!

### ทางเลือกที่ 2: Ngrok
1. รันคำสั่ง:
   ```bash
   ngrok http 3000
   ```
2. คัดลอก URL แบบ `https://xxxx.ngrok-free.app` ไปใส่ในหน้า `/qr.html`

---

## 🚀 คู่มือการ Deploy สู่ Cloud (Render / Railway)

หากต้องการให้เกมออนไลน์ตลอด 24 ชั่วโมง มี HTTPS ให้ในตัวฟรี:

### การ Deploy บน Render (แนะนำ — ฟรี 100%)
1. อัปโหลดโปรเจกต์ขึ้น **GitHub Repository**
2. ไปที่ [Render.com](https://render.com) แล้วล็อกอินด้วย GitHub
3. กด **New +** -> เลือก **Web Service**
4. เลือก Repository ของคุณ
5. ตั้งค่าการ Build:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server/index.js`
   - **Instance Type**: `Free`
6. กด **Create Web Service**
7. เมื่อ Deploy เสร็จ จะได้ URL เช่น `https://ar-checkers.onrender.com` นำ URL นี้ไปเปิดและฉาย QR Code ได้ทันที!

### การ Deploy บน Railway
1. ไปที่ [Railway.app](https://railway.app)
2. กด **New Project** -> เลือก **Deploy from GitHub repo**
3. เลือก Repository ระบบจะตรวจจับ Node.js และเริ่ม Deploy ให้อัตโนมัติ
4. ไปที่แท็บ **Settings** -> ส่วน **Networking** กด **Generate Domain** จะได้ URL แบบ `https://xxxx.up.railway.app`

---

## 👥 ผู้พัฒนาและลิขสิทธิ์
- ผลงานนี้พัฒนาขึ้นเพื่อการศึกษาและการนำเสนอในชั้นเรียนวิชาวิทยาการคอมพิวเตอร์
- โค้ดทั้งหมดเปิดเผยภายใต้ใบอนุญาต [MIT License](LICENSE)
