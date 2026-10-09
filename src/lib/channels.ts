// Message delivery. Every channel is in TEST mode (nothing leaves the computer) until a provider is configured.
//
// SMS, any Bangladeshi bulk-SMS gateway with an HTTP API:
//   SMS_API_URL=https://your-provider/api/send?apikey=XXX&to={to}&msg={message}
//   SMS_API_METHOD=GET (default) or POST
// SMS via Twilio:
//   SMS_PROVIDER=twilio  TWILIO_ACCOUNT_SID=...  TWILIO_AUTH_TOKEN=...  TWILIO_FROM=+1...
// Voice calls, any IVR provider with an HTTP API that reads text aloud:
//   VOICE_API_URL=https://your-ivr/api/call?key=XXX&to={to}&text={message}
// {to} becomes +8801XXXXXXXXX and {message} the URL-encoded Bangla text.

export type ChannelMode = "live" | "test";
export type SendResult = { ok: boolean; error?: string };

function fill(template: string, to: string, message: string) {
  return template.replace("{to}", encodeURIComponent(to)).replace("{message}", encodeURIComponent(message));
}

async function callTemplate(template: string, method: string, to: string, message: string): Promise<SendResult> {
  try {
    const res = await fetch(fill(template, to, message), { method });
    return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

const twilioReady = () =>
  process.env.SMS_PROVIDER === "twilio" && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM;

export const smsMode = (): ChannelMode => (twilioReady() || process.env.SMS_API_URL ? "live" : "test");
export const voiceMode = (): ChannelMode => (process.env.VOICE_API_URL ? "live" : "test");

export async function sendSms(to: string, message: string): Promise<SendResult> {
  if (twilioReady()) {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM!, Body: message }),
      });
      return res.ok ? { ok: true } : { ok: false, error: `Twilio ${res.status}` };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
  if (process.env.SMS_API_URL) return callTemplate(process.env.SMS_API_URL, process.env.SMS_API_METHOD ?? "GET", to, message);
  return { ok: true };
}

export async function sendVoice(to: string, message: string): Promise<SendResult> {
  if (process.env.VOICE_API_URL) return callTemplate(process.env.VOICE_API_URL, process.env.VOICE_API_METHOD ?? "GET", to, message);
  return { ok: true };
}
