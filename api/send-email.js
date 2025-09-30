// api/send-email.js
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { to, html } = req.body;

  try {
    const data = await resend.emails.send({
      from: 'Redline Reports <reports@redlinecre.com>',
      to,
      subject: 'Your Property Report',
      html,
    });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Email send failed:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
