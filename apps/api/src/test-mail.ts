import "dotenv/config";
import { sendSmtpTest } from "./mail.js";

try {
  const recipient = await sendSmtpTest();
  console.log(`SMTP test email sent to ${recipient}.`);
} catch (error) {
  console.error("SMTP test failed:", (error as Error).message);
  process.exitCode = 1;
}
