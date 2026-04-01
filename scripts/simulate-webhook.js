const crypto = require('crypto');
const http = require('http');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables dari .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const orderId = process.argv[2];
const grossAmount = process.argv[3] || "150000"; // default: 150000

if (!orderId) {
    console.log("=========================================");
    console.log("❌ EROR: Order ID tidak disediakan.");
    console.log("CARA PENGGUNAAN:");
    console.log("  node scripts/simulate-webhook.js <ORDER_ID> [JUMLAH]");
    console.log("Contoh:");
    console.log("  node scripts/simulate-webhook.js BARBER-XXXX-12345 150000");
    console.log("=========================================\n");
    process.exit(1);
}

const serverKey = process.env.MIDTRANS_SERVER_KEY;
if (!serverKey) {
    console.log("❌ ERROR: MIDTRANS_SERVER_KEY tidak ditemukan di .env.local");
    process.exit(1);
}

const statusCode = "200";

// Generate signature sesuai Midtrans docs
// SHA512(order_id + status_code + gross_amount + server_key)
const signature = crypto
    .createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest('hex');

const payload = JSON.stringify({
    order_id: orderId,
    status_code: statusCode,
    gross_amount: grossAmount,
    signature_key: signature,
    transaction_status: "settlement",
    payment_type: "qris",
    fraud_status: "accept"
});

console.log("Mengirim simulasi Webhook Midtrans ke localhost:3000...");
console.log(`Order ID: ${orderId}`);
console.log(`Amount: ${grossAmount}`);
console.log(`Signature: ${signature}\n`);

const req = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/billing/webhook',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
    }
}, (res) => {
    console.log(`STATUS HTTP: ${res.statusCode}`);
    let data = '';
    
    res.on('data', (chunk) => {
        data += chunk;
    });
    
    res.on('end', () => {
        console.log(`RESPONSE BODY: ${data}`);
        console.log("\n✅ Simulasi Webhook selesai. Silakan cek dashboard aplikasi.");
    });
});

req.on('error', (e) => {
    console.error("❌ Gagal mengirim webhook:");
    console.error(e.message);
    console.log("Pastikan server Next.js sedang berjalan di port 3000.");
});

req.write(payload);
req.end();
