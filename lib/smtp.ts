import "server-only";
import nodemailer from "nodemailer";

export type SmtpConnection = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
};

function transporter(config: SmtpConnection) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.username, pass: config.password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

export async function verifySmtpConnection(config: SmtpConnection) {
  await transporter(config).verify();
}

export async function sendSmtpMail(config: SmtpConnection, input: { fromEmail: string; to: string; subject: string; body: string; isHtml?: boolean }) {
  const transport = transporter(config);
  await transport.sendMail({
    from: { name: input.fromEmail, address: input.fromEmail },
    to: input.to,
    subject: input.subject,
    ...(input.isHtml ? { html: input.body } : { text: input.body }),
  });
}
