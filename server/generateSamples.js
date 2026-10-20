const fs = require('fs');
const path = require('path');

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const aadhaarSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380">
  <rect width="600" height="380" rx="16" fill="#ffffff" stroke="#d1d5db" stroke-width="2"/>
  <rect width="600" height="60" rx="16" fill="#ff9933"/>
  <rect y="340" width="600" height="40" rx="16" fill="#138808"/>
  <text x="300" y="38" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#ffffff" text-anchor="middle">GOVERNMENT OF INDIA - UNIQUE IDENTIFICATION AUTHORITY</text>
  <rect x="30" y="80" width="120" height="150" rx="8" fill="#e2e8f0" stroke="#94a3b8"/>
  <circle cx="90" cy="130" r="35" fill="#cbd5e1"/>
  <path d="M 50 210 Q 90 170 130 210 Z" fill="#cbd5e1"/>
  <text x="170" y="110" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#1e293b">NAME: ANIKET SHARMA</text>
  <text x="170" y="140" font-family="Arial, sans-serif" font-size="15" fill="#475569">DOB: 14/08/1998 | MALE</text>
  <text x="170" y="170" font-family="Arial, sans-serif" font-size="14" fill="#475569">ADDRESS: #42, 5th Cross, Koramangala, Bengaluru</text>
  <rect x="170" y="200" width="380" height="50" rx="6" fill="#f1f5f9"/>
  <text x="360" y="235" font-family="Courier, monospace" font-size="22" font-weight="bold" fill="#0f172a" text-anchor="middle" letter-spacing="4">XXXX - 8921 - 4402</text>
  <text x="300" y="310" font-family="Arial, sans-serif" font-size="14" font-style="italic" fill="#64748b" text-anchor="middle">Aadhaar - Identity Verification Card</text>
</svg>`;

const dlSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380">
  <rect width="600" height="380" rx="16" fill="#f8fafc" stroke="#0284c7" stroke-width="3"/>
  <rect width="600" height="55" rx="16" fill="#0284c7"/>
  <text x="300" y="36" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#ffffff" text-anchor="middle">INDIAN UNION MOTOR DRIVING LICENCE</text>
  <rect x="30" y="90" width="120" height="150" rx="8" fill="#e2e8f0" stroke="#94a3b8"/>
  <circle cx="90" cy="140" r="35" fill="#94a3b8"/>
  <path d="M 50 220 Q 90 180 130 220 Z" fill="#94a3b8"/>
  <text x="170" y="115" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#0f172a">DL NO: KA-01-2020-008924</text>
  <text x="170" y="145" font-family="Arial, sans-serif" font-size="14" fill="#334155">HOLDER: ANIKET SHARMA</text>
  <text x="170" y="175" font-family="Arial, sans-serif" font-size="14" fill="#334155">VALIDITY: 12/03/2040</text>
  <text x="170" y="205" font-family="Arial, sans-serif" font-size="14" fill="#334155">COV: MCWG (Two Wheeler) + Auto Commercial</text>
  <rect x="30" y="270" width="540" height="50" rx="8" fill="#e0f2fe" stroke="#7dd3fc"/>
  <text x="300" y="302" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#0369a1" text-anchor="middle">AUTHORISED COMMERCIAL RIDER LICENCE</text>
</svg>`;

const rcSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380">
  <rect width="600" height="380" rx="16" fill="#ffffff" stroke="#16a34a" stroke-width="2"/>
  <rect width="600" height="55" rx="16" fill="#15803d"/>
  <text x="300" y="36" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#ffffff" text-anchor="middle">CERTIFICATE OF REGISTRATION (FORM 23)</text>
  <text x="30" y="95" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#15803d">REGISTRATION NO: KA-02-ZZ-1204</text>
  <text x="30" y="130" font-family="Arial, sans-serif" font-size="14" fill="#334155">OWNER: ANIKET SHARMA</text>
  <text x="30" y="160" font-family="Arial, sans-serif" font-size="14" fill="#334155">CLASS OF VEHICLE: TWO WHEELER (MOTOR CYCLE)</text>
  <text x="30" y="190" font-family="Arial, sans-serif" font-size="14" fill="#334155">MAKER / MODEL: YAMAHA FZ-S FI (149 CC)</text>
  <text x="30" y="220" font-family="Arial, sans-serif" font-size="14" fill="#334155">CHASSIS NO: ME1RG0710K108XXXX</text>
  <text x="30" y="250" font-family="Arial, sans-serif" font-size="14" fill="#334155">FUEL TYPE: PETROL | BS-VI COMPLIANT</text>
  <rect x="30" y="295" width="540" height="45" rx="6" fill="#dcfce7"/>
  <text x="300" y="323" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#15803d" text-anchor="middle">COMMERCIAL FITNESS &amp; INSURANCE VALID UP TO 2028</text>
</svg>`;

fs.writeFileSync(path.join(uploadDir, 'sample_aadhaar.png'), aadhaarSvg);
fs.writeFileSync(path.join(uploadDir, 'sample_dl.png'), dlSvg);
fs.writeFileSync(path.join(uploadDir, 'sample_rc.png'), rcSvg);
console.log('Sample documents successfully generated in', uploadDir);
