export const sendBookingNotification = async (recipientNumber, message) => {
    const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;
    const WHATSAPP_SENDER_PHONE_ID = process.env.WHATSAPP_SENDER_PHONE_ID;

    console.log("--- SIMULATING WHATSAPP NOTIFICATION ---");
    console.log(`To: ${recipientNumber}`);
    console.log(`Message: ${message}`);
    console.log("----------------------------------------");

    if (!WHATSAPP_API_TOKEN || !WHATSAPP_SENDER_PHONE_ID) {
        console.warn("WhatsApp API credentials not found in .env file. Skipping actual API call.");
    }
};
