export type EmailMessage = {
  from: string;
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
};

// HTTPS works on Render Free, whose standard SMTP ports are blocked.
export function resendTransport(apiKey: string) {
  return {
    async sendMail(message: EmailMessage) {
      const { replyTo, ...body } = message;
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...body,
          to: [body.to],
          ...(replyTo ? { reply_to: replyTo } : {}),
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok)
        throw new Error(
          `Email provider rejected the request (${response.status}).`,
        );
    },
  };
}
